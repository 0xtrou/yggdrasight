#!/usr/bin/env bun
/**
 * Classification Worker — Philosophical intelligence agent orchestration.
 *
 * Usage: bun scripts/classify-worker.ts <jobId>
 *
 * 1. Connects to MongoDB
 * 2. Loads the ClassificationJob by ID
 * 3. Loads the latest DiscoveryJob result for the symbol (context data)
 * 4. Runs all 6 classification agents in parallel across Docker containers
 * 5. Feeds all 6 results to a 7th synthesizer agent
 * 6. Parses + stores the final classification
 * 7. Creates a ClassificationSnapshot for time-series tracking
 * 8. Exits
 *
 * Mirrors discover-worker.ts architecture exactly.
 */
import mongoose from 'mongoose'
import { spawn } from 'child_process'
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

// ── Types ─────────────────────────────────────────────────────────────────────

import type {
  AgentType,
  CrackMappingResult,
  VisibilityResult,
  NarrativeSeparatorResult,
  PowerVectorResult,
  ProblemRecognitionResult,
  IdentityPolarityResult,
  ClassificationResult,
  SubAgentResult,
  ClassificationCategory,
} from '../apps/web/src/lib/intelligence/classification/types'

// ── Prompt builders ──────────────────────────────────────────────────────────

import {
  buildCrackMappingPrompt,
  buildVisibilityPrompt,
  buildNarrativeSeparatorPrompt,
  buildPowerVectorPrompt,
  buildProblemRecognitionPrompt,
  buildIdentityPolarityPrompt,
  buildSynthesizerPrompt,
  AGENT_PROMPT_BUILDERS,
  type ClassificationAgentType,
} from '../apps/web/src/lib/intelligence/classification/prompts'

// ── Parsers ──────────────────────────────────────────────────────────────────

import {
  parseCrackMapping,
  parseVisibility,
  parseNarrativeSeparator,
  parsePowerVector,
  parseProblemRecognition,
  parseIdentityPolarity,
  parseClassificationResult,
} from '../apps/web/src/lib/intelligence/classification/parsers'

// ── Constants ─────────────────────────────────────────────────────────────────

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://oculus:oculus_dev_secret@localhost:27017/oculus-trading?authSource=admin'
const DOCKER_BIN = process.env.DOCKER_BIN ?? 'docker'
const OPENCODE_IMAGE = process.env.OPENCODE_IMAGE ?? 'ghcr.io/anomalyco/opencode'
const WORKER_TIMEOUT_MS = 1_500_000 // 25 minutes safety limit (6 parallel + 1 synthesizer)
const AGENT_TIMEOUT_MS = 600_000 // 10 minutes per individual agent (matches discover-worker)

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

// ── JSON event parsing (same as discover-worker) ──────────────────────────────

function extractJsonObjects(stdout: string): string[] {
  const objects: string[] = []
  let i = 0
  const len = stdout.length
  while (i < len) {
    if (stdout[i] !== '{') { i++; continue }
    let depth = 0
    const start = i
    let inString = false
    let escape = false
    for (let j = i; j < len; j++) {
      const ch = stdout[j]
      if (escape) { escape = false; continue }
      if (ch === '\\') { if (inString) escape = true; continue }
      if (ch === '"' && !escape) { inString = !inString; continue }
      if (inString) continue
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) { objects.push(stdout.substring(start, j + 1)); i = j + 1; break }
      }
      if (j - start > 1_000_000) { i = j + 1; break }
    }
    if (depth > 0) i = start + 1
  }
  return objects
}

function sanitizeJsonString(raw: string): string {
  let result = ''
  let inString = false
  let escape = false
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!
    const code = raw.charCodeAt(i)
    if (escape) { escape = false; result += ch; continue }
    if (ch === '\\') { escape = true; result += ch; continue }
    if (ch === '"') { inString = !inString; result += ch; continue }
    if (inString && code < 0x20) {
      if (code === 0x0a) result += '\\n'
      else if (code === 0x0d) result += '\\r'
      else if (code === 0x09) result += '\\t'
      else result += `\\u${code.toString(16).padStart(4, '0')}`
      continue
    }
    result += ch
  }
  return result
}

function extractResponse(stdout: string): { text: string; urlsFetched: string[]; toolCallCount: number } {
  const jsonStrings = extractJsonObjects(stdout)
  const allTextParts: string[] = []
  const stepTextParts: string[][] = [[]]
  const urlsFetched: string[] = []
  let toolCallCount = 0
  let hasJsonEvents = false

  for (const jsonStr of jsonStrings) {
    try {
      const event = JSON.parse(sanitizeJsonString(jsonStr))
      hasJsonEvents = true
      if (event.type === 'step_start') stepTextParts.push([])
      if (event.type === 'text' && event.part?.text) {
        const currentStep = stepTextParts[stepTextParts.length - 1]!
        currentStep.push(event.part.text)
        allTextParts.push(event.part.text)
      }
      if (event.type === 'tool_use' && event.part) {
        toolCallCount++
        const part = event.part
        if (part.tool === 'webfetch' && part.state?.status === 'completed' && part.state.input?.url) {
          urlsFetched.push(part.state.input.url)
        }
        if (part.tool === 'websearch_web_search_exa' && part.state?.status === 'completed' && part.state.input?.query) {
          urlsFetched.push(`search:${part.state.input.query}`)
        }
      }
      if (event.type === 'error' && event.error && allTextParts.length === 0) {
        const err = event.error
        const errorMsg = typeof err === 'string' ? err : err.data?.message ?? err.message ?? 'Unknown error'
        return { text: `Error: ${errorMsg}`, urlsFetched, toolCallCount }
      }
    } catch { /* skip invalid JSON */ }
  }

  const lastStepText = stepTextParts[stepTextParts.length - 1]!
  if (lastStepText.length > 0) return { text: lastStepText.join(''), urlsFetched, toolCallCount }
  if (allTextParts.length > 0) return { text: allTextParts.join(''), urlsFetched, toolCallCount }
  if (hasJsonEvents) return { text: '', urlsFetched, toolCallCount }
  return { text: stdout.trim(), urlsFetched: [], toolCallCount }
}

// ── Run single OpenCode agent ─────────────────────────────────────────────────

interface AgentRunResult {
  success: boolean
  text: string
  error?: string
  urlsFetched: string[]
  toolCallCount: number
  durationMs: number
}

async function runAgent(
  model: string,
  workDir: string,
  agentType: string,
  jobId: string,
): Promise<AgentRunResult> {
  const HOME_DIR = process.env.HOME ?? '/root'
  const startTime = Date.now()

  const args = [
    'run', '--rm',
    '--network', 'host',
    '-v', `${HOME_DIR}/.opencode:/root/.opencode:ro`,
    '-v', `${HOME_DIR}/.local/share/opencode/auth.json:/root/.local/share/opencode/auth.json:ro`,
    '-v', `${HOME_DIR}/.config/opencode:/root/.config/opencode:ro`,
    '-v', `${workDir}:/workspace:rw`,
    '-e', 'HOME=/root',
    OPENCODE_IMAGE,
    'run', '-m', model, '--format', 'json', '--print-logs', '--log-level', 'WARN', '--dir', '/workspace',
    'Read INSTRUCTIONS.md for your task. Then read each file in data/ directory. Follow all instructions exactly. Your FINAL output MUST be ONLY the JSON object specified in INSTRUCTIONS.md — no prose, no status updates, no explanations. Complete all research first, then output the raw JSON.',
  ]

  log(`[${agentType}] Starting agent (model: ${model})`)
  await appendLogs(jobId, [`[${agentType}] Starting...`])

  return new Promise((resolve) => {
    const child = spawn(DOCKER_BIN, args, {
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let resolved = false
    const pendingLogs: string[] = []
    const LOG_FLUSH_INTERVAL = 3000

    const logFlushTimer = setInterval(async () => {
      if (pendingLogs.length > 0) {
        const batch = pendingLogs.splice(0)
        await appendLogs(jobId, batch)
      }
    }, LOG_FLUSH_INTERVAL)

    let stdoutBuffer = ''
    child.stdout.on('data', (chunk: Buffer) => {
      const data = chunk.toString()
      stdout += data
      stdoutBuffer += data

      const jsonObjects = extractJsonObjects(stdoutBuffer)
      if (jsonObjects.length > 0) {
        const lastObj = jsonObjects[jsonObjects.length - 1]!
        const lastIdx = stdoutBuffer.lastIndexOf(lastObj)
        if (lastIdx >= 0) stdoutBuffer = stdoutBuffer.substring(lastIdx + lastObj.length)

        for (const jsonStr of jsonObjects) {
          try {
            const event = JSON.parse(sanitizeJsonString(jsonStr))
            if (event.type === 'tool_use' && event.part) {
              const tool = event.part.tool || 'unknown'
              const status = event.part.state?.status || ''
              if (status === 'completed') {
                const input = event.part.state?.input || {}
                let detail = ''
                if (tool === 'read' && input.filePath) detail = ` ${input.filePath.split('/').slice(-2).join('/')}`
                else if (tool === 'webfetch' && input.url) detail = ` ${input.url.substring(0, 80)}`
                else if (tool === 'websearch_web_search_exa' && input.query) detail = ` "${input.query}"`
                pendingLogs.push(`[${agentType}] ✓ ${tool}${detail}`)
              }
            }
          } catch { /* skip */ }
        }
      }
    })

    child.stderr.on('data', (chunk: Buffer) => {
      const data = chunk.toString()
      stderr += data

      // Detect rate limit errors — only fail fast if the ACTIVE model hit rate limit
      // Check for FreeUsageLimitError with the actual model name to avoid false positives
      // from background provider checks on other (rate-limited) providers
      const isActiveModelRateLimit = (
        data.includes('FreeUsageLimitError') && data.includes(model)
      ) || (
        data.includes('statusCode":429') && data.includes(model)
      )
      if (isActiveModelRateLimit) {
        if (!resolved) {
          resolved = true
          clearInterval(logFlushTimer)
          clearTimeout(timeout)
          child.kill('SIGTERM')
          const msg = 'API rate limit exceeded — retry later'
          appendLogs(jobId, [...pendingLogs, `[${agentType}] ${msg}`]).finally(() => {
            resolve({ success: false, text: '', error: msg, urlsFetched: [], toolCallCount: 0, durationMs: Date.now() - startTime })
          })
          return
        }
      }

      const lines = data.split('\n').filter((l: string) => {
        const t = l.trim()
        if (!t) return false
        if (t.includes('@opencode-ai/plugin')) return false
        if (t.includes('getConfigContext()')) return false
        if (t.includes('defaulting to CLI paths')) return false
        if (t.startsWith('Resolving dependencies')) return false
        if (t.startsWith('Resolved, downloaded')) return false
        if (t.startsWith('error: No version matching')) return false
        return true
      })
      if (lines.length > 0) {
        pendingLogs.push(...lines.map((l: string) => `[${agentType}] [stderr] ${l.trim().substring(0, 200)}`))
      }
    })

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        clearInterval(logFlushTimer)
        child.kill('SIGTERM')
        appendLogs(jobId, [...pendingLogs, `[${agentType}] TIMEOUT after ${AGENT_TIMEOUT_MS}ms`]).finally(() => {
          resolve({ success: false, text: '', error: `Agent ${agentType} timed out`, urlsFetched: [], toolCallCount: 0, durationMs: Date.now() - startTime })
        })
      }
    }, AGENT_TIMEOUT_MS)

    child.on('close', async (code) => {
      clearTimeout(timeout)
      clearInterval(logFlushTimer)
      if (resolved) return
      resolved = true

      if (pendingLogs.length > 0) await appendLogs(jobId, pendingLogs.splice(0))

      const { text, urlsFetched, toolCallCount } = extractResponse(stdout)
      const trimmedText = text.trim()
      const durationMs = Date.now() - startTime

      log(`[${agentType}] Completed — ${toolCallCount} tool calls, ${urlsFetched.length} URLs, ${trimmedText.length}B, ${(durationMs / 1000).toFixed(1)}s`)
      await appendLogs(jobId, [`[${agentType}] Done: ${toolCallCount} tools, ${urlsFetched.length} URLs, ${(durationMs / 1000).toFixed(1)}s`])

      if (!trimmedText) {
        resolve({ success: false, text: '', error: `Empty response from ${agentType}`, urlsFetched, toolCallCount, durationMs })
      } else {
        resolve({ success: true, text: trimmedText, urlsFetched, toolCallCount, durationMs })
      }
    })

    child.on('error', async (err) => {
      clearTimeout(timeout)
      clearInterval(logFlushTimer)
      if (resolved) return
      resolved = true
      const msg = err.message || 'Unknown spawn error'
      await appendLogs(jobId, [...pendingLogs, `[${agentType}] ERROR: ${msg}`])
      resolve({ success: false, text: '', error: msg, urlsFetched: [], toolCallCount: 0, durationMs: Date.now() - startTime })
    })

    child.stdin?.end()
  })
}

// ── Build agent workspace ─────────────────────────────────────────────────────

function buildAgentWorkspace(
  agentType: ClassificationAgentType,
  symbol: string,
  projectName: string,
  discoveryData: Record<string, unknown> | null,
): string {
  const tmpDir = path.join(tmpdir(), `oculus-classify-${agentType}-${Date.now()}`)
  mkdirSync(tmpDir, { recursive: true })
  mkdirSync(path.join(tmpDir, 'data'), { recursive: true })

  // Write discovery data
  if (discoveryData) {
    writeFileSync(
      path.join(tmpDir, 'data', 'discovery.json'),
      JSON.stringify(discoveryData, null, 2),
      'utf-8'
    )
  } else {
    writeFileSync(
      path.join(tmpDir, 'data', 'discovery.json'),
      JSON.stringify({ note: 'No discovery data available — rely on web search' }),
      'utf-8'
    )
  }

  // Build and write prompt as INSTRUCTIONS.md
  const promptBuilder = AGENT_PROMPT_BUILDERS[agentType]
  const prompt = promptBuilder(symbol, projectName)
  writeFileSync(path.join(tmpDir, 'INSTRUCTIONS.md'), prompt, 'utf-8')

  return tmpDir
}

function buildSynthesizerWorkspace(
  symbol: string,
  projectName: string,
  agentResults: {
    crack_mapping: CrackMappingResult | null
    visibility: VisibilityResult | null
    narrative_separator: NarrativeSeparatorResult | null
    power_vector: PowerVectorResult | null
    problem_recognition: ProblemRecognitionResult | null
    identity_polarity: IdentityPolarityResult | null
  },
): string {
  const tmpDir = path.join(tmpdir(), `oculus-classify-synthesizer-${Date.now()}`)
  mkdirSync(tmpDir, { recursive: true })
  mkdirSync(path.join(tmpDir, 'data'), { recursive: true })

  const prompt = buildSynthesizerPrompt(symbol, projectName, agentResults)
  writeFileSync(path.join(tmpDir, 'INSTRUCTIONS.md'), prompt, 'utf-8')

  // Also write each agent result as a separate file for reference
  for (const [key, value] of Object.entries(agentResults)) {
    writeFileSync(
      path.join(tmpDir, 'data', `${key}.json`),
      JSON.stringify(value, null, 2),
      'utf-8'
    )
  }

  return tmpDir
}

// ── Parallel batch runner ─────────────────────────────────────────────────────

type AgentTypeKey = ClassificationAgentType

const CLASSIFICATION_AGENTS: AgentTypeKey[] = [
  'crack_mapping',
  'visibility',
  'narrative_separator',
  'power_vector',
  'problem_recognition',
  'identity_polarity',
]

const PARSER_MAP = {
  crack_mapping: parseCrackMapping,
  visibility: parseVisibility,
  narrative_separator: parseNarrativeSeparator,
  power_vector: parsePowerVector,
  problem_recognition: parseProblemRecognition,
  identity_polarity: parseIdentityPolarity,
} as const

async function runClassificationAgents(
  model: string,
  symbol: string,
  projectName: string,
  discoveryData: Record<string, unknown> | null,
  jobId: string,
  agentModels: Record<string, string> | null = null,
): Promise<Record<ClassificationAgentType, SubAgentResult>> {
  const results: Record<string, SubAgentResult> = {}

  log(`Running ${CLASSIFICATION_AGENTS.length} classification agents in parallel...`)

  const agentPromises = CLASSIFICATION_AGENTS.map(async (agentType) => {
    const workDir = buildAgentWorkspace(agentType, symbol, projectName, discoveryData)
    try {
      const agentModel = agentModels?.[agentType] || model
      const result = await runAgent(agentModel, workDir, agentType, jobId)
      const parser = PARSER_MAP[agentType]
      const parsed = result.success ? parser(result.text) : null

      results[agentType] = {
        agentType,
        status: parsed ? 'completed' : 'failed',
        result: parsed,
        rawOutput: result.text || null,
        error: result.error || (result.success && !parsed ? 'Failed to parse agent response' : null),
        modelId: agentModel,
        durationMs: result.durationMs,
        urlsFetched: result.urlsFetched,
        toolCallCount: result.toolCallCount,
      }
    } catch (err) {
      const agentModel = agentModels?.[agentType] || model
      results[agentType] = {
        agentType,
        status: 'failed',
        result: null,
        rawOutput: null,
        error: err instanceof Error ? err.message : 'Unknown agent error',
        modelId: agentModel,
        durationMs: 0,
        urlsFetched: [],
        toolCallCount: 0,
      }
      try { rmSync(workDir, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  })

  await Promise.all(agentPromises)
  return results as Record<ClassificationAgentType, SubAgentResult>
}

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
  const model = job.modelId as string
  const agentModels = (job.agentModels as Record<string, string> | null) ?? null
  const getModelForAgent = (agentType: string): string => agentModels?.[agentType] || model
  const projectName = SYMBOL_NAMES[symbol] || symbol

  log(`Job loaded: symbol=${symbol}, model=${model}, project=${projectName}`)

  // Mark as running
  await ClassificationJob.updateOne(
    { _id: jobId },
    { $set: { status: 'running', pid: process.pid } },
  )

  try {
    // Load latest discovery data for context
    const latestDiscovery = await DiscoveryJob.findOne(
      { symbol, status: 'completed' },
      { result: 1 },
      { sort: { completedAt: -1 } },
    ).lean() as { result?: Record<string, unknown> } | null

    const discoveryData = latestDiscovery?.result ?? null
    log(`Discovery data: ${discoveryData ? 'found' : 'not available'}`)
    await appendLogs(jobId, [`Discovery data: ${discoveryData ? 'loaded' : 'none — agents will rely on web search'}`])

    // ── Phase 1: Run 6 classification agents in parallel ──
    const subAgentResults = await runClassificationAgents(model, symbol, projectName, discoveryData, jobId, agentModels)

    // Check how many succeeded
    const successCount = Object.values(subAgentResults).filter(r => r.status === 'completed').length
    log(`Phase 1 complete: ${successCount}/${CLASSIFICATION_AGENTS.length} agents succeeded`)
    await appendLogs(jobId, [`Phase 1 done: ${successCount}/${CLASSIFICATION_AGENTS.length} agents succeeded`])

    if (successCount === 0) {
      log('All agents failed — cannot synthesize')
      await ClassificationJob.updateOne(
        { _id: jobId },
        { $set: { status: 'failed', error: 'All 6 classification agents failed', subAgentResults, completedAt: new Date() } },
      )
      await mongoose.disconnect()
      process.exit(0)
    }

    // ── Phase 2: Run synthesizer agent ──
    log('Phase 2: Running synthesizer agent...')
    await appendLogs(jobId, ['Phase 2: Running synthesizer...'])

    const synthesizerInput = {
      crack_mapping: subAgentResults.crack_mapping?.result as CrackMappingResult | null,
      visibility: subAgentResults.visibility?.result as VisibilityResult | null,
      narrative_separator: subAgentResults.narrative_separator?.result as NarrativeSeparatorResult | null,
      power_vector: subAgentResults.power_vector?.result as PowerVectorResult | null,
      problem_recognition: subAgentResults.problem_recognition?.result as ProblemRecognitionResult | null,
      identity_polarity: subAgentResults.identity_polarity?.result as IdentityPolarityResult | null,
    }

    const synthWorkDir = buildSynthesizerWorkspace(symbol, projectName, synthesizerInput)
    let synthesizedResult: ClassificationResult | null = null

    try {
      const synthResult = await runAgent(getModelForAgent('synthesizer'), synthWorkDir, 'synthesizer', jobId)
      if (synthResult.success) {
        synthesizedResult = parseClassificationResult(synthResult.text)
      }

      const synthAgentResult: SubAgentResult<ClassificationResult> = {
        agentType: 'synthesizer',
        status: synthesizedResult ? 'completed' : 'failed',
        result: synthesizedResult,
        rawOutput: synthResult.text || null,
        error: synthResult.error || (synthResult.success && !synthesizedResult ? 'Failed to parse synthesizer response' : null),
        modelId: getModelForAgent('synthesizer'),
        durationMs: synthResult.durationMs,
        urlsFetched: synthResult.urlsFetched,
        toolCallCount: synthResult.toolCallCount,
      }

      // Add synthesizer to sub-agent results
      ;(subAgentResults as Record<string, SubAgentResult>).synthesizer = synthAgentResult
    } finally {
      try { rmSync(synthWorkDir, { recursive: true, force: true }) } catch { /* ignore */ }
    }

    if (!synthesizedResult) {
      log('Synthesizer failed — saving partial results')
      await ClassificationJob.updateOne(
        { _id: jobId },
        { $set: { status: 'failed', error: 'Synthesizer agent failed to produce classification', subAgentResults, completedAt: new Date() } },
      )
      await mongoose.disconnect()
      process.exit(0)
    }

    log(`Classification complete: primary category = ${synthesizedResult.primary_category}`)
    await appendLogs(jobId, [`Classification: Cat ${synthesizedResult.primary_category} (${getCategoryName(synthesizedResult.primary_category)})`])

    // ── Phase 3: Save results ──
    await ClassificationJob.updateOne(
      { _id: jobId },
      {
        $set: {
          status: 'completed',
          result: synthesizedResult,
          subAgentResults,
          completedAt: new Date(),
        },
      },
    )

    // Create time-series snapshot
    await ClassificationSnapshot.create({
      symbol,
      modelId: model,
      primaryCategory: synthesizedResult.primary_category,
      categoryWeights: synthesizedResult.categories.map(c => ({
        category: c.category,
        weight: c.weight,
      })),
      crackAlignment: synthesizedResult.crack_alignment,
      classification: synthesizedResult,
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
