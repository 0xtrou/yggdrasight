'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { init, dispose, ActionType } from 'klinecharts'
import type { Chart } from 'klinecharts'
import { useOHLCV } from '@/hooks/useOHLCV'
import { usePriceTicker } from '@/hooks/usePriceTicker'
import { useSignals } from '@/hooks/useSignals'

// ─── Constants ───────────────────────────────────────────────────────────────



const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'] as const
type TF = (typeof TIMEFRAMES)[number]

const TF_TO_INTERVAL: Record<TF, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m',
  '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w',
}

// ─── Indicator Registry ───────────────────────────────────────────────────────

interface IndicatorDef {
  name: string
  label: string
  type: 'main' | 'sub'
}

const INDICATOR_CATEGORIES: { label: string; indicators: IndicatorDef[] }[] = [
  {
    label: 'MAIN INDICATORS',
    indicators: [
      { name: 'MA', label: 'MA (7,25,99)', type: 'main' },
      { name: 'EMA', label: 'EMA', type: 'main' },
      { name: 'SMA', label: 'SMA', type: 'main' },
      { name: 'BOLL', label: 'Bollinger Bands', type: 'main' },
      { name: 'SAR', label: 'SAR', type: 'main' },
      { name: 'BBI', label: 'BBI', type: 'main' },
      { name: 'AVP', label: 'AVP', type: 'main' },
    ],
  },
  {
    label: 'SUB INDICATORS',
    indicators: [
      { name: 'VOL', label: 'Volume', type: 'sub' },
      { name: 'MACD', label: 'MACD', type: 'sub' },
      { name: 'RSI', label: 'RSI', type: 'sub' },
      { name: 'KDJ', label: 'KDJ', type: 'sub' },
      { name: 'DMI', label: 'DMI', type: 'sub' },
      { name: 'OBV', label: 'OBV', type: 'sub' },
      { name: 'BIAS', label: 'BIAS', type: 'sub' },
      { name: 'BRAR', label: 'BR/AR', type: 'sub' },
      { name: 'CCI', label: 'CCI', type: 'sub' },
      { name: 'CR', label: 'CR', type: 'sub' },
      { name: 'DMA', label: 'DMA', type: 'sub' },
      { name: 'EMV', label: 'EMV', type: 'sub' },
      { name: 'MTM', label: 'MTM', type: 'sub' },
      { name: 'PSY', label: 'PSY', type: 'sub' },
      { name: 'ROC', label: 'ROC', type: 'sub' },
      { name: 'TRIX', label: 'TRIX', type: 'sub' },
      { name: 'VR', label: 'VR', type: 'sub' },
      { name: 'WR', label: 'WR', type: 'sub' },
      { name: 'AO', label: 'AO', type: 'sub' },
      { name: 'PVT', label: 'PVT', type: 'sub' },
    ],
  },
]

const ALL_INDICATORS = INDICATOR_CATEGORIES.flatMap(c => c.indicators)
const DEFAULT_INDICATORS = ['MA', 'VOL']

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (price >= 100) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 })
  if (price >= 1) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
  if (price >= 0.01) return price.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 5 })
  if (price >= 0.0001) return price.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 7 })
  return price.toLocaleString('en-US', { minimumFractionDigits: 8, maximumFractionDigits: 10 })
}

/** Detect required decimal precision from candle price data. */
function detectPricePrecision(candles: { close: number; low: number }[]): number {
  // Sample some candles to find the smallest meaningful price
  const sample = candles.slice(-100)
  let minPrice = Infinity
  for (const c of sample) {
    if (c.close > 0 && c.close < minPrice) minPrice = c.close
    if (c.low > 0 && c.low < minPrice) minPrice = c.low
  }
  if (minPrice === Infinity || minPrice === 0) return 2
  // For prices >= 1000, 2 decimals. >= 1, 4 decimals.
  // For sub-dollar, count leading zeros after decimal + 4 significant digits
  if (minPrice >= 1000) return 2
  if (minPrice >= 100) return 3
  if (minPrice >= 1) return 4
  // Sub-dollar: count leading zeros after decimal point
  // e.g. 0.02110 → 1 leading zero → need 5 decimals
  // e.g. 0.00085 → 3 leading zeros → need 7 decimals
  const str = minPrice.toFixed(20)
  const afterDot = str.split('.')[1] || ''
  let leadingZeros = 0
  for (const ch of afterDot) {
    if (ch === '0') leadingZeros++
    else break
  }
  // Show at least 4 significant digits after the leading zeros
  return Math.min(leadingZeros + 4, 12)
}

function formatChange(change: number): string {
  const sign = change >= 0 ? '+' : ''
  return `${sign}${change.toFixed(2)}%`
}

function formatVolume(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(2) + 'M'
  if (v >= 1000) return (v / 1000).toFixed(1) + 'K'
  return v.toFixed(0)
}

function formatCandleDate(timestampMs: number): string {
  const d = new Date(timestampMs)
  const yy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mn = String(d.getMinutes()).padStart(2, '0')
  return `${yy}/${mm}/${dd} ${hh}:${mn}`
}

function calcRange(high: number, low: number): string {
  if (low === 0) return '0.00'
  return (((high - low) / low) * 100).toFixed(2)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface OHLCVRowProps {
  candle: { open: number; high: number; low: number; close: number; volume: number; timestamp: number } | null
  prevClose: number | null
}

function OHLCVRow({ candle, prevClose }: OHLCVRowProps) {
  if (!candle) {
    return (
      <div style={{
        height: 20,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 10,
        background: 'var(--color-terminal-bg)',
        borderBottom: '1px solid var(--color-terminal-border)',
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        color: 'var(--color-terminal-dim)',
        letterSpacing: '0.04em',
        gap: 12,
      }}>
        —
      </div>
    )
  }

  const changePct = prevClose != null && prevClose !== 0
    ? ((candle.close - prevClose) / prevClose) * 100
    : ((candle.close - candle.open) / candle.open) * 100
  const changeColor = changePct >= 0 ? 'var(--color-terminal-up)' : 'var(--color-terminal-down)'
  const rangeVal = calcRange(candle.high, candle.low)

  const label: React.CSSProperties = { color: '#555', marginRight: 2 }
  const val: React.CSSProperties = { color: 'var(--color-terminal-text)', marginRight: 10 }

  return (
    <div style={{
      height: 20,
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      paddingLeft: 10,
      background: 'var(--color-terminal-bg)',
      borderBottom: '1px solid var(--color-terminal-border)',
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      letterSpacing: '0.04em',
      gap: 0,
      overflow: 'hidden',
    }}>
      <span style={{ color: 'var(--color-terminal-dim)', marginRight: 10 }}>
        {formatCandleDate(candle.timestamp)}
      </span>
      <span style={label}>O</span><span style={val}>{formatPrice(candle.open)}</span>
      <span style={label}>H</span><span style={val}>{formatPrice(candle.high)}</span>
      <span style={label}>L</span><span style={val}>{formatPrice(candle.low)}</span>
      <span style={label}>C</span><span style={val}>{formatPrice(candle.close)}</span>
      <span style={label}>Chg</span>
      <span style={{ color: changeColor, marginRight: 10 }}>{formatChange(changePct)}</span>
      <span style={label}>Rng</span>
      <span style={{ color: 'var(--color-terminal-muted)', marginRight: 10 }}>{rangeVal}%</span>
      <span style={label}>Vol</span>
      <span style={{ color: 'var(--color-terminal-muted)' }}>{formatVolume(candle.volume)}</span>
    </div>
  )
}

interface MARowProps {
  indicators: { ma7?: number; ma25?: number; ma99?: number }
}

function MARow({ indicators }: MARowProps) {
  const fmt = (v?: number) => v != null ? formatPrice(v) : '—'
  const label: React.CSSProperties = { color: '#555', marginRight: 2 }

  return (
    <div style={{
      height: 18,
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      paddingLeft: 10,
      background: 'var(--color-terminal-bg)',
      borderBottom: '1px solid var(--color-terminal-border)',
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      letterSpacing: '0.04em',
      gap: 0,
    }}>
      <span style={label}>MA(7)</span>
      <span style={{ color: '#4488ff', marginRight: 12 }}>{fmt(indicators.ma7)}</span>
      <span style={label}>MA(25)</span>
      <span style={{ color: '#ffaa00', marginRight: 12 }}>{fmt(indicators.ma25)}</span>
      <span style={label}>MA(99)</span>
      <span style={{ color: '#ff6b6b' }}>{fmt(indicators.ma99)}</span>
    </div>
  )
}

// ─── Context Menu Sub-components ────────────────────────────────────────────

function MenuDivider() {
  return <div style={{ height: 1, background: '#2a2a2a', margin: '4px 0' }} />
}

function MenuItem({
  icon, label, shortcut, onClick, checked,
}: {
  icon?: React.ReactNode
  label: string
  shortcut?: string
  onClick: () => void
  checked?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '7px 16px',
        cursor: 'pointer',
        gap: 12,
        background: hovered ? '#2a2a2a' : 'transparent',
        userSelect: 'none',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon && <span style={{ color: '#888', fontSize: 12, width: 16, textAlign: 'center' }}>{icon}</span>}
        {checked !== undefined && (
          <span style={{
            width: 14, height: 14, borderRadius: 3,
            border: checked ? '1px solid #00ff88' : '1px solid #555',
            background: checked ? '#00ff88' : 'transparent',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, color: checked ? '#000' : 'transparent', flexShrink: 0,
          }}>✓</span>
        )}
        <span style={{ color: '#e5e5e5', fontSize: 12 }}>{label}</span>
      </span>
      {shortcut && <span style={{ color: '#666', fontSize: 10 }}>{shortcut}</span>}
    </div>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ChartPanel({ verdict, symbol: externalSymbol = 'BTC' }: { verdict?: { direction: 'long' | 'short' | 'neutral'; confidence: number } | null; symbol?: string } = {}) {
  // ── Persisted chart config (per-asset, saved immediately on every change) ──
  const storageKey = `oculus-chart-config:${externalSymbol}`

  // Read saved config for this asset (returns defaults if nothing saved)
  const readConfig = useCallback(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) return JSON.parse(raw) as Record<string, unknown>
    } catch { /* corrupt */ }
    return {} as Record<string, unknown>
  }, [storageKey])

  // Write a partial update — merges with existing config
  const saveConfig = useCallback((patch: Record<string, unknown>) => {
    try {
      const prev = readConfig()
      localStorage.setItem(storageKey, JSON.stringify({ ...prev, ...patch }))
    } catch { /* quota / private browsing */ }
  }, [storageKey, readConfig])

  // React state — initialised from localStorage per-asset
  const [timeframe, setTimeframeRaw] = useState<TF>(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed.timeframe && TIMEFRAMES.includes(parsed.timeframe)) return parsed.timeframe as TF
      }
    } catch { /* ignore */ }
    return '4h'
  })
  const [lockedCursor, setLockedCursorRaw] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (typeof parsed.lockedCursor === 'boolean') return parsed.lockedCursor
      }
    } catch { /* ignore */ }
    return false
  })
  const [hideMarks, setHideMarksRaw] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (typeof parsed.hideMarks === 'boolean') return parsed.hideMarks
      }
    } catch { /* ignore */ }
    return false
  })
  const [activeIndicators, setActiveIndicatorsRaw] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed.indicators)) return parsed.indicators
      }
    } catch { /* ignore */ }
    return DEFAULT_INDICATORS
  })

  const setActiveIndicators = useCallback((indicators: string[]) => {
    setActiveIndicatorsRaw(indicators)
    saveConfig({ indicators })
  }, [saveConfig])

  const [showIndicatorMenu, setShowIndicatorMenu] = useState(false)
  const indicatorMenuRef = useRef<HTMLDivElement>(null)

  // Wrapped setters that persist immediately
  const setTimeframe = useCallback((tf: TF) => {
    setTimeframeRaw(tf)
    saveConfig({ timeframe: tf })
  }, [saveConfig])

  const setLockedCursor = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    setLockedCursorRaw((prev: boolean) => {
      const next = typeof v === 'function' ? v(prev) : v
      saveConfig({ lockedCursor: next })
      return next
    })
  }, [saveConfig])

  const setHideMarks = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    setHideMarksRaw((prev: boolean) => {
      const next = typeof v === 'function' ? v(prev) : v
      saveConfig({ hideMarks: next })
      return next
    })
  }, [saveConfig])

  const toggleIndicator = useCallback((name: string) => {
    setActiveIndicators(
      activeIndicators.includes(name)
        ? activeIndicators.filter(n => n !== name)
        : [...activeIndicators, name]
    )
  }, [activeIndicators, setActiveIndicators])

  // Re-hydrate React state when asset changes
  useEffect(() => {
    const cfg = readConfig()
    if (cfg.timeframe && TIMEFRAMES.includes(cfg.timeframe as TF)) setTimeframeRaw(cfg.timeframe as TF)
    if (typeof cfg.lockedCursor === 'boolean') setLockedCursorRaw(cfg.lockedCursor)
    if (typeof cfg.hideMarks === 'boolean') setHideMarksRaw(cfg.hideMarks)
    if (Array.isArray(cfg.indicators)) setActiveIndicatorsRaw(cfg.indicators)
  }, [externalSymbol, readConfig])


  const symbol = `${externalSymbol}USDT`
  const interval = TF_TO_INTERVAL[timeframe]

  const { candles, loading, error } = useOHLCV(symbol, interval)
  const { tickers } = usePriceTicker([externalSymbol])
  const { signals } = useSignals()

  const ticker = tickers[symbol]
  const change24h = ticker?.change24h ?? 0

  // Hover state for OHLCV & MA rows
  const [hoverCandle, setHoverCandle] = useState<{
    open: number; high: number; low: number; close: number; volume: number; timestamp: number
  } | null>(null)
  const [hoverIndicators, setHoverIndicators] = useState<{ ma7?: number; ma25?: number; ma99?: number }>({})

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; price: number } | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const chartRef = useRef<Chart | null>(null)

  // Chart ref
  const containerRef = useRef<HTMLDivElement>(null)

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev)
    // Trigger resize after state update so klinecharts recalculates
    setTimeout(() => chartRef.current?.resize(), 50)
  }, [])

  // Escape exits fullscreen
  useEffect(() => {
    if (!isFullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFullscreen(false)
        setTimeout(() => chartRef.current?.resize(), 50)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isFullscreen])

  // Close indicator menu on outside click
  useEffect(() => {
    if (!showIndicatorMenu) return
    const onMouseDown = (e: MouseEvent) => {
      if (indicatorMenuRef.current && !indicatorMenuRef.current.contains(e.target as Node)) {
        setShowIndicatorMenu(false)
      }
    }
    window.addEventListener('mousedown', onMouseDown)
    return () => window.removeEventListener('mousedown', onMouseDown)
  }, [showIndicatorMenu])

  // ── Chart init & data update ──────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || loading || candles.length === 0) return

    const container = containerRef.current
    dispose(container)

    const chart: Chart | null = init(container)
    if (!chart) return
    chartRef.current = chart

    // Set price precision based on actual candle data (critical for sub-dollar tokens)
    const pricePrecision = detectPricePrecision(candles)
    chart.setPriceVolumePrecision(pricePrecision, 0)

    // Bloomberg terminal dark styles (hex only — CSS vars don't work in canvas)
    chart.setStyles({
      candle: {
        bar: {
          upColor: '#00ff88',
          downColor: '#ff3b3b',
          noChangeColor: '#888888',
          upBorderColor: '#00ff88',
          downBorderColor: '#ff3b3b',
          noChangeBorderColor: '#888888',
          upWickColor: '#00ff88',
          downWickColor: '#ff3b3b',
          noChangeWickColor: '#888888',
        },
      },
      xAxis: {
        axisLine: { color: '#2a2a2a' },
        tickLine: { color: '#2a2a2a' },
        tickText: { color: '#888888', size: 10, family: 'JetBrains Mono, monospace' },
      },
      yAxis: {
        axisLine: { color: '#2a2a2a' },
        tickLine: { color: '#2a2a2a' },
        tickText: { color: '#888888', size: 10, family: 'JetBrains Mono, monospace' },
      },
      grid: {
        horizontal: { color: '#1a1a1a' },
        vertical: { color: '#1a1a1a' },
      },
      crosshair: {
        horizontal: {
          line: { color: '#444444' },
          text: { backgroundColor: '#222222', color: '#e5e5e5' },
        },
        vertical: {
          line: { color: '#444444' },
          text: { backgroundColor: '#222222', color: '#e5e5e5' },
        },
      },
      separator: { color: '#1a1a1a' },
    })

    // Feed OHLCV data — useOHLCV returns time in Unix seconds, klinecharts needs milliseconds
    chart.applyNewData(
      candles.map((c) => ({
        timestamp: c.time * 1000,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      })),
    )

    // Create indicators dynamically from activeIndicators
    // isStack=true allows multiple indicators to coexist in the same pane
    for (const name of activeIndicators) {
      const def = ALL_INDICATORS.find(i => i.name === name)
      if (!def) continue
      if (def.type === 'main') {
        try {
          if (name === 'MA') {
            chart.createIndicator({ name: 'MA', calcParams: [7, 25, 99] }, true, { id: 'candle_pane' })
          } else {
            chart.createIndicator(name, true, { id: 'candle_pane' })
          }
        } catch {
          chart.createIndicator(name, true, { id: 'candle_pane' })
        }
      } else {
        chart.createIndicator(name, true)
      }
    }

    // Restore saved bar space (zoom) and scroll offset
    const cfg = readConfig()
    if (typeof cfg.barSpace === 'number' && cfg.barSpace > 0) {
      chart.setBarSpace(cfg.barSpace)
    }
    if (typeof cfg.offsetRightDistance === 'number') {
      chart.setOffsetRightDistance(cfg.offsetRightDistance)
    }

    // Persist zoom & scroll immediately on every user interaction
    chart.subscribeAction(ActionType.OnZoom, () => {
      saveConfig({
        barSpace: chart.getBarSpace(),
        offsetRightDistance: chart.getOffsetRightDistance(),
      })
    })
    chart.subscribeAction(ActionType.OnScroll, () => {
      saveConfig({
        barSpace: chart.getBarSpace(),
        offsetRightDistance: chart.getOffsetRightDistance(),
      })
    })

    // Crosshair change listener for OHLCV & MA rows
    chart.subscribeAction(ActionType.OnCrosshairChange, (data: unknown) => {
      try {
        const d = data as {
          kLineData?: { open: number; high: number; low: number; close: number; volume: number; timestamp: number }
          indicatorData?: unknown
        }
        if (d.kLineData) {
          setHoverCandle(d.kLineData)
        }
        // Extract MA values — structure varies by klinechart version
        if (d.indicatorData) {
          try {
            const indMap = d.indicatorData as Map<string, unknown> | Record<string, unknown>
            let maEntry: unknown = null
            if (typeof (indMap as Map<string, unknown>).get === 'function') {
              const m = indMap as Map<string, unknown>
              maEntry = m.get('MA') ?? m.get('candle_pane_MA')
            } else {
              const rec = indMap as Record<string, unknown>
              maEntry = rec['MA'] ?? rec['candle_pane_MA']
            }
            if (maEntry) {
              const ma = maEntry as { MA1?: number; MA2?: number; MA3?: number; values?: { MA1?: number; MA2?: number; MA3?: number } }
              const vals = ma.values ?? ma
              setHoverIndicators({
                ma7: typeof vals.MA1 === 'number' ? vals.MA1 : undefined,
                ma25: typeof vals.MA2 === 'number' ? vals.MA2 : undefined,
                ma99: typeof vals.MA3 === 'number' ? vals.MA3 : undefined,
              })
            }
          } catch {
            // indicator data unavailable — leave as-is
          }
        }
      } catch {
        // noop
      }
    })

    // Signal markers
    const chartStart = candles[0].time * 1000
    const chartEnd = candles[candles.length - 1].time * 1000

    for (const sig of signals) {
      const sigBase = sig.symbol.replace(/[/\-_]?USDT$/i, '').replace('/', '')
      if (sigBase.toUpperCase() !== externalSymbol.toUpperCase()) continue

      const createdTs = new Date(sig.createdAt).getTime()
      if (createdTs < chartStart || createdTs > chartEnd) continue

      const isLong = sig.direction === 'long'
      chart.createOverlay({
        name: 'simpleAnnotation',
        lock: true,
        points: [{ timestamp: createdTs, value: sig.entryPrice }],
        extendData: `${isLong ? '▲' : '▼'} E ${formatPrice(sig.entryPrice)}`,
        styles: {
          text: {
            color: isLong ? '#00ff88' : '#ff3b3b',
            size: 10,
            family: 'JetBrains Mono, monospace',
            weight: 'bold',
          },
        },
      })

      for (const tp of sig.takeProfits) {
        if (tp.hit && tp.hitAt) {
          const ts = new Date(tp.hitAt).getTime()
          if (ts >= chartStart && ts <= chartEnd) {
            chart.createOverlay({
              name: 'simpleAnnotation',
              lock: true,
              points: [{ timestamp: ts, value: tp.price }],
              extendData: `TP${tp.level}`,
              styles: {
                text: {
                  color: '#00ff88',
                  size: 10,
                  family: 'JetBrains Mono, monospace',
                  weight: 'bold',
                },
              },
            })
          }
        }
      }
    }

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      chart.resize()
    })
    resizeObserver.observe(container)

    return () => {
      chartRef.current = null
      resizeObserver.disconnect()
      dispose(container)
    }
  }, [candles, signals, externalSymbol, readConfig, saveConfig, activeIndicators]) // re-create when data, symbol, or indicators change

  // Displayed candle: prefer hovered, fall back to last candle
  const lastCandle = candles.length > 0 ? candles[candles.length - 1] : null
  const prevCandle = candles.length > 1 ? candles[candles.length - 2] : null
  const displayCandle = hoverCandle ?? (lastCandle ? {
    open: lastCandle.open,
    high: lastCandle.high,
    low: lastCandle.low,
    close: lastCandle.close,
    volume: lastCandle.volume,
    timestamp: lastCandle.time * 1000,
  } : null)
  const prevClose = prevCandle?.close ?? null

  // Dismiss context menu on outside click or Escape
  useEffect(() => {
    if (!ctxMenu) return
    const dismiss = () => setCtxMenu(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCtxMenu(null) }
    window.addEventListener('mousedown', dismiss)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', dismiss)
      window.removeEventListener('keydown', onKey)
    }
  }, [ctxMenu])

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        ...(isFullscreen ? {
          position: 'fixed' as const,
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9999,
          background: 'var(--color-terminal-bg)',
        } : {}),
        display: 'flex',
        flexDirection: 'column' as const,
        height: '100%',
        overflow: 'hidden',
        borderRight: isFullscreen ? 'none' : '1px solid var(--color-terminal-border)',
      }}
    >

      {/* ── Section 2: Timeframe toolbar ── */}
      <div
        style={{
          padding: '0 10px',
          background: 'var(--color-terminal-panel)',
          borderBottom: '1px solid var(--color-terminal-border)',
          fontFamily: 'var(--font-mono)',
          flexShrink: 0,
          height: 28,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-terminal-text)' }}>
          {externalSymbol}/USDT
        </span>

        {/* 24h change badge */}
        {ticker != null && (
          <span style={{
            fontSize: 10,
            color: change24h >= 0 ? 'var(--color-terminal-up)' : 'var(--color-terminal-down)',
          }}>
            {change24h >= 0 ? '▲' : '▼'} {formatChange(change24h)}
          </span>
        )}

        {/* Timeframe buttons */}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              style={{
                padding: '1px 5px',
                fontSize: 9,
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
                border: tf === timeframe ? '1px solid rgba(255,170,0,0.5)' : '1px solid transparent',
                background: tf === timeframe ? 'rgba(255,170,0,0.15)' : 'transparent',
                color: tf === timeframe ? 'var(--color-terminal-amber)' : 'var(--color-terminal-dim)',
                letterSpacing: '0.04em',
              }}
            >
              {tf}
            </button>
          ))}
        </span>
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
          style={{
            background: 'transparent',
            border: '1px solid var(--color-terminal-border)',
            color: isFullscreen ? 'var(--color-terminal-amber)' : 'var(--color-terminal-dim)',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            cursor: 'pointer',
            padding: '1px 5px',
            marginLeft: 4,
            lineHeight: 1,
          }}
        >
          {isFullscreen ? '⊡' : '⊞'}
        </button>

        {/* Indicator selector button + dropdown */}
        <div ref={indicatorMenuRef} style={{ position: 'relative', marginLeft: 4 }}>
          <button
            onClick={() => setShowIndicatorMenu(v => !v)}
            title="Technical Indicators"
            style={{
              background: showIndicatorMenu ? 'rgba(255,170,0,0.15)' : 'transparent',
              border: showIndicatorMenu ? '1px solid rgba(255,170,0,0.5)' : '1px solid var(--color-terminal-border)',
              color: showIndicatorMenu ? 'var(--color-terminal-amber)' : 'var(--color-terminal-dim)',
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              cursor: 'pointer',
              padding: '1px 5px',
              lineHeight: 1,
              letterSpacing: '0.04em',
            }}
          >
            Indicators
          </button>

          {showIndicatorMenu && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 4,
                zIndex: 1000,
                background: '#1a1a1a',
                border: '1px solid #333',
                borderRadius: 6,
                padding: '6px 0',
                minWidth: 220,
                maxHeight: 420,
                overflowY: 'auto',
                boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 11,
              }}
            >
              {INDICATOR_CATEGORIES.map((cat) => (
                <div key={cat.label}>
                  <div style={{
                    padding: '6px 12px 3px',
                    fontSize: 9,
                    fontWeight: 700,
                    color: '#888',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase' as const,
                  }}>
                    {cat.label}
                  </div>
                  {cat.indicators.map((ind) => {
                    const active = activeIndicators.includes(ind.name)
                    return (
                      <div
                        key={ind.name}
                        onClick={() => toggleIndicator(ind.name)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '5px 12px',
                          cursor: 'pointer',
                          background: active ? 'rgba(255,170,0,0.08)' : 'transparent',
                          userSelect: 'none',
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = active ? 'rgba(255,170,0,0.15)' : '#2a2a2a' }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = active ? 'rgba(255,170,0,0.08)' : 'transparent' }}
                      >
                        <span style={{
                          width: 14,
                          height: 14,
                          borderRadius: 3,
                          border: active ? '1px solid var(--color-terminal-amber)' : '1px solid #555',
                          background: active ? 'var(--color-terminal-amber)' : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 10,
                          color: active ? '#000' : 'transparent',
                          flexShrink: 0,
                        }}>
                          ✓
                        </span>
                        <span style={{ color: active ? 'var(--color-terminal-text)' : '#999', fontSize: 11 }}>
                          {ind.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              ))}
              <div style={{ height: 1, background: '#2a2a2a', margin: '6px 0' }} />
              <div
                onClick={() => { setActiveIndicators(DEFAULT_INDICATORS); setShowIndicatorMenu(false) }}
                style={{
                  padding: '5px 12px',
                  cursor: 'pointer',
                  color: '#888',
                  fontSize: 10,
                  userSelect: 'none',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#2a2a2a' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
              >
                Reset to defaults
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Section 3: OHLCV data row ── */}
      <OHLCVRow candle={displayCandle} prevClose={prevClose} />

      {/* ── Section 4: MA indicator row ── */}
      <MARow indicators={hoverIndicators} />

      {/* ── Section 5: Chart area ── */}
      <div
        style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'var(--color-terminal-bg)' }}
        onContextMenu={(e) => {
          e.preventDefault()
          const rect = containerRef.current?.getBoundingClientRect()
          if (!rect) return
          const x = e.clientX - rect.left
          const y = e.clientY - rect.top
          let price = 0
          try {
            const result = chartRef.current?.convertFromPixel([{ x, y }], { paneId: 'candle_pane' })
            const pt = Array.isArray(result) ? result[0] : result
            price = (pt as { value?: number })?.value ?? 0
          } catch { price = 0 }
          setCtxMenu({ x: e.clientX, y: e.clientY, price })
        }}
      >

        {/* Verdict badge */}
        {verdict && (
          <div style={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 20,
            background: 'rgba(0,0,0,0.75)',
            padding: '3px 8px',
            fontSize: 10,
            fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: '0.06em',
            border: `1px solid ${verdict.direction === 'long' ? '#00ff88' : verdict.direction === 'short' ? '#ff3b3b' : '#ffaa00'}`,
            color: verdict.direction === 'long' ? '#00ff88' : verdict.direction === 'short' ? '#ff3b3b' : '#ffaa00',
          }}>
            {verdict.direction === 'long' ? 'BUY ▲' : verdict.direction === 'short' ? 'SELL ▼' : 'NEUTRAL —'}
            {'  '}{(verdict.confidence * 100).toFixed(0)}%
          </div>
        )}

        {/* Loading overlay */}
        {loading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--color-terminal-bg)',
              zIndex: 10,
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--color-terminal-dim)',
              letterSpacing: '0.1em',
            }}
          >
            LOADING OHLCV...
          </div>
        )}

        {/* Error overlay */}
        {error && !loading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--color-terminal-bg)',
              zIndex: 10,
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--color-terminal-amber)',
              letterSpacing: '0.08em',
            }}
          >
            ERR: {error}
          </div>
        )}

        {/* Chart container — klinecharts mounts here */}
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        {/* Context menu */}
        {ctxMenu && (
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: Math.min(ctxMenu.y, (typeof window !== 'undefined' ? window.innerHeight : 800) - 340),
              left: Math.min(ctxMenu.x, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 230),
              zIndex: 1000,
              background: '#1a1a1a',
              border: '1px solid #333333',
              borderRadius: 6,
              padding: '4px 0',
              minWidth: 220,
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 12,
              color: '#e5e5e5',
            }}
          >
            <MenuItem
              icon="↩"
              label="Reset chart view"
              shortcut="⌥R"
              onClick={() => {
                chartRef.current?.scrollToRealTime()
                setCtxMenu(null)
              }}
            />
            <MenuDivider />
            <MenuItem
              label={`Create Alert at ${formatPrice(ctxMenu.price)}`}
              onClick={() => setCtxMenu(null)}
            />
            <MenuItem
              label={`Copy price ${formatPrice(ctxMenu.price)}`}
              onClick={() => {
                navigator.clipboard.writeText(String(ctxMenu.price)).catch(() => {})
                setCtxMenu(null)
              }}
            />
            <MenuDivider />
            <MenuItem
              label="Lock vertical cursor line by time"
              checked={lockedCursor}
              onClick={() => { setLockedCursor(v => !v); setCtxMenu(null) }}
            />
            <MenuDivider />
            <MenuItem
              label="Remove all indicators"
              onClick={() => { setActiveIndicators([]); setCtxMenu(null); }}
            />
            <MenuItem
              label="Hide marks on bars"
              checked={hideMarks}
              onClick={() => { setHideMarks(v => !v); setCtxMenu(null) }}
            />
            <MenuDivider />
            <MenuItem icon="⚙" label="Settings..." onClick={() => setCtxMenu(null)} />
          </div>
        )}
      </div>
    </div>
  )
}
