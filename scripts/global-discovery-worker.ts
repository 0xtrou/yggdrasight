#!/usr/bin/env bun
/**
 * Global Discovery Worker — Multi-agent global crypto intelligence discovery.
 *
 * Usage: bun scripts/global-discovery-worker.ts <jobId>
 *
 * 1. Connects to MongoDB
 * 2. Loads the GlobalDiscoveryJob by ID
 * 3. Loads the latest GlobalDiscoveryReport (context inheritance)
 * 4. Runs a master planner agent to create search assignments
 * 5. Spawns N discovery agents in parallel (one per assignment)
 * 6. Runs a synthesizer to combine all findings + previous report
 * 7. Creates a new GlobalDiscoveryReport (compounding knowledge)
 * 8. Exits
 *
 * Mirrors classify-worker.ts architecture exactly.
 */
import mongoose from 'mongoose'
import { spawn } from 'child_process'
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

// ── Per-user config decryption (optional — when OCULUS_PASSWORD_HASH is set) ──
import { decryptConfigForMount, cleanupDecryptedConfig } from '../apps/web/src/lib/auth/vault'
import type { DecryptedConfigPaths } from '../apps/web/src/lib/auth/vault'

// ── Prompt builders ─────────────────────────────────────────────────────────

import {
  buildMasterPlannerPrompt,
  buildDiscoveryAgentPrompt,
  buildSynthesizerPrompt,
} from '../apps/web/src/lib/intelligence/global-discovery/prompts'

// ── Parsers ─────────────────────────────────────────────────────────────────

import {
  parseMasterPlan,
  parseDiscoveryAgent,
  parseSynthesizerResult,
} from '../apps/web/src/lib/intelligence/global-discovery/parsers'

import type { MasterPlanResult, DiscoveryAgentResult, SynthesizerResult } from '../apps/web/src/lib/intelligence/global-discovery/parsers'
import type { IGlobalDiscoveredProject } from '../apps/web/src/lib/intelligence/models/global-discovery-job.model'

// ── Constants ────────────────────────────────────────────────────────────────

const MONGODB_URI = process.env.OCULUS_MONGODB_URI || process.env.MONGODB_URI || 'mongodb://oculus:oculus_dev_secret@localhost:27017/oculus-trading?authSource=admin'
const DOCKER_BIN = process.env.DOCKER_BIN ?? 'docker'
const OPENCODE_IMAGE = process.env.OPENCODE_IMAGE ?? 'ghcr.io/anomalyco/opencode'
const AGENT_TIMEOUT_MS = 900_000 // 15 minutes per individual agent (agents may do deep research)

// ── Mongoose Models (inline — worker is standalone) ──────────────────────────

const GlobalDiscoveredProjectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  symbol: { type: String, default: null },
  description: { type: String, required: true },
  primaryCategory: { type: Number, default: null, min: 1, max: 6 },
  categoryWeights: {
    type: [{
      category: { type: Number, required: true, min: 1, max: 6 },
      weight: { type: Number, required: true, min: 0, max: 1 },
    }],
    default: null,
  },
  crackAlignment: { type: [Number], default: [] },
  discoveryReason: { type: String, required: true },
  sector: { type: String, default: null },
  launchDate: { type: String, default: null },
  sources: { type: [String], default: [] },
  signalStrength: { type: Number, default: 0.5, min: 0, max: 1 },
  logoUrl: { type: String, default: null },
  marketCap: { type: Number, default: null },
  volume24h: { type: Number, default: null },
  websiteUrl: { type: String, default: null },
}, { _id: false })

const GlobalDiscoveryReportSchema = new mongoose.Schema({
  generation: { type: Number, required: true, default: 1 },
  jobId: { type: mongoose.Schema.Types.ObjectId, required: true },
  parentReportId: { type: mongoose.Schema.Types.ObjectId, default: null },
  projects: { type: [GlobalDiscoveredProjectSchema], default: [] },
  newProjects: { type: [GlobalDiscoveredProjectSchema], default: [] },
  marketDirection: { type: String, default: null },
  crossPillarInsights: { type: String, default: null },
  emergingTrends: { type: [String], default: [] },
  executiveSummary: { type: String, required: true },
  depth: { type: Number, required: true },
  agentCount: { type: Number, required: true },
  totalProjects: { type: Number, required: true, default: 0 },
  newProjectCount: { type: Number, required: true, default: 0 },
  createdAt: { type: Date, default: Date.now },
})
const GlobalDiscoveryReport = mongoose.models.GlobalDiscoveryReport || mongoose.model('GlobalDiscoveryReport', GlobalDiscoveryReportSchema)

const GlobalDiscoveryJobSchema = new mongoose.Schema({
  depth: { type: Number, required: true, default: 20 },
  agentCount: { type: Number, required: true, default: 5 },
  modelId: { type: String, required: true },
  agentModels: { type: mongoose.Schema.Types.Mixed, default: null },
  status: { type: String, required: true, enum: ['pending', 'running', 'completed', 'failed'], default: 'pending' },
  previousReportId: { type: mongoose.Schema.Types.ObjectId, default: null },
  reportId: { type: mongoose.Schema.Types.ObjectId, default: null },
  agentResults: { type: mongoose.Schema.Types.Mixed, default: null },
  error: { type: String, default: null },
  pid: { type: Number, default: null },
  logs: { type: [String], default: [] },
  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },
})
const GlobalDiscoveryJob = mongoose.models.GlobalDiscoveryJob || mongoose.model('GlobalDiscoveryJob', GlobalDiscoveryJobSchema)

// ── JSON event parsing (same as classify-worker) ──────────────────────────────

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
  configPaths?: DecryptedConfigPaths | null,
): Promise<AgentRunResult> {
  const HOME_DIR = process.env.HOME ?? '/root'
  const startTime = Date.now()

  const args = [
    'run', '--rm',
    '--network', 'bridge',
    '--add-host', 'host.docker.internal:host-gateway',
    '-v', `${configPaths?.authJsonPath ?? `${HOME_DIR}/.local/share/opencode/auth.json`}:/root/.local/share/opencode/auth.json:ro`,
    '-v', `${HOME_DIR}/.config/opencode:/root/.config/opencode:ro`,
    '-v', `${workDir}:/workspace:rw`,
    '-e', 'HOME=/root',
    OPENCODE_IMAGE,
    'run', '-m', model, '--format', 'json', '--print-logs', '--log-level', 'WARN', '--dir', '/workspace',
    'You are an autonomous background worker — there is no user interaction. Read INSTRUCTIONS.md then each file in data/ directory. Do ALL research YOURSELF using websearch_web_search_exa and webfetch — do NOT delegate to sub-agents or use the Task tool. Do NOT ask questions or output status updates. Your ONLY output must be the raw JSON object specified in INSTRUCTIONS.md.',
  ]

  log(`[${agentType}] Starting agent (model: ${model})`)
  await appendLogs(jobId, [`[${agentType}] Starting...`])

  return new Promise((resolve) => {
    const child = spawn(DOCKER_BIN, args, {
      env: { PATH: process.env.PATH, HOME: process.env.HOME, DOCKER_HOST: process.env.DOCKER_HOST },
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

// ── Build agent workspaces ───────────────────────────────────────────────────

function buildMasterPlannerWorkspace(
  depth: number,
  agentCount: number,
  previousReport: {
    executiveSummary: string
    totalProjects: number
    emergingTrends: string[]
    projects: Array<{ name: string; sector: string | null; primaryCategory: number | null }>
  } | null,
): string {
  const tmpDir = path.join(tmpdir(), `oculus-global-master-${Date.now()}`)
  mkdirSync(tmpDir, { recursive: true })
  mkdirSync(path.join(tmpDir, 'data'), { recursive: true })

  const prompt = buildMasterPlannerPrompt(depth, agentCount, previousReport)
  writeFileSync(path.join(tmpDir, 'INSTRUCTIONS.md'), prompt, 'utf-8')

  if (previousReport) {
    writeFileSync(
      path.join(tmpDir, 'data', 'previous-report.json'),
      JSON.stringify(previousReport, null, 2),
      'utf-8'
    )
  }

  return tmpDir
}

function buildDiscoveryAgentWorkspace(
  agentId: string,
  depth: number,
  assignment: {
    focus_area: string
    search_queries: string[]
    sectors_to_explore: string[]
    avoid_projects: string[]
  },
  previousProjects: Array<{ name: string; symbol: string | null }>,
): string {
  const tmpDir = path.join(tmpdir(), `oculus-global-agent-${agentId}-${Date.now()}`)
  mkdirSync(tmpDir, { recursive: true })
  mkdirSync(path.join(tmpDir, 'data'), { recursive: true })

  const prompt = buildDiscoveryAgentPrompt(agentId, depth, assignment, previousProjects)
  writeFileSync(path.join(tmpDir, 'INSTRUCTIONS.md'), prompt, 'utf-8')

  writeFileSync(
    path.join(tmpDir, 'data', 'assignment.json'),
    JSON.stringify(assignment, null, 2),
    'utf-8'
  )

  return tmpDir
}

function buildSynthesizerWorkspace(
  agentResults: DiscoveryAgentResult[],
  previousReport: {
    executiveSummary: string
    totalProjects: number
    projects: IGlobalDiscoveredProject[]
    emergingTrends: string[]
  } | null,
  depth: number,
  agentCount: number,
): string {
  const tmpDir = path.join(tmpdir(), `oculus-global-synth-${Date.now()}`)
  mkdirSync(tmpDir, { recursive: true })
  mkdirSync(path.join(tmpDir, 'data'), { recursive: true })

  const prompt = buildSynthesizerPrompt(agentResults, previousReport, depth, agentCount)
  writeFileSync(path.join(tmpDir, 'INSTRUCTIONS.md'), prompt, 'utf-8')

  // Write each agent result as a separate file for reference
  for (const result of agentResults) {
    writeFileSync(
      path.join(tmpDir, 'data', `${result.agent_id}.json`),
      JSON.stringify(result, null, 2),
      'utf-8'
    )
  }

  if (previousReport) {
    writeFileSync(
      path.join(tmpDir, 'data', 'previous-report.json'),
      JSON.stringify(previousReport, null, 2),
      'utf-8'
    )
  }

  return tmpDir
}

// ── Logging ──────────────────────────────────────────────────────────────────

async function appendLogs(jobId: string, lines: string[]): Promise<void> {
  if (lines.length === 0) return
  try {
    const timestamped = lines.map(l => `${new Date().toISOString().substring(11, 19)} ${l}`)
    await GlobalDiscoveryJob.updateOne(
      { _id: jobId },
      { $push: { logs: { $each: timestamped } } },
    )
  } catch {
    console.error('[global-discovery-worker] Failed to append logs to DB')
  }
}

function log(msg: string) {
  const ts = new Date().toISOString().substring(11, 23)
  console.log(`[global-discovery ${ts}] ${msg}`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const jobId = process.argv[2]
  if (!jobId) {
    console.error('Usage: bun scripts/global-discovery-worker.ts <jobId>')
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

  // Decrypt per-user config if password hash is provided
  let configPaths: DecryptedConfigPaths | null = null
  const passwordHash = process.env.OCULUS_SECRET_FILE
    ? readFileSync(process.env.OCULUS_SECRET_FILE, 'utf-8').trim()
    : process.env.OCULUS_PASSWORD_HASH // fallback for backward compat
  if (passwordHash) {
    try {
      configPaths = await decryptConfigForMount(mongoose.connection, passwordHash)
      log('Decrypted user config for Docker mounts')
    } catch (err) {
      console.error('Failed to decrypt user config:', err)
      process.exit(1)
    }
  }

  // Load the job
  const job = await GlobalDiscoveryJob.findById(jobId)
  if (!job) {
    console.error(`Job ${jobId} not found in database`)
    await mongoose.disconnect()
    process.exit(1)
  }

  const depth = (job.depth as number) ?? 20
  const agentCount = (job.agentCount as number) ?? 5
  const model = job.modelId as string
  const agentModels = (job.agentModels as Record<string, string> | null) ?? null
  const previousReportId = job.previousReportId as mongoose.Types.ObjectId | null
  const getModelForAgent = (agentType: string): string => {
    // For individual discovery agents (agent_1, agent_2, etc), check specific key first,
    // then fall back to the 'discovery_agent' template key from AI Config
    if (agentType.startsWith('agent_')) {
      return agentModels?.[agentType] || agentModels?.['discovery_agent'] || model
    }
    // For synthesizer, use 'global_synthesizer' key (distinct from classification synthesizer)
    if (agentType === 'synthesizer') {
      return agentModels?.['global_synthesizer'] || agentModels?.['synthesizer'] || model
    }
    return agentModels?.[agentType] || model
  }

  log(`Job loaded: depth=${depth}, agentCount=${agentCount}, model=${model}`)

  // Mark as running
  await GlobalDiscoveryJob.updateOne(
    { _id: jobId },
    { $set: { status: 'running', pid: process.pid } },
  )

  try {
    // Load previous report for context inheritance
    let previousReport: {
      _id: mongoose.Types.ObjectId
      generation: number
      executiveSummary: string
      totalProjects: number
      projects: IGlobalDiscoveredProject[]
      emergingTrends: string[]
    } | null = null

    if (previousReportId) {
      previousReport = await GlobalDiscoveryReport.findById(previousReportId).lean() as typeof previousReport
    }

    if (!previousReport) {
      // Fallback: find the latest report
      previousReport = await GlobalDiscoveryReport.findOne(
        {},
        { _id: 1, generation: 1, executiveSummary: 1, totalProjects: 1, projects: 1, emergingTrends: 1 },
        { sort: { createdAt: -1 } },
      ).lean() as typeof previousReport
    }

    log(`Previous report: ${previousReport ? `generation ${previousReport.generation}, ${previousReport.totalProjects} projects` : 'none (first run)'}`)
    await appendLogs(jobId, [
      previousReport
        ? `Context: Previous report gen ${previousReport.generation} with ${previousReport.totalProjects} projects`
        : 'Context: First discovery run — starting fresh'
    ])

    // ── Phase 1: Run master planner ──
    log('Phase 1: Running master planner agent...')
    await appendLogs(jobId, ['Phase 1: Master planner analyzing landscape...'])

    const masterWorkDir = buildMasterPlannerWorkspace(
      depth,
      agentCount,
      previousReport ? {
        executiveSummary: previousReport.executiveSummary,
        totalProjects: previousReport.totalProjects,
        emergingTrends: previousReport.emergingTrends,
        projects: previousReport.projects.map(p => ({
          name: p.name,
          sector: p.sector,
          primaryCategory: p.primaryCategory,
          crackAlignment: p.crackAlignment,
        })),
      } : null,
    )
    // Also write crack saturation data as a separate file for the master planner
    if (previousReport) {
      const crackCounts: Record<number, number> = {}
      for (const p of previousReport.projects) {
        for (const c of (p.crackAlignment ?? [])) {
          crackCounts[c] = (crackCounts[c] ?? 0) + 1
        }
      }
      log(`Crack saturation: ${JSON.stringify(crackCounts)}`)
    }

    let masterPlan: MasterPlanResult | null = null
    try {
      const masterResult = await runAgent(getModelForAgent('master_planner'), masterWorkDir, 'master_planner', jobId, configPaths)
      if (masterResult.success) {
        masterPlan = parseMasterPlan(masterResult.text)
      }
      if (!masterPlan) {
        log('Master planner failed to produce a valid plan')
        await appendLogs(jobId, ['Master planner: FAILED to produce plan — using fallback assignments'])

        // Fallback: create generic assignments
        masterPlan = {
          search_assignments: Array.from({ length: agentCount }, (_, i) => ({
            agent_id: `agent_${i + 1}`,
            focus_area: [
              'DeFi protocols and financial primitives',
              'AI + crypto and compute networks',
              'Infrastructure and scalability solutions',
              'Real-world assets and institutional crypto',
              'Social, identity, and governance protocols',
            ][i % 5]!,
            search_queries: [`new crypto projects 2024 2025 ${['DeFi', 'AI blockchain', 'crypto infrastructure', 'RWA tokenization', 'decentralized identity'][i % 5]}`],
            sectors_to_explore: [['DeFi', 'Lending'], ['AI', 'Compute'], ['L2', 'Bridges'], ['RWA', 'Stablecoins'], ['Identity', 'Social']][i % 5]!,
            avoid_projects: previousReport?.projects.map(p => p.name) ?? [],
          })),
          global_direction: 'Unable to assess — master planner failed',
          priority_sectors: [],
          gaps_in_coverage: [],
        }
      }
    } finally {
      try { rmSync(masterWorkDir, { recursive: true, force: true }) } catch { /* ignore */ }
    }

    log(`Phase 1 complete: ${masterPlan.search_assignments.length} assignments planned`)
    await appendLogs(jobId, [
      `Master planner: ${masterPlan.search_assignments.length} search assignments created`,
      `Direction: ${masterPlan.global_direction.substring(0, 100)}...`,
    ])

    // ── Phase 2: Run N discovery agents in parallel ──
    log(`Phase 2: Running ${masterPlan.search_assignments.length} discovery agents in parallel...`)
    await appendLogs(jobId, [`Phase 2: Spawning ${masterPlan.search_assignments.length} discovery agents...`])

    const previousProjects = previousReport?.projects.map(p => ({ name: p.name, symbol: p.symbol })) ?? []
    const agentResultsMap: Record<string, {
      agentId: string
      status: 'completed' | 'failed'
      projectsFound: number
      rawOutput: string | null
      error: string | null
      durationMs: number
    }> = {}

    const discoveryResults: DiscoveryAgentResult[] = []

    const agentPromises = masterPlan.search_assignments.map(async (assignment) => {
      const agentId = assignment.agent_id
      const workDir = buildDiscoveryAgentWorkspace(agentId, depth, assignment, previousProjects)
      try {
        const agentModel = getModelForAgent(agentId)
        const result = await runAgent(agentModel, workDir, agentId, jobId, configPaths)
        const parsed = result.success ? parseDiscoveryAgent(result.text) : null

        if (parsed) {
          discoveryResults.push(parsed)
        }

        agentResultsMap[agentId] = {
          agentId,
          status: parsed ? 'completed' : 'failed',
          projectsFound: parsed?.projects.length ?? 0,
          rawOutput: result.text || null,
          error: result.error || (result.success && !parsed ? 'Failed to parse agent response' : null),
          durationMs: result.durationMs,
        }
      } catch (err) {
        agentResultsMap[agentId] = {
          agentId,
          status: 'failed',
          projectsFound: 0,
          rawOutput: null,
          error: err instanceof Error ? err.message : 'Unknown agent error',
          durationMs: 0,
        }
      } finally {
        try { rmSync(workDir, { recursive: true, force: true }) } catch { /* ignore */ }
      }
    })

    await Promise.all(agentPromises)

    const successCount = discoveryResults.length
    const totalNewProjects = discoveryResults.reduce((sum, r) => sum + r.projects.length, 0)
    log(`Phase 2 complete: ${successCount}/${masterPlan.search_assignments.length} agents succeeded, ${totalNewProjects} projects found`)
    await appendLogs(jobId, [
      `Phase 2 done: ${successCount}/${masterPlan.search_assignments.length} agents succeeded`,
      `Total new projects found: ${totalNewProjects}`,
    ])

    // Update job with agent results
    await GlobalDiscoveryJob.updateOne(
      { _id: jobId },
      { $set: { agentResults: agentResultsMap } },
    )

    if (successCount === 0) {
      log('All discovery agents failed — cannot synthesize')
      await GlobalDiscoveryJob.updateOne(
        { _id: jobId },
        { $set: { status: 'failed', error: 'All discovery agents failed', completedAt: new Date() } },
      )
      await mongoose.disconnect()
      process.exit(0)
    }

    // ── Phase 3: Run synthesizer ──
    log('Phase 3: Running synthesizer agent...')
    await appendLogs(jobId, ['Phase 3: Synthesizing findings into unified report...'])

    const synthWorkDir = buildSynthesizerWorkspace(
      discoveryResults,
      previousReport ? {
        executiveSummary: previousReport.executiveSummary,
        totalProjects: previousReport.totalProjects,
        projects: previousReport.projects,
        emergingTrends: previousReport.emergingTrends,
      } : null,
      depth,
      agentCount,
    )

    let synthResult: SynthesizerResult | null = null
    try {
      const rawResult = await runAgent(getModelForAgent('synthesizer'), synthWorkDir, 'synthesizer', jobId, configPaths)
      if (rawResult.success) {
        synthResult = parseSynthesizerResult(rawResult.text)
      }
    } finally {
      try { rmSync(synthWorkDir, { recursive: true, force: true }) } catch { /* ignore */ }
    }

    if (!synthResult) {
      log('Synthesizer failed — constructing report from raw agent results')
      await appendLogs(jobId, ['Synthesizer failed — building report from raw agent data'])

      // Fallback: combine agent results directly
      const allProjects = [
        ...(previousReport?.projects ?? []),
        ...discoveryResults.flatMap(r => r.projects),
      ]
      // Deduplicate by name (case-insensitive)
      const seen = new Set<string>()
      const deduped: IGlobalDiscoveredProject[] = []
      for (const p of allProjects) {
        const key = p.name.toLowerCase()
        if (!seen.has(key)) {
          seen.add(key)
          deduped.push(p)
        }
      }

      const newProjects = discoveryResults.flatMap(r => r.projects)

      synthResult = {
        projects: deduped,
        newProjects,
        marketDirection: masterPlan.global_direction,
        crossPillarInsights: null,
        emergingTrends: discoveryResults.flatMap(r => r.notable_trends),
        executiveSummary: `Discovered ${newProjects.length} new projects across ${successCount} agents. Total tracked: ${deduped.length}.`,
      }
    }

    log(`Synthesis complete: ${synthResult.projects.length} total projects, ${synthResult.newProjects.length} new`)
    await appendLogs(jobId, [
      `Report: ${synthResult.projects.length} total projects, ${synthResult.newProjects.length} new`,
      `Direction: ${(synthResult.marketDirection ?? 'unknown').substring(0, 100)}`,
    ])

    // ── Phase 4: Enrich with market data (multi-source fallback) ──
    // Sources tried in order: CoinGecko → CoinPaprika → CoinCap
    // Each source fills in only the projects still missing data.
    log('Phase 4: Enriching projects with market data (multi-source)...')
    await appendLogs(jobId, ['Phase 4: Fetching market data — CoinGecko → CoinPaprika → CoinCap...'])
    try {
      // ── Shared symbol map (symbol → CoinGecko ID) ──────────────────────────
      const SYMBOL_TO_CG: Record<string, string> = {
        // L1 / major
        BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', BNB: 'binancecoin',
        ADA: 'cardano', XRP: 'ripple', AVAX: 'avalanche-2', DOT: 'polkadot',
        ATOM: 'cosmos', TRX: 'tron', MATIC: 'matic-network', SUI: 'sui',
        APT: 'aptos', SEI: 'sei-network', TON: 'the-open-network',
        ALPH: 'alephium', SHM: 'shardeum', NEAR: 'near',
        // L2 / infra
        ARB: 'arbitrum', OP: 'optimism', IMX: 'immutable-x',
        STRK: 'starknet', MANTA: 'manta-network',
        // DeFi
        AAVE: 'aave', UNI: 'uniswap', MKR: 'maker', LDO: 'lido-dao',
        PENDLE: 'pendle', GMX: 'gmx', RUNE: 'thorchain', CRV: 'curve-dao-token',
        MORPHO: 'morpho', KAMINO: 'kamino', HYPE: 'hyperliquid',
        // AI / compute
        TAO: 'bittensor', RNDR: 'render-token', RENDER: 'render-token',
        FET: 'fetch-ai', IO: 'io-net', FLUX: 'zel', GRT: 'the-graph',
        ICP: 'internet-computer', AKT: 'akash-network',
        // Storage / infra
        FIL: 'filecoin', AR: 'arweave',
        // Interop / oracle
        LINK: 'chainlink', INJ: 'injective-protocol', TIA: 'celestia',
        // Identity / social
        CVC: 'civic', TEL: 'telcoin', MOCA: 'moca-network',
        // Gaming / other
        ILV: 'illuvium', HNT: 'helium', MOBILE: 'helium-mobile',
        WLD: 'worldcoin-wld', SENT: 'sentient',
      }

      // Build normalized symbol list (strip USDT/USD suffix, take first token)
      interface SymbolEntry { name: string; symbol: string; idx: number }
      const symbolsWithIndex: SymbolEntry[] = []
      synthResult.projects.forEach((p, idx) => {
        if (p.symbol) {
          const sym = p.symbol.toUpperCase().split(/[/\s]/)[0]!.replace(/USDT$/i, '').replace(/USD$/i, '').trim()
          if (sym) symbolsWithIndex.push({ name: p.name, symbol: sym, idx })
        }
      })

      if (symbolsWithIndex.length > 0) {
        // Helper: apply enrichment result to projects array
        const applyEnrichment = (results: Array<{ symbol: string; marketCap: number | null; volume24h: number | null }>) => {
          for (const r of results) {
            const entries = symbolsWithIndex.filter(s => s.symbol === r.symbol)
            for (const e of entries) {
              const p = synthResult.projects[e.idx]!
              if (p.marketCap === null) p.marketCap = r.marketCap
              if (p.volume24h === null) p.volume24h = r.volume24h
            }
          }
        }

        // ── Source 1: CoinGecko /coins/markets (batch by ID) ──────────────────
        try {
          const symbolToIdx: Record<string, number[]> = {}
          const ids = [...new Set(symbolsWithIndex.map(s => {
            const cgId = SYMBOL_TO_CG[s.symbol] ?? s.symbol.toLowerCase()
            if (!symbolToIdx[cgId]) symbolToIdx[cgId] = []
            symbolToIdx[cgId]!.push(s.idx)
            return cgId
          }))]
          const cgUrl = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids.join(',')}&order=market_cap_desc&per_page=250&page=1&sparkline=false`
          const cgRes = await fetch(cgUrl, { headers: { 'User-Agent': 'oculus-trading/1.0' }, signal: AbortSignal.timeout(20_000) })
          if (cgRes.ok) {
            const cgData = await cgRes.json() as Array<{ id: string; symbol: string; market_cap: number | null; total_volume: number | null }>
            for (const coin of cgData) {
              const indices = symbolToIdx[coin.id] ?? symbolToIdx[coin.symbol?.toUpperCase()] ?? []
              for (const idx of indices) {
                const p = synthResult.projects[idx]!
                p.marketCap = coin.market_cap ?? null
                p.volume24h = coin.total_volume ?? null
              }
            }
            const cgCount = synthResult.projects.filter(p => p.marketCap !== null).length
            log(`CoinGecko: ${cgCount}/${synthResult.projects.length} projects enriched`)
          } else {
            log(`CoinGecko returned ${cgRes.status} — skipping`)
          }
        } catch (e) {
          log(`CoinGecko failed: ${e instanceof Error ? e.message : e}`)
        }

        // ── Source 2: CoinPaprika /v1/tickers (batch, free) ───────────────────
        // Fills in projects still missing marketCap after CoinGecko
        const missingAfterCG = symbolsWithIndex.filter(s => synthResult.projects[s.idx]!.marketCap === null)
        if (missingAfterCG.length > 0) {
          try {
            const paprikaRes = await fetch('https://api.coinpaprika.com/v1/tickers?quotes=USD&limit=2000', {
              headers: { 'User-Agent': 'oculus-trading/1.0' },
              signal: AbortSignal.timeout(20_000),
            })
            if (paprikaRes.ok) {
              const paprikaData = await paprikaRes.json() as Array<{
                symbol: string
                quotes: { USD: { market_cap: number | null; volume_24h: number | null } }
              }>
              // Build a symbol → data map (take the highest market cap entry per symbol)
              const paprikaMap: Record<string, { marketCap: number | null; volume24h: number | null }> = {}
              for (const coin of paprikaData) {
                const sym = coin.symbol?.toUpperCase()
                if (!sym) continue
                const mc = coin.quotes?.USD?.market_cap ?? null
                const existing = paprikaMap[sym]
                if (!existing || (mc !== null && (existing.marketCap === null || mc > existing.marketCap))) {
                  paprikaMap[sym] = { marketCap: mc, volume24h: coin.quotes?.USD?.volume_24h ?? null }
                }
              }
              const papResults = missingAfterCG
                .filter(s => paprikaMap[s.symbol])
                .map(s => ({ symbol: s.symbol, ...paprikaMap[s.symbol]! }))
              applyEnrichment(papResults)
              const papCount = papResults.filter(r => r.marketCap !== null).length
              log(`CoinPaprika: ${papCount} additional projects enriched`)
            } else {
              log(`CoinPaprika returned ${paprikaRes.status} — skipping`)
            }
          } catch (e) {
            log(`CoinPaprika failed: ${e instanceof Error ? e.message : e}`)
          }
        }

        // ── Source 3: CoinCap /v2/assets search (per-symbol for remaining) ──
        const missingAfterPaprika = symbolsWithIndex.filter(s => synthResult.projects[s.idx]!.marketCap === null)
        if (missingAfterPaprika.length > 0) {
          const coincapResults: Array<{ symbol: string; marketCap: number | null; volume24h: number | null }> = []
          // Batch: fetch up to 10 in parallel to avoid hammering the API
          const BATCH = 10
          for (let i = 0; i < missingAfterPaprika.length; i += BATCH) {
            const batch = missingAfterPaprika.slice(i, i + BATCH)
            const batchResults = await Promise.allSettled(batch.map(async s => {
              const res = await fetch(`https://api.coincap.io/v2/assets?search=${encodeURIComponent(s.symbol)}&limit=3`, {
                headers: { 'User-Agent': 'oculus-trading/1.0' },
                signal: AbortSignal.timeout(10_000),
              })
              if (!res.ok) return null
              const json = await res.json() as { data: Array<{ symbol: string; marketCapUsd: string | null; volumeUsd24Hr: string | null }> }
              const match = json.data?.find(d => d.symbol?.toUpperCase() === s.symbol)
              if (!match) return null
              return {
                symbol: s.symbol,
                marketCap: match.marketCapUsd ? parseFloat(match.marketCapUsd) : null,
                volume24h: match.volumeUsd24Hr ? parseFloat(match.volumeUsd24Hr) : null,
              }
            }))
            for (const r of batchResults) {
              if (r.status === 'fulfilled' && r.value) coincapResults.push(r.value)
            }
          }
          applyEnrichment(coincapResults)
          const ccCount = coincapResults.filter(r => r.marketCap !== null).length
          if (ccCount > 0) log(`CoinCap: ${ccCount} additional projects enriched`)
        }

        // Mirror all enrichment into newProjects
        synthResult.newProjects.forEach(np => {
          const enriched = synthResult.projects.find(p => p.name === np.name)
          if (enriched) { np.marketCap = enriched.marketCap; np.volume24h = enriched.volume24h }
        })

        const totalEnriched = synthResult.projects.filter(p => p.marketCap !== null).length
        log(`Market data total: ${totalEnriched}/${synthResult.projects.length} projects enriched`)
        await appendLogs(jobId, [`Market data: ${totalEnriched}/${synthResult.projects.length} enriched via CoinGecko + CoinPaprika + CoinCap`])
      }
    } catch (enrichErr) {
      log(`Market data enrichment failed (non-fatal): ${enrichErr instanceof Error ? enrichErr.message : enrichErr}`)
    }

    // Sort all projects by marketCap descending (nulls last)
    const sortByMarketCap = (arr: IGlobalDiscoveredProject[]) =>
      arr.sort((a, b) => {
        if (a.marketCap === null && b.marketCap === null) return 0
        if (a.marketCap === null) return 1
        if (b.marketCap === null) return -1
        return b.marketCap - a.marketCap
      })
    sortByMarketCap(synthResult.projects)
    sortByMarketCap(synthResult.newProjects)
    log('Projects sorted by marketCap descending')

    // ── Phase 5: Save report and update job ──
    const generation = previousReport ? (previousReport.generation ?? 0) + 1 : 1

    const report = await GlobalDiscoveryReport.create({
      generation,
      jobId: new mongoose.Types.ObjectId(jobId),
      parentReportId: previousReport?._id ?? null,
      projects: synthResult.projects,
      newProjects: synthResult.newProjects,
      marketDirection: synthResult.marketDirection,
      crossPillarInsights: synthResult.crossPillarInsights,
      emergingTrends: synthResult.emergingTrends,
      executiveSummary: synthResult.executiveSummary,
      depth,
      agentCount,
      totalProjects: synthResult.projects.length,
      newProjectCount: synthResult.newProjects.length,
    })

    await GlobalDiscoveryJob.updateOne(
      { _id: jobId },
      {
        $set: {
          status: 'completed',
          reportId: report._id,
          completedAt: new Date(),
        },
      },
    )

    log(`Job completed: report ${report._id} (generation ${generation})`)
    await appendLogs(jobId, [`Report saved: generation ${generation}, ${synthResult.projects.length} projects`])

    log('Job completed successfully')
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown worker error'
    log(`Worker error: ${errorMsg}`)
    await GlobalDiscoveryJob.updateOne(
      { _id: jobId },
      { $set: { status: 'failed', error: errorMsg, completedAt: new Date() } },
    ).catch(() => { /* ignore DB errors during error handling */ })
  }

  // Cleanup decrypted config temp files
  if (configPaths) cleanupDecryptedConfig(configPaths)

  await mongoose.disconnect()
  process.exit(0)
}

main().catch((err) => {
  console.error('Fatal worker error:', err)
  process.exit(1)
})
