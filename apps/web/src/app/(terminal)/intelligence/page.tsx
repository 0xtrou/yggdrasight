'use client'

import { Suspense } from 'react'
import { useMarketGlobal, type MarketGlobalData } from '@/hooks/useMarketGlobal'
import { usePriceTicker, type TickerData } from '@/hooks/usePriceTicker'

/* ── Constants ── */
const ASSETS = ['BTC', 'ETH', 'SOL', 'BNB', 'TAO', 'DOGE', 'XRP', 'ADA', 'AVAX', 'DOT'] as const
const TICKER_SYMBOLS = ASSETS.map(s => `${s}USDT`)

/* ── Number formatters ── */
function formatLargeUsd(v: number | null | undefined): string {
  if (v == null) return '—'
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  return `$${v.toFixed(0)}`
}

function formatPct(v: number | null | undefined, decimals = 1): string {
  if (v == null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(decimals)}%`
}

function formatPrice(v: number | null | undefined): string {
  if (v == null) return '—'
  if (v >= 10000) return `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  if (v >= 1) return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
  return `$${v.toFixed(6)}`
}

/* ── Fear & Greed gauge ── */
function fearGreedColor(val: number): string {
  if (val <= 25) return '#ff3b3b'
  if (val <= 45) return '#ff8c00'
  if (val <= 55) return '#ffaa00'
  if (val <= 75) return '#66cc88'
  return '#00ff88'
}

/* ── Global header bar ── */
function GlobalMetricsBar({ data, loading }: { data: MarketGlobalData | null; loading: boolean }) {
  const fgColor = data ? fearGreedColor(data.fearGreedValue) : 'var(--color-terminal-dim)'

  return (
    <div style={{
      height: '44px',
      minHeight: '44px',
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      gap: '24px',
      background: 'var(--color-terminal-panel)',
      borderBottom: '1px solid var(--color-terminal-border)',
      overflowX: 'auto',
      flexShrink: 0,
    }}>
      <span style={{ color: 'var(--color-terminal-amber)', fontSize: '11px', fontWeight: 'bold', letterSpacing: '0.15em', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
        GLOBAL INTELLIGENCE
      </span>

      {loading ? (
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>LOADING...</span>
      ) : data ? (
        <>
          <MetricPill label="MARKET CAP" value={formatLargeUsd(data.totalMarketCap)} />
          <MetricPill label="24H VOL" value={formatLargeUsd(data.totalVolume24h)} />
          <MetricPill label="BTC DOM" value={`${data.btcDominance.toFixed(1)}%`} />
          <MetricPill
            label="FEAR & GREED"
            value={`${data.fearGreedValue} ${data.fearGreedLabel.toUpperCase()}`}
            valueColor={fgColor}
          />
        </>
      ) : (
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>NO GLOBAL DATA</span>
      )}
    </div>
  )
}

function MetricPill({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
      <span style={{ color: 'var(--color-terminal-dim)', fontSize: '9px', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' }}>
        {label}
      </span>
      <span style={{ color: valueColor ?? 'var(--color-terminal-text)', fontSize: '11px', fontWeight: 'bold', fontFamily: 'var(--font-mono)' }}>
        {value}
      </span>
    </div>
  )
}

/* ── Price grid row ── */
function AssetRow({ symbol, ticker }: { symbol: string; ticker?: TickerData }) {
  const changeColor = ticker
    ? ticker.change24h >= 0 ? 'var(--color-terminal-up)' : 'var(--color-terminal-down)'
    : 'var(--color-terminal-dim)'

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '80px 1fr 90px 70px',
      alignItems: 'center',
      padding: '8px 16px',
      borderBottom: '1px solid var(--color-terminal-border)',
      gap: '12px',
      fontFamily: 'var(--font-mono)',
    }}>
      {/* Symbol */}
      <span style={{ color: 'var(--color-terminal-text)', fontSize: '12px', fontWeight: 'bold', letterSpacing: '0.08em' }}>
        {symbol}
      </span>

      {/* Price bar background */}
      <div style={{ position: 'relative', height: '2px', background: 'var(--color-terminal-border)', borderRadius: '1px', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: ticker ? `${Math.min(100, Math.abs(ticker.change24h) * 5)}%` : '0%',
          background: changeColor,
          transition: 'width 0.5s ease',
          borderRadius: '1px',
        }} />
      </div>

      {/* Price */}
      <span style={{ color: 'var(--color-terminal-text)', fontSize: '12px', fontWeight: 'bold', textAlign: 'right' }}>
        {ticker ? formatPrice(ticker.price) : '—'}
      </span>

      {/* 24h change */}
      <span style={{ color: changeColor, fontSize: '11px', fontWeight: 'bold', textAlign: 'right' }}>
        {ticker ? formatPct(ticker.change24h) : '—'}
      </span>
    </div>
  )
}

/* ── Fear & Greed Arc Gauge ── */
function FearGreedGauge({ data, loading }: { data: MarketGlobalData | null; loading: boolean }) {
  if (loading || !data) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '160px', color: 'var(--color-terminal-dim)', fontSize: '11px', fontFamily: 'var(--font-mono)',
      }}>
        {loading ? 'LOADING...' : 'NO DATA'}
      </div>
    )
  }

  const val = data.fearGreedValue
  const color = fearGreedColor(val)

  // SVG arc gauge — half circle
  const radius = 60
  const cx = 80
  const cy = 80
  // Angle from -180deg (left) to 0deg (right)
  const angle = -180 + (val / 100) * 180
  const rad = (angle * Math.PI) / 180
  const needleX = cx + radius * Math.cos(rad)
  const needleY = cy + radius * Math.sin(rad)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px' }}>
      <svg width="160" height="90" viewBox="0 0 160 90">
        {/* Background arc */}
        <path
          d={`M 10 80 A 70 70 0 0 1 150 80`}
          fill="none"
          stroke="var(--color-terminal-border)"
          strokeWidth="8"
          strokeLinecap="round"
        />
        {/* Colored arc */}
        <path
          d={`M 10 80 A 70 70 0 0 1 ${needleX + (cx - 80)} ${needleY + (cy - 80) + (80 - cy)}`}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          opacity={0.85}
        />
        {/* Needle dot */}
        <circle cx={needleX} cy={needleY} r={5} fill={color} />
        {/* Center value */}
        <text x="80" y="75" textAnchor="middle" fill={color} fontSize="22" fontWeight="bold" fontFamily="var(--font-mono)">
          {val}
        </text>
      </svg>
      <span style={{ color, fontSize: '12px', fontWeight: 'bold', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)', marginTop: '-8px' }}>
        {data.fearGreedLabel.toUpperCase()}
      </span>
      <span style={{ color: 'var(--color-terminal-dim)', fontSize: '9px', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
        FEAR &amp; GREED INDEX
      </span>
    </div>
  )
}

/* ── BTC Dominance bar ── */
function DominanceBar({ data, loading }: { data: MarketGlobalData | null; loading: boolean }) {
  if (!data || loading) return null

  const btcPct = data.btcDominance
  const altPct = 100 - btcPct

  return (
    <div style={{ padding: '16px' }}>
      <div style={{ color: 'var(--color-terminal-dim)', fontSize: '9px', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)', marginBottom: '8px' }}>
        MARKET DOMINANCE
      </div>
      <div style={{ height: '8px', background: 'var(--color-terminal-border)', borderRadius: '4px', overflow: 'hidden', display: 'flex' }}>
        <div style={{ width: `${btcPct}%`, background: '#f7931a', borderRadius: '4px 0 0 4px', transition: 'width 0.5s ease' }} />
        <div style={{ flex: 1, background: '#8e7cc3', borderRadius: '0 4px 4px 0' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
        <span style={{ color: '#f7931a', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>BTC {btcPct.toFixed(1)}%</span>
        <span style={{ color: '#8e7cc3', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>ALT {altPct.toFixed(1)}%</span>
      </div>
    </div>
  )
}

/* ── Main content ── */
function IntelligenceContent() {
  const { tickers } = usePriceTicker(TICKER_SYMBOLS)
  const { data: globalData, loading: globalLoading } = useMarketGlobal()

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, background: 'var(--color-terminal-bg)', fontFamily: 'var(--font-mono)' }}>
      {/* Global bar */}
      <GlobalMetricsBar data={globalData} loading={globalLoading} />

      {/* Body: two-column layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* Left: asset price grid */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, borderRight: '1px solid var(--color-terminal-border)' }}>
          {/* Column headers */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '80px 1fr 90px 70px',
            padding: '6px 16px',
            gap: '12px',
            background: 'var(--color-terminal-panel)',
            borderBottom: '1px solid var(--color-terminal-border)',
            flexShrink: 0,
          }}>
            {['ASSET', 'MOMENTUM', 'PRICE', '24H'].map(h => (
              <span key={h} style={{ color: 'var(--color-terminal-dim)', fontSize: '9px', letterSpacing: '0.12em' }}>{h}</span>
            ))}
          </div>

          {/* Rows */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {ASSETS.map(asset => (
              <AssetRow key={asset} symbol={asset} ticker={tickers[`${asset}USDT`]} />
            ))}
          </div>
        </div>

        {/* Right: gauge + dominance panel */}
        <div style={{ width: '240px', minWidth: '200px', flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <FearGreedGauge data={globalData} loading={globalLoading} />
          <div style={{ borderTop: '1px solid var(--color-terminal-border)' }} />
          <DominanceBar data={globalData} loading={globalLoading} />
        </div>
      </div>
    </div>
  )
}

export default function IntelligencePage() {
  return (
    <Suspense>
      <IntelligenceContent />
    </Suspense>
  )
}
