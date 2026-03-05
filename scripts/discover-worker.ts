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

// ── Types ─────────────────────────────────────────────────────────────────────

interface DiscoveredProjectInfo {
  [key: string]: unknown
  projectName: string | null
  description: string | null
  discoveredAt: string
  sourcesUsed: string[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://oculus:oculus_dev_secret@localhost:27017/oculus-trading?authSource=admin'
const OPENCODE_BIN = process.env.OPENCODE_BIN ?? 'opencode'
// No hard timeout — the agent can take as long as it needs
const WORKER_TIMEOUT_MS = 600_000 // 10 minutes safety limit

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

  const lastStepText = stepTextParts[stepTextParts.length - 1]!
  if (lastStepText.length > 0) return { text: lastStepText.join(''), urlsFetched, toolCallCount }
  if (allTextParts.length > 0) return { text: allTextParts.join(''), urlsFetched, toolCallCount }
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
    `You are a crypto research analyst. Your task is to deeply research the cryptocurrency project "${fullName}" (ticker: ${symbol}).`,
    '',
    '## RESEARCH INSTRUCTIONS',
    '',
    'Use your websearch and webfetch tools extensively. Do NOT rely on training data — search the web for CURRENT information.',
    '',
    '### Step 1: General Project Research',
    `Search for "${fullName} crypto" and "${symbol} cryptocurrency" to find:`,
    '- Official website, social links (Twitter/X, Discord, Telegram, GitHub)',
    '- Team/founders — who built this? What is their background?',
    '- Funding rounds, investors, total funding raised, treasury/runway',
    '- Token type and chain (ERC-20, native L1, SPL, etc.)',
    '- Tokenomics (total supply, circulating supply, max supply, vesting)',
    '- Project description, categories, ecosystem',
    '- Competitors, unique selling points, partnerships',
    '- Revenue model — how does the protocol earn?',
    '- Adoption signals — dApp usage, active users, growth',
    '- Recent news and developments',
    '- Known risks or controversies',
    '',
    '### Step 2: Valuation & Market Data',
    'Search for current pricing and valuation data:',
    '- Current price, all-time high, all-time low, % from ATH',
    '- Staking yield / APR if applicable',
    '- Token inflation / emission rate',
    '- Vesting schedule and upcoming unlocks',
    '',
    '### Step 3: On-Chain Activity Research',
    `Research on-chain activity using blockchain explorers. Search for "${symbol} contract address" or "${fullName} token address" first, then visit the relevant explorer:`,
    '',
    '**Explorer URL patterns to try (use webfetch):**',
    '- Ethereum/ERC-20: https://etherscan.io/token/<contract_address> — check holders, transfers, top holders',
    '- Solana/SPL: https://solscan.io/token/<token_address> — check holders, activity',
    '- BSC/BEP-20: https://bscscan.com/token/<contract_address>',
    '- Arbitrum: https://arbiscan.io/token/<contract_address>',
    '- Base: https://basescan.org/token/<contract_address>',
    '- Optimism: https://optimistic.etherscan.io/token/<contract_address>',
    '- Avalanche: https://snowtrace.io/token/<contract_address>',
    '- Polygon: https://polygonscan.com/token/<contract_address>',
    '',
    'Also try:',
    `- CoinGecko page: https://www.coingecko.com/en/coins/${slug}`,
    `- DeFiLlama: https://defillama.com/protocol/${slug}`,
    `- CoinMarketCap: https://coinmarketcap.com/currencies/${slug}/`,
    '',
    'Look for:',
    '- Number of token holders',
    '- Recent large transactions (whale activity)',
    '- Top holder distribution (concentration risk)',
    '- Daily active addresses if available',
    '- Any notable on-chain patterns',
    '',
    '### Step 4: Compile Results',
    '',
    'Rate each of the 4 core investment pillars as STRONG, MODERATE, or WEAK:',
    '1. **Team Survival Fitness** — Is the team credible, funded, actively building?',
    '2. **Narrative Alignment** — Does the project fit current macro narratives (AI, DePIN, RWA)?',
    '3. **Economic Moat** — Does the protocol have defensibility, real TVL, revenue?',
    '4. **Valuation & Accumulation Zone** — Is the current price attractive vs fundamentals?',
    '',
    'Return your findings as a SINGLE JSON object with this EXACT structure (use null for anything you could not find):',
    '',
    '```json',
    jsonSchema,
    '```',
    '',
    'IMPORTANT:',
    '- Return ONLY the JSON object, no other text',
    '- Use null for any field you could not find reliable data for',
    '- For on-chain data, note if the data is from a specific date',
    '- Be factual — cite what you found, do not speculate',
    '- Rate each pillar honestly based on evidence found',
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
): Promise<{ success: boolean; text: string; error?: string; urlsFetched: string[]; toolCallCount: number }> {
  const args = ['run', '-m', model, '--format', 'json', prompt]

  log(`Running OpenCode: ${model} (prompt ${(prompt.length / 1024).toFixed(1)}KB)`)
  await appendLogs(jobId, [`Starting ${model}...`])

  return new Promise((resolve) => {
    const child = spawn(OPENCODE_BIN, args, {
      env: { ...process.env },
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
            // Log step transitions
            if (event.type === 'step_start') {
              pendingLogs.push('--- new reasoning step ---')
            }
            if (event.type === 'step_finish' && event.part?.reason) {
              pendingLogs.push(`Step finished: ${event.part.reason}`)
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
      await appendLogs(jobId, [...pendingLogs, `ERROR: ${msg}`])
      resolve({ success: false, text: '', error: msg, urlsFetched: [], toolCallCount: 0 })
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
    const result = await runOpenCode(model, prompt, jobId)

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

    // Parse the response
    const parsed = parseDiscoveredInfo(result.text)
    if (!parsed) {
      log(`Failed to parse response. Preview: ${result.text.substring(0, 300)}`)
      await DiscoveryJob.updateOne(
        { _id: jobId },
        { $set: { status: 'failed', error: 'Failed to parse agent discovery response', completedAt: new Date() } },
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
      { $set: { status: 'completed', result: discovered, completedAt: new Date() } },
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

  await mongoose.disconnect()
  process.exit(0)
}

main().catch((err) => {
  console.error('Fatal worker error:', err)
  process.exit(1)
})
