'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useIntelligence } from '@/hooks/useIntelligence'
import { useProjectInfo } from '@/hooks/useProjectInfo'
import { useMarketGlobal } from '@/hooks/useMarketGlobal'
import { useSignals } from '@/hooks/useSignals'
import type { AnalystVerdict, VerdictRecord, UnifiedProjectInfo, UnifiedProjectField } from '@/lib/intelligence/types'

interface AnalysisStripProps {
  symbol: string // e.g. 'BTCUSDT'
  refreshKey?: number
  agentModelMap?: Record<string, string>
}

/* ── Helpers ── */

/** Map analyst id/category to a display group */
const CATEGORY_LABELS: Record<string, string> = {
  'technical-analysis': 'TECHNICAL ANALYSIS',
  'quantitative': 'QUANTITATIVE',
  'macro-economic': 'MACRO & SENTIMENT',
  'behavioral-finance': 'BEHAVIORAL FINANCE',
  'crypto-native': 'CRYPTO NATIVE',
  'risk-management': 'RISK MANAGEMENT',
  'market-microstructure': 'MARKET MICROSTRUCTURE',
  'value-investing': 'VALUE & FUNDAMENTALS',
  'long-term-investing': 'VALUE & FUNDAMENTALS',
}

const DETERMINISTIC_CATEGORY: Record<string, string> = {
  'trend': 'technical-analysis',
  'signal-consensus': 'quantitative',
  'market-regime': 'macro-economic',
  'volume-profile': 'technical-analysis',
  'key-levels': 'technical-analysis',
  'mtf-alignment': 'technical-analysis',
}

const CATEGORY_ORDER = [
  'technical-analysis',
  'quantitative',
  'macro-economic',
  'crypto-native',
  'value-investing',
  'long-term-investing',
  'behavioral-finance',
  'risk-management',
  'market-microstructure',
]
const CATEGORY_COLORS: Record<string, string> = {
  'technical-analysis': '#5b9bd5',
  'quantitative': '#8e7cc3',
  'macro-economic': '#e2b53a',
  'behavioral-finance': '#c27ba0',
  'crypto-native': '#6aa84f',
  'risk-management': '#e06666',
  'market-microstructure': '#76a5af',
  'value-investing': '#e69138',
  'long-term-investing': '#e69138',
}

function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? 'var(--color-terminal-dim)'
}


function getAnalystCategory(analyst: AnalystVerdict): string {
  const meta = analyst.meta as AnalystVerdict['meta'] & { type?: string; category?: string }
  if (meta.type === 'llm' && meta.category) return meta.category
  return DETERMINISTIC_CATEGORY[meta.id] ?? 'technical-analysis'
}

function groupAnalystsByCategory(analysts: AnalystVerdict[]): { category: string; label: string; analysts: AnalystVerdict[] }[] {
  const groups = new Map<string, AnalystVerdict[]>()
  for (const a of analysts) {
    const cat = getAnalystCategory(a)
    if (!groups.has(cat)) groups.set(cat, [])
    groups.get(cat)!.push(a)
  }
  return CATEGORY_ORDER
    .filter(cat => groups.has(cat))
    .map(cat => ({
      category: cat,
      label: CATEGORY_LABELS[cat] ?? cat.toUpperCase().replace(/-/g, ' '),
      analysts: groups.get(cat)!,
    }))
}

function getDominantSentiment(analysts: AnalystVerdict[]): { direction: string; color: string; label: string } {
  let longScore = 0, shortScore = 0, neutralScore = 0
  for (const a of analysts) {
    const weight = a.confidence
    if (a.direction === 'long') longScore += weight
    else if (a.direction === 'short') shortScore += weight
    else neutralScore += weight
  }
  if (longScore > shortScore && longScore > neutralScore) return { direction: 'long', color: 'var(--color-terminal-up)', label: 'BUY' }
  if (shortScore > longScore && shortScore > neutralScore) return { direction: 'short', color: 'var(--color-terminal-down)', label: 'SELL' }
  return { direction: 'neutral', color: 'var(--color-terminal-amber)', label: 'NEUTRAL' }
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
    case 'long': return { label: '▲ BUY', color: 'var(--color-terminal-up)' }
    case 'short': return { label: '▼ SELL', color: 'var(--color-terminal-down)' }
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
        fontSize: '9px',
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

/* ── Category Delimiter (list view) ── */

function CategoryDelimiter({ label, count, color, analysts }: { label: string; count: number; color: string; analysts: AnalystVerdict[] }) {
  const sentiment = getDominantSentiment(analysts)
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '4px 10px',
        background: 'var(--color-terminal-surface)',
        borderBottom: '1px solid var(--color-terminal-border)',
        fontFamily: 'var(--font-mono)',
        minHeight: '24px',
      }}
    >
      <span style={{ fontSize: '11px', fontWeight: 'bold', letterSpacing: '0.1em', color, whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <span style={{ fontSize: '10px', fontWeight: 'bold', color: sentiment.color, whiteSpace: 'nowrap' }}>
        {sentiment.label}
      </span>
      <div style={{ flex: 1, height: '1px', background: color, opacity: 0.25 }} />
      <span style={{ fontSize: '9px', color: 'var(--color-terminal-dim)', whiteSpace: 'nowrap' }}>
        {count}
      </span>
    </div>
  )
}

/* ── Category Grid Header (grid view) ── */

function CategoryGridHeader({ label, count, color, analysts }: { label: string; count: number; color: string; analysts: AnalystVerdict[] }) {
  const sentiment = getDominantSentiment(analysts)
  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '4px 0',
        fontFamily: 'var(--font-mono)',
      }}
    >
      <span style={{ fontSize: '11px', fontWeight: 'bold', letterSpacing: '0.1em', color, whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <span style={{ fontSize: '10px', fontWeight: 'bold', color: sentiment.color, whiteSpace: 'nowrap' }}>
        {sentiment.label}
      </span>
      <div style={{ flex: 1, height: '1px', background: color, opacity: 0.25 }} />
      <span style={{ fontSize: '9px', color: 'var(--color-terminal-dim)', whiteSpace: 'nowrap' }}>
        {count}
      </span>
    </div>
  )
}

/* ── Category Summary Row (list view) ── */

function CategorySummaryRow({ analysts }: { analysts: AnalystVerdict[] }) {
  const groups = groupAnalystsByCategory(analysts)
  if (groups.length === 0) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '5px 10px', borderBottom: '1px solid var(--color-terminal-border)', borderLeft: '2px solid var(--color-terminal-dim)', background: 'var(--color-terminal-panel)', fontFamily: 'var(--font-mono)', minHeight: '34px', flexWrap: 'nowrap', overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none' }}>
      <span style={{ color: 'var(--color-terminal-dim)', fontSize: '11px', letterSpacing: '0.08em', width: '140px', flexShrink: 0 }}>CATEGORY STATS</span>
      {groups.map((group) => {
        const sentiment = getDominantSentiment(group.analysts)
        const color = getCategoryColor(group.category)
        const avgConf = group.analysts.reduce((s, a) => s + a.confidence, 0) / group.analysts.length
        return (
          <span key={group.category} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', flexShrink: 0 }}>
            <span style={{ fontSize: '10px', fontWeight: 'bold', color }}>{group.label}</span>
            <span style={{ fontSize: '10px', fontWeight: 'bold', color: sentiment.color }}>{sentiment.label}</span>
            <span style={{ fontSize: '10px', color: 'var(--color-terminal-blue)' }}>{(avgConf * 100).toFixed(0)}%</span>
            <span style={{ fontSize: '9px', color: 'var(--color-terminal-dim)', marginRight: '4px' }}>({group.analysts.length})</span>
          </span>
        )
      })}
    </div>
  )
}

/* ── Category Summary Card (grid view) ── */

function CategorySummaryCard({ analysts }: { analysts: AnalystVerdict[] }) {
  const groups = groupAnalystsByCategory(analysts)
  if (groups.length === 0) return null
  return (
    <div
      style={{
        ...cardBaseStyle,
        borderLeft: '2px solid var(--color-terminal-dim)',
        height: 'auto',
        minHeight: '180px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '11px', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' }}>
          CATEGORY STATS
        </span>
        <span style={{ color: 'var(--color-terminal-muted)', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
          {groups.length} categories
        </span>
      </div>
      {groups.map((group) => {
        const sentiment = getDominantSentiment(group.analysts)
        const color = getCategoryColor(group.category)
        const avgConf = group.analysts.reduce((s, a) => s + a.confidence, 0) / group.analysts.length
        return (
          <div key={group.category} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
            <span style={{ fontSize: '10px', fontWeight: 'bold', color, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{group.label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '10px', fontWeight: 'bold', color: sentiment.color, fontFamily: 'var(--font-mono)' }}>{sentiment.label}</span>
              <span style={{ fontSize: '10px', color: 'var(--color-terminal-blue)', fontFamily: 'var(--font-mono)' }}>{(avgConf * 100).toFixed(0)}%</span>
              <span style={{ fontSize: '9px', color: 'var(--color-terminal-dim)', fontFamily: 'var(--font-mono)' }}>({group.analysts.length})</span>
            </div>
          </div>
        )
      })}
    </div>
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
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '11px', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' }}>
          {analyst.meta.name.toUpperCase()}
        </span>
        <span style={{ color: chip.color, fontSize: '10px', fontWeight: 'bold', fontFamily: 'var(--font-mono)' }}>
          {chip.label}
        </span>
      </div>

      {/* Description */}
      <div style={{ color: 'var(--color-terminal-muted)', fontSize: '10px', fontFamily: 'var(--font-mono)', lineHeight: '1.2', ...(expanded ? {} : { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }) }}>
        {analyst.meta.description}
      </div>

      {/* Confidence row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'var(--color-terminal-muted)', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>Confidence</span>
        <span style={{ color: 'var(--color-terminal-blue)', fontSize: '11px', fontWeight: 'bold', fontFamily: 'var(--font-mono)' }}>
          {(analyst.confidence * 100).toFixed(0)}%
        </span>
      </div>

      {/* 2px confidence bar */}
      <div style={{ height: '2px', backgroundColor: 'var(--color-terminal-border)', width: '100%', flexShrink: 0 }}>
        <div style={{ height: '2px', backgroundColor: dirColor, width: `${analyst.confidence * 100}%`, transition: 'width 0.3s ease' }} />
      </div>

      {/* Weight + type */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '9px', fontFamily: 'var(--font-mono)' }}>
          Weight: {analyst.meta.weight}
        </span>
        {meta.type === 'llm' && (
          <span style={{ color: 'var(--color-terminal-blue)', fontSize: '9px', fontFamily: 'var(--font-mono)' }}>LLM</span>
        )}
      </div>

      {/* Reason text */}
      {analyst.reason && (
        <div
          style={{
            color: 'var(--color-terminal-dim)',
            fontSize: '10px',
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
      <div style={{ textAlign: 'center', color: 'var(--color-terminal-dim)', fontSize: '9px', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
        {expanded ? '▲ collapse' : '▼ expand'}
      </div>
    </div>
  )
}

/* ── Analyst List Row (list view) with expand/collapse ── */

function AnalystRow({ analyst, expanded, onToggle, categoryColor }: { analyst: AnalystVerdict; expanded: boolean; onToggle: () => void; categoryColor: string }) {
  const chip = getDirectionChip(analyst.direction)
  const dirColor = getDirectionColor(analyst.direction)
  const meta = analyst.meta as AnalystVerdict['meta'] & { type?: string }

  return (
    <div
      style={{
        borderBottom: '1px solid var(--color-terminal-border)',
        borderLeft: `2px solid ${categoryColor}`,
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
          flexWrap: 'nowrap',
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollbarWidth: 'none',
        }}
      >
        {/* Expand icon */}
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px', width: '10px', flexShrink: 0 }}>
          {expanded ? '▼' : '▶'}
        </span>

        {/* Name */}
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '11px', letterSpacing: '0.08em', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {analyst.meta.name.toUpperCase()}
        </span>

        {/* Direction */}
        <span style={{ color: chip.color, fontSize: '11px', fontWeight: 'bold', width: '80px', flexShrink: 0 }}>
          {chip.label}
        </span>

        {/* Confidence bar + value */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100px', flexShrink: 0 }}>
          <div style={{ flex: 1, height: '2px', background: 'var(--color-terminal-border)' }}>
            <div style={{ height: '2px', background: dirColor, width: `${analyst.confidence * 100}%` }} />
          </div>
          <span style={{ color: 'var(--color-terminal-blue)', fontSize: '11px', fontWeight: 'bold', width: '32px', textAlign: 'right' }}>
            {(analyst.confidence * 100).toFixed(0)}%
          </span>
        </div>

        {/* Reason (truncated) */}
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {analyst.reason}
        </span>

        {/* Weight badge */}
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '9px', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
          w:{analyst.meta.weight}
        </span>

        {/* LLM badge */}
        {meta.type === 'llm' && (
          <span style={{ color: 'var(--color-terminal-blue)', fontSize: '9px', fontFamily: 'var(--font-mono)', padding: '0 3px', border: '1px solid var(--color-terminal-border)', flexShrink: 0 }}>
            LLM
          </span>
        )}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{ padding: '4px 10px 8px 28px', borderTop: '1px solid var(--color-terminal-border)', background: 'var(--color-terminal-surface)' }}>
          {/* Description */}
          <div style={{ color: 'var(--color-terminal-muted)', fontSize: '10px', fontFamily: 'var(--font-mono)', lineHeight: '1.4', marginBottom: '4px' }}>
            {analyst.meta.description}
          </div>

          {/* Full reason */}
          <div style={{ color: 'var(--color-terminal-text)', fontSize: '10px', fontFamily: 'var(--font-mono)', lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: '6px' }}>
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
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px' }}>MARKET CONTEXT — Loading...</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '5px 10px', borderBottom: '1px solid var(--color-terminal-border)', borderLeft: '2px solid var(--color-terminal-blue)', background: 'var(--color-terminal-panel)', fontFamily: 'var(--font-mono)', minHeight: '34px', flexWrap: 'nowrap', overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none' }}>
      <span style={{ color: 'var(--color-terminal-dim)', fontSize: '11px', letterSpacing: '0.08em', width: '140px', flexShrink: 0 }}>MARKET CONTEXT</span>
      <span style={{ fontSize: '10px', color: 'var(--color-terminal-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>F&G</span>
      <span style={{ fontSize: '11px', fontWeight: 'bold', color: getFearGreedColor(marketData.fearGreedValue), whiteSpace: 'nowrap', flexShrink: 0 }}>{marketData.fearGreedValue} {marketData.fearGreedLabel.toUpperCase()}</span>
      <span style={{ fontSize: '10px', color: 'var(--color-terminal-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>BTC Dom</span>
      <span style={{ fontSize: '11px', color: 'var(--color-terminal-blue)', whiteSpace: 'nowrap', flexShrink: 0 }}>{marketData.btcDominance.toFixed(1)}%</span>
      <span style={{ fontSize: '10px', color: 'var(--color-terminal-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>MCap</span>
      <span style={{ fontSize: '11px', color: 'var(--color-terminal-text)', whiteSpace: 'nowrap', flexShrink: 0 }}>{formatMcap(marketData.totalMarketCap)}</span>
      <span style={{ fontSize: '10px', color: 'var(--color-terminal-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>24h Vol</span>
      <span style={{ fontSize: '11px', color: 'var(--color-terminal-text)', whiteSpace: 'nowrap', flexShrink: 0 }}>{formatMcap(marketData.totalVolume24h)}</span>
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
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px' }}>SIGNAL STATS — Loading...</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '5px 10px', borderBottom: '1px solid var(--color-terminal-border)', borderLeft: '2px solid var(--color-terminal-amber)', background: 'var(--color-terminal-panel)', fontFamily: 'var(--font-mono)', minHeight: '34px', flexWrap: 'nowrap', overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none' }}>
      <span style={{ color: 'var(--color-terminal-dim)', fontSize: '11px', letterSpacing: '0.08em', width: '140px', flexShrink: 0 }}>SIGNAL STATS</span>
      <span style={{ fontSize: '10px', color: 'var(--color-terminal-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>{stats.total} signals</span>
      <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--color-terminal-up)', whiteSpace: 'nowrap', flexShrink: 0 }}>↑{stats.pctLong}% ({stats.longCount})</span>
      <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--color-terminal-down)', whiteSpace: 'nowrap', flexShrink: 0 }}>↓{stats.pctShort}% ({stats.shortCount})</span>
      <span style={{ fontSize: '10px', color: 'var(--color-terminal-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>Win Rate</span>
      <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--color-terminal-blue)', whiteSpace: 'nowrap', flexShrink: 0 }}>{stats.winRate}%</span>
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
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '11px', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' }}>
          MARKET CONTEXT
        </span>
      </div>

      {loading || !marketData ? (
        <div style={{ color: 'var(--color-terminal-dim)', fontSize: '10px', fontFamily: 'var(--font-mono)', flex: 1, display: 'flex', alignItems: 'center' }}>
          Loading...
        </div>
      ) : (
        <>
          {/* Fear & Greed */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
            <span style={{ color: 'var(--color-terminal-muted)', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>Fear & Greed</span>
            <span style={{ color: getFearGreedColor(marketData.fearGreedValue), fontSize: '12px', fontWeight: 'bold', fontFamily: 'var(--font-mono)' }}>
              {marketData.fearGreedValue} {marketData.fearGreedLabel.toUpperCase()}
            </span>
          </div>

          {/* Fear/Greed bar */}
          <div style={{ height: '2px', backgroundColor: 'var(--color-terminal-border)', width: '100%', flexShrink: 0 }}>
            <div style={{ height: '2px', backgroundColor: getFearGreedColor(marketData.fearGreedValue), width: `${marketData.fearGreedValue}%`, transition: 'width 0.3s ease' }} />
          </div>

          {/* BTC Dominance */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--color-terminal-muted)', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>BTC Dom</span>
            <span style={{ color: 'var(--color-terminal-blue)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
              {marketData.btcDominance.toFixed(1)}%
            </span>
          </div>

          {/* Total MCap */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--color-terminal-muted)', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>Total MCap</span>
            <span style={{ color: 'var(--color-terminal-text)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
              {formatMcap(marketData.totalMarketCap)}
            </span>
          </div>

          {/* 24h Volume */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--color-terminal-muted)', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>24h Volume</span>
            <span style={{ color: 'var(--color-terminal-text)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
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
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '11px', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' }}>
          SIGNAL STATS
        </span>
        <span style={{ color: 'var(--color-terminal-muted)', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
          {stats.total} total
        </span>
      </div>

      {loading ? (
        <div style={{ color: 'var(--color-terminal-dim)', fontSize: '10px', fontFamily: 'var(--font-mono)', flex: 1, display: 'flex', alignItems: 'center' }}>
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
            <span style={{ color: 'var(--color-terminal-muted)', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>Long</span>
            <span style={{ color: 'var(--color-terminal-up)', fontSize: '11px', fontWeight: 'bold', fontFamily: 'var(--font-mono)' }}>
              {stats.pctLong}% ({stats.longCount})
            </span>
          </div>

          {/* Short % */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--color-terminal-muted)', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>Short</span>
            <span style={{ color: 'var(--color-terminal-down)', fontSize: '11px', fontWeight: 'bold', fontFamily: 'var(--font-mono)' }}>
              {stats.pctShort}% ({stats.shortCount})
            </span>
          </div>

          {/* Win Rate */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
            <span style={{ color: 'var(--color-terminal-muted)', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>Win Rate</span>
            <span style={{ color: 'var(--color-terminal-blue)', fontSize: '12px', fontWeight: 'bold', fontFamily: 'var(--font-mono)' }}>
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
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px', width: '10px', flexShrink: 0 }}>
          {expanded ? '▼' : '▶'}
        </span>

        {/* Timestamp */}
        <span style={{ color: 'var(--color-terminal-muted)', fontSize: '10px', width: '60px', flexShrink: 0 }}>
          {timeAgo(verdict.createdAt)}
        </span>

        {/* Direction */}
        <span style={{ color: chip.color, fontSize: '11px', fontWeight: 'bold', width: '80px', flexShrink: 0 }}>
          {chip.label}
        </span>

        {/* Confidence */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '80px', flexShrink: 0 }}>
          <div style={{ flex: 1, height: '2px', background: 'var(--color-terminal-border)' }}>
            <div style={{ height: '2px', background: dirColor, width: `${verdict.confidence * 100}%` }} />
          </div>
          <span style={{ color: 'var(--color-terminal-blue)', fontSize: '10px', fontWeight: 'bold' }}>
            {(verdict.confidence * 100).toFixed(0)}%
          </span>
        </div>

        {/* Confluence */}
        <span style={{ color: 'var(--color-terminal-muted)', fontSize: '10px', flexShrink: 0 }}>
          ×{verdict.confluence.toFixed(2)}
        </span>

        {/* Analyst count */}
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px', flexShrink: 0 }}>
          {analystCount} analysts
        </span>

        {/* LLM model */}
        {verdict.llmModel && (
          <span style={{ color: 'var(--color-terminal-blue)', fontSize: '9px', padding: '0 3px', border: '1px solid var(--color-terminal-border)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>
            {verdict.llmModel}
          </span>
        )}

        {/* Timeframes */}
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '9px', flexShrink: 0, marginLeft: 'auto' }}>
          {verdict.timeframes?.join(' ') ?? ''}
        </span>
      </div>

      {/* Expanded: timestamp + all analysts */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--color-terminal-border)', background: 'var(--color-terminal-surface)' }}>
          {/* Full timestamp */}
          <div style={{ padding: '4px 10px 2px 28px', color: 'var(--color-terminal-muted)', fontSize: '9px', fontFamily: 'var(--font-mono)' }}>
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
                  <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px', letterSpacing: '0.08em', width: '110px', flexShrink: 0 }}>
                    {analyst.meta?.name?.toUpperCase() ?? 'UNKNOWN'}
                  </span>
                  <span style={{ color: aChip.color, fontSize: '10px', fontWeight: 'bold' }}>{aChip.label}</span>
                  <span style={{ color: 'var(--color-terminal-blue)', fontSize: '10px', fontWeight: 'bold' }}>
                    {(analyst.confidence * 100).toFixed(0)}%
                  </span>
                  <span style={{ color: 'var(--color-terminal-dim)', fontSize: '9px' }}>w:{analyst.meta?.weight ?? '?'}</span>
                </div>

                {/* Reason */}
                {analyst.reason && (
                  <div style={{ color: 'var(--color-terminal-text)', fontSize: '10px', fontFamily: 'var(--font-mono)', lineHeight: '1.4', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: '3px' }}>
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



/* ── Project Info Content (project-info tab) ── */

function ProjectInfoContent({ symbol, projectInfo, agentModelMap }: { symbol: string; projectInfo: ReturnType<typeof useProjectInfo>; agentModelMap?: Record<string, string> }) {
  const { unified, loading, discovering, discoveryElapsed, discoveryLogs, error, discover, cancelDiscovery } = projectInfo
  const base = symbol.replace(/USDT$|BUSD$|USD$/i, '').toUpperCase()

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-terminal-dim)', fontSize: '11px', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
        LOADING PROJECT DATA...
      </div>
    )
  }

  if (error && !unified) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', color: 'var(--color-terminal-dim)', fontSize: '11px', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
        <span>{error}</span>
        <button
          onClick={() => discover(agentModelMap?.['discovery'] || undefined)}
          disabled={discovering}
          style={{
            background: discovering ? 'var(--color-terminal-surface)' : 'var(--color-terminal-amber)',
            color: discovering ? 'var(--color-terminal-dim)' : '#000',
            border: 'none',
            padding: '6px 16px',
            fontSize: '11px',
            fontWeight: 'bold',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.1em',
            cursor: discovering ? 'wait' : 'pointer',
          }}
        >
          {discovering ? 'DISCOVERING...' : 'DISCOVER VIA AI AGENT'}
        </button>
        {discovering && (
          <button
            onClick={() => cancelDiscovery()}
            style={{
              background: 'transparent',
              color: 'var(--color-terminal-down)',
              border: '1px solid var(--color-terminal-down)44',
              padding: '4px 12px',
              fontSize: '10px',
              fontWeight: 'bold',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.1em',
              cursor: 'pointer',
              marginTop: '4px',
            }}
          >
            CANCEL
          </button>
        )}
        {discovering && discoveryLogs.length > 0 && (
          <div style={{
            width: '100%',
            maxHeight: '200px',
            overflow: 'auto',
            marginTop: '8px',
            background: 'var(--color-terminal-bg)',
            border: '1px solid var(--color-terminal-border)',
            padding: '6px 8px',
            fontFamily: 'var(--font-mono)',
            fontSize: '9px',
            lineHeight: '1.5',
            color: 'var(--color-terminal-muted)',
          }}>
            {discoveryLogs.map((line, i) => (
              <div key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: line.includes('\u2713') ? 'var(--color-terminal-up)' : line.includes('ERROR') || line.includes('[stderr]') ? 'var(--color-terminal-down)' : line.includes('\u25b6') ? 'var(--color-terminal-amber)' : 'var(--color-terminal-dim)' }}>
                {line}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const u = unified!

  // ── Source badge ──
  const sourceBadge = (source: 'api' | 'ai' | 'both'): React.ReactNode => {
    const colors: Record<string, { bg: string; border: string; text: string; label: string }> = {
      api: { bg: 'var(--color-terminal-up)11', border: 'var(--color-terminal-up)44', text: 'var(--color-terminal-up)', label: 'API' },
      ai: { bg: 'var(--color-terminal-amber)11', border: 'var(--color-terminal-amber)44', text: 'var(--color-terminal-amber)', label: 'AI' },
      both: { bg: 'var(--color-terminal-blue)11', border: 'var(--color-terminal-blue)44', text: 'var(--color-terminal-blue)', label: 'API+AI' },
    }
    const c = colors[source]
    return (
      <span style={{ fontSize: '8px', padding: '0 3px', background: c.bg, border: `1px solid ${c.border}`, color: c.text, fontWeight: 'bold', lineHeight: '14px', marginLeft: '4px', flexShrink: 0 }}>{c.label}</span>
    )
  }

  const sectionHeader = (title: string, color: string): React.CSSProperties => ({
    fontSize: '11px', fontWeight: 'bold', letterSpacing: '0.1em', color, fontFamily: 'var(--font-mono)', padding: '6px 10px 3px', borderBottom: `1px solid ${color}33`,
  })

  // ── Unified row — shows source badge ──
  const uRow = <T,>(label: string, field: UnifiedProjectField<T>, fmt?: (v: T) => string, valueColor?: string): React.ReactNode => {
    if (field.value === null || field.value === undefined) return null
    const display = fmt ? fmt(field.value) : String(field.value)
    if (!display || display === '—') return null
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 10px', gap: '8px' }}>
        <span style={{ color: 'var(--color-terminal-muted)', fontSize: '10px', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center' }}>
          {label}{sourceBadge(field.source)}
        </span>
        <span style={{ color: valueColor ?? 'var(--color-terminal-text)', fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 'bold', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{display}</span>
      </div>
    )
  }

  // Number formatters
  const fmtNum = (v: number | null): string => {
    if (v === null || v === undefined) return '—'
    return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(2)
  }
  const fmtPct = (v: number | null): string => {
    if (v === null || v === undefined) return '—'
    return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
  }
  const fmtUsd = (v: number | null): string => {
    if (v === null || v === undefined || isNaN(v)) return '—'
    if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
    if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
    if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`
    return `$${v.toFixed(0)}`
  }
  const changeColor = (v: number | null): string => {
    if (v === null || v === undefined) return 'var(--color-terminal-muted)'
    return v >= 0 ? 'var(--color-terminal-up)' : 'var(--color-terminal-down)'
  }

  // Commit sparkline using Unicode block chars
  const sparkline = (data: number[]): string => {
    if (!data || data.length === 0) return ''
    const max = Math.max(...data, 1)
    const blocks = ['\u2581', '\u2582', '\u2583', '\u2584', '\u2585', '\u2586', '\u2587', '\u2588']
    return data.map(v => blocks[Math.min(Math.floor((v / max) * 7), 7)]).join('')
  }

  // Array/list renderer for pillar data
  const listField = (label: string, field: UnifiedProjectField<string[] | null>, itemColor?: string): React.ReactNode => {
    if (!field.value || field.value.length === 0) return null
    return (
      <div style={{ padding: '2px 10px' }}>
        <div style={{ color: 'var(--color-terminal-muted)', fontSize: '10px', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', marginBottom: '2px' }}>
          {label}{sourceBadge(field.source)}
        </div>
        {field.value.map((item, i) => (
          <div key={i} style={{ color: itemColor ?? 'var(--color-terminal-text)', fontSize: '10px', fontFamily: 'var(--font-mono)', padding: '1px 0', opacity: 0.9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {String.fromCharCode(0x25AA)} {item}
          </div>
        ))}
      </div>
    )
  }

  // Pillar score badge
  const pillarScore = (field: UnifiedProjectField<string | null>): React.ReactNode => {
    if (!field.value) return null
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '2px 10px' }}>
        <span style={{ fontSize: '10px', padding: '2px 8px', background: 'var(--color-terminal-amber)11', border: '1px solid var(--color-terminal-amber)44', color: 'var(--color-terminal-amber)', fontWeight: 'bold', fontFamily: 'var(--font-mono)' }}>
          SCORE: {field.value}
        </span>
      </div>
    )
  }

  // Text block for long-form fields
  const textBlock = (field: UnifiedProjectField<string | null>, borderColor?: string): React.ReactNode => {
    if (!field.value) return null
    return (
      <div style={{ padding: '4px 10px', color: 'var(--color-terminal-text)', fontSize: '10px', fontFamily: 'var(--font-mono)', lineHeight: '1.5', opacity: 0.85, ...(borderColor ? { borderLeft: `2px solid ${borderColor}`, marginLeft: '8px', marginRight: '8px' } : {}) }}>
        {sourceBadge(field.source)} {field.value}
      </div>
    )
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden', fontFamily: 'var(--font-mono)' }}>

      {/* ── DISCOVER BUTTON — always visible at top ── */}
      <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--color-terminal-border)', flexShrink: 0 }}>
        <button
          onClick={() => discover(agentModelMap?.['discovery'] || undefined)}
          disabled={discovering}
          style={{
            width: '100%',
            background: discovering ? 'var(--color-terminal-surface)' : (u.hasAiData ? 'transparent' : 'var(--color-terminal-amber)'),
            color: discovering ? 'var(--color-terminal-dim)' : (u.hasAiData ? 'var(--color-terminal-amber)' : '#000'),
            border: u.hasAiData ? `1px solid ${discovering ? 'var(--color-terminal-border)' : 'var(--color-terminal-amber)44'}` : 'none',
            padding: '5px 12px',
            fontSize: '10px',
            fontWeight: 'bold',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.1em',
            cursor: discovering ? 'wait' : 'pointer',
          }}
        >
          {discovering ? `AGENT RESEARCHING... ${discoveryElapsed}s` : (u.hasAiData ? `RE-DISCOVER ${base}` : `DISCOVER ${base} VIA AI AGENT`)}
        </button>
        <div style={{ fontSize: '9px', color: 'var(--color-terminal-dim)', marginTop: '2px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
          {discovering ? 'Worker running off-thread — UI stays responsive' : 'Uses web search + blockchain explorers to find project data'}
        </div>
        {discovering && (
          <button
            onClick={() => cancelDiscovery()}
            style={{
              width: '100%',
              background: 'transparent',
              color: 'var(--color-terminal-down)',
              border: '1px solid var(--color-terminal-down)44',
              padding: '4px 12px',
              fontSize: '9px',
              fontWeight: 'bold',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.1em',
              cursor: 'pointer',
              marginTop: '4px',
            }}
          >
            CANCEL DISCOVERY
          </button>
        )}
        {discovering && discoveryLogs.length > 0 && (
          <div style={{
            width: '100%',
            maxHeight: '200px',
            overflow: 'auto',
            marginTop: '8px',
            background: 'var(--color-terminal-bg)',
            border: '1px solid var(--color-terminal-border)',
            padding: '6px 8px',
            fontFamily: 'var(--font-mono)',
            fontSize: '9px',
            lineHeight: '1.5',
            color: 'var(--color-terminal-muted)',
          }}>
            {discoveryLogs.map((line, i) => (
              <div key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: line.includes('\u2713') ? 'var(--color-terminal-up)' : line.includes('ERROR') || line.includes('[stderr]') ? 'var(--color-terminal-down)' : line.includes('\u25b6') ? 'var(--color-terminal-amber)' : 'var(--color-terminal-dim)' }}>
                {line}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── ASSET IDENTITY ── */}
      <div style={sectionHeader(`${base} \u2014 PROJECT OVERVIEW`, 'var(--color-terminal-amber)')}>
        {base} {String.fromCharCode(0x2014)} PROJECT OVERVIEW
      </div>
      {u.description.value && (
        <div style={{ padding: '4px 10px', color: 'var(--color-terminal-text)', fontSize: '11px', lineHeight: '1.5', opacity: 0.85 }}>
          {u.description.value.slice(0, 300)}{u.description.value.length > 300 ? '...' : ''}
          {sourceBadge(u.description.source)}
        </div>
      )}
      {u.categories.value.length > 0 && (
        <div style={{ padding: '2px 10px', display: 'flex', flexWrap: 'wrap', gap: '3px', alignItems: 'center' }}>
          {u.categories.value.map(cat => (
            <span key={cat} style={{ fontSize: '9px', padding: '1px 5px', background: 'var(--color-terminal-surface)', border: '1px solid var(--color-terminal-border)', color: 'var(--color-terminal-blue)' }}>{cat}</span>
          ))}
          {sourceBadge(u.categories.source)}
        </div>
      )}
      {uRow('Website', u.website)}
      {uRow('Twitter', u.twitter)}
      {uRow('GitHub', u.github)}
      {uRow('Discord', u.discord)}
      {uRow('Telegram', u.telegram)}
      {uRow('Genesis', u.genesisDate)}

      {/* ══════ PILLAR 1: TEAM SURVIVAL FITNESS ══════ */}
      <div style={sectionHeader('1 \u25B8 TEAM SURVIVAL FITNESS', '#5b9bd5')}>
        1 {String.fromCharCode(0x25B8)} TEAM SURVIVAL FITNESS
      </div>
      {listField('Founders', u.founders)}
      {uRow('Team Size', u.teamSize)}
      {textBlock(u.teamBackground)}
      {listField('Funding Rounds', u.fundingRounds)}
      {uRow('Total Funding', u.totalFunding)}
      {listField('Investors', u.investors)}
      {uRow('Treasury', u.treasury)}
      {uRow('Team Activity', u.teamActivity)}
      {uRow('Commits (4w)', u.commitCount4Weeks, (v) => v !== null ? fmtNum(v) : '\u2014', u.commitCount4Weeks.value !== null ? (u.commitCount4Weeks.value > 20 ? 'var(--color-terminal-up)' : u.commitCount4Weeks.value > 5 ? 'var(--color-terminal-amber)' : 'var(--color-terminal-down)') : undefined)}
      {u.commitActivitySeries.value.length > 0 && (
        <div style={{ padding: '2px 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: 'var(--color-terminal-muted)', fontSize: '10px' }}>28d Activity</span>
          {sourceBadge(u.commitActivitySeries.source)}
          <span style={{ color: 'var(--color-terminal-blue)', fontSize: '11px', letterSpacing: '1px', fontFamily: 'var(--font-mono)' }}>{sparkline(u.commitActivitySeries.value)}</span>
        </div>
      )}
      {uRow('PRs Merged', u.pullRequestsMerged, (v) => v !== null ? fmtNum(v) : '\u2014')}
      {uRow('PR Contributors', u.pullRequestContributors, (v) => v !== null ? fmtNum(v) : '\u2014')}
      {u.codeAdditions4Weeks.value !== null && u.codeDeletions4Weeks.value !== null && (
        uRow('Code +/-', u.codeAdditions4Weeks, () => `+${(u.codeAdditions4Weeks.value ?? 0).toLocaleString()} / -${(u.codeDeletions4Weeks.value ?? 0).toLocaleString()}`)
      )}
      {u.issuesClosed.value !== null && u.issuesTotal.value !== null && (
        uRow('Issues Closed/Total', u.issuesClosed, () => `${(u.issuesClosed.value ?? 0).toLocaleString()} / ${(u.issuesTotal.value ?? 0).toLocaleString()}`)
      )}
      {uRow('GitHub Stars', u.githubStars, (v) => v !== null ? fmtNum(v) : '\u2014')}
      {uRow('GitHub Forks', u.githubForks, (v) => v !== null ? fmtNum(v) : '\u2014')}
      {pillarScore(u.pillar1Score)}

      {/* ══════ PILLAR 2: NARRATIVE ALIGNMENT ══════ */}
      <div style={sectionHeader('2 \u25B8 NARRATIVE ALIGNMENT', '#6aa84f')}>
        2 {String.fromCharCode(0x25B8)} NARRATIVE ALIGNMENT
      </div>
      {u.categories.value.length > 0 && (
        <div style={{ padding: '4px 10px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {u.categories.value.map(cat => {
              const hotNarratives = ['Artificial Intelligence', 'AI', 'DePIN', 'Real World Assets', 'RWA', 'Layer 1', 'Layer 2', 'DeFi', 'Gaming', 'Privacy', 'Infrastructure', 'Interoperability']
              const isHot = hotNarratives.some(h => cat.toLowerCase().includes(h.toLowerCase()))
              return (
                <span key={cat} style={{ fontSize: '10px', padding: '2px 6px', background: isHot ? 'var(--color-terminal-up)11' : 'var(--color-terminal-surface)', border: `1px solid ${isHot ? 'var(--color-terminal-up)' : 'var(--color-terminal-border)'}`, color: isHot ? 'var(--color-terminal-up)' : 'var(--color-terminal-muted)', fontWeight: isHot ? 'bold' : 'normal' }}>
                  {cat}
                </span>
              )
            })}
          </div>
        </div>
      )}
      {uRow('Ecosystem', u.ecosystem)}
      {uRow('Narrative Strength', u.narrativeStrength)}
      {uRow('USP', u.uniqueSellingPoint)}
      {listField('Competitors', u.competitors)}
      {listField('Partnerships', u.partnerships)}
      {uRow('Adoption Signals', u.adoptionSignals)}
      {uRow('Sentiment Up', u.sentimentUp, (v) => v !== null ? `${v.toFixed(0)}%` : '\u2014', u.sentimentUp.value !== null ? (u.sentimentUp.value > 60 ? 'var(--color-terminal-up)' : u.sentimentUp.value < 40 ? 'var(--color-terminal-down)' : 'var(--color-terminal-amber)') : undefined)}
      {uRow('Sentiment Down', u.sentimentDown, (v) => v !== null ? `${v.toFixed(0)}%` : '\u2014', u.sentimentDown.value !== null && u.sentimentDown.value > 40 ? 'var(--color-terminal-down)' : 'var(--color-terminal-muted)')}
      {uRow('Twitter Followers', u.twitterFollowers, (v) => v !== null ? fmtNum(v) : '\u2014')}
      {uRow('Reddit Subscribers', u.redditSubscribers, (v) => v !== null ? fmtNum(v) : '\u2014')}
      {uRow('Telegram Users', u.telegramUsers, (v) => v !== null ? fmtNum(v) : '\u2014')}
      {pillarScore(u.pillar2Score)}

      {/* ══════ PILLAR 3: ECONOMIC MOAT ══════ */}
      <div style={sectionHeader('3 \u25B8 ECONOMIC MOAT', '#e69138')}>
        3 {String.fromCharCode(0x25B8)} ECONOMIC MOAT
      </div>
      {uRow('Token Type', u.tokenType)}
      {uRow('Total Supply', u.totalSupply)}
      {uRow('Circulating', u.circulatingSupply)}
      {uRow('Max Supply', u.maxSupply)}
      {uRow('Market Cap', u.marketCap)}
      {uRow('FDV', u.fdv)}
      {uRow('Protocol', u.protocolName)}
      {uRow('Category', u.protocolCategory)}
      {uRow('TVL', u.tvl)}
      {uRow('TVL 24h', u.tvlChange24h, (v) => v !== null ? fmtPct(v) : '\u2014', u.tvlChange24h.value !== null ? changeColor(u.tvlChange24h.value) : undefined)}
      {uRow('TVL 7d', u.tvlChange7d, (v) => v !== null ? fmtPct(v) : '\u2014', u.tvlChange7d.value !== null ? changeColor(u.tvlChange7d.value) : undefined)}
      {uRow('MCap/TVL', u.mcapToTvl, (v) => v !== null ? v.toFixed(2) + 'x' : '\u2014')}
      {u.chains.value.length > 0 && uRow('Chains', u.chains, (v) => v.join(', '))}
      {uRow('Chain TVL', u.chainTvl, (v) => v !== null ? fmtUsd(v) : '\u2014')}
      {uRow('Revenue Model', u.revenueModel)}
      {textBlock(u.moatDescription)}
      {uRow('Mainnet', u.mainnetLaunched)}
      {uRow('Audited', u.audited)}
      {uRow('Audit Details', u.auditDetails)}
      {pillarScore(u.pillar3Score)}

      {/* ══════ PILLAR 4: VALUATION & ACCUMULATION ══════ */}
      <div style={sectionHeader('4 \u25B8 VALUATION & ACCUMULATION', '#8e7cc3')}>
        4 {String.fromCharCode(0x25B8)} VALUATION & ACCUMULATION
      </div>
      {uRow('Fees 24h', u.fees24h, (v) => v !== null ? fmtUsd(v) : '\u2014')}
      {uRow('Fees 7d', u.fees7d, (v) => v !== null ? fmtUsd(v) : '\u2014')}
      {uRow('Fees 30d', u.fees30d, (v) => v !== null ? fmtUsd(v) : '\u2014')}
      {uRow('Revenue 24h', u.revenue24h, (v) => v !== null ? fmtUsd(v) : '\u2014')}
      {uRow('Revenue 7d', u.revenue7d, (v) => v !== null ? fmtUsd(v) : '\u2014')}
      {uRow('Revenue 30d', u.revenue30d, (v) => v !== null ? fmtUsd(v) : '\u2014')}
      {uRow('Current Price', u.currentPrice)}
      {uRow('All-Time High', u.allTimeHigh)}
      {uRow('All-Time Low', u.allTimeLow)}
      {uRow('Price from ATH', u.priceFromATH)}
      {uRow('Vesting Schedule', u.vestingSchedule)}
      {uRow('Inflation Rate', u.inflationRate)}
      {uRow('Staking Yield', u.stakingYield)}
      {textBlock(u.valuationNotes)}
      {pillarScore(u.pillar4Score)}

      {/* ══════ ON-CHAIN ACTIVITY ══════ */}
      {(u.contractAddress.value || u.holderCount.value || u.onChainSummary.value) && (
        <>
          <div style={sectionHeader('ON-CHAIN ACTIVITY', '#e06666')}>
            ON-CHAIN ACTIVITY
          </div>
          {uRow('Chain', u.chain)}
          {uRow('Contract', u.contractAddress)}
          {uRow('Holders', u.holderCount)}
          {uRow('Active Addr 24h', u.activeAddresses24h)}
          {uRow('Whale Activity', u.largeTransactions)}
          {listField('Top Holders', u.topHolders)}
          {textBlock(u.onChainSummary)}
        </>
      )}

      {/* ══════ RISKS & NEWS ══════ */}
      {(u.risks.value && u.risks.value.length > 0) || (u.recentNews.value && u.recentNews.value.length > 0) ? (
        <>
          <div style={sectionHeader('RISKS & NEWS', '#cc0000')}>
            RISKS & NEWS
          </div>
          {u.risks.value && u.risks.value.length > 0 && (
            <div style={{ padding: '4px 10px' }}>
              <div style={{ color: 'var(--color-terminal-down)', fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 'bold', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                RISKS{sourceBadge(u.risks.source)}
              </div>
              {u.risks.value.map((r, i) => (
                <div key={i} style={{ color: 'var(--color-terminal-text)', fontSize: '10px', fontFamily: 'var(--font-mono)', padding: '1px 0', lineHeight: '1.4', opacity: 0.9 }}>
                  {String.fromCharCode(0x25AA)} {r}
                </div>
              ))}
            </div>
          )}
          {u.recentNews.value && u.recentNews.value.length > 0 && (
            <div style={{ padding: '4px 10px' }}>
              <div style={{ color: 'var(--color-terminal-blue)', fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 'bold', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                RECENT NEWS{sourceBadge(u.recentNews.source)}
              </div>
              {u.recentNews.value.map((n, i) => (
                <div key={i} style={{ color: 'var(--color-terminal-text)', fontSize: '10px', fontFamily: 'var(--font-mono)', padding: '1px 0', lineHeight: '1.4', opacity: 0.9 }}>
                  {String.fromCharCode(0x25AA)} {n}
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}

      {/* ══════ AI ASSESSMENT ══════ */}
      {u.aiSummary.value && (
        <>
          <div style={sectionHeader('AI ASSESSMENT', 'var(--color-terminal-amber)')}>
            AI ASSESSMENT
          </div>
          <div style={{ padding: '6px 10px', color: 'var(--color-terminal-text)', fontSize: '11px', fontFamily: 'var(--font-mono)', lineHeight: '1.6', opacity: 0.9, borderLeft: '2px solid var(--color-terminal-amber)', marginLeft: '8px', marginRight: '8px' }}>
            {u.aiSummary.value}
          </div>
        </>
      )}

      {/* ══════ SOURCES ══════ */}
      {u.sourcesUsed.length > 0 && (
        <div style={{ padding: '4px 10px' }}>
          <div style={{ color: 'var(--color-terminal-dim)', fontSize: '9px', fontFamily: 'var(--font-mono)', marginBottom: '2px' }}>SOURCES ({u.sourcesUsed.length})</div>
          {u.sourcesUsed.filter(s => !s.startsWith('search:')).slice(0, 10).map((s, i) => (
            <div key={i} style={{ color: 'var(--color-terminal-blue)', fontSize: '9px', fontFamily: 'var(--font-mono)', padding: '1px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.7 }}>
              {s}
            </div>
          ))}
        </div>
      )}
      {u.discoveredAt && (
        <div style={{ padding: '2px 10px', color: 'var(--color-terminal-dim)', fontSize: '9px', fontFamily: 'var(--font-mono)' }}>
          Discovered {new Date(u.discoveredAt).toLocaleString()}
        </div>
      )}

      {/* Bottom spacer */}
      <div style={{ height: '12px', flexShrink: 0 }} />
    </div>
  )
}
/* ═══════════════════════════════════════════════════════════════════════ */
/*  ANALYSIS STRIP — Main Component                                      */
/* ═══════════════════════════════════════════════════════════════════════ */

type ActiveTab = 'analysis' | 'activities' | 'project-info'

export function AnalysisStrip({ symbol, refreshKey, agentModelMap }: AnalysisStripProps) {
  const { result, history } = useIntelligence(symbol, { refreshKey })
  const projectInfo = useProjectInfo(symbol)

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
    fontSize: '11px',
    letterSpacing: '0.1em',
    color: activeTab === tab ? 'var(--color-terminal-text)' : 'var(--color-terminal-dim)',
    fontFamily: 'var(--font-mono)',
    padding: '0 8px',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
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
          overflowX: 'auto',
          overflowY: 'hidden',
          whiteSpace: 'nowrap' as const,
        }}
      >
        {/* Tabs */}
        <button style={tabStyle('analysis')} onClick={() => setActiveTab('analysis')}>
          ANALYSIS ({analystCount})
        </button>
        <button style={tabStyle('activities')} onClick={() => setActiveTab('activities')}>
          ACTIVITIES ({history.length})
        </button>
        <button style={tabStyle('project-info')} onClick={() => setActiveTab('project-info')}>
          PROJECT INFO
        </button>

        {/* Consensus summary — only on analysis tab */}
        {activeTab === 'analysis' && result && (
          <>
            <span style={{ marginLeft: '8px', fontSize: '11px', fontWeight: 'bold', color: getDirectionColor(result.direction), fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
              {getDirectionChip(result.direction).label}
            </span>
            <span style={{ marginLeft: '6px', fontSize: '10px', color: 'var(--color-terminal-blue)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
              {(result.confidence * 100).toFixed(0)}% conf
            </span>
            <span style={{ marginLeft: '6px', fontSize: '10px', color: 'var(--color-terminal-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
              ×{result.confluence.toFixed(2)}
            </span>
          </>
        )}

        {/* View mode toggle — only on analysis tab */}
        {activeTab === 'analysis' && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
            <button
              onClick={() => setViewMode('list')}
              style={{
                cursor: 'pointer',
                background: 'none',
                border: 'none',
                fontSize: '12px',
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
                fontSize: '12px',
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
            fontSize: '11px',
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
              fontSize: '11px',
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
            <CategorySummaryCard analysts={analysts} />
            {groupAnalystsByCategory(analysts).map((group) => (
              <div key={group.category} style={{ width: '100%', display: 'contents' }}>
                <CategoryGridHeader label={group.label} count={group.analysts.length} color={getCategoryColor(group.category)} analysts={group.analysts} />
                {group.analysts.map((analyst, idx) => {
                  const key = analyst.meta.id ?? `${group.category}-${idx}`
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
            ))}
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
            <CategorySummaryRow analysts={analysts} />
            {groupAnalystsByCategory(analysts).map((group) => (
              <div key={group.category}>
                <CategoryDelimiter label={group.label} count={group.analysts.length} color={getCategoryColor(group.category)} analysts={group.analysts} />
                {group.analysts.map((analyst, idx) => {
                  const key = analyst.meta.id ?? `${group.category}-${idx}`
                  return (
                    <AnalystRow
                      key={key}
                      analyst={analyst}
                      expanded={expandedAnalysts.has(key)}
                      onToggle={() => toggleAnalyst(key)}
                      categoryColor={getCategoryColor(group.category)}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        )
      ) : activeTab === 'activities' ? (
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
                fontSize: '11px',
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
      ) : (
        /* ── PROJECT INFO TAB ── */
        <ProjectInfoContent symbol={symbol} projectInfo={projectInfo} agentModelMap={agentModelMap} />
      )}
    </div>
  )
}
