'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useIntelligence } from '@/hooks/useIntelligence'
import { useMarketGlobal } from '@/hooks/useMarketGlobal'
import { useSignals } from '@/hooks/useSignals'
import type { AnalystVerdict, VerdictRecord } from '@/lib/intelligence/types'

interface AnalysisStripProps {
  symbol: string // e.g. 'BTCUSDT'
  refreshKey?: number
}

/* ── Helpers ── */

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

function formatMcap(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  return `$${n.toFixed(0)}`
}

function getFearGreedColor(value: number): string {
  if (value <= 25) return 'var(--color-terminal-down)'
  if (value >= 75) return 'var(--color-terminal-up)'
  return 'var(--color-terminal-amber)'
}

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return ts
  }
}

function timeAgo(ts: string): string {
  try {
    const diff = Date.now() - new Date(ts).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return `${days}d ago`
  } catch {
    return ''
  }
}

/* ── Indicator Badge ── */

function IndicatorBadge({ k, v }: { k: string; v: number | string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '1px 4px',
        marginRight: '2px',
        marginTop: '1px',
        fontSize: '10px',
        background: 'var(--color-terminal-surface)',
        border: '1px solid var(--color-terminal-border)',
        color: 'var(--color-terminal-muted)',
        fontFamily: 'var(--font-mono)',
        lineHeight: '1.3',
        whiteSpace: 'nowrap',
      }}
    >
      {k}: {typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : String(v)}
    </span>
  )
}

/* ── Shared card shell style ── */

const cardBaseStyle: React.CSSProperties = {
  minWidth: '180px',
  flex: '1 1 200px',
  maxWidth: '280px',
  height: '180px',
  background: 'var(--color-terminal-panel)',
  border: '1px solid var(--color-terminal-border)',
  padding: '8px 10px',
  fontFamily: 'var(--font-mono)',
  display: 'flex',
  flexDirection: 'column',
  gap: '3px',
  flexShrink: 0,
  overflow: 'hidden',
}

/* ── Analyst Card (grid view) ── */

function AnalystCard({ analyst, expanded, onToggle }: { analyst: AnalystVerdict; expanded: boolean; onToggle: () => void }) {
  const chip = getDirectionChip(analyst.direction)
  const dirColor = getDirectionColor(analyst.direction)
  const meta = analyst.meta as AnalystVerdict['meta'] & { type?: string }

  return (
    <div
      style={{
        ...cardBaseStyle,
        borderLeft: `2px solid ${dirColor}`,
        height: expanded ? 'auto' : '180px',
        cursor: 'pointer',
      }}
      onClick={onToggle}
    >
      {/* Row 1: name + direction chip */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '12px', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' }}>
          {analyst.meta.name.toUpperCase()}
        </span>
        <span style={{ color: chip.color, fontSize: '11px', fontWeight: 'bold', fontFamily: 'var(--font-mono)' }}>
          {chip.label}
        </span>
      </div>

      {/* Description */}
      <div style={{ color: 'var(--color-terminal-muted)', fontSize: '11px', fontFamily: 'var(--font-mono)', lineHeight: '1.2', ...(expanded ? {} : { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }) }}>
        {analyst.meta.description}
      </div>

      {/* Confidence row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'var(--color-terminal-muted)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>Confidence</span>
        <span style={{ color: 'var(--color-terminal-blue)', fontSize: '12px', fontWeight: 'bold', fontFamily: 'var(--font-mono)' }}>
          {(analyst.confidence * 100).toFixed(0)}%
        </span>
      </div>

      {/* 2px confidence bar */}
      <div style={{ height: '2px', backgroundColor: 'var(--color-terminal-border)', width: '100%', flexShrink: 0 }}>
        <div style={{ height: '2px', backgroundColor: dirColor, width: `${analyst.confidence * 100}%`, transition: 'width 0.3s ease' }} />
      </div>

      {/* Weight + type */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
          Weight: {analyst.meta.weight}
        </span>
        {meta.type === 'llm' && (
          <span style={{ color: 'var(--color-terminal-blue)', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>LLM</span>
        )}
      </div>

      {/* Reason text */}
      {analyst.reason && (
        <div
          style={{
            color: 'var(--color-terminal-dim)',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            lineHeight: '1.3',
            ...(expanded
              ? { whiteSpace: 'pre-wrap', wordBreak: 'break-word' }
              : { overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', flex: '1 1 auto', minHeight: 0 }),
          }}
        >
          {analyst.reason}
        </div>
      )}

      {/* Indicator badges */}
      {analyst.indicators && Object.keys(analyst.indicators).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1px', flexShrink: 0, ...(expanded ? {} : { overflow: 'hidden', maxHeight: '20px' }) }}>
          {(expanded
            ? Object.entries(analyst.indicators)
            : Object.entries(analyst.indicators).slice(0, 6)
          ).map(([k, v]) => (
            <IndicatorBadge key={k} k={k} v={v} />
          ))}
        </div>
      )}

      {/* Expand indicator */}
      <div style={{ textAlign: 'center', color: 'var(--color-terminal-dim)', fontSize: '10px', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
        {expanded ? '▲ collapse' : '▼ expand'}
      </div>
    </div>
  )
}

/* ── Analyst List Row (list view) with expand/collapse ── */

function AnalystRow({ analyst, expanded, onToggle }: { analyst: AnalystVerdict; expanded: boolean; onToggle: () => void }) {
  const chip = getDirectionChip(analyst.direction)
  const dirColor = getDirectionColor(analyst.direction)
  const meta = analyst.meta as AnalystVerdict['meta'] & { type?: string }

  return (
    <div
      style={{
        borderBottom: '1px solid var(--color-terminal-border)',
        borderLeft: `2px solid ${dirColor}`,
        background: 'var(--color-terminal-panel)',
        fontFamily: 'var(--font-mono)',
      }}
    >
      {/* Collapsed row */}
      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '5px 10px',
          minHeight: '34px',
          cursor: 'pointer',
        }}
      >
        {/* Expand icon */}
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '11px', width: '10px', flexShrink: 0 }}>
          {expanded ? '▼' : '▶'}
        </span>

        {/* Name */}
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '12px', letterSpacing: '0.08em', width: '140px', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {analyst.meta.name.toUpperCase()}
        </span>

        {/* Direction */}
        <span style={{ color: chip.color, fontSize: '12px', fontWeight: 'bold', width: '80px', flexShrink: 0 }}>
          {chip.label}
        </span>

        {/* Confidence bar + value */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100px', flexShrink: 0 }}>
          <div style={{ flex: 1, height: '2px', background: 'var(--color-terminal-border)' }}>
            <div style={{ height: '2px', background: dirColor, width: `${analyst.confidence * 100}%` }} />
          </div>
          <span style={{ color: 'var(--color-terminal-blue)', fontSize: '12px', fontWeight: 'bold', width: '32px', textAlign: 'right' }}>
            {(analyst.confidence * 100).toFixed(0)}%
          </span>
        </div>

        {/* Reason (truncated) */}
        <span style={{ flex: 1, color: 'var(--color-terminal-dim)', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
          {analyst.reason}
        </span>

        {/* Weight badge */}
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
          w:{analyst.meta.weight}
        </span>

        {/* LLM badge */}
        {meta.type === 'llm' && (
          <span style={{ color: 'var(--color-terminal-blue)', fontSize: '10px', fontFamily: 'var(--font-mono)', padding: '0 3px', border: '1px solid var(--color-terminal-border)', flexShrink: 0 }}>
            LLM
          </span>
        )}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{ padding: '4px 10px 8px 28px', borderTop: '1px solid var(--color-terminal-border)', background: 'var(--color-terminal-surface)' }}>
          {/* Description */}
          <div style={{ color: 'var(--color-terminal-muted)', fontSize: '11px', fontFamily: 'var(--font-mono)', lineHeight: '1.4', marginBottom: '4px' }}>
            {analyst.meta.description}
          </div>

          {/* Full reason */}
          <div style={{ color: 'var(--color-terminal-text)', fontSize: '11px', fontFamily: 'var(--font-mono)', lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: '6px' }}>
            {analyst.reason}
          </div>

          {/* All indicators */}
          {analyst.indicators && Object.keys(analyst.indicators).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
              {Object.entries(analyst.indicators).map(([k, v]) => (
                <IndicatorBadge key={k} k={k} v={v} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Market Context Row (list view) ── */

function MarketContextRow() {
  const { data: marketData, loading } = useMarketGlobal()

  if (loading || !marketData) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', padding: '5px 10px', borderBottom: '1px solid var(--color-terminal-border)', borderLeft: '2px solid var(--color-terminal-blue)', background: 'var(--color-terminal-panel)', fontFamily: 'var(--font-mono)', minHeight: '34px' }}>
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '11px' }}>MARKET CONTEXT — Loading...</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '5px 10px', borderBottom: '1px solid var(--color-terminal-border)', borderLeft: '2px solid var(--color-terminal-blue)', background: 'var(--color-terminal-panel)', fontFamily: 'var(--font-mono)', minHeight: '34px' }}>
      <span style={{ color: 'var(--color-terminal-dim)', fontSize: '12px', letterSpacing: '0.08em', width: '140px', flexShrink: 0 }}>MARKET CONTEXT</span>
      <span style={{ fontSize: '11px', color: 'var(--color-terminal-muted)' }}>F&G</span>
      <span style={{ fontSize: '12px', fontWeight: 'bold', color: getFearGreedColor(marketData.fearGreedValue) }}>{marketData.fearGreedValue} {marketData.fearGreedLabel.toUpperCase()}</span>
      <span style={{ fontSize: '11px', color: 'var(--color-terminal-muted)' }}>BTC Dom</span>
      <span style={{ fontSize: '12px', color: 'var(--color-terminal-blue)' }}>{marketData.btcDominance.toFixed(1)}%</span>
      <span style={{ fontSize: '11px', color: 'var(--color-terminal-muted)' }}>MCap</span>
      <span style={{ fontSize: '12px', color: 'var(--color-terminal-text)' }}>{formatMcap(marketData.totalMarketCap)}</span>
      <span style={{ fontSize: '11px', color: 'var(--color-terminal-muted)' }}>24h Vol</span>
      <span style={{ fontSize: '12px', color: 'var(--color-terminal-text)' }}>{formatMcap(marketData.totalVolume24h)}</span>
    </div>
  )
}

/* ── Signal Stats Row (list view) ── */

function SignalStatsRow({ symbol }: { symbol: string }) {
  const { signals, loading } = useSignals()

  const stats = useMemo(() => {
    const baseSymbol = symbol.replace(/USDT$/i, '').toUpperCase()
    const filtered = signals.filter((s) => {
      const sym = s.symbol.replace(/[^A-Z]/gi, '').toUpperCase()
      return sym.startsWith(baseSymbol)
    })
    const total = filtered.length
    const longCount = filtered.filter((s) => s.direction === 'long').length
    const shortCount = filtered.filter((s) => s.direction === 'short').length
    const pctLong = total > 0 ? Math.round((longCount / total) * 100) : 0
    const pctShort = total > 0 ? Math.round((shortCount / total) * 100) : 0
    const closed = filtered.filter((s) => s.status === 'tp_hit' || s.status === 'sl_hit')
    const wins = closed.filter((s) => s.status === 'tp_hit').length
    const winRate = closed.length > 0 ? Math.round((wins / closed.length) * 100) : 0
    return { total, longCount, shortCount, pctLong, pctShort, winRate }
  }, [signals, symbol])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', padding: '5px 10px', borderBottom: '1px solid var(--color-terminal-border)', borderLeft: '2px solid var(--color-terminal-amber)', background: 'var(--color-terminal-panel)', fontFamily: 'var(--font-mono)', minHeight: '34px' }}>
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '11px' }}>SIGNAL STATS — Loading...</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '5px 10px', borderBottom: '1px solid var(--color-terminal-border)', borderLeft: '2px solid var(--color-terminal-amber)', background: 'var(--color-terminal-panel)', fontFamily: 'var(--font-mono)', minHeight: '34px' }}>
      <span style={{ color: 'var(--color-terminal-dim)', fontSize: '12px', letterSpacing: '0.08em', width: '140px', flexShrink: 0 }}>SIGNAL STATS</span>
      <span style={{ fontSize: '11px', color: 'var(--color-terminal-muted)' }}>{stats.total} signals</span>
      <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--color-terminal-up)' }}>↑{stats.pctLong}% ({stats.longCount})</span>
      <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--color-terminal-down)' }}>↓{stats.pctShort}% ({stats.shortCount})</span>
      <span style={{ fontSize: '11px', color: 'var(--color-terminal-muted)' }}>Win Rate</span>
      <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--color-terminal-blue)' }}>{stats.winRate}%</span>
    </div>
  )
}

/* ── Market Context Card ── */

function MarketContextCard() {
  const { data: marketData, loading } = useMarketGlobal()

  return (
    <div
      style={{
        ...cardBaseStyle,
        borderLeft: '2px solid var(--color-terminal-blue)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '12px', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' }}>
          MARKET CONTEXT
        </span>
      </div>

      {loading || !marketData ? (
        <div style={{ color: 'var(--color-terminal-dim)', fontSize: '11px', fontFamily: 'var(--font-mono)', flex: 1, display: 'flex', alignItems: 'center' }}>
          Loading...
        </div>
      ) : (
        <>
          {/* Fear & Greed */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
            <span style={{ color: 'var(--color-terminal-muted)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>Fear & Greed</span>
            <span style={{ color: getFearGreedColor(marketData.fearGreedValue), fontSize: '13px', fontWeight: 'bold', fontFamily: 'var(--font-mono)' }}>
              {marketData.fearGreedValue} {marketData.fearGreedLabel.toUpperCase()}
            </span>
          </div>

          {/* Fear/Greed bar */}
          <div style={{ height: '2px', backgroundColor: 'var(--color-terminal-border)', width: '100%', flexShrink: 0 }}>
            <div style={{ height: '2px', backgroundColor: getFearGreedColor(marketData.fearGreedValue), width: `${marketData.fearGreedValue}%`, transition: 'width 0.3s ease' }} />
          </div>

          {/* BTC Dominance */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--color-terminal-muted)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>BTC Dom</span>
            <span style={{ color: 'var(--color-terminal-blue)', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
              {marketData.btcDominance.toFixed(1)}%
            </span>
          </div>

          {/* Total MCap */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--color-terminal-muted)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>Total MCap</span>
            <span style={{ color: 'var(--color-terminal-text)', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
              {formatMcap(marketData.totalMarketCap)}
            </span>
          </div>

          {/* 24h Volume */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--color-terminal-muted)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>24h Volume</span>
            <span style={{ color: 'var(--color-terminal-text)', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
              {formatMcap(marketData.totalVolume24h)}
            </span>
          </div>
        </>
      )}
    </div>
  )
}

/* ── Signal Stats Card ── */

function SignalStatsCard({ symbol }: { symbol: string }) {
  const { signals, loading } = useSignals()

  const stats = useMemo(() => {
    const baseSymbol = symbol.replace(/USDT$/i, '').toUpperCase()
    const filtered = signals.filter((s) => {
      const sym = s.symbol.replace(/[^A-Z]/gi, '').toUpperCase()
      return sym.startsWith(baseSymbol)
    })
    const total = filtered.length
    const longCount = filtered.filter((s) => s.direction === 'long').length
    const shortCount = filtered.filter((s) => s.direction === 'short').length
    const pctLong = total > 0 ? Math.round((longCount / total) * 100) : 0
    const pctShort = total > 0 ? Math.round((shortCount / total) * 100) : 0

    const closed = filtered.filter((s) => s.status === 'tp_hit' || s.status === 'sl_hit')
    const wins = closed.filter((s) => s.status === 'tp_hit').length
    const winRate = closed.length > 0 ? Math.round((wins / closed.length) * 100) : 0

    return { total, longCount, shortCount, pctLong, pctShort, winRate }
  }, [signals, symbol])

  return (
    <div
      style={{
        ...cardBaseStyle,
        borderLeft: '2px solid var(--color-terminal-amber)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '12px', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' }}>
          SIGNAL STATS
        </span>
        <span style={{ color: 'var(--color-terminal-muted)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
          {stats.total} total
        </span>
      </div>

      {loading ? (
        <div style={{ color: 'var(--color-terminal-dim)', fontSize: '11px', fontFamily: 'var(--font-mono)', flex: 1, display: 'flex', alignItems: 'center' }}>
          Loading...
        </div>
      ) : (
        <>
          {/* Long / Short bar */}
          <div style={{ display: 'flex', height: '4px', backgroundColor: 'var(--color-terminal-border)', width: '100%', marginTop: '4px', flexShrink: 0 }}>
            {stats.total > 0 && (
              <>
                <div style={{ height: '4px', backgroundColor: 'var(--color-terminal-up)', width: `${stats.pctLong}%` }} />
                <div style={{ height: '4px', backgroundColor: 'var(--color-terminal-down)', width: `${stats.pctShort}%` }} />
              </>
            )}
          </div>

          {/* Long % */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
            <span style={{ color: 'var(--color-terminal-muted)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>Long</span>
            <span style={{ color: 'var(--color-terminal-up)', fontSize: '12px', fontWeight: 'bold', fontFamily: 'var(--font-mono)' }}>
              {stats.pctLong}% ({stats.longCount})
            </span>
          </div>

          {/* Short % */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--color-terminal-muted)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>Short</span>
            <span style={{ color: 'var(--color-terminal-down)', fontSize: '12px', fontWeight: 'bold', fontFamily: 'var(--font-mono)' }}>
              {stats.pctShort}% ({stats.shortCount})
            </span>
          </div>

          {/* Win Rate */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
            <span style={{ color: 'var(--color-terminal-muted)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>Win Rate</span>
            <span style={{ color: 'var(--color-terminal-blue)', fontSize: '14px', fontWeight: 'bold', fontFamily: 'var(--font-mono)' }}>
              {stats.winRate}%
            </span>
          </div>

          {/* Win rate bar */}
          <div style={{ height: '2px', backgroundColor: 'var(--color-terminal-border)', width: '100%', flexShrink: 0 }}>
            <div style={{ height: '2px', backgroundColor: 'var(--color-terminal-blue)', width: `${stats.winRate}%`, transition: 'width 0.3s ease' }} />
          </div>
        </>
      )}
    </div>
  )
}

/* ── Activity Entry Row (history tab) ── */

function ActivityEntry({ verdict, expanded, onToggle }: { verdict: VerdictRecord; expanded: boolean; onToggle: () => void }) {
  const chip = getDirectionChip(verdict.direction)
  const dirColor = getDirectionColor(verdict.direction)
  const analystCount = verdict.analysts?.length ?? 0

  return (
    <div style={{ borderBottom: '1px solid var(--color-terminal-border)', background: 'var(--color-terminal-panel)', fontFamily: 'var(--font-mono)' }}>
      {/* Summary row */}
      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '5px 10px',
          minHeight: '34px',
          cursor: 'pointer',
          borderLeft: `2px solid ${dirColor}`,
        }}
      >
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '11px', width: '10px', flexShrink: 0 }}>
          {expanded ? '▼' : '▶'}
        </span>

        {/* Timestamp */}
        <span style={{ color: 'var(--color-terminal-muted)', fontSize: '11px', width: '60px', flexShrink: 0 }}>
          {timeAgo(verdict.createdAt)}
        </span>

        {/* Direction */}
        <span style={{ color: chip.color, fontSize: '12px', fontWeight: 'bold', width: '80px', flexShrink: 0 }}>
          {chip.label}
        </span>

        {/* Confidence */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '80px', flexShrink: 0 }}>
          <div style={{ flex: 1, height: '2px', background: 'var(--color-terminal-border)' }}>
            <div style={{ height: '2px', background: dirColor, width: `${verdict.confidence * 100}%` }} />
          </div>
          <span style={{ color: 'var(--color-terminal-blue)', fontSize: '11px', fontWeight: 'bold' }}>
            {(verdict.confidence * 100).toFixed(0)}%
          </span>
        </div>

        {/* Confluence */}
        <span style={{ color: 'var(--color-terminal-muted)', fontSize: '11px', flexShrink: 0 }}>
          ×{verdict.confluence.toFixed(2)}
        </span>

        {/* Analyst count */}
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '11px', flexShrink: 0 }}>
          {analystCount} analysts
        </span>

        {/* LLM model */}
        {verdict.llmModel && (
          <span style={{ color: 'var(--color-terminal-blue)', fontSize: '10px', padding: '0 3px', border: '1px solid var(--color-terminal-border)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>
            {verdict.llmModel}
          </span>
        )}

        {/* Timeframes */}
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px', flexShrink: 0, marginLeft: 'auto' }}>
          {verdict.timeframes?.join(' ') ?? ''}
        </span>
      </div>

      {/* Expanded: timestamp + all analysts */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--color-terminal-border)', background: 'var(--color-terminal-surface)' }}>
          {/* Full timestamp */}
          <div style={{ padding: '4px 10px 2px 28px', color: 'var(--color-terminal-muted)', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
            {formatTimestamp(verdict.createdAt)}
            {verdict.llmModel && <span style={{ marginLeft: '8px', color: 'var(--color-terminal-blue)' }}>Model: {verdict.llmModel}</span>}
          </div>

          {/* Per-analyst breakdown */}
          {verdict.analysts?.map((analyst, idx) => {
            const aChip = getDirectionChip(analyst.direction)
            const aDirColor = getDirectionColor(analyst.direction)
            return (
              <div
                key={analyst.meta?.id ?? idx}
                style={{
                  padding: '4px 10px 4px 28px',
                  borderTop: '1px solid var(--color-terminal-border)',
                  borderLeft: `2px solid ${aDirColor}`,
                  marginLeft: '18px',
                }}
              >
                {/* Name + direction + confidence */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                  <span style={{ color: 'var(--color-terminal-dim)', fontSize: '11px', letterSpacing: '0.08em', width: '110px', flexShrink: 0 }}>
                    {analyst.meta?.name?.toUpperCase() ?? 'UNKNOWN'}
                  </span>
                  <span style={{ color: aChip.color, fontSize: '11px', fontWeight: 'bold' }}>{aChip.label}</span>
                  <span style={{ color: 'var(--color-terminal-blue)', fontSize: '11px', fontWeight: 'bold' }}>
                    {(analyst.confidence * 100).toFixed(0)}%
                  </span>
                  <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px' }}>w:{analyst.meta?.weight ?? '?'}</span>
                </div>

                {/* Reason */}
                {analyst.reason && (
                  <div style={{ color: 'var(--color-terminal-text)', fontSize: '11px', fontFamily: 'var(--font-mono)', lineHeight: '1.4', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: '3px' }}>
                    {analyst.reason}
                  </div>
                )}

                {/* All indicators */}
                {analyst.indicators && Object.keys(analyst.indicators).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
                    {Object.entries(analyst.indicators).map(([k, v]) => (
                      <IndicatorBadge key={k} k={k} v={v} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}


/* ═══════════════════════════════════════════════════════════════════════ */
/*  ANALYSIS STRIP — Main Component                                      */
/* ═══════════════════════════════════════════════════════════════════════ */

type ActiveTab = 'analysis' | 'activities'

export function AnalysisStrip({ symbol, refreshKey }: AnalysisStripProps) {
  const { result, history } = useIntelligence(symbol, { refreshKey })

  const analysts = result?.analysts ?? []
  const analystCount = analysts.length
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [activeTab, setActiveTab] = useState<ActiveTab>('analysis')
  const [expandedAnalysts, setExpandedAnalysts] = useState<Set<string>>(new Set())
  const [expandedActivities, setExpandedActivities] = useState<Set<string>>(new Set())
  const [isFullscreen, setIsFullscreen] = useState(false)

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev)
  }, [])

  useEffect(() => {
    if (!isFullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isFullscreen])


  const toggleAnalyst = useCallback((id: string) => {
    setExpandedAnalysts((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleActivity = useCallback((id: string) => {
    setExpandedActivities((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const tabStyle = (tab: ActiveTab): React.CSSProperties => ({
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    borderBottom: activeTab === tab ? '2px solid var(--color-terminal-amber)' : '2px solid transparent',
    fontSize: '12px',
    letterSpacing: '0.1em',
    color: activeTab === tab ? 'var(--color-terminal-text)' : 'var(--color-terminal-dim)',
    fontFamily: 'var(--font-mono)',
    padding: '0 8px',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
  })

  return (
    <div
      style={{
        ...(isFullscreen ? {
          position: 'fixed' as const,
          top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 9999,
        } : {}),
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-terminal-bg)',
        fontFamily: 'var(--font-mono)',
        overflow: 'hidden',
        minHeight: 0,
      }}
    >
      {/* ── Section Header with Tabs ── */}
      <div
        style={{
          height: '28px',
          minHeight: '28px',
          display: 'flex',
          alignItems: 'center',
          padding: '0 4px',
          background: 'var(--color-terminal-panel)',
          borderBottom: '1px solid var(--color-terminal-border)',
          flexShrink: 0,
          gap: '0',
        }}
      >
        {/* Tabs */}
        <button style={tabStyle('analysis')} onClick={() => setActiveTab('analysis')}>
          ANALYSIS ({analystCount})
        </button>
        <button style={tabStyle('activities')} onClick={() => setActiveTab('activities')}>
          ACTIVITIES ({history.length})
        </button>

        {/* Consensus summary — only on analysis tab */}
        {activeTab === 'analysis' && result && (
          <>
            <span style={{ marginLeft: '8px', fontSize: '12px', fontWeight: 'bold', color: getDirectionColor(result.direction), fontFamily: 'var(--font-mono)' }}>
              {getDirectionChip(result.direction).label}
            </span>
            <span style={{ marginLeft: '6px', fontSize: '11px', color: 'var(--color-terminal-blue)', fontFamily: 'var(--font-mono)' }}>
              {(result.confidence * 100).toFixed(0)}% conf
            </span>
            <span style={{ marginLeft: '6px', fontSize: '11px', color: 'var(--color-terminal-muted)', fontFamily: 'var(--font-mono)' }}>
              ×{result.confluence.toFixed(2)}
            </span>
          </>
        )}

        {/* View mode toggle — only on analysis tab */}
        {activeTab === 'analysis' && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '2px' }}>
            <button
              onClick={() => setViewMode('list')}
              style={{
                cursor: 'pointer',
                background: 'none',
                border: 'none',
                fontSize: '14px',
                padding: '0 3px',
                fontFamily: 'var(--font-mono)',
                color: viewMode === 'list' ? 'var(--color-terminal-amber)' : 'var(--color-terminal-dim)',
              }}
            >
              ☰
            </button>
            <button
              onClick={() => setViewMode('grid')}
              style={{
                cursor: 'pointer',
                background: 'none',
                border: 'none',
                fontSize: '14px',
                padding: '0 3px',
                fontFamily: 'var(--font-mono)',
                color: viewMode === 'grid' ? 'var(--color-terminal-amber)' : 'var(--color-terminal-dim)',
              }}
            >
              ⊞
            </button>
          </div>
        )}

        {/* Fullscreen toggle — always visible */}
        {activeTab !== 'analysis' && <div style={{ marginLeft: 'auto' }} />}
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
          style={{
            background: 'transparent',
            border: '1px solid var(--color-terminal-border)',
            color: isFullscreen ? 'var(--color-terminal-amber)' : 'var(--color-terminal-dim)',
            fontFamily: 'var(--font-mono)',
            fontSize: '13px',
            cursor: 'pointer',
            padding: '1px 5px',
            lineHeight: 1,
            marginLeft: activeTab === 'analysis' ? '4px' : '0',
            marginRight: '2px',
          }}
        >
          {isFullscreen ? '⊡' : '⊞'}
        </button>
      </div>

      {/* ── Tab Content ── */}
      {activeTab === 'analysis' ? (
        /* ── ANALYSIS TAB ── */
        analystCount === 0 && !result ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-terminal-dim)',
              fontSize: '13px',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.1em',
            }}
          >
            NO ANALYSIS DATA
          </div>
        ) : viewMode === 'grid' ? (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px',
              padding: '6px 10px',
              overflowY: 'auto',
              overflowX: 'hidden',
              alignItems: 'flex-start',
              alignContent: 'flex-start',
            }}
          >
            <MarketContextCard />
            <SignalStatsCard symbol={symbol} />
            {analysts.map((analyst: AnalystVerdict, idx: number) => {
              const key = analyst.meta.id ?? `a-${idx}`
              return (
                <AnalystCard
                  key={key}
                  analyst={analyst}
                  expanded={expandedAnalysts.has(key)}
                  onToggle={() => toggleAnalyst(key)}
                />
              )
            })}
          </div>
        ) : (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
              overflowX: 'hidden',
            }}
          >
            <MarketContextRow />
            <SignalStatsRow symbol={symbol} />
            {analysts.map((analyst: AnalystVerdict, idx: number) => {
              const key = analyst.meta.id ?? `a-${idx}`
              return (
                <AnalystRow
                  key={key}
                  analyst={analyst}
                  expanded={expandedAnalysts.has(key)}
                  onToggle={() => toggleAnalyst(key)}
                />
              )
            })}
          </div>
        )
      ) : (
        /* ── ACTIVITIES TAB ── */
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            overflowX: 'hidden',
          }}
        >
          {history.length === 0 ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-terminal-dim)',
                fontSize: '13px',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.1em',
              }}
            >
              NO ACTIVITY HISTORY
            </div>
          ) : (
            history.map((verdict, idx) => {
              const key = verdict.id ?? `h-${idx}`
              return (
                <ActivityEntry
                  key={key}
                  verdict={verdict}
                  expanded={expandedActivities.has(key)}
                  onToggle={() => toggleActivity(key)}
                />
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
