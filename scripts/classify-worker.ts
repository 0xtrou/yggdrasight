#!/usr/bin/env bun
/**
 * Classification Worker — TypeSafe judgment pipeline.
 *
 * Usage: bun scripts/classify-worker.ts <jobId>
 *
 * 1. Connects to MongoDB
 * 2. Loads the ClassificationJob by ID
 * 3. Loads the latest DiscoveryJob result for the symbol (judgment state)
 * 4. Runs the TypeSafe classification engine (2 batched judgment requests —
 *    six dimensions in parallel, then synthesis over those answers)
 * 5. Stores the final classification + per-dimension sub-agent results
 * 6. Creates a ClassificationSnapshot for time-series tracking
 * 7. Exits
 *
 * Requires TYPESAFE_API_KEY in the environment (passed through by the API route).
 */
import mongoose from 'mongoose'

// ── Types ─────────────────────────────────────────────────────────────────────

import type { ClassificationResult, SubAgentResult } from '../apps/web/src/lib/intelligence/classification/types'
import { runTypeSafeClassification } from '../apps/web/src/lib/intelligence/classification/typesafe-classifier'

// ── Constants ─────────────────────────────────────────────────────────────────

const MONGODB_URI = process.env.YGGDRASIGHT_MONGODB_URI || process.env.MONGODB_URI || 'mongodb://yggdrasight:yggdrasight_dev_secret@localhost:27017/yggdrasight?authSource=admin'

// ── Symbol name mappings (same as discover-worker) ───────────────────────────

const SYMBOL_NAMES: Record<string, string> = {
  BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', BNB: 'BNB Chain (Binance)',
  TAO: 'Bittensor', PENDLE: 'Pendle Finance', DOGE: 'Dogecoin', ADA: 'Cardano',
  XRP: 'Ripple XRP', AVAX: 'Avalanche', DOT: 'Polkadot', LINK: 'Chainlink',
  UNI: 'Uniswap', ATOM: 'Cosmos', ARB: 'Arbitrum', OP: 'Optimism',
  APT: 'Aptos', SUI: 'Sui', NEAR: 'NEAR Protocol', FIL: 'Filecoin',
  AAVE: 'Aave', INJ: 'Injective', RENDER: 'Render Network', FET: 'Fetch.ai',
  ICP: 'Internet Computer', TIA: 'Celestia', JUP: 'Jupiter (Solana)',
  ONDO: 'Ondo Finance', SEI: 'Sei Network', SENT: 'Sentient',
}

// ── Mongoose Models (inline — worker is standalone) ──────────────────────────

const ClassificationJobSchema = new mongoose.Schema({
  symbol: { type: String, required: true, index: true },
  modelId: { type: String, required: true },
  status: { type: String, required: true, enum: ['pending', 'running', 'completed', 'failed'], default: 'pending' },
  result: { type: mongoose.Schema.Types.Mixed, default: null },
  subAgentResults: { type: mongoose.Schema.Types.Mixed, default: null },
  rawOutput: { type: String, default: null },
  error: { type: String, default: null },
  pid: { type: Number, default: null },
  logs: { type: [String], default: [] },
  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },
})
const ClassificationJob = mongoose.models.ClassificationJob || mongoose.model('ClassificationJob', ClassificationJobSchema)

const ClassificationSnapshotSchema = new mongoose.Schema({
  symbol: { type: String, required: true, index: true },
  modelId: { type: String, required: true },
  primaryCategory: { type: Number, required: true, min: 1, max: 6 },
  categoryWeights: { type: [{ category: Number, weight: Number }], default: [] },
  crackAlignment: { type: [Number], default: [] },
  classification: { type: mongoose.Schema.Types.Mixed, default: null },
  jobId: { type: mongoose.Schema.Types.ObjectId, required: true },
  classifiedAt: { type: Date, required: true, default: Date.now },
})
const ClassificationSnapshot = mongoose.models.ClassificationSnapshot || mongoose.model('ClassificationSnapshot', ClassificationSnapshotSchema)

const DiscoveryJobSchema = new mongoose.Schema({
  symbol: { type: String, required: true, index: true },
  modelId: { type: String, required: true },
  status: { type: String, required: true },
  result: { type: mongoose.Schema.Types.Mixed, default: null },
  completedAt: { type: Date, default: null },
})
const DiscoveryJob = mongoose.models.DiscoveryJob || mongoose.model('DiscoveryJob', DiscoveryJobSchema)

// ── Logging ──────────────────────────────────────────────────────────────────

async function appendLogs(jobId: string, lines: string[]): Promise<void> {
  if (lines.length === 0) return
  try {
    const timestamped = lines.map(l => `${new Date().toISOString().substring(11, 19)} ${l}`)
    await ClassificationJob.updateOne(
      { _id: jobId },
      { $push: { logs: { $each: timestamped } } },
    )
  } catch {
    console.error('[classify-worker] Failed to append logs to DB')
  }
}

function log(msg: string) {
  const ts = new Date().toISOString().substring(11, 23)
  console.log(`[classify-worker ${ts}] ${msg}`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const jobId = process.argv[2]
  if (!jobId) {
    console.error('Usage: bun scripts/classify-worker.ts <jobId>')
    process.exit(1)
  }

  log(`Starting for jobId=${jobId}`)

  if (!process.env.TYPESAFE_API_KEY) {
    console.error('TYPESAFE_API_KEY is not set — cannot run TypeSafe classification')
    process.exit(1)
  }

  // Connect to MongoDB
  try {
    await mongoose.connect(MONGODB_URI, { bufferCommands: false })
    log('Connected to MongoDB')
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err)
    process.exit(1)
  }

  // Load the job
  const job = await ClassificationJob.findById(jobId)
  if (!job) {
    console.error(`Job ${jobId} not found in database`)
    await mongoose.disconnect()
    process.exit(1)
  }

  const symbol = job.symbol as string
  const projectName = SYMBOL_NAMES[symbol] || symbol
  const pendingLogs: string[] = []
  const onLog = (line: string) => {
    log(line)
    pendingLogs.push(line)
    // Flush opportunistically — keeps the UI log stream alive during the run
    if (pendingLogs.length >= 3) {
      const batch = pendingLogs.splice(0)
      void appendLogs(jobId, batch)
    }
  }

  log(`Job loaded: symbol=${symbol}, project=${projectName}`)

  // Mark as running
  await ClassificationJob.updateOne(
    { _id: jobId },
    { $set: { status: 'running', pid: process.pid } },
  )

  try {
    // Load latest discovery data for judgment state
    const latestDiscovery = await DiscoveryJob.findOne(
      { symbol, status: 'completed' },
      { result: 1 },
      { sort: { completedAt: -1 } },
    ).lean() as { result?: Record<string, unknown> } | null

    const discoveryData = latestDiscovery?.result ?? null
    log(`Discovery data: ${discoveryData ? 'found' : 'not available'}`)
    await appendLogs(jobId, [`Discovery data: ${discoveryData ? 'loaded' : 'none — judging from model knowledge'}`])

    // Run the TypeSafe classification engine (2 batched judgment requests)
    const { subAgentResults, classification, modelId, totalDurationMs } =
      await runTypeSafeClassification(symbol, projectName, discoveryData, onLog)

    const successCount = Object.values(subAgentResults).filter(r => r.status === 'completed').length
    log(`Classification complete: primary category = ${classification.primary_category} (${successCount}/7 sub-agents, ${(totalDurationMs / 1000).toFixed(1)}s total)`)
    await appendLogs(jobId, [
      `Classification: Cat ${classification.primary_category} (${getCategoryName(classification.primary_category)})`,
      ...pendingLogs.splice(0),
    ])

    // Save results
    await ClassificationJob.updateOne(
      { _id: jobId },
      {
        $set: {
          status: 'completed',
          result: classification,
          subAgentResults,
          modelId,
          completedAt: new Date(),
        },
      },
    )

    // Create time-series snapshot
    await ClassificationSnapshot.create({
      symbol,
      modelId,
      primaryCategory: classification.primary_category,
      categoryWeights: classification.categories.map(c => ({
        category: c.category,
        weight: c.weight,
      })),
      crackAlignment: classification.crack_alignment,
      classification,
      jobId: new mongoose.Types.ObjectId(jobId),
      classifiedAt: new Date(),
    })

    log('Snapshot created for migration tracking')
    await appendLogs(jobId, ['Snapshot saved for migration tracking'])

    log('Job completed successfully')
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown worker error'
    log(`Worker error: ${errorMsg}`)
    await ClassificationJob.updateOne(
      { _id: jobId },
      { $set: { status: 'failed', error: errorMsg, completedAt: new Date() } },
    ).catch(() => { /* ignore DB errors during error handling */ })
  }

  await mongoose.disconnect()
  process.exit(0)
}

function getCategoryName(cat: number): string {
  const names: Record<number, string> = {
    1: 'Crack Expander', 2: 'Infrastructure of Disappearance', 3: 'Mirror Builder',
    4: 'Narrative Vessel', 5: 'Ego Builder', 6: 'Consciousness Seed',
  }
  return names[cat] ?? 'Unknown'
}

main().catch((err) => {
  console.error('Fatal worker error:', err)
  process.exit(1)
})
