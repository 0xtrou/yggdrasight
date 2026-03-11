#!/usr/bin/env bun
/**
 * Signal Crawl Worker — AI-powered signal generation via OpenCode.
 *
 * Usage: bun scripts/signal-crawl-worker.ts <jobId>
 *
 * 1. Connects to MongoDB
 * 2. Loads SignalCrawlJob by ID
 * 3. Runs OpenCode CLI to research signals for requested symbols
 * 4. Parses structured signal array from response
 * 5. Saves each valid signal as a Signal document
 * 6. Marks job completed
 */
import mongoose from 'mongoose'
import { spawn } from 'child_process'
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

// ── Per-user config decryption (optional — when OCULUS_PASSWORD_HASH is set) ──
import { decryptConfigForMount, cleanupDecryptedConfig } from '../apps/web/src/lib/auth/vault'
import type { DecryptedConfigPaths } from '../apps/web/src/lib/auth/vault'

// ── Constants ─────────────────────────────────────────────────────────────────

const MONGODB_URI = process.env.YGGDRASIGHT_MONGODB_URI || process.env.MONGODB_URI || 'mongodb://yggdrasight:yggdrasight_dev_secret@localhost:27017/yggdrasight?authSource=admin'
const DOCKER_BIN = process.env.DOCKER_BIN ?? 'docker'
const OPENCODE_IMAGE = process.env.OPENCODE_IMAGE ?? 'ghcr.io/anomalyco/opencode'
const WORKER_TIMEOUT_MS = 900_000 // 15 minutes

// ── Inline Mongoose models (worker is standalone — no package imports) ─────────

const SignalCrawlJobSchema = new mongoose.Schema(
  {
    symbols: { type: [String], required: true },
    screen: { type: String, required: true, default: 'signals' },
    agentSlug: { type: String, required: true, default: 'signal_crawler' },
    modelId: { type: String, required: true },
    status: { type: String, required: true, enum: ['pending', 'running', 'completed', 'failed'], default: 'pending' },
    signals: { type: mongoose.Schema.Types.Mixed, default: [] },
    savedSignalIds: { type: [String], default: [] },
    rawOutput: { type: String, default: null },
    error: { type: String, default: null },
    pid: { type: Number, default: null },
    logs: { type: [String], default: [] },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
  },
  { timestamps: false },
)

const SignalCrawlJob =
  mongoose.models.SignalCrawlJob ||
  mongoose.model('SignalCrawlJob', SignalCrawlJobSchema)

const TakeProfitSchema = new mongoose.Schema(
  { level: Number, price: Number, hit: { type: Boolean, default: false }, hitAt: { type: Date, default: null } },
  { _id: false },
)

const SignalSchema = new mongoose.Schema(
  {
    symbol: { type: String, required: true },
    direction: { type: String, required: true },
    status: { type: String, default: 'pending' },
    source: { type: String, default: 'ai_crawl' },
    exchange: { type: String, default: 'binance' },
    timeframe: { type: String, default: '4h' },
    entryPrice: { type: Number, required: true },
    stopLoss: { type: Number, required: true },
    takeProfits: { type: [TakeProfitSchema], default: [] },
    confidence: { type: Number, default: 0.5 },
    indicators: { type: mongoose.Schema.Types.Mixed, default: {} },
    notes: { type: String, default: null },
  },
  { timestamps: true },
)

const Signal =
  mongoose.models.Signal ||
  mongoose.model('Signal', SignalSchema)

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildCrawlPrompt(symbols: string[]): string {
  const symbolList = symbols.join(', ')

  const signalSchema = JSON.stringify({
    symbol: 'e.g. BTC, ETH, SOL — exact ticker',
    direction: '"long" or "short"',
    entryPrice: 'number — current or limit entry price',
    stopLoss: 'number — stop loss price',
    takeProfits: [
      { level: 1, price: 'number — TP1 price' },
      { level: 2, price: 'number — TP2 price (optional)' },
    ],
    timeframe: '"15m" | "1h" | "4h" | "1d" | "1w"',
    confidence: 'number 0-100 — your confidence in this signal',
    rationale: 'string — concise reason for the signal (1-2 sentences)',
    exchange: '"binance" | "bybit" | "okx" — where to trade it',
    indicators: {
      rsi: 'number or null',
      macd_signal: '"bullish" | "bearish" | null',
      volume_trend: '"increasing" | "decreasing" | null',
      key_level: 'string or null — e.g. "support at 98000"',
    },
  }, null, 2)

  return [
    `You are a professional crypto trader and market analyst with access to web search and fetch tools.`, 
    `Your task: research current market conditions and generate trading signals for these assets: **${symbolList}**`,
    '',
    '## MANDATORY RESEARCH STEPS (you MUST use your tools for each asset)',
    '',
    '### Step 1: Current Price & Chart Context',
    '- Use web_search to find current price, recent price action, key support/resistance levels',
    '- Search for chart patterns: breakouts, consolidations, trend reversals',
    '- Check recent 24h/7d performance',
    '',
    '### Step 2: Market Sentiment & News',
    '- Search for recent news, catalysts, or events affecting each asset',
    '- Look for strong bullish/bearish sentiment shifts',
    '- Check for on-chain signals: large whale movements, exchange inflows/outflows',
    '',
    '### Step 3: Technical Analysis',
    '- Identify key support/resistance levels from recent price history',
    '- Assess RSI (overbought >70, oversold <30), MACD direction, volume trends',
    '- Look for confluence: multiple indicators agreeing on direction',
    '',
    '### Step 4: Signal Generation',
    'After completing research, generate a signal for each asset. For each:',
    '- Define a clear entry price based on your research',
    '- Set stop-loss at a key technical level',
    '- Set 1-2 take-profit targets at realistic resistance/support levels',
    '- Rate confidence 50-100 (only include signals you genuinely believe in)',
    '',
    '## CRITICAL: You MUST search the web. Do NOT skip research. Do NOT return [] without doing research first.',
    '',
    '## OUTPUT FORMAT',
    '',
    'After completing ALL research steps above, return a SINGLE JSON array of signal objects.',
    'Do NOT wrap in markdown. Do NOT include any text outside the JSON array.',
    '',
    'Each signal must match this schema exactly:',
    '',
    signalSchema,
    '',
    'Example valid response:',
    '[',
    '  { "symbol": "BTC", "direction": "long", "entryPrice": 98500, "stopLoss": 95000, "takeProfits": [{"level": 1, "price": 103000}, {"level": 2, "price": 108000}], "timeframe": "4h", "confidence": 72, "rationale": "Bullish engulfing on 4h at key support, RSI recovering from oversold", "exchange": "binance", "indicators": {"rsi": 38, "macd_signal": "bullish", "volume_trend": "increasing", "key_level": "support at 98000"} }',
    ']',
    '',
    'RULES:',
    '- Return ONLY the JSON array — no prose, no markdown, no explanation',
    '- Use null for any indicator you could not determine',
    '- Minimum confidence to include a signal: 50',
    '- entryPrice, stopLoss, and at least 1 takeProfit are required',
    '- You MUST do web research before generating signals — no shortcuts',
  ].join('\n')
}

// ── Response parser ───────────────────────────────────────────────────────────

interface RawSignal {
  symbol?: unknown
  direction?: unknown
  entryPrice?: unknown
  stopLoss?: unknown
  takeProfits?: unknown
  timeframe?: unknown
  confidence?: unknown
  rationale?: unknown
  exchange?: unknown
  indicators?: unknown
}

function parseSignals(text: string): RawSignal[] | null {
  // Try direct parse
  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) return parsed
  } catch { /* nope */ }

  // Strip markdown blocks
  const blockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (blockMatch) {
    try {
      const parsed = JSON.parse(blockMatch[1]!)
      if (Array.isArray(parsed)) return parsed
    } catch { /* nope */ }
  }

  // Find first [...] array in text
  const arrayMatch = text.match(/\[[\s\S]*\]/)
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0])
      if (Array.isArray(parsed)) return parsed
    } catch { /* nope */ }
  }

  return null
}

function validateSignal(s: RawSignal): boolean {
  return (
    typeof s.symbol === 'string' && s.symbol.length > 0 &&
    (s.direction === 'long' || s.direction === 'short') &&
    typeof s.entryPrice === 'number' && s.entryPrice > 0 &&
    typeof s.stopLoss === 'number' && s.stopLoss > 0 &&
    Array.isArray(s.takeProfits) && s.takeProfits.length > 0
  )
}

// ── JSON extraction (copied from discover-worker) ─────────────────────────────

function extractJsonObjects(buffer: string): string[] {
  const results: string[] = []
  let depth = 0
  let start = -1
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === '{') {
      if (depth === 0) start = i
      depth++
    } else if (buffer[i] === '}') {
      depth--
      if (depth === 0 && start >= 0) {
        results.push(buffer.substring(start, i + 1))
        start = -1
      }
    }
  }
  return results
}

function sanitizeJsonString(s: string): string {
  return s.replace(/[\u0000-\u001F\u007F-\u009F]/g, (c) => {
    const code = c.charCodeAt(0)
    if (code === 0x09) return '\\t'
    if (code === 0x0a) return '\\n'
    if (code === 0x0d) return '\\r'
    return ''
  })
}

function extractResponse(stdout: string): { text: string; urlsFetched: string[]; toolCallCount: number } {
  const urlsFetched: string[] = []
  let toolCallCount = 0
  const textParts: string[] = []

  const jsonObjects = extractJsonObjects(stdout)
  for (const jsonStr of jsonObjects) {
    try {
      const event = JSON.parse(sanitizeJsonString(jsonStr))
      if (event.type === 'tool_use' && event.part) {
        toolCallCount++
        const input = event.part.state?.input || {}
        if (input.url) urlsFetched.push(input.url)
      }
      if (event.type === 'text' && event.part?.text) {
        textParts.push(event.part.text)
      }
    } catch { /* skip */ }
  }

  // If we extracted text parts from streaming JSON, join them
  if (textParts.length > 0) {
    return { text: textParts.join(''), urlsFetched, toolCallCount }
  }

  // Fallback: try to find raw JSON array in stdout
  const arrayMatch = stdout.match(/\[[\s\S]*\]/)
  if (arrayMatch) {
    return { text: arrayMatch[0], urlsFetched, toolCallCount }
  }

  return { text: stdout.trim(), urlsFetched, toolCallCount }
}

// ── Log helper ────────────────────────────────────────────────────────────────

async function appendLogs(jobId: string, lines: string[]): Promise<void> {
  if (lines.length === 0) return
  try {
    const timestamped = lines.map(l => `${new Date().toISOString().substring(11, 19)} ${l}`)
    await SignalCrawlJob.updateOne(
      { _id: jobId },
      { $push: { logs: { $each: timestamped } } },
    )
  } catch { /* non-critical */ }
}

function log(msg: string) {
  const ts = new Date().toISOString().substring(11, 23)
  console.log(`[signal-crawl-worker ${ts}] ${msg}`)
}

// ── Run OpenCode ──────────────────────────────────────────────────────────────

async function runOpenCode(
  model: string,
  prompt: string,
  jobId: string,
  configPaths?: DecryptedConfigPaths | null,
): Promise<{ success: boolean; text: string; error?: string }> {
  const HOME_DIR = process.env.HOME ?? '/root'
  const tmpDir = path.join(tmpdir(), `yggdrasight-crawl-${jobId}`)
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
    'run', '-m', model, '--format', 'json', '--dir', '/workspace',
    'You are a crypto trading analyst. Read the full instructions in /workspace/prompt.txt, then use your web search and fetch tools to research current market data for each asset listed, and return a JSON array of trading signals as instructed. Do the research — do not skip it.',
  ]

  log(`Running OpenCode: ${model} (prompt ${(prompt.length / 1024).toFixed(1)}KB)`)
  await appendLogs(jobId, [`Starting ${model}...`])

  return new Promise((resolve) => {
    const child = spawn(DOCKER_BIN, args, {
      env: { PATH: process.env.PATH, HOME: process.env.HOME, DOCKER_HOST: process.env.DOCKER_HOST },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let resolved = false
    const pendingLogs: string[] = []

    const logFlushTimer = setInterval(async () => {
      if (pendingLogs.length > 0) {
        const batch = pendingLogs.splice(0)
        await appendLogs(jobId, batch)
      }
    }, 3000)

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
            if (event.type === 'tool_use' && event.part?.state?.status === 'completed') {
              const tool = event.part.tool || 'unknown'
              const input = event.part.state?.input || {}
              let detail = ''
              if (tool === 'webfetch' && input.url) detail = ` ${input.url.substring(0, 80)}`
              else if (tool === 'websearch_web_search_exa' && input.query) detail = ` "${input.query}"`
              pendingLogs.push(`✓ ${tool}${detail}`)
            }
            if (event.type === 'text' && event.part?.text?.trim()) {
              pendingLogs.push(event.part.text.trim().substring(0, 200))
            }
          } catch { /* skip */ }
        }
      }
    })

    child.stderr.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter((l: string) => {
        const t = l.trim()
        if (!t) return false
        if (t.includes('@opencode-ai/plugin')) return false
        if (t.includes('getConfigContext()')) return false
        if (t.startsWith('Resolving dependencies')) return false
        return true
      })
      if (lines.length > 0) pendingLogs.push(...lines.map((l: string) => `[stderr] ${l.trim().substring(0, 200)}`))
    })

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        clearInterval(logFlushTimer)
        child.kill('SIGTERM')
        appendLogs(jobId, ['TIMEOUT: Worker killed']).finally(() => {
          rmSync(tmpDir, { recursive: true, force: true })
          resolve({ success: false, text: '', error: `Timed out after ${WORKER_TIMEOUT_MS}ms` })
        })
      }
    }, WORKER_TIMEOUT_MS)

    child.on('close', async (code) => {
      clearTimeout(timeout)
      clearInterval(logFlushTimer)
      if (resolved) return
      resolved = true

      if (pendingLogs.length > 0) await appendLogs(jobId, pendingLogs.splice(0))
      rmSync(tmpDir, { recursive: true, force: true })

      const { text, toolCallCount } = extractResponse(stdout)
      const trimmedText = text.trim()

      log(`stdout: ${stdout.length}B, text: ${trimmedText.length}B, ${toolCallCount} tool calls, exit: ${code}`)
      await appendLogs(jobId, [`Done: ${toolCallCount} tool calls, ${trimmedText.length}B response`])

      if (!trimmedText) {
        resolve({ success: false, text: '', error: 'Empty response from OpenCode CLI' })
      } else {
        resolve({ success: true, text: trimmedText })
      }
    })

    child.on('error', async (err) => {
      clearTimeout(timeout)
      clearInterval(logFlushTimer)
      if (resolved) return
      resolved = true
      const msg = err.message || 'Unknown spawn error'
      rmSync(tmpDir, { recursive: true, force: true })
      await appendLogs(jobId, ['ERROR: ' + msg])
      resolve({ success: false, text: '', error: msg })
    })

    child.stdin?.end()
  })
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const jobId = process.argv[2]
  if (!jobId) {
    console.error('Usage: bun scripts/signal-crawl-worker.ts <jobId>')
    process.exit(1)
  }

  log(`Starting for jobId=${jobId}`)

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

  const job = await SignalCrawlJob.findById(jobId)
  if (!job) {
    console.error(`Job ${jobId} not found`)
    await mongoose.disconnect()
    process.exit(1)
  }

  const symbols: string[] = (job.symbols as string[]) ?? []
  const model: string = job.modelId as string

  log(`Job: symbols=[${symbols.join(', ')}], model=${model}`)

  await SignalCrawlJob.updateOne(
    { _id: jobId },
    { $set: { status: 'running', pid: process.pid } },
  )

  try {
    const prompt = buildCrawlPrompt(symbols)
    const result = await runOpenCode(model, prompt, jobId, configPaths)

    if (!result.success || !result.text) {
      await SignalCrawlJob.updateOne(
        { _id: jobId },
        {
          $set: {
            status: 'failed',
            error: result.error ?? 'No output from OpenCode',
            rawOutput: result.text ?? null,
            completedAt: new Date(),
          },
        },
      )
      log('Failed: ' + (result.error ?? 'no output'))
      await mongoose.disconnect()
      process.exit(1)
    }

    // Parse signals from response
    const rawSignals = parseSignals(result.text)

    if (!rawSignals) {
      await SignalCrawlJob.updateOne(
        { _id: jobId },
        {
          $set: {
            status: 'failed',
            error: 'Failed to parse signal array from response',
            rawOutput: result.text.substring(0, 5000),
            completedAt: new Date(),
          },
        },
      )
      log('Failed to parse signals from: ' + result.text.substring(0, 200))
      await mongoose.disconnect()
      process.exit(1)
    }

    log(`Parsed ${rawSignals.length} raw signals`)

    // Filter valid signals
    const validSignals = rawSignals.filter(validateSignal)
    log(`${validSignals.length} valid signals (of ${rawSignals.length})`)

    // Save each to Signal collection
    const savedIds: string[] = []
    for (const s of validSignals) {
      try {
        const tps = (s.takeProfits as { level: number; price: number }[]).map(tp => ({
          level: tp.level ?? 1,
          price: tp.price,
          hit: false,
          hitAt: null,
        }))

        const signal = await Signal.create({
          symbol: (s.symbol as string).toUpperCase(),
          direction: s.direction,
          status: 'pending',
          source: 'ai_crawl',
          exchange: (s.exchange as string) ?? 'binance',
          timeframe: (s.timeframe as string) ?? '4h',
          entryPrice: s.entryPrice,
          stopLoss: s.stopLoss,
          takeProfits: tps,
          confidence: Math.min(1, Math.max(0, ((s.confidence as number) ?? 50) / 100)),
          indicators: (s.indicators as Record<string, unknown>) ?? {},
          notes: (s.rationale as string) ?? null,
        })

        savedIds.push(String(signal._id))
        log(`Saved signal: ${s.symbol} ${s.direction} @ ${s.entryPrice}`)
      } catch (err) {
        log(`Failed to save signal for ${s.symbol}: ${err}`)
      }
    }

    await SignalCrawlJob.updateOne(
      { _id: jobId },
      {
        $set: {
          status: 'completed',
          signals: validSignals,
          savedSignalIds: savedIds,
          rawOutput: result.text.substring(0, 10000),
          completedAt: new Date(),
        },
      },
    )

    log(`Completed. Saved ${savedIds.length} signals.`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log('Unexpected error: ' + msg)
    await SignalCrawlJob.updateOne(
      { _id: jobId },
      { $set: { status: 'failed', error: msg, completedAt: new Date() } },
    )
  }

  // Cleanup decrypted config temp files
  if (configPaths) cleanupDecryptedConfig(configPaths)

  await mongoose.disconnect()
  process.exit(0)
}

main().catch((err) => {
  console.error('[signal-crawl-worker] Fatal:', err)
  process.exit(1)
})
