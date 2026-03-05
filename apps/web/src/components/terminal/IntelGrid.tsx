'use client'

import { useState, useMemo } from 'react'
import { useIntelligence } from '@/hooks/useIntelligence'
import { useMarketGlobal } from '@/hooks/useMarketGlobal'
import { useSignals } from '@/hooks/useSignals'
import type { VerdictRecord, AnalystVerdict } from '@/lib/intelligence/types'

type ViewMode = 'LIST' | 'GRID'

const SYMBOLS = ['BTC', 'ETH', 'SOL', 'BNB'] as const

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: '9px',
  letterSpacing: '0.12em',
  color: 'var(--color-terminal-dim)',
  background: 'var(--color-terminal-panel)',
  borderTop: '1px solid var(--color-terminal-border)',
  borderBottom: '1px solid var(--color-terminal-border)',
  padding: '5px 10px 3px',
  fontFamily: 'var(--font-mono)',
}

const dataRowStyle: React.CSSProperties = {
  fontSize: '11px',
  padding: '5px 10px',
  borderBottom: '1px solid var(--color-terminal-border)',
  fontFamily: 'var(--font-mono)',
}

function getDirectionColor(direction: string): string {
  switch (direction) {
    case 'long': return 'var(--color-terminal-up)'
    case 'short': return 'var(--color-terminal-down)'
    default: return 'var(--color-terminal-amber)'
  }
}

function getDirectionChip(direction: string): { label: string; color: string } {
  switch (direction) {
    case 'long': return { label: '▲ LONG', color: 'var(--color-terminal-up)' }
    case 'short': return { label: '▼ SHORT', color: 'var(--color-terminal-down)' }
    default: return { label: '— NEUTRAL', color: 'var(--color-terminal-amber)' }
  }
}

function getVerdictLabel(direction: string): string {
  switch (direction) {
    case 'long': return 'BUY ▲'
    case 'short': return 'SELL ▼'
    default: return 'NEUTRAL —'
  }
}

function getHistoryLabel(direction: string): string {
  switch (direction) {
    case 'long': return '▲ BUY'
    case 'short': return '▼ SELL'
    default: return '— NEU'
  }
}

function formatMcap(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  return `$${n.toFixed(0)}`
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/* ── Section header ── */
function SectionHeader({ title }: { title: string }) {
  return <div style={sectionHeaderStyle}>{title}</div>
}

/* ── Stat row ── */
function StatRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ ...dataRowStyle, display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: 'var(--color-terminal-muted)' }}>{label}</span>
      <span style={{ color: valueColor ?? 'var(--color-terminal-text)' }}>{value}</span>
    </div>
  )
}

/* ── Confidence bar ── */
function ConfidenceBar({ confidence, color }: { confidence: number; color: string }) {
  return (
    <div style={{ height: '2px', backgroundColor: color, width: `${confidence * 100}%`, transition: 'width 0.3s ease' }} />
  )
}

/* ── Analyst card ── */
function AnalystCard({ analyst }: { analyst: AnalystVerdict }) {
  const chip = getDirectionChip(analyst.direction)
  const dirColor = getDirectionColor(analyst.direction)

  // Build indicator badges from indicators object
  const badges = analyst.indicators
    ? Object.entries(analyst.indicators).map(([k, v]) => (
        <span
          key={k}
          style={{
            display: 'inline-block',
            padding: '1px 4px',
            marginRight: '3px',
            marginTop: '2px',
            fontSize: '8px',
            background: 'var(--color-terminal-panel)',
            border: '1px solid var(--color-terminal-border)',
            color: 'var(--color-terminal-muted)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {k}: {typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : String(v)}
        </span>
      ))
    : null

  return (
    <div style={{ padding: '8px 10px 8px 12px', borderBottom: '1px solid var(--color-terminal-border)', borderLeft: `2px solid ${dirColor}`, fontFamily: 'var(--font-mono)' }}>
      {/* Row 1: name + direction chip */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
        <span style={{ color: 'var(--color-terminal-text)', fontSize: '10px' }}>{analyst.meta.name}</span>
        <span style={{ color: chip.color, fontSize: '9px', fontWeight: 'bold' }}>{chip.label}</span>
      </div>
      {/* Row 2: description + confidence */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
        <span style={{ color: 'var(--color-terminal-muted)', fontSize: '9px' }}>{analyst.meta.description}</span>
        <span style={{ color: 'var(--color-terminal-blue)', fontSize: '9px' }}>{(analyst.confidence * 100).toFixed(0)}%</span>
      </div>
      {/* 2px confidence bar */}
      <ConfidenceBar confidence={analyst.confidence} color={dirColor} />
      {/* Reason text */}
      {analyst.reason && (
        <div style={{ color: 'var(--color-terminal-dim)', fontSize: '8px', marginTop: '3px', lineHeight: '1.3' }}>
          {analyst.reason}
        </div>
      )}
      {/* Indicator badges */}
      {badges && badges.length > 0 && (
        <div style={{ marginTop: '3px', display: 'flex', flexWrap: 'wrap' }}>{badges}</div>
      )}
    </div>
  )
}

/* ── Analyst grid card (standalone card variant for GRID mode) ── */
function AnalystGridCard({ analyst }: { analyst: AnalystVerdict }) {
  const chip = getDirectionChip(analyst.direction)
  const dirColor = getDirectionColor(analyst.direction)

  const badges = analyst.indicators
    ? Object.entries(analyst.indicators).map(([k, v]) => (
        <span
          key={k}
          style={{
            display: 'inline-block',
            padding: '1px 4px',
            marginRight: '3px',
            marginTop: '2px',
            fontSize: '8px',
            background: 'var(--color-terminal-surface)',
            border: '1px solid var(--color-terminal-border)',
            color: 'var(--color-terminal-muted)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {k}: {typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : String(v)}
        </span>
      ))
    : null

  return (
    <div
      style={{
        background: 'var(--color-terminal-panel)',
        border: '1px solid var(--color-terminal-border)',
        borderLeft: `2px solid ${dirColor}`,
        padding: '12px',
        fontFamily: 'var(--font-mono)',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      {/* Card header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '9px', letterSpacing: '0.12em' }}>
          {analyst.meta.name.toUpperCase()}
        </span>
        <span style={{ color: chip.color, fontSize: '9px', fontWeight: 'bold' }}>{chip.label}</span>
      </div>
      {/* Description */}
      {analyst.meta.description && (
        <span style={{ color: 'var(--color-terminal-muted)', fontSize: '9px' }}>{analyst.meta.description}</span>
      )}
      {/* Confidence row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'var(--color-terminal-muted)', fontSize: '9px' }}>Confidence</span>
        <span style={{ color: 'var(--color-terminal-blue)', fontSize: '9px' }}>{(analyst.confidence * 100).toFixed(0)}%</span>
      </div>
      <ConfidenceBar confidence={analyst.confidence} color={dirColor} />
      {/* Reason */}
      {analyst.reason && (
        <div style={{ color: 'var(--color-terminal-dim)', fontSize: '8px', lineHeight: '1.4' }}>{analyst.reason}</div>
      )}
      {/* Indicator badges */}
      {badges && badges.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>{badges}</div>
      )}
    </div>
  )
}

/* ── MTF Alignment section ── */
function MTFAlignmentSection({ analysts }: { analysts: AnalystVerdict[] }) {
  const mtf = analysts.find((a) => a.meta.id === 'mtf-alignment')
  if (!mtf || !mtf.indicators) return null

  const timeframes = [
    { label: 'H1', key: 'h1' },
    { label: 'H4', key: 'h4' },
    { label: 'D1', key: 'd1' },
  ]

  return (
    <>
      <SectionHeader title="MTF ALIGNMENT" />
      {timeframes.map((tf) => {
        const bias = mtf.indicators?.[tf.key]
        const isBullish = bias === 'bullish'
        const isBearish = bias === 'bearish'
        const color = isBullish
          ? 'var(--color-terminal-up)'
          : isBearish
          ? 'var(--color-terminal-down)'
          : 'var(--color-terminal-amber)'
        return (
          <div key={tf.key} style={{ ...dataRowStyle, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--color-terminal-muted)' }}>{tf.label}</span>
            <span style={{ color, fontWeight: 'bold', fontSize: '10px' }}>
              {isBullish ? '▲ BULLISH' : isBearish ? '▼ BEARISH' : String(bias ?? 'N/A').toUpperCase()}
            </span>
          </div>
        )
      })}
      {mtf.indicators?.alignment != null && (
        <div style={{ ...dataRowStyle, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--color-terminal-muted)' }}>Alignment</span>
          <span style={{ color: 'var(--color-terminal-blue)' }}>{(Number(mtf.indicators.alignment) * 100).toFixed(0)}%</span>
        </div>
      )}
    </>
  )
}

/* ── Volume Profile section ── */
function VolumeProfileSection({ analysts }: { analysts: AnalystVerdict[] }) {
  const vol = analysts.find((a) => a.meta.id === 'volume-profile')
  if (!vol || !vol.indicators) return null

  return (
    <>
      <SectionHeader title="VOLUME PROFILE" />
      <StatRow label="OBV" value={String(vol.indicators.obv ?? '—')} />
      <StatRow
        label="OBV Trend"
        value={String(vol.indicators.obvTrend ?? '—').toUpperCase()}
        valueColor={
          vol.indicators.obvTrend === 'rising'
            ? 'var(--color-terminal-up)'
            : vol.indicators.obvTrend === 'falling'
            ? 'var(--color-terminal-down)'
            : 'var(--color-terminal-amber)'
        }
      />
      <StatRow label="Vol Ratio" value={`${vol.indicators.volumeRatio ?? '—'}x`} />
    </>
  )
}

/* ── Key Levels section ── */
function KeyLevelsSection({ analysts }: { analysts: AnalystVerdict[] }) {
  const kl = analysts.find((a) => a.meta.id === 'key-levels')
  if (!kl || !kl.indicators) return null

  const fmt = (v: string | number | undefined) => {
    if (v == null) return '—'
    const n = Number(v)
    return isNaN(n) ? String(v) : `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  }
  const pctFmt = (v: string | number | undefined) => {
    if (v == null) return '—'
    return `${Number(v).toFixed(1)}%`
  }

  return (
    <>
      <SectionHeader title="KEY LEVELS" />
      <StatRow label="Resistance" value={fmt(kl.indicators.nearestResistance)} valueColor="var(--color-terminal-down)" />
      <StatRow label="Support" value={fmt(kl.indicators.nearestSupport)} valueColor="var(--color-terminal-up)" />
      <StatRow label="Nearest" value={fmt(kl.indicators.nearestLevel)} />
      <StatRow label="Distance" value={pctFmt(kl.indicators.distancePct)} valueColor="var(--color-terminal-blue)" />
    </>
  )
}

/* ── History list ── */
function HistoryList({ history, limit = 5 }: { history: VerdictRecord[]; limit?: number }) {
  if (history.length === 0) return null
  return (
    <>
      <SectionHeader title={`HISTORY (${history.length})`} />
      {history.slice(0, limit).map((record, idx) => (
        <div
          key={record.id ?? idx}
          style={{
            ...dataRowStyle,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '9px',
          }}
        >
          <span style={{ color: getDirectionColor(record.direction) }}>
            {getHistoryLabel(record.direction)}
          </span>
          <span style={{ color: 'var(--color-terminal-blue)' }}>
            {(record.confidence * 100).toFixed(0)}%
          </span>
          <span style={{ color: 'var(--color-terminal-muted)' }}>
            {formatTimestamp(record.createdAt)}
          </span>
        </div>
      ))}
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════════════ */
/*  INTEL GRID — Main Component                                          */
/* ═══════════════════════════════════════════════════════════════════════ */

export function IntelGrid() {
  const [symbol, setSymbol] = useState<(typeof SYMBOLS)[number]>('BTC')
  const [mode, setMode] = useState<ViewMode>('LIST')
  const pair = `${symbol}USDT`

  const { result, loading, error, history, isStale, analyze } = useIntelligence(pair)
  const { data: marketData } = useMarketGlobal()
  const { signals } = useSignals()

  const [isAnalyzing, setIsAnalyzing] = useState(false)

  const handleAnalyze = async () => {
    setIsAnalyzing(true)
    try {
      await analyze()
    } finally {
      setIsAnalyzing(false)
    }
  }

  // Signals stats: filter by base symbol
  const signalStats = useMemo(() => {
    const filtered = signals.filter((s) => {
      const sym = s.symbol.replace(/[^A-Z]/gi, '').toUpperCase()
      return sym.startsWith(symbol)
    })
    const total = filtered.length
    const longCount = filtered.filter((s) => s.direction === 'long').length
    const shortCount = filtered.filter((s) => s.direction === 'short').length
    const pctLong = total > 0 ? Math.round((longCount / total) * 100) : 0
    const pctShort = total > 0 ? Math.round((shortCount / total) * 100) : 0

    // Simple win rate: tp_hit / (tp_hit + sl_hit)
    const closed = filtered.filter((s) => s.status === 'tp_hit' || s.status === 'sl_hit')
    const wins = closed.filter((s) => s.status === 'tp_hit').length
    const winRate = closed.length > 0 ? Math.round((wins / closed.length) * 100) : 0

    return { total, longCount, shortCount, pctLong, pctShort, winRate }
  }, [signals, symbol])

  // Timeframe breakdown from result
  const timeframeBreakdown = useMemo(() => {
    if (!result?.analysts) return []
    const mtf = result.analysts.find((a) => a.meta.id === 'mtf-alignment')
    if (!mtf?.indicators) return []
    const tfs = [
      { label: '1H', key: 'h1' },
      { label: '4H', key: 'h4' },
      { label: '1D', key: 'd1' },
    ]
    return tfs.map((tf) => {
      const bias = mtf.indicators?.[tf.key]
      const dir = bias === 'bullish' ? 'long' : bias === 'bearish' ? 'short' : 'neutral'
      const confKey = `${tf.key}Confidence`
      const confValue = mtf.indicators?.[confKey]
      const conf = confValue != null ? Number(confValue) : null
      return { label: tf.label, direction: dir, confidence: conf }
    })
  }, [result])

  const lastUpdated = result?.createdAt ? formatTimestamp(result.createdAt) : null

  // Tab button style — same pattern as FeedGrid
  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    background: 'transparent',
    border: 'none',
    borderBottom: active
      ? '2px solid var(--color-terminal-amber)'
      : '2px solid transparent',
    color: active ? 'var(--color-terminal-text)' : 'var(--color-terminal-muted)',
    fontSize: '10px',
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.08em',
    padding: '0 10px',
    height: '28px',
    cursor: 'pointer',
  })

  /* ── Loading state ── */
  if (loading && !result) {
    return (
      <div
        style={{
          display: 'flex',
          height: 'calc(100vh - 40px - 32px)',
          width: '100vw',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--color-terminal-bg)',
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          color: 'var(--color-terminal-dim)',
        }}
      >
        COMPUTING...
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 40px - 32px)',
        width: '100vw',
        overflow: 'hidden',
        background: 'var(--color-terminal-bg)',
        fontFamily: 'var(--font-mono)',
      }}
    >
      {/* ── HEADER ROW ── */}
      <div
        style={{
          height: '28px',
          minHeight: '28px',
          display: 'flex',
          alignItems: 'center',
          padding: '0 10px',
          background: 'var(--color-terminal-panel)',
          borderBottom: '1px solid var(--color-terminal-border)',
          fontSize: '10px',
          gap: '10px',
          flexShrink: 0,
        }}
      >
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '9px', letterSpacing: '0.12em', fontWeight: 'bold' }}>
          INTELLIGENCE
        </span>

        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-terminal-text)', fontFamily: 'var(--font-mono)' }}>
          {symbol}/USDT
        </span>

        {result && (
          <span style={{ fontSize: '9px', fontWeight: 'bold', color: getDirectionColor(result.direction), padding: '1px 5px', border: `1px solid ${getDirectionColor(result.direction)}`, background: 'transparent' }}>
            {getVerdictLabel(result.direction)}
          </span>
        )}

        <span style={{ flex: 1 }} />

        {/* LIST / GRID toggle */}
        <div style={{ display: 'flex' }}>
          <button style={tabBtnStyle(mode === 'LIST')} onClick={() => setMode('LIST')}>LIST</button>
          <button style={tabBtnStyle(mode === 'GRID')} onClick={() => setMode('GRID')}>GRID</button>
        </div>

        {/* ANALYZE button — only shown in header when GRID mode */}
        {mode === 'GRID' && (
          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing}
            style={{
              background: 'var(--color-terminal-blue)',
              color: 'var(--color-terminal-text)',
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              padding: '2px 10px',
              border: 'none',
              cursor: isAnalyzing ? 'not-allowed' : 'pointer',
              opacity: isAnalyzing ? 0.7 : 1,
              transition: 'opacity 0.2s',
              height: '20px',
            }}
          >
            {isAnalyzing ? 'ANALYZING...' : 'ANALYZE'}
          </button>
        )}

        {/* Symbol selector */}
        <div style={{ display: 'flex', gap: '2px' }}>
          {SYMBOLS.map((s) => (
            <button
              key={s}
              onClick={() => setSymbol(s)}
              style={{
                padding: '2px 6px',
                fontSize: '9px',
                fontFamily: 'var(--font-mono)',
                border: '1px solid var(--color-terminal-border)',
                background: s === symbol ? 'var(--color-terminal-blue)' : 'transparent',
                color: s === symbol ? 'var(--color-terminal-text)' : 'var(--color-terminal-muted)',
                cursor: 'pointer',
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {isStale && (
          <span
            style={{
              color: 'var(--color-terminal-amber)',
              fontSize: '9px',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.08em',
              border: '1px solid var(--color-terminal-amber)',
              padding: '1px 4px',
            }}
          >
            STALE
          </span>
        )}

        {/* Last updated */}
        <span style={{ color: 'var(--color-terminal-muted)', fontSize: '9px' }}>
          {lastUpdated ? `Updated: ${lastUpdated}` : 'No data'}
        </span>
      </div>

      {/* ── ERROR ROW ── */}
      {error && (
        <div
          style={{
            padding: '4px 10px',
            background: 'var(--color-terminal-panel)',
            borderBottom: '1px solid var(--color-terminal-border)',
            fontSize: '9px',
            color: 'var(--color-terminal-down)',
            fontFamily: 'var(--font-mono)',
            flexShrink: 0,
          }}
        >
          ERROR: {error}
        </div>
      )}

      {/* ══════════════════════════════════════════ */}
      {/* LIST MODE — 3-column layout               */}
      {/* ══════════════════════════════════════════ */}
      {mode === 'LIST' && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* ═══ LEFT COLUMN ═══ */}
          <div
            style={{
              width: '220px',
              minWidth: '220px',
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--color-terminal-surface)',
              borderRight: '1px solid var(--color-terminal-border)',
              overflowY: 'auto',
            }}
          >
            {result ? (
              <>
                {/* VERDICT */}
                <SectionHeader title="VERDICT" />
                <div style={{ padding: '10px', borderBottom: '1px solid var(--color-terminal-border)' }}>
                  <div style={{ marginBottom: '5px' }}>
                    <span
                      style={{
                        color: getDirectionColor(result.direction),
                        fontSize: '14px',
                        fontWeight: 'bold',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {getVerdictLabel(result.direction)}
                    </span>
                  </div>
                  <ConfidenceBar confidence={result.confidence} color={getDirectionColor(result.direction)} />
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginTop: '5px',
                      fontSize: '10px',
                      color: 'var(--color-terminal-muted)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    <span>Confidence: {(result.confidence * 100).toFixed(0)}%</span>
                    <span>Score: {result.score.toFixed(2)}</span>
                  </div>
                </div>
                <StatRow label="Confluence" value={`${(result.confluence * 100).toFixed(0)}%`} valueColor="var(--color-terminal-blue)" />

                {/* TIMEFRAMES */}
                {timeframeBreakdown.length > 0 && (
                  <>
                    <SectionHeader title="TIMEFRAMES" />
                    {timeframeBreakdown.map((tf) => {
                      const dir = tf.direction === 'long' ? 'BUY' : tf.direction === 'short' ? 'SELL' : 'NEU'
                      const color = getDirectionColor(tf.direction)
                      return (
                        <div key={tf.label} style={{ ...dataRowStyle, display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--color-terminal-muted)' }}>{tf.label}</span>
                          <span style={{ color }}>
                            {dir} {tf.confidence != null ? `${(tf.confidence * 100).toFixed(0)}%` : ''}
                          </span>
                        </div>
                      )
                    })}
                  </>
                )}

                {/* HISTORY (left column) */}
                <HistoryList history={history} limit={5} />
              </>
            ) : (
              <div
                style={{
                  padding: '20px 10px',
                  textAlign: 'center',
                  fontSize: '10px',
                  color: 'var(--color-terminal-dim)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                NO VERDICTS
              </div>
            )}

            {/* ANALYZE button at bottom of left column */}
            <div style={{ marginTop: 'auto', padding: '10px', borderTop: '1px solid var(--color-terminal-border)' }}>
              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                style={{
                  width: '100%',
                  background: 'var(--color-terminal-blue)',
                  color: 'var(--color-terminal-text)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  padding: '4px 10px',
                  border: 'none',
                  cursor: isAnalyzing ? 'not-allowed' : 'pointer',
                  opacity: isAnalyzing ? 0.7 : 1,
                  transition: 'opacity 0.2s',
                }}
              >
                {isAnalyzing ? 'ANALYZING...' : 'ANALYZE'}
              </button>
            </div>
          </div>

          {/* ═══ CENTER COLUMN ═══ */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--color-terminal-surface)',
              borderRight: '1px solid var(--color-terminal-border)',
              overflowY: 'auto',
            }}
          >
            {result?.analysts && result.analysts.length > 0 ? (
              <>
                {/* ANALYSTS */}
                <SectionHeader title={`ANALYSTS (${result.analysts.length})`} />
                {result.analysts.map((analyst: AnalystVerdict, idx: number) => (
                  <AnalystCard key={analyst.meta.id ?? idx} analyst={analyst} />
                ))}

                {/* MTF ALIGNMENT */}
                <MTFAlignmentSection analysts={result.analysts} />

                {/* VOLUME PROFILE */}
                <VolumeProfileSection analysts={result.analysts} />
              </>
            ) : (
              <div
                style={{
                  padding: '20px 10px',
                  textAlign: 'center',
                  fontSize: '10px',
                  color: 'var(--color-terminal-dim)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                NO ANALYSTS DATA
              </div>
            )}
          </div>

          {/* ═══ RIGHT COLUMN ═══ */}
          <div
            style={{
              width: '220px',
              minWidth: '220px',
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--color-terminal-surface)',
              overflowY: 'auto',
            }}
          >
            {/* MARKET CONTEXT */}
            <SectionHeader title="MARKET CONTEXT" />
            {marketData ? (
              <>
                <StatRow
                  label="Fear & Greed"
                  value={`${marketData.fearGreedValue} ${marketData.fearGreedLabel.toUpperCase()}`}
                  valueColor={
                    marketData.fearGreedValue <= 25
                      ? 'var(--color-terminal-down)'
                      : marketData.fearGreedValue >= 75
                      ? 'var(--color-terminal-up)'
                      : 'var(--color-terminal-amber)'
                  }
                />
                <StatRow label="BTC Dom" value={`${marketData.btcDominance.toFixed(1)}%`} valueColor="var(--color-terminal-blue)" />
                <StatRow label="Total MCap" value={formatMcap(marketData.totalMarketCap)} />
                <StatRow label="24h Volume" value={formatMcap(marketData.totalVolume24h)} />
              </>
            ) : (
              <div style={{ ...dataRowStyle, color: 'var(--color-terminal-dim)', fontSize: '9px' }}>Loading market data...</div>
            )}

            {/* KEY LEVELS */}
            {result?.analysts && <KeyLevelsSection analysts={result.analysts} />}

            {/* SIGNALS STATS */}
            <SectionHeader title="SIGNALS STATS" />
            <StatRow label="Signals" value={`${signalStats.total}`} />
            <StatRow
              label="Long"
              value={`${signalStats.pctLong}%`}
              valueColor="var(--color-terminal-up)"
            />
            <StatRow
              label="Short"
              value={`${signalStats.pctShort}%`}
              valueColor="var(--color-terminal-down)"
            />
            <StatRow
              label="Win Rate"
              value={`${signalStats.winRate}%`}
              valueColor="var(--color-terminal-blue)"
            />

            {/* HISTORY (right column) */}
            <HistoryList history={history} limit={4} />
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════ */}
      {/* GRID MODE — card grid layout              */}
      {/* ══════════════════════════════════════════ */}
      {mode === 'GRID' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
          {!result && !loading && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'var(--color-terminal-dim)',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
              }}
            >
              NO INTELLIGENCE DATA — CLICK ANALYZE
            </div>
          )}

          {result && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '12px',
              }}
            >
              {/* ── VERDICT CARD ── */}
              <div
                style={{
                  background: 'var(--color-terminal-panel)',
                  border: '1px solid var(--color-terminal-border)',
                  borderLeft: `2px solid ${getDirectionColor(result.direction)}`,
                  padding: '12px',
                  fontFamily: 'var(--font-mono)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--color-terminal-dim)', fontSize: '9px', letterSpacing: '0.12em' }}>VERDICT</span>
                  <span style={{ color: getDirectionColor(result.direction), fontSize: '9px', fontWeight: 'bold' }}>
                    {getVerdictLabel(result.direction)}
                  </span>
                </div>
                <ConfidenceBar confidence={result.confidence} color={getDirectionColor(result.direction)} />
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-terminal-muted)', fontSize: '9px' }}>Confidence</span>
                  <span style={{ color: 'var(--color-terminal-text)', fontSize: '9px' }}>{(result.confidence * 100).toFixed(0)}%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-terminal-muted)', fontSize: '9px' }}>Confluence</span>
                  <span style={{ color: 'var(--color-terminal-blue)', fontSize: '9px' }}>{(result.confluence * 100).toFixed(0)}%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-terminal-muted)', fontSize: '9px' }}>Score</span>
                  <span style={{ color: 'var(--color-terminal-text)', fontSize: '9px' }}>{result.score.toFixed(2)}</span>
                </div>
              </div>

              {/* ── MARKET CONTEXT CARD ── */}
              <div
                style={{
                  background: 'var(--color-terminal-panel)',
                  border: '1px solid var(--color-terminal-border)',
                  padding: '12px',
                  fontFamily: 'var(--font-mono)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--color-terminal-dim)', fontSize: '9px', letterSpacing: '0.12em' }}>MARKET CONTEXT</span>
                </div>
                {marketData ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--color-terminal-muted)', fontSize: '9px' }}>Fear &amp; Greed</span>
                      <span
                        style={{
                          fontSize: '9px',
                          color:
                            marketData.fearGreedValue <= 25
                              ? 'var(--color-terminal-down)'
                              : marketData.fearGreedValue >= 75
                              ? 'var(--color-terminal-up)'
                              : 'var(--color-terminal-amber)',
                        }}
                      >
                        {marketData.fearGreedValue} {marketData.fearGreedLabel.toUpperCase()}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--color-terminal-muted)', fontSize: '9px' }}>BTC Dom</span>
                      <span style={{ color: 'var(--color-terminal-blue)', fontSize: '9px' }}>{marketData.btcDominance.toFixed(1)}%</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--color-terminal-muted)', fontSize: '9px' }}>Total MCap</span>
                      <span style={{ color: 'var(--color-terminal-text)', fontSize: '9px' }}>{formatMcap(marketData.totalMarketCap)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--color-terminal-muted)', fontSize: '9px' }}>24h Volume</span>
                      <span style={{ color: 'var(--color-terminal-text)', fontSize: '9px' }}>{formatMcap(marketData.totalVolume24h)}</span>
                    </div>
                  </>
                ) : (
                  <span style={{ color: 'var(--color-terminal-dim)', fontSize: '9px' }}>Loading...</span>
                )}
              </div>

              {/* ── SIGNAL STATS CARD ── */}
              <div
                style={{
                  background: 'var(--color-terminal-panel)',
                  border: '1px solid var(--color-terminal-border)',
                  padding: '12px',
                  fontFamily: 'var(--font-mono)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--color-terminal-dim)', fontSize: '9px', letterSpacing: '0.12em' }}>SIGNAL STATS</span>
                  <span style={{ color: 'var(--color-terminal-muted)', fontSize: '9px' }}>{signalStats.total} total</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-terminal-muted)', fontSize: '9px' }}>Long</span>
                  <span style={{ color: 'var(--color-terminal-up)', fontSize: '9px' }}>{signalStats.pctLong}%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-terminal-muted)', fontSize: '9px' }}>Short</span>
                  <span style={{ color: 'var(--color-terminal-down)', fontSize: '9px' }}>{signalStats.pctShort}%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-terminal-muted)', fontSize: '9px' }}>Win Rate</span>
                  <span style={{ color: 'var(--color-terminal-blue)', fontSize: '9px' }}>{signalStats.winRate}%</span>
                </div>
              </div>

              {/* ── KEY LEVELS CARD ── */}
              {result.analysts && (() => {
                const kl = result.analysts.find((a) => a.meta.id === 'key-levels')
                if (!kl?.indicators) return null
                const fmt = (v: string | number | undefined) => {
                  if (v == null) return '—'
                  const n = Number(v)
                  return isNaN(n) ? String(v) : `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                }
                return (
                  <div
                    style={{
                      background: 'var(--color-terminal-panel)',
                      border: '1px solid var(--color-terminal-border)',
                      padding: '12px',
                      fontFamily: 'var(--font-mono)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    <span style={{ color: 'var(--color-terminal-dim)', fontSize: '9px', letterSpacing: '0.12em' }}>KEY LEVELS</span>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--color-terminal-muted)', fontSize: '9px' }}>Resistance</span>
                      <span style={{ color: 'var(--color-terminal-down)', fontSize: '9px' }}>{fmt(kl.indicators.nearestResistance)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--color-terminal-muted)', fontSize: '9px' }}>Support</span>
                      <span style={{ color: 'var(--color-terminal-up)', fontSize: '9px' }}>{fmt(kl.indicators.nearestSupport)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--color-terminal-muted)', fontSize: '9px' }}>Nearest</span>
                      <span style={{ color: 'var(--color-terminal-text)', fontSize: '9px' }}>{fmt(kl.indicators.nearestLevel)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--color-terminal-muted)', fontSize: '9px' }}>Distance</span>
                      <span style={{ color: 'var(--color-terminal-blue)', fontSize: '9px' }}>
                        {kl.indicators.distancePct != null ? `${Number(kl.indicators.distancePct).toFixed(1)}%` : '—'}
                      </span>
                    </div>
                  </div>
                )
              })()}

              {/* ── MTF ALIGNMENT CARD ── */}
              {result.analysts && (() => {
                const mtf = result.analysts.find((a) => a.meta.id === 'mtf-alignment')
                if (!mtf?.indicators) return null
                const tfs = [
                  { label: 'H1', key: 'h1' },
                  { label: 'H4', key: 'h4' },
                  { label: 'D1', key: 'd1' },
                ]
                return (
                  <div
                    style={{
                      background: 'var(--color-terminal-panel)',
                      border: '1px solid var(--color-terminal-border)',
                      padding: '12px',
                      fontFamily: 'var(--font-mono)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--color-terminal-dim)', fontSize: '9px', letterSpacing: '0.12em' }}>MTF ALIGNMENT</span>
                      {mtf.indicators.alignment != null && (
                        <span style={{ color: 'var(--color-terminal-blue)', fontSize: '9px' }}>
                          {(Number(mtf.indicators.alignment) * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                    {tfs.map((tf) => {
                      const bias = mtf.indicators?.[tf.key]
                      const isBullish = bias === 'bullish'
                      const isBearish = bias === 'bearish'
                      const color = isBullish
                        ? 'var(--color-terminal-up)'
                        : isBearish
                        ? 'var(--color-terminal-down)'
                        : 'var(--color-terminal-amber)'
                      return (
                        <div key={tf.key} style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--color-terminal-muted)', fontSize: '9px' }}>{tf.label}</span>
                          <span style={{ color, fontSize: '9px', fontWeight: 'bold' }}>
                            {isBullish ? '▲ BULLISH' : isBearish ? '▼ BEARISH' : String(bias ?? 'N/A').toUpperCase()}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}

              {/* ── ANALYST CARDS ── */}
              {result.analysts.map((analyst: AnalystVerdict, idx: number) => (
                <AnalystGridCard key={analyst.meta.id ?? idx} analyst={analyst} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
