/**
 * Oculus Trading — Signal Feed Seeder
 *
 * Seeds realistic trading signals into MongoDB for development/testing.
 *
 * Usage:
 *   ts-node -P scripts/tsconfig.json scripts/feed.ts
 *   ts-node -P scripts/tsconfig.json scripts/feed.ts --clear
 *   ts-node -P scripts/tsconfig.json scripts/feed.ts --count 50
 *   ts-node -P scripts/tsconfig.json scripts/feed.ts --symbol BTCUSDT --count 10
 *   ts-node -P scripts/tsconfig.json scripts/feed.ts --clear --count 30
 *
 * Flags:
 *   --clear          Wipe all existing signals before seeding
 *   --count  <n>     Number of signals to seed (default: 20)
 *   --symbol <sym>   Seed only this symbol (default: mixed)
 *   --status <s>     Override status for all seeded signals
 *   --dry-run        Print signals without inserting
 */

import { connectDB, Signal } from '@oculus/db'
import {
  SignalDirection,
  SignalStatus,
  Timeframe,
  Exchange,
  ProviderType,
  MarketRegime,
} from '@oculus/core'

// ── Colour helpers (no deps) ──────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
}
const clr = (color: keyof typeof c, text: string) => `${c[color]}${text}${c.reset}`
const bold = (text: string) => `${c.bold}${text}${c.reset}`

// ── CLI arg parsing ───────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2)
  const opts = {
    clear: false,
    count: 20,
    symbol: null as string | null,
    status: null as string | null,
    dryRun: false,
  }
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--clear':    opts.clear = true; break
      case '--dry-run':  opts.dryRun = true; break
      case '--count':    opts.count = Math.max(1, parseInt(args[++i] ?? '20', 10)); break
      case '--symbol':   opts.symbol = args[++i] ?? null; break
      case '--status':   opts.status = args[++i] ?? null; break
    }
  }
  return opts
}


// ── Seed data ─────────────────────────────────────────────────────────────────

interface SeedTemplate {
  symbol: string
  exchange: Exchange
  basePrice: number
  volatility: number  // fraction, e.g. 0.02 = 2%
}

const TEMPLATES: SeedTemplate[] = [
  { symbol: 'BTC/USDT',  exchange: Exchange.BINANCE,     basePrice: 67000,   volatility: 0.02 },
  { symbol: 'ETH/USDT',  exchange: Exchange.BINANCE,     basePrice: 3200,    volatility: 0.025 },
  { symbol: 'SOL/USDT',  exchange: Exchange.BYBIT,       basePrice: 145,     volatility: 0.04 },
  { symbol: 'BNB/USDT',  exchange: Exchange.BINANCE,     basePrice: 580,     volatility: 0.02 },
  { symbol: 'AVAX/USDT', exchange: Exchange.BYBIT,       basePrice: 35,      volatility: 0.05 },
  { symbol: 'MATIC/USDT',exchange: Exchange.OKX,         basePrice: 0.85,    volatility: 0.06 },
  { symbol: 'ARB/USDT',  exchange: Exchange.BYBIT,       basePrice: 1.12,    volatility: 0.06 },
  { symbol: 'OP/USDT',   exchange: Exchange.OKX,         basePrice: 2.40,    volatility: 0.06 },
  { symbol: 'LINK/USDT', exchange: Exchange.BINANCE,     basePrice: 14.5,    volatility: 0.04 },
  { symbol: 'INJ/USDT',  exchange: Exchange.BYBIT,       basePrice: 28,      volatility: 0.07 },
]

const TIMEFRAMES: Timeframe[] = [
  Timeframe.M15, Timeframe.H1, Timeframe.H4, Timeframe.D1,
]

const SOURCES: ProviderType[] = [
  ProviderType.MANUAL,
  ProviderType.TRADINGVIEW,
  ProviderType.TELEGRAM,
  ProviderType.WEBHOOK,
]

const SOURCE_PROVIDERS: Record<ProviderType, string[]> = {
  [ProviderType.MANUAL]:        ['desk-trader', 'analyst-1', 'analyst-2'],
  [ProviderType.TRADINGVIEW]:   ['tv-alert-btc', 'tv-premium', 'tv-community'],
  [ProviderType.TELEGRAM]:      ['whale-signals', 'crypto-calls', 'altcoin-insider'],
  [ProviderType.WEBHOOK]:       ['webhook-binance', 'webhook-bybit', 'webhook-custom'],
  [ProviderType.ONCHAIN]:       ['onchain-feed'],
  [ProviderType.SOCIAL]:        ['social-feed'],
}

const MARKET_REGIMES: MarketRegime[] = [
  MarketRegime.TRENDING_UP,
  MarketRegime.TRENDING_DOWN,
  MarketRegime.RANGING,
  MarketRegime.VOLATILE,
  MarketRegime.ACCUMULATION,
]

// Weighted status distribution: mostly active/pending, some closed
const STATUS_WEIGHTS: { status: SignalStatus; weight: number }[] = [
  { status: SignalStatus.ACTIVE,    weight: 40 },
  { status: SignalStatus.PENDING,   weight: 20 },
  { status: SignalStatus.TP_HIT,    weight: 15 },
  { status: SignalStatus.SL_HIT,    weight: 10 },
  { status: SignalStatus.EXPIRED,   weight: 10 },
  { status: SignalStatus.CANCELLED, weight: 5 },
]

// Indicator sets per timeframe
const INDICATOR_SETS: Record<string, Record<string, unknown>> = {
  momentum: {
    rsi14:     null, // filled at generation time
    macd:      { histogram: null, signal: null, value: null },
    ema20:     null,
    ema50:     null,
    ema200:    null,
    volume_ma: null,
  },
  breakout: {
    bb_upper:  null,
    bb_lower:  null,
    bb_width:  null,
    atr14:     null,
    high_1d:   null,
    low_1d:    null,
  },
  trend: {
    adx14:     null,
    dmi_plus:  null,
    dmi_minus: null,
    ichimoku_cloud: null,
    ema50:     null,
    ema200:    null,
  },
}

// ── Utility: random helpers ───────────────────────────────────────────────────
function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min
}
function randInt(min: number, max: number): number {
  return Math.floor(rand(min, max + 1))
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}
function pickWeighted<T>(items: { weight: number; value?: T; status?: T }[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0)
  let r = Math.random() * total
  for (const item of items) {
    r -= item.weight
    if (r <= 0) return (item as { weight: number; value?: T; status?: T; [k: string]: unknown }).status as T ?? (item as { value: T }).value
  }
  return (items[items.length - 1] as { weight: number; value?: T; status?: T; [k: string]: unknown }).status as T
}
function jitter(value: number, fraction: number): number {
  return value * (1 + rand(-fraction, fraction))
}

// ── Signal generator ──────────────────────────────────────────────────────────
interface GeneratedSignal {
  symbol: string
  direction: SignalDirection
  status: SignalStatus
  source: ProviderType
  sourceProvider: string
  exchange: Exchange
  timeframe: Timeframe
  entryPrice: number
  currentPrice: number
  stopLoss: number
  takeProfits: { level: number; price: number; hit: boolean; hitAt: Date | null }[]
  leverage: number
  confidence: number
  indicators: Record<string, unknown>
  sourceRaw: Record<string, unknown>
  notes: string
  marketRegime: MarketRegime
  createdAt: Date
}

function generateSignal(
  template: SeedTemplate,
  overrideStatus?: SignalStatus,
  ageOffsetMs?: number,
): GeneratedSignal {
  const direction = pick([SignalDirection.LONG, SignalDirection.SHORT])
  const source    = pick(SOURCES)
  const timeframe = pick(TIMEFRAMES)
  const status    = overrideStatus ?? pickWeighted(STATUS_WEIGHTS)
  const regime    = pick(MARKET_REGIMES)

  const ep      = jitter(template.basePrice, template.volatility)
  const slPct   = rand(0.015, 0.06)   // 1.5–6% stop loss
  const tp1Pct  = rand(0.02, 0.05)    // 2–5% TP1
  const tp2Pct  = rand(0.05, 0.10)    // 5–10% TP2
  const tp3Pct  = rand(0.10, 0.18)    // 10–18% TP3

  const sign  = direction === SignalDirection.LONG ? 1 : -1
  const sl    = ep * (1 - sign * slPct)
  const tp1   = ep * (1 + sign * tp1Pct)
  const tp2   = ep * (1 + sign * tp2Pct)
  const tp3   = ep * (1 + sign * tp3Pct)

  // Determine TP hits based on status
  const tp1Hit = status === SignalStatus.TP_HIT && Math.random() > 0.3
  const tp2Hit = status === SignalStatus.TP_HIT && Math.random() > 0.6
  const hitDate = new Date(Date.now() - randInt(0, 86400000))

  const currentPrice = status === SignalStatus.SL_HIT
    ? sl * jitter(1, 0.005)
    : status === SignalStatus.TP_HIT
      ? (tp2Hit ? tp2 : tp1) * jitter(1, 0.003)
      : ep * jitter(1, template.volatility * 0.5)

  // Build indicators
  const indicatorSet = pick(Object.values(INDICATOR_SETS))
  const indicators: Record<string, unknown> = {
    rsi14:    Math.round(rand(25, 80)),
    ema20:    ep * rand(0.98, 1.02),
    ema50:    ep * rand(0.96, 1.04),
    ema200:   ep * rand(0.90, 1.10),
    atr14:    ep * rand(0.005, 0.025),
    volume_ratio: rand(0.5, 3.0),
    adx14:    rand(15, 60),
    ...Object.fromEntries(
      Object.entries(indicatorSet).map(([k]) => [k, rand(0.8, 1.2) * ep])
    ),
  }

  const providers = SOURCE_PROVIDERS[source] ?? ['unknown']
  const sourceProvider = pick(providers)

  // Age the signal
  const ageMs   = ageOffsetMs ?? randInt(0, 7 * 24 * 3600 * 1000)  // up to 7 days old
  const created = new Date(Date.now() - ageMs)

  const leverage = timeframe === Timeframe.M15 ? pick([3, 5, 10]) : pick([1, 2, 3])

  return {
    symbol:         template.symbol,
    direction,
    status,
    source,
    sourceProvider,
    exchange:       template.exchange,
    timeframe,
    entryPrice:     parseFloat(ep.toPrecision(6)),
    currentPrice:   parseFloat(currentPrice.toPrecision(6)),
    stopLoss:       parseFloat(sl.toPrecision(6)),
    takeProfits: [
      { level: 1, price: parseFloat(tp1.toPrecision(6)), hit: tp1Hit, hitAt: tp1Hit ? hitDate : null },
      { level: 2, price: parseFloat(tp2.toPrecision(6)), hit: tp2Hit, hitAt: tp2Hit ? hitDate : null },
      { level: 3, price: parseFloat(tp3.toPrecision(6)), hit: false,  hitAt: null },
    ],
    leverage,
    confidence:     parseFloat(rand(0.35, 0.92).toFixed(2)),
    indicators,
    sourceRaw:      { raw: true, source, provider: sourceProvider, timestamp: created.toISOString() },
    notes:          generateNote(direction, regime, template.symbol),
    marketRegime:   regime,
    createdAt:      created,
  }
}

function generateNote(
  direction: SignalDirection,
  regime: MarketRegime,
  symbol: string,
): string {
  const notes: Record<SignalDirection, string[]> = {
    [SignalDirection.LONG]: [
      `${symbol} breaking above key resistance. Momentum building.`,
      `Strong bullish engulfing on higher timeframe. Entry confirmed.`,
      `RSI recovering from oversold. EMAs aligning bullish.`,
      `Accumulation zone detected. Smart money entering.`,
      `Breakout from consolidation with high volume. Bullish continuation.`,
    ],
    [SignalDirection.SHORT]: [
      `${symbol} rejected at major resistance. Bearish structure forming.`,
      `Distribution pattern complete. Bearish divergence on RSI.`,
      `Failed breakout. Sellers in control. Target: previous support.`,
      `Death cross confirmed. Macro trend bearish.`,
      `Supply zone reached. High probability reversal setup.`,
    ],
    [SignalDirection.NEUTRAL]: [
      `Awaiting breakout confirmation from range.`,
      `Mixed signals. Monitoring for direction.`,
    ],
  }
  const pool = notes[direction] ?? notes[SignalDirection.LONG]
  return `${pick(pool)} Regime: ${regime}.`
}

// ── Formatting helpers ────────────────────────────────────────────────────────
function directionLabel(d: SignalDirection): string {
  switch (d) {
    case SignalDirection.LONG:  return clr('green', '▲ LONG ')
    case SignalDirection.SHORT: return clr('red',   '▼ SHORT')
    default:                   return clr('yellow', '— NEUT ')
  }
}
function statusLabel(s: SignalStatus): string {
  switch (s) {
    case SignalStatus.ACTIVE:    return clr('green',  'ACTIVE   ')
    case SignalStatus.PENDING:   return clr('yellow', 'PENDING  ')
    case SignalStatus.TP_HIT:    return clr('cyan',   'TP_HIT   ')
    case SignalStatus.SL_HIT:    return clr('red',    'SL_HIT   ')
    case SignalStatus.EXPIRED:   return clr('gray',   'EXPIRED  ')
    case SignalStatus.CANCELLED: return clr('gray',   'CANCELLED')
  }
}
function fmt(n: number): string {
  return n >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 2 })
       : n >= 1   ? n.toFixed(3)
       : n.toPrecision(4)
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs()

  console.log()
  console.log(bold('  ◉ OCULUS TRADING — Signal Feed Seeder'))
  console.log(clr('gray', '  ─────────────────────────────────────'))
  console.log()

  // MongoDB URI is loaded by scripts/bootstrap.js via -r flag

  if (!opts.dryRun) {
    process.stdout.write(`  ${clr('gray', 'Connecting')}  `)
    await connectDB()
    console.log(clr('green', '✓ connected'))
  }

  // Build pool of templates to use
  let templates = TEMPLATES
  if (opts.symbol) {
    const sym = opts.symbol.toUpperCase().replace('/', '').replace('USDT', '/USDT').replace('BUSD', '/BUSD')
    templates = TEMPLATES.filter(t => t.symbol.toUpperCase().replace('/', '') === sym.replace('/', '') || t.symbol === opts.symbol)
    if (templates.length === 0) {
      // Use a generic template for unknown symbols
      templates = [{
        symbol: opts.symbol,
        exchange: Exchange.BINANCE,
        basePrice: 100,
        volatility: 0.03,
      }]
    }
  }

  // Clear if requested
  if (opts.clear && !opts.dryRun) {
    const query = opts.symbol ? { symbol: { $in: templates.map(t => t.symbol) } } : {}
    const deleted = await Signal.deleteMany(query)
    console.log(`  ${clr('gray', 'Cleared')}    ${clr('red', `${deleted.deletedCount} signal(s) removed`)}`)
  }

  // Generate signals
  console.log()
  console.log(`  ${clr('gray', 'Generating')} ${clr('white', `${opts.count} signal(s)`)}${opts.dryRun ? clr('yellow', ' (dry run)') : ''}`)
  console.log()
  console.log(
    `  ${clr('gray', '#  ')} ${clr('gray', 'SYMBOL      ')} ${clr('gray', 'DIR   ')} ${clr('gray', 'STATUS    ')} ${clr('gray', 'ENTRY     ')} ${clr('gray', 'SL        ')} ${clr('gray', 'TF  ')} ${clr('gray', 'CONF')}`
  )
  console.log(clr('gray', '  ' + '─'.repeat(76)))

  const signals: GeneratedSignal[] = []
  for (let i = 0; i < opts.count; i++) {
    const template = templates[i % templates.length]
    // Spread signals across last 7 days, newest first
    const ageMs = (i / opts.count) * 7 * 24 * 3600 * 1000
    const sig = generateSignal(template, opts.status as SignalStatus | undefined, ageMs)
    signals.push(sig)

    const sym    = sig.symbol.padEnd(10)
    const conf   = `${Math.round(sig.confidence * 100)}%`.padStart(4)
    console.log(
      `  ${clr('gray', String(i + 1).padStart(2) + ' ')}` +
      ` ${clr('white', sym)} ` +
      ` ${directionLabel(sig.direction)} ` +
      ` ${statusLabel(sig.status)} ` +
      ` ${clr('white', fmt(sig.entryPrice).padEnd(10))} ` +
      ` ${clr('red', fmt(sig.stopLoss).padEnd(10))} ` +
      ` ${clr('gray', sig.timeframe.padEnd(4))} ` +
      ` ${clr('blue', conf)}`
    )
  }

  if (opts.dryRun) {
    console.log()
    console.log(`  ${clr('yellow', '⚠  Dry run — nothing written to database.')}`)
    console.log()
    return
  }

  // Insert into MongoDB
  console.log()
  process.stdout.write(`  ${clr('gray', 'Inserting')}   `)

  const docs = signals.map(s => ({
    symbol:       s.symbol,
    direction:    s.direction,
    status:       s.status,
    source:       s.source,
    exchange:     s.exchange,
    timeframe:    s.timeframe,
    entryPrice:   s.entryPrice,
    currentPrice: s.currentPrice,
    stopLoss:     s.stopLoss,
    takeProfits:  s.takeProfits,
    leverage:     s.leverage,
    confidence:   s.confidence,
    indicators:   s.indicators,
    sourceRaw:    s.sourceRaw,
    notes:        s.notes,
    createdAt:    s.createdAt,
    updatedAt:    s.createdAt,
  }))

  const inserted = await Signal.insertMany(docs, { ordered: false })

  console.log(clr('green', `✓ ${inserted.length} signal(s) inserted`))

  // Summary stats
  const byDir: Record<string, number> = {}
  const byStatus: Record<string, number> = {}
  for (const s of signals) {
    byDir[s.direction]     = (byDir[s.direction]     ?? 0) + 1
    byStatus[s.status]     = (byStatus[s.status]     ?? 0) + 1
  }

  console.log()
  console.log(`  ${bold('Summary')}`)
  console.log(`  ${clr('gray', 'By Direction')}`)
  for (const [dir, n] of Object.entries(byDir)) {
    const d = dir as SignalDirection
    console.log(`    ${directionLabel(d)}  ${clr('white', String(n))}`)
  }
  console.log(`  ${clr('gray', 'By Status')}`)
  for (const [st, n] of Object.entries(byStatus)) {
    const s = st as SignalStatus
    console.log(`    ${statusLabel(s)}  ${clr('white', String(n))}`)
  }

  // Total in DB
  const total = await Signal.countDocuments()
  console.log()
  console.log(`  ${clr('gray', 'Total in DB')}  ${bold(clr('cyan', String(total) + ' signal(s)'))}`)
  console.log()
  console.log(`  ${clr('green', '✓ Done.')}  Reload the SIGNAL FEED panel to see results.`)
  console.log()

  process.exit(0)
}

main().catch(err => {
  console.error()
  console.error(clr('red', '  ✗ Seeder failed:'), err instanceof Error ? err.message : err)
  console.error()
  process.exit(1)
})
