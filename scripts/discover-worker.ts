#!/usr/bin/env bun
/**
 * Discovery Worker — Off-main-thread agent execution.
 *
 * Usage: bun scripts/discover-worker.ts <jobId>
 *
 * 1. Connects to MongoDB
 * 2. Loads the DiscoveryJob by ID
 * 3. Runs OpenCode CLI (unlimited time — no web request timeout)
 * 4. Parses the response
 * 5. Saves result to DB
 * 6. Exits
 *
 * This script is spawned as a detached child process by the API route,
 * so the web server can return immediately with the jobId.
 */
import mongoose from 'mongoose'
import { spawn } from 'child_process'
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

// ── Per-user config decryption (optional — when OCULUS_PASSWORD_HASH is set) ──
import { decryptConfigForMount, cleanupDecryptedConfig } from '../apps/web/src/lib/auth/vault'
import type { DecryptedConfigPaths } from '../apps/web/src/lib/auth/vault'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DiscoveredProjectInfo {
  [key: string]: unknown
  projectName: string | null
  description: string | null
  discoveredAt: string
  sourcesUsed: string[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MONGODB_URI = process.env.YGGDRASIGHT_MONGODB_URI || process.env.MONGODB_URI || 'mongodb://yggdrasight:yggdrasight_dev_secret@localhost:27017/yggdrasight?authSource=admin'
const DOCKER_BIN = process.env.DOCKER_BIN ?? 'docker'
const OPENCODE_IMAGE = process.env.OPENCODE_IMAGE ?? 'ghcr.io/anomalyco/opencode'
// No hard timeout — the agent can take as long as it needs
const WORKER_TIMEOUT_MS = 900_000 // 15 minutes safety limit (agents may do deep research)

// ── Symbol name mappings ──────────────────────────────────────────────────────

const SYMBOL_NAMES: Record<string, string> = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  SOL: 'Solana',
  BNB: 'BNB Chain (Binance)',
  TAO: 'Bittensor',
  PENDLE: 'Pendle Finance',
  DOGE: 'Dogecoin',
  ADA: 'Cardano',
  XRP: 'Ripple XRP',
  AVAX: 'Avalanche',
  DOT: 'Polkadot',
  LINK: 'Chainlink',
  UNI: 'Uniswap',
  ATOM: 'Cosmos',
  ARB: 'Arbitrum',
  OP: 'Optimism',
  APT: 'Aptos',
  SUI: 'Sui',
  NEAR: 'NEAR Protocol',
  FIL: 'Filecoin',
  AAVE: 'Aave',
  INJ: 'Injective',
  RENDER: 'Render Network',
  FET: 'Fetch.ai',
  ICP: 'Internet Computer',
  TIA: 'Celestia',
  JUP: 'Jupiter (Solana)',
  ONDO: 'Ondo Finance',
  SEI: 'Sei Network',
  SENT: 'Sentient',
}

// ── Mongoose Model (inline — worker is standalone) ────────────────────────────

const DiscoveryJobSchema = new mongoose.Schema({
  symbol: { type: String, required: true, index: true },
  modelId: { type: String, required: true },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'running', 'completed', 'failed'],
    default: 'pending',
  },
  result: { type: mongoose.Schema.Types.Mixed, default: null },
  rawOutput: { type: String, default: null },
  error: { type: String, default: null },
  pid: { type: Number, default: null },
  logs: { type: [String], default: [] },
  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },
})

const DiscoveryJob = mongoose.models.DiscoveryJob || mongoose.model('DiscoveryJob', DiscoveryJobSchema)

// ── JSON event parsing (copy from opencode.ts for standalone usage) ───────────

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

interface ExtractedResponse {
  text: string
  urlsFetched: string[]
  toolCallCount: number
}

function extractResponse(stdout: string): ExtractedResponse {
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

  // Try to find parseable JSON in ALL text first (agent may output JSON in any step),
  // then fall back to last step text for error reporting.
  const allText = allTextParts.join('')
  const lastStepText = stepTextParts[stepTextParts.length - 1]!

  // Prefer allText — gives parseDiscoveredInfo the full conversation to search for JSON
  if (allText.length > 0) return { text: allText, urlsFetched, toolCallCount }
  if (hasJsonEvents) return { text: '', urlsFetched, toolCallCount }
  return { text: stdout.trim(), urlsFetched: [], toolCallCount }
}
// ── Discovery prompt builder ──────────────────────────────────────────────────

function buildDiscoveryPrompt(symbol: string): string {
  const fullName = SYMBOL_NAMES[symbol] || symbol
  const slug = (SYMBOL_NAMES[symbol] || symbol).toLowerCase().replace(/[^a-z0-9]/g, '-')

  const jsonSchema = JSON.stringify({
    projectName: 'string or null',
    description: 'string or null - 2-3 sentence description',
    website: 'string or null',
    twitter: 'string or null - handle without @',
    github: 'string or null',
    discord: 'string or null',
    telegram: 'string or null',
    founders: ['name1', 'name2'],
    teamSize: 'string or null',
    teamBackground: 'string or null',
    fundingRounds: ['Series A: $10M (a16z, 2023)'],
    totalFunding: 'string or null - e.g. $85M',
    investors: ['VC1', 'VC2'],
    treasury: 'string or null - estimated runway',
    teamActivity: 'string or null - recent hiring/shipping signals',
    genesisDate: 'string or null',
    categories: ['cat1'],
    ecosystem: 'string or null',
    narrativeStrength: 'string or null - how well it fits current narratives',
    uniqueSellingPoint: 'string or null',
    competitors: ['comp1'],
    partnerships: ['partner1'],
    adoptionSignals: 'string or null - user metrics, dApp usage',
    tokenType: 'string or null',
    totalSupply: 'string or null',
    circulatingSupply: 'string or null',
    maxSupply: 'string or null',
    tvl: 'string or null',
    marketCap: 'string or null',
    fdv: 'string or null',
    revenueModel: 'string or null - how protocol earns',
    moatDescription: 'string or null - what makes it defensible',
    mainnetLaunched: 'true/false/null',
    audited: 'true/false/null',
    auditDetails: 'string or null - which firms, when',
    currentPrice: 'string or null',
    allTimeHigh: 'string or null',
    allTimeLow: 'string or null',
    priceFromATH: 'string or null - e.g. -56%',
    vestingSchedule: 'string or null',
    inflationRate: 'string or null',
    stakingYield: 'string or null',
    valuationNotes: 'string or null - your valuation assessment',
    contractAddress: 'string or null',
    chain: 'string or null',
    holderCount: 'string or null',
    activeAddresses24h: 'string or null',
    largeTransactions: 'string or null',
    topHolders: ['holder1 - X%'],
    onChainSummary: 'string or null',
    risks: ['risk1'],
    recentNews: ['news1'],
    pillar1Score: 'STRONG or MODERATE or WEAK',
    pillar2Score: 'STRONG or MODERATE or WEAK',
    pillar3Score: 'STRONG or MODERATE or WEAK',
    pillar4Score: 'STRONG or MODERATE or WEAK',
    aiSummary: 'string - 3-5 sentence overall assessment',
  }, null, 2)

  return [
    `You are a crypto research analyst. Your task is to deeply research the cryptocurrency project "${fullName}" (ticker: ${symbol}) and return a SINGLE JSON object.`,
    '',
    '## CRITICAL OUTPUT REQUIREMENT',
    '',
    'Your FINAL message MUST be ONLY a single JSON object matching the schema below.',
    'Do NOT wrap it in markdown code blocks. Do NOT add any commentary before or after.',
    'If you cannot find data for a field, set it to null.',
    '',
    '## RESEARCH STEPS (do these using tools, then output JSON)',
    '',
    'Use your websearch and webfetch tools extensively. Do NOT rely on training data.',
    '',
    '### Step 1: General Project Research',
    `Search for "${fullName} crypto" and "${symbol} cryptocurrency" to find:`,
    '- Official website, social links (Twitter/X, Discord, Telegram, GitHub)',
    '- Team/founders, background, funding rounds, investors',
    '- Token type, chain, tokenomics (supply, vesting)',
    '- Description, categories, ecosystem, competitors, partnerships',
    '- Revenue model, adoption signals, recent news, risks',
    '',
    '### Step 2: Valuation & Market Data',
    'Search CoinGecko and CoinMarketCap for:',
    '- Current price, ATH, ATL, % from ATH, market cap, FDV, TVL',
    '- Staking yield, inflation rate, vesting schedule',
    '',
    '### Step 3: On-Chain Activity',
    `Search for on-chain data using explorers:`,
    `- CoinGecko: https://www.coingecko.com/en/coins/${slug}`,
    `- CoinMarketCap: https://coinmarketcap.com/currencies/${slug}/`,
    `- DeFiLlama: https://defillama.com/protocol/${slug}`,
    '- Holder count, whale activity, top holders, active addresses',
    '',
    '### Step 4: OUTPUT JSON',
    '',
    'Rate each pillar as STRONG, MODERATE, or WEAK:',
    '1. Team Survival Fitness 2. Narrative Alignment 3. Economic Moat 4. Valuation & Accumulation Zone',
    '',
    'Then output ONLY this JSON (no text before or after):',
    '',
    jsonSchema,
    '',
    '## RULES',
    '- Your response MUST be ONLY the JSON object, nothing else',
    '- Use null for unfound fields',
    '- Be factual, do not speculate',
    '- If running low on steps, STOP researching and output the JSON with what you have',
    '- Do NOT narrate your research process in the final output',
  ].join('\n')
}

// ── Response parser ───────────────────────────────────────────────────────────

function parseDiscoveredInfo(text: string): Record<string, unknown> | null {
  try { return JSON.parse(text) } catch { /* nope */ }
  const jsonBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (jsonBlockMatch) { try { return JSON.parse(jsonBlockMatch[1]!) } catch { /* nope */ } }
  const jsonMatch = text.match(/\{[\s\S]*"projectName"[\s\S]*\}/)
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]) } catch {
      const str = jsonMatch[0]
      for (let end = str.length; end > 50; end--) {
        try { return JSON.parse(str.substring(0, end) + '}') } catch { continue }
      }
    }
  }
  return null
}

// ── Run OpenCode CLI ──────────────────────────────────────────────────────────

async function runOpenCode(
  model: string,
  prompt: string,
  jobId: string,
  configPaths?: DecryptedConfigPaths | null,
): Promise<{ success: boolean; text: string; error?: string; urlsFetched: string[]; toolCallCount: number }> {
  const HOME_DIR = process.env.HOME ?? '/root'
  const tmpDir = path.join(tmpdir(), `yggdrasight-job-${jobId}`)
  mkdirSync(tmpDir, { recursive: true })
  writeFileSync(path.join(tmpDir, 'prompt.txt'), prompt, 'utf-8')
  const args = [
    'run', '--rm',
    '--network', 'bridge',
    '--add-host', 'host.docker.internal:host-gateway',
    '-v', `${configPaths?.authJsonPath ?? `${HOME_DIR}/.local/share/opencode/auth.json`}:/root/.local/share/opencode/auth.json:ro`,
    '-v', `${HOME_DIR}/.config/opencode:/root/.config/opencode:ro`,
    '-v', `${tmpDir}:/workspace:rw`,
    '-e', 'HOME=/root',
    OPENCODE_IMAGE,
    'run', '-m', model, '--format', 'json', '--dir', '/workspace', 'Read /workspace/prompt.txt and follow the instructions in it exactly.',
  ]

  log(`Running OpenCode: ${model} (prompt ${(prompt.length / 1024).toFixed(1)}KB, tmpDir: ${tmpDir})`)
  await appendLogs(jobId, [`Starting ${model}...`])

  return new Promise((resolve) => {
    const child = spawn(DOCKER_BIN, args, {
      env: { PATH: process.env.PATH, HOME: process.env.HOME, DOCKER_HOST: process.env.DOCKER_HOST },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let resolved = false
    const pendingLogs: string[] = []
    let lastLogFlush = Date.now()
    const LOG_FLUSH_INTERVAL = 3000 // Write logs to DB every 3s

    // Periodic log flusher
    const logFlushTimer = setInterval(async () => {
      if (pendingLogs.length > 0) {
        const batch = pendingLogs.splice(0)
        await appendLogs(jobId, batch)
        lastLogFlush = Date.now()
      }
    }, LOG_FLUSH_INTERVAL)

    // Process stdout line-by-line for progress extraction
    let stdoutBuffer = ''
    child.stdout.on('data', (chunk: Buffer) => {
      const data = chunk.toString()
      stdout += data
      stdoutBuffer += data

      // Try to extract JSON events from the buffer for progress logging
      const jsonObjects = extractJsonObjects(stdoutBuffer)
      if (jsonObjects.length > 0) {
        // Move buffer past the last extracted object
        const lastObj = jsonObjects[jsonObjects.length - 1]!
        const lastIdx = stdoutBuffer.lastIndexOf(lastObj)
        if (lastIdx >= 0) {
          stdoutBuffer = stdoutBuffer.substring(lastIdx + lastObj.length)
        }

        for (const jsonStr of jsonObjects) {
          try {
            const event = JSON.parse(sanitizeJsonString(jsonStr))
            // Log tool_use events as progress
            if (event.type === 'tool_use' && event.part) {
              const tool = event.part.tool || 'unknown'
              const status = event.part.state?.status || ''
              if (status === 'completed') {
                const input = event.part.state?.input || {}
                let detail = ''
                if (tool === 'read' && input.filePath) detail = ` ${input.filePath.split('/').slice(-2).join('/')}`
                else if (tool === 'webfetch' && input.url) detail = ` ${input.url.substring(0, 80)}`
                else if (tool === 'websearch_web_search_exa' && input.query) detail = ` "${input.query}"`
                else if (tool === 'bash' && input.command) detail = ` ${input.command.substring(0, 60)}`
                pendingLogs.push(`✓ ${tool}${detail}`)
              } else if (status === 'running') {
                const input = event.part.state?.input || {}
                let detail = ''
                if (tool === 'webfetch' && input.url) detail = ` ${input.url.substring(0, 80)}`
                else if (tool === 'websearch_web_search_exa' && input.query) detail = ` "${input.query}"`
                pendingLogs.push(`▶ ${tool}${detail}`)
              }
            }
            // Stream agent text output in real-time
            if (event.type === 'text' && event.part?.text) {
              const chunk = event.part.text
              // Only log non-trivial chunks to avoid spamming single characters
              if (chunk.trim().length > 0) {
                pendingLogs.push(chunk)
              }
            }
          } catch { /* skip unparseable */ }
        }
      }
    })

    child.stderr.on('data', (chunk: Buffer) => {
      const data = chunk.toString()
      stderr += data
      // Filter noise, log significant stderr
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
        pendingLogs.push(...lines.map((l: string) => `[stderr] ${l.trim().substring(0, 200)}`))
      }
    })

    // Safety timeout
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        clearInterval(logFlushTimer)
        child.kill('SIGTERM')
        appendLogs(jobId, [...pendingLogs, 'TIMEOUT: Worker killed after 10 minutes']).finally(() => {
          rmSync(tmpDir, { recursive: true, force: true })
          resolve({ success: false, text: '', error: `OpenCode CLI timed out after ${WORKER_TIMEOUT_MS}ms`, urlsFetched: [], toolCallCount: 0 })
        })
      }
    }, WORKER_TIMEOUT_MS)

    child.on('close', async (code) => {
      clearTimeout(timeout)
      clearInterval(logFlushTimer)

      if (resolved) return
      resolved = true

      // Flush remaining logs
      if (pendingLogs.length > 0) {
        await appendLogs(jobId, pendingLogs.splice(0))
      }

      rmSync(tmpDir, { recursive: true, force: true })

      const { text, urlsFetched, toolCallCount } = extractResponse(stdout)
      const trimmedText = text.trim()

      log(`stdout: ${stdout.length}B, text: ${trimmedText.length}B, ${toolCallCount} tool calls, ${urlsFetched.length} URLs, exit code: ${code}`)
      await appendLogs(jobId, [`Completed: ${toolCallCount} tool calls, ${urlsFetched.length} URLs, ${trimmedText.length}B response`])

      if (!trimmedText) {
        resolve({ success: false, text: '', error: 'Empty response from OpenCode CLI', urlsFetched, toolCallCount })
      } else {
        resolve({ success: true, text: trimmedText, urlsFetched, toolCallCount })
      }
    })

    child.on('error', async (err) => {
      clearTimeout(timeout)
      clearInterval(logFlushTimer)

      if (resolved) return
      resolved = true

      const msg = err.message || 'Unknown spawn error'
      rmSync(tmpDir, { recursive: true, force: true })
      await appendLogs(jobId, [...pendingLogs, `ERROR: ${msg}`])
    })

    // Close stdin so opencode doesn't hang waiting for input
    child.stdin?.end()
  })
}

/**
 * Append log lines to a DiscoveryJob in the database.
 * Uses $push to atomically add to the logs array.
 */
async function appendLogs(jobId: string, lines: string[]): Promise<void> {
  if (lines.length === 0) return
  try {
    const timestamped = lines.map(l => `${new Date().toISOString().substring(11, 19)} ${l}`)
    await DiscoveryJob.updateOne(
      { _id: jobId },
      { $push: { logs: { $each: timestamped } } },
    )
  } catch {
    // Non-critical — log to console but don't fail
    console.error('[discover-worker] Failed to append logs to DB')
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────

function log(msg: string) {
  const ts = new Date().toISOString().substring(11, 23)
  console.log(`[discover-worker ${ts}] ${msg}`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const jobId = process.argv[2]
  if (!jobId) {
    console.error('Usage: bun scripts/discover-worker.ts <jobId>')
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
  const passwordHash = process.env.YGGDRASIGHT_SECRET_FILE
    ? readFileSync(process.env.YGGDRASIGHT_SECRET_FILE, 'utf-8').trim()
    : process.env.YGGDRASIGHT_PASSWORD_HASH // fallback for backward compat
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
  const job = await DiscoveryJob.findById(jobId)
  if (!job) {
    console.error(`Job ${jobId} not found in database`)
    await mongoose.disconnect()
    process.exit(1)
  }

  const symbol = job.symbol as string
  const model = job.modelId as string

  log(`Job loaded: symbol=${symbol}, model=${model}, status=${job.status}`)

  // Mark as running
  await DiscoveryJob.updateOne(
    { _id: jobId },
    { $set: { status: 'running', pid: process.pid } },
  )

  try {
    // Build prompt
    const prompt = buildDiscoveryPrompt(symbol)

    // Run OpenCode CLI — this may take minutes
    const result = await runOpenCode(model, prompt, jobId, configPaths)

    if (!result.success) {
      log(`Agent failed: ${result.error}`)
      await DiscoveryJob.updateOne(
        { _id: jobId },
        { $set: { status: 'failed', error: result.error, completedAt: new Date() } },
      )
      await mongoose.disconnect()
      process.exit(0)
    }

    log(`Agent completed — ${result.toolCallCount} tool calls, ${result.urlsFetched.length} URLs`)

    // Parse the response — try multiple strategies to extract JSON
    let parsed = parseDiscoveredInfo(result.text)
    if (!parsed) {
      // Try extracting from all markdown code blocks in the full text
      const codeBlocks = result.text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/g)
      if (codeBlocks) {
        for (const block of codeBlocks) {
          const inner = block.replace(/```(?:json)?\s*\n?/, '').replace(/\n?```/, '')
          try { parsed = JSON.parse(inner); break } catch { /* try next */ }
        }
      }
    }
    if (!parsed) {
      log(`Failed to parse response (${result.text.length}B). Preview: ${result.text.substring(0, 500)}`)
      await DiscoveryJob.updateOne(
        { _id: jobId },
        { $set: { status: 'failed', error: 'Failed to parse agent discovery response', rawOutput: result.text, completedAt: new Date() } },
      )
      await mongoose.disconnect()
      process.exit(0)
    }

    // Build the full DiscoveredProjectInfo
    const discovered = {
      ...Object.fromEntries(
        Object.entries(parsed).map(([k, v]) => [k, v ?? null])
      ),
      mainnetLaunched: typeof parsed.mainnetLaunched === 'boolean' ? parsed.mainnetLaunched : null,
      audited: typeof parsed.audited === 'boolean' ? parsed.audited : null,
      discoveredAt: new Date().toISOString(),
      sourcesUsed: (parsed.sourcesUsed as string[] | undefined) ?? result.urlsFetched ?? [],
    }

    const fieldCount = Object.entries(discovered).filter(([, v]) => v !== null && v !== undefined).length
    log(`Parsed ${fieldCount} fields for ${symbol}`)

    // Save to DB
    await DiscoveryJob.updateOne(
      { _id: jobId },
      { $set: { status: 'completed', result: discovered, rawOutput: result.text, completedAt: new Date() } },
    )

    log(`Job completed successfully`)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown worker error'
    log(`Worker error: ${errorMsg}`)
    await DiscoveryJob.updateOne(
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
