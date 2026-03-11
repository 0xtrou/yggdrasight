#!/usr/bin/env bun
/**
 * Test script for the discovery worker.
 * Creates a test job in MongoDB, runs the worker, and checks results.
 *
 * Usage: bun scripts/test-discover-worker.ts [symbol]
 */
import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://yggdrasight:yggdrasight_dev_secret@localhost:27017/yggdrasight?authSource=admin'
const BUN_BIN = process.env.BUN_BIN ?? '/Users/mrk/.bun/bin/bun'
const WORKER_SCRIPT = new URL('./discover-worker.ts', import.meta.url).pathname

const symbol = process.argv[2] || 'BTC'
const model = process.argv[3] || 'opencode/big-pickle'

// Inline schema (same as worker)
const DiscoveryJobSchema = new mongoose.Schema({
  symbol: { type: String, required: true, index: true },
  modelId: { type: String, required: true },
  status: { type: String, required: true, enum: ['pending', 'running', 'completed', 'failed'], default: 'pending' },
  result: { type: mongoose.Schema.Types.Mixed, default: null },
  error: { type: String, default: null },
  pid: { type: Number, default: null },
  logs: { type: [String], default: [] },
  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },
})
const DiscoveryJob = mongoose.models.DiscoveryJob || mongoose.model('DiscoveryJob', DiscoveryJobSchema)

async function main() {
  console.log(`\n=== Discovery Worker Test ===`)
  console.log(`Symbol: ${symbol}`)
  console.log(`Model: ${model}`)
  console.log(`Worker: ${WORKER_SCRIPT}`)
  console.log(`Bun: ${BUN_BIN}`)
  console.log()

  // Step 1: Connect to MongoDB
  console.log('[1/5] Connecting to MongoDB...')
  try {
    await mongoose.connect(MONGODB_URI, { bufferCommands: false })
    console.log('  ✓ Connected')
  } catch (err) {
    console.error('  ✗ Failed to connect:', err)
    process.exit(1)
  }

  // Step 2: Create a test job
  console.log('[2/5] Creating test job...')
  const job = await DiscoveryJob.create({
    symbol,
    modelId: model,
    status: 'pending',
    startedAt: new Date(),
  })
  const jobId = String(job._id)
  console.log(`  ✓ Job created: ${jobId}`)

  // Step 3: Run the worker directly (not detached — we want to see output)
  console.log('[3/5] Running worker...')
  console.log(`  Command: ${BUN_BIN} ${WORKER_SCRIPT} ${jobId}`)
  console.log('  --- worker output start ---')

  const { spawn } = await import('child_process')
  const path = await import('path')
  const projectRoot = path.resolve(import.meta.dir, '..')

  const child = spawn(BUN_BIN, [WORKER_SCRIPT, jobId], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      MONGODB_URI,
      NODE_PATH: [
        path.join(projectRoot, 'packages/db/node_modules'),
        path.join(projectRoot, 'node_modules'),
      ].join(path.delimiter),
    },
    cwd: projectRoot,
  })

  child.stdout.on('data', (chunk: Buffer) => {
    process.stdout.write(`  [stdout] ${chunk.toString()}`)
  })
  child.stderr.on('data', (chunk: Buffer) => {
    process.stderr.write(`  [stderr] ${chunk.toString()}`)
  })

  const exitCode = await new Promise<number | null>((resolve) => {
    child.on('close', resolve)
    child.on('error', (err) => {
      console.error(`  [spawn error] ${err.message}`)
      resolve(null)
    })
  })

  console.log('  --- worker output end ---')
  console.log(`  Exit code: ${exitCode}`)

  // Step 4: Check job status in DB
  console.log('[4/5] Checking job status in DB...')
  const updatedJob = await DiscoveryJob.findById(jobId).lean()
  if (!updatedJob) {
    console.error('  ✗ Job not found!')
  } else {
    const j = updatedJob as Record<string, unknown>
    console.log(`  Status: ${j.status}`)
    console.log(`  PID: ${j.pid}`)
    console.log(`  Error: ${j.error || '(none)'}`)
    console.log(`  Logs (${(j.logs as string[])?.length || 0}):`)
    const logs = (j.logs as string[]) || []
    for (const l of logs.slice(0, 20)) {
      console.log(`    ${l}`)
    }
    if (logs.length > 20) console.log(`    ... and ${logs.length - 20} more`)

    if (j.result) {
      const result = j.result as Record<string, unknown>
      const fieldCount = Object.entries(result).filter(([, v]) => v !== null && v !== undefined).length
      console.log(`  Result: ${fieldCount} fields populated`)
      console.log(`  Project: ${result.projectName}`)
      console.log(`  Description: ${typeof result.description === 'string' ? result.description?.substring(0, 100) : '(none)'}...`)
    } else {
      console.log('  Result: (none)')
    }

    // Verdict
    if (j.status === 'completed' && j.result) {
      console.log('\n[5/5] ✅ TEST PASSED — Worker completed successfully')
    } else if (j.status === 'failed') {
      console.log(`\n[5/5] ❌ TEST FAILED — Worker failed: ${j.error}`)
    } else {
      console.log(`\n[5/5] ⚠️  UNEXPECTED — Status is "${j.status}" after worker exited`)
    }
  }

  // Cleanup: remove test job
  await DiscoveryJob.deleteOne({ _id: jobId })
  console.log(`  Cleaned up test job ${jobId}`)

  await mongoose.disconnect()
  process.exit(exitCode === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
