'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useIntelligence } from '@/hooks/useIntelligence'
import { useProjectInfo } from '@/hooks/useProjectInfo'
import { useMarketGlobal } from '@/hooks/useMarketGlobal'
import { useSignals } from '@/hooks/useSignals'
import type { AnalystVerdict, VerdictRecord } from '@/lib/intelligence/types'
import type { DiscoveryHistoryEntry } from '@/hooks/useProjectInfo'
import { DiscoveryDialog } from '@/components/terminal/DiscoveryDialog'
import { ProjectInfoContent } from '@/components/terminal/ProjectInfoContent'

interface ModelInfo {
  id: string
  provider: string
  name: string
}

interface AgentInfo {
  id: string
  name: string
  description: string
  category: string
}

const DEFAULT_MODEL = 'opencode/big-pickle'
const RECOMMENDED_PROVIDERS = ['opencode', 'github-copilot']

interface AnalysisStripProps {
  symbol: string // e.g. 'BTCUSDT'
  refreshKey?: number
  agentModelMap?: Record<string, string>
  onAnalysisComplete?: () => void
  onAgentModelMapChange?: (map: Record<string, string>) => void
}

// ─── Reusable searchable model dropdown ───

function ModelDropdown({
  value,
  onChange,
  models,
  label,
}: {
  value: string
  onChange: (modelId: string) => void
  models: ModelInfo[]
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const modelsByProvider = useMemo(() => {
    return models.reduce<Record<string, ModelInfo[]>>((acc, m) => {
      if (!acc[m.provider]) acc[m.provider] = []
      acc[m.provider].push(m)
      return acc
    }, {})
  }, [models])

  const orderedProviders = useMemo(() => {
    return Object.keys(modelsByProvider).sort((a, b) => {
      const aIdx = RECOMMENDED_PROVIDERS.indexOf(a)
      const bIdx = RECOMMENDED_PROVIDERS.indexOf(b)
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx
      if (aIdx !== -1) return -1
      if (bIdx !== -1) return 1
      return a.localeCompare(b)
    })
  }, [modelsByProvider])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? models.filter(
          (m) =>
            m.id.toLowerCase().includes(q) ||
            m.name.toLowerCase().includes(q) ||
            m.provider.toLowerCase().includes(q)
        )
      : models

    const byProvider = list.reduce<Record<string, ModelInfo[]>>((acc, m) => {
      if (!acc[m.provider]) acc[m.provider] = []
      acc[m.provider].push(m)
      return acc
    }, {})

    const providers = orderedProviders.filter((p) => byProvider[p]?.length)
    Object.keys(byProvider).forEach((p) => {
      if (!providers.includes(p)) providers.push(p)
    })

    return { byProvider, providers }
  }, [query, models, orderedProviders])

  const displayName = value
    ? models.find((m) => m.id === value)?.name ?? value
    : DEFAULT_MODEL

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      {label && (
        <label
          style={{
            fontSize: '9px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-terminal-dim)',
            letterSpacing: '0.5px',
            display: 'block',
            marginBottom: '1px',
          }}
        >
          {label}
        </label>
      )}
      <button
        onClick={() => {
          setOpen(!open)
          setQuery('')
        }}
        style={{
          width: '100%',
          padding: '2px 4px',
          background: 'var(--color-terminal-bg)',
          color: 'var(--color-terminal-text)',
          border: '1px solid ' + (open ? 'var(--color-terminal-blue)' : 'var(--color-terminal-border)'),
          borderRadius: '2px',
          fontSize: '10px',
          fontFamily: 'var(--font-mono)',
          outline: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '2px',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {displayName}
        </span>
        <span style={{ fontSize: '7px', color: 'var(--color-terminal-dim)', flexShrink: 0 }}>
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 10000,
            background: 'var(--color-terminal-bg)',
            border: '1px solid var(--color-terminal-blue)',
            borderTop: 'none',
            borderRadius: '0 0 2px 2px',
            maxHeight: '220px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ padding: '3px', borderBottom: '1px solid var(--color-terminal-border)' }}>
            <input
              autoFocus
              type="text"
              placeholder="Search models..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '2px 4px',
                background: 'var(--color-terminal-panel)',
                color: 'var(--color-terminal-text)',
                border: '1px solid var(--color-terminal-border)',
                borderRadius: '2px',
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.providers.map((provider) => (
              <div key={provider}>
                <div
                  style={{
                    padding: '2px 6px 1px',
                    fontSize: '8px',
                    fontFamily: 'var(--font-mono)',
                    color: RECOMMENDED_PROVIDERS.includes(provider) ? 'var(--color-terminal-amber)' : 'var(--color-terminal-dim)',
                    letterSpacing: '0.5px',
                    textTransform: 'uppercase',
                    borderTop: '1px solid var(--color-terminal-border)',
                    marginTop: '1px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                  }}
                >
                  {provider}
                  {RECOMMENDED_PROVIDERS.includes(provider) && (
                    <span style={{ fontSize: '7px', color: 'var(--color-terminal-amber)', opacity: 0.7 }}>★</span>
                  )}
                </div>
                {(filtered.byProvider[provider] ?? []).map((m) => {
                  const isActive = value === m.id
                  return (
                    <div
                      key={m.id}
                      onClick={() => {
                        onChange(m.id)
                        setOpen(false)
                        setQuery('')
                      }}
                      style={{
                        padding: '1px 10px',
                        fontSize: '10px',
                        fontFamily: 'var(--font-mono)',
                        color: isActive ? 'var(--color-terminal-blue)' : 'var(--color-terminal-text)',
                        cursor: 'pointer',
                        background: isActive ? 'rgba(68, 136, 255, 0.1)' : 'transparent',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'var(--color-terminal-panel)' }}
                      onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                    >
                      {m.name}
                    </div>
                  )
                })}
              </div>
            ))}
            {filtered.providers.length === 0 && (
              <div
                style={{
                  padding: '6px',
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-terminal-dim)',
                  textAlign: 'center',
                }}
              >
                No models matching &quot;{query}&quot;
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
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

/* ── Discovery Activity Entry Row ── */

function DiscoveryActivityEntry({ entry, expanded, onToggle }: { entry: DiscoveryHistoryEntry; expanded: boolean; onToggle: () => void }) {
  const isCompleted = entry.status === 'completed'
  const statusColor = isCompleted ? 'var(--color-terminal-up)' : 'var(--color-terminal-down)'
  const aiSummary = entry.result?.aiSummary
  const rawPreview = entry.rawOutput ? entry.rawOutput.slice(0, 200) : null

  return (
    <div style={{ borderBottom: '1px solid var(--color-terminal-border)', background: 'var(--color-terminal-panel)', fontFamily: 'var(--font-mono)' }}>
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 10px', minHeight: '34px',
          cursor: 'pointer', borderLeft: `2px solid ${statusColor}`,
        }}
      >
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px', width: '10px', flexShrink: 0 }}>
          {expanded ? '▼' : '▶'}
        </span>
        <span style={{ color: 'var(--color-terminal-muted)', fontSize: '10px', width: '60px', flexShrink: 0 }}>
          {timeAgo(entry.completedAt)}
        </span>
        <span style={{ color: 'var(--color-terminal-purple)', fontSize: '10px', fontWeight: 'bold', width: '80px', flexShrink: 0 }}>
          DISCOVERY
        </span>
        <span style={{ color: 'var(--color-terminal-text)', fontSize: '11px', fontWeight: 'bold', flexShrink: 0 }}>
          {entry.symbol}
        </span>
        <span style={{ color: statusColor, fontSize: '9px', padding: '0 4px', border: `1px solid ${statusColor}`, flexShrink: 0 }}>
          {entry.status.toUpperCase()}
        </span>
        <span style={{ color: 'var(--color-terminal-blue)', fontSize: '9px', padding: '0 3px', border: '1px solid var(--color-terminal-border)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>
          {entry.modelId.split('/').pop() ?? entry.modelId}
        </span>
      </div>
      {expanded && (
        <div style={{ borderTop: '1px solid var(--color-terminal-border)', background: 'var(--color-terminal-surface)', padding: '8px 28px' }}>
          <div style={{ color: 'var(--color-terminal-muted)', fontSize: '9px', marginBottom: '6px' }}>
            {new Date(entry.completedAt).toLocaleString()}
            <span style={{ marginLeft: '8px', color: 'var(--color-terminal-blue)' }}>Model: {entry.modelId}</span>
          </div>
          {aiSummary ? (
            <div style={{ color: 'var(--color-terminal-text)', fontSize: '11px', lineHeight: 1.6, marginBottom: '6px' }}>{aiSummary}</div>
          ) : rawPreview ? (
            <pre style={{ color: 'var(--color-terminal-muted)', fontSize: '10px', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
              {rawPreview}{entry.rawOutput && entry.rawOutput.length > 200 ? '…' : ''}
            </pre>
          ) : (
            <div style={{ color: 'var(--color-terminal-dim)', fontSize: '10px' }}>No output available.</div>
          )}
        </div>
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



/* ═══════════════════════════════════════════════════════════════════════ */
/*  ANALYSIS STRIP — Main Component                                      */
/* ═══════════════════════════════════════════════════════════════════════ */

type ActiveTab = 'analysis' | 'activities' | 'project-info'

export function AnalysisStrip({ symbol, refreshKey, agentModelMap, onAnalysisComplete, onAgentModelMapChange }: AnalysisStripProps) {
  const { result, loading, error, history, isStale, analyze } = useIntelligence(symbol, { refreshKey })
  const projectInfo = useProjectInfo(symbol)

  const analysts = result?.analysts ?? []
  const analystCount = analysts.length
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [activeTab, setActiveTab] = useState<ActiveTab>('analysis')
  const [expandedAnalysts, setExpandedAnalysts] = useState<Set<string>>(new Set())
  const [expandedActivities, setExpandedActivities] = useState<Set<string>>(new Set())
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [selectedAgents, setSelectedAgents] = useState<string[]>([])
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([])
  const [availableAgents, setAvailableAgents] = useState<AgentInfo[]>([])
  const [configOpen, setConfigOpen] = useState(false)
  const [setAllOpen, setSetAllOpen] = useState(false)


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

  useEffect(() => {
    let cancelled = false
    fetch('/api/intelligence/models')
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data) => {
        if (!cancelled) {
          setAvailableModels(data.models ?? [])
          setAvailableAgents(data.agents ?? [])
        }
      })
      .catch((err) => console.warn('[AnalysisStrip] Failed to fetch models:', err))
    return () => { cancelled = true }
  }, [])

  const toggleAgent = (agentId: string) => {
    setSelectedAgents((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]
    )
  }

  const allAgentKeys = useMemo(() => {
    const keys = availableAgents.map((a) => a.id)
    if (!keys.includes('discovery')) keys.push('discovery')
    return keys
  }, [availableAgents])

  const getAgentModel = useCallback((agentId: string) => {
    return (agentModelMap ?? {})[agentId] || DEFAULT_MODEL
  }, [agentModelMap])

  const setAgentModel = useCallback((agentId: string, modelId: string) => {
    onAgentModelMapChange?.({ ...(agentModelMap ?? {}), [agentId]: modelId })
  }, [agentModelMap, onAgentModelMapChange])

  const setAllModels = useCallback((modelId: string) => {
    const newMap: Record<string, string> = {}
    for (const key of allAgentKeys) {
      newMap[key] = modelId
    }
    onAgentModelMapChange?.(newMap)
    setSetAllOpen(false)
  }, [allAgentKeys, onAgentModelMapChange])

  const handleAnalyze = () => {
    if (!loading) {
      const activeAgents = selectedAgents.length > 0 ? selectedAgents : availableAgents.map((a) => a.id)
      const modelMap: Record<string, string> = {}
      for (const id of activeAgents) {
        modelMap[id] = getAgentModel(id)
      }
      analyze(undefined, {
        agentModelMap: modelMap,
        agentIds: selectedAgents.length > 0 ? selectedAgents : undefined,
      }).then(() => {
        onAnalysisComplete?.()
      })
    }
  }


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
          ACTIVITIES ({history.length + projectInfo.discoveryHistory.length})
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
          {history.length === 0 && projectInfo.discoveryHistory.length === 0 ? (
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
          ) : (() => {
            type MergedItem =
              | { kind: 'verdict'; id: string; ts: number; data: VerdictRecord }
              | { kind: 'discovery'; id: string; ts: number; data: DiscoveryHistoryEntry }
            const items: MergedItem[] = [
              ...history.map((v, i): MergedItem => ({ kind: 'verdict', id: v.id ?? `h-${i}`, ts: new Date(v.createdAt).getTime(), data: v })),
              ...projectInfo.discoveryHistory.map((d): MergedItem => ({ kind: 'discovery', id: d.id, ts: new Date(d.completedAt).getTime(), data: d })),
            ]
            items.sort((a, b) => b.ts - a.ts)
            return items.map(item => {
              if (item.kind === 'verdict') {
                return (
                  <ActivityEntry
                    key={item.id}
                    verdict={item.data as VerdictRecord}
                    expanded={expandedActivities.has(item.id)}
                    onToggle={() => toggleActivity(item.id)}
                  />
                )
              }
              return (
                <DiscoveryActivityEntry
                  key={item.id}
                  entry={item.data as DiscoveryHistoryEntry}
                  expanded={expandedActivities.has(item.id)}
                  onToggle={() => toggleActivity(item.id)}
                />
              )
            })
          })()}
        </div>
      ) : (
        /* ── PROJECT INFO TAB ── */
        <ProjectInfoContent symbol={symbol} projectInfo={projectInfo} agentModelMap={agentModelMap} />
      )}

      {/* AI CONFIG — Modal trigger */}
      <div
        style={{
          borderTop: '1px solid var(--color-terminal-border)',
          flexShrink: 0,
          padding: '4px 8px',
        }}
      >
        <button
          onClick={() => setConfigOpen(true)}
          style={{
            width: '100%',
            padding: '3px 6px',
            background: 'transparent',
            border: '1px solid var(--color-terminal-border)',
            borderRadius: '2px',
            color: 'var(--color-terminal-dim)',
            fontSize: '10px',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.5px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            textTransform: 'uppercase',
          }}
        >
          <span>AI CONFIG</span>
          <span style={{ fontSize: '8px' }}>⚙</span>
        </button>
      </div>

      {/* AI CONFIG — Modal overlay */}
      {configOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 20000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.6)',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfigOpen(false)
          }}
        >
          <div
            style={{
              width: '460px',
              maxHeight: '80vh',
              background: 'var(--color-terminal-surface)',
              border: '1px solid var(--color-terminal-border)',
              borderRadius: '4px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Modal header */}
            <div
              style={{
                padding: '10px 14px',
                borderBottom: '1px solid var(--color-terminal-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-terminal-text)',
                  letterSpacing: '0.5px',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                }}
              >
                AI CONFIG
              </span>
              <button
                onClick={() => setConfigOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-terminal-dim)',
                  fontSize: '14px',
                  cursor: 'pointer',
                  padding: '0 2px',
                  fontFamily: 'var(--font-mono)',
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal body — scrollable */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
              {/* SET ALL — Apply one model to all agents */}
              <div style={{ marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px solid var(--color-terminal-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label
                    style={{
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--color-terminal-dim)',
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                    }}
                  >
                    SET ALL AGENTS
                  </label>
                  <button
                    onClick={() => setSetAllOpen(!setAllOpen)}
                    style={{
                      padding: '2px 8px',
                      fontSize: '9px',
                      fontFamily: 'var(--font-mono)',
                      background: 'var(--color-terminal-blue)',
                      color: 'var(--color-terminal-bg)',
                      border: 'none',
                      borderRadius: '2px',
                      cursor: 'pointer',
                      letterSpacing: '0.3px',
                      textTransform: 'uppercase',
                    }}
                  >
                    SET ALL
                  </button>
                </div>
                {setAllOpen && (
                  <ModelDropdown
                    value=""
                    onChange={(modelId) => setAllModels(modelId)}
                    models={availableModels}
                  />
                )}
              </div>

              {/* Per-agent model selectors */}
              {availableAgents.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {availableAgents.map((agent) => {
                    const isSelected = selectedAgents.length === 0 || selectedAgents.includes(agent.id)
                    return (
                      <div key={agent.id} style={{ opacity: isSelected ? 1 : 0.5 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                          <button
                            onClick={() => toggleAgent(agent.id)}
                            title={agent.description}
                            style={{
                              padding: '2px 6px',
                              fontSize: '9px',
                              fontFamily: 'var(--font-mono)',
                              border: '1px solid ' + (selectedAgents.includes(agent.id) || selectedAgents.length === 0 ? 'var(--color-terminal-blue)' : 'var(--color-terminal-border)'),
                              borderRadius: '2px',
                              background: selectedAgents.includes(agent.id) || selectedAgents.length === 0 ? 'rgba(68, 136, 255, 0.15)' : 'var(--color-terminal-bg)',
                              color: selectedAgents.includes(agent.id) || selectedAgents.length === 0 ? 'var(--color-terminal-blue)' : 'var(--color-terminal-muted)',
                              cursor: 'pointer',
                              letterSpacing: '0.3px',
                              textTransform: 'uppercase',
                              lineHeight: '1.3',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {agent.name}
                          </button>
                          <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--color-terminal-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                            {getAgentModel(agent.id).split('/').pop()}
                          </span>
                        </div>
                        <ModelDropdown
                          value={getAgentModel(agent.id)}
                          onChange={(modelId) => setAgentModel(agent.id, modelId)}
                          models={availableModels}
                        />
                      </div>
                    )
                  })}

                  {/* Discovery agent model */}
                  <div style={{ paddingTop: '6px', borderTop: '1px solid var(--color-terminal-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                      <span
                        style={{
                          padding: '2px 6px',
                          fontSize: '9px',
                          fontFamily: 'var(--font-mono)',
                          border: '1px solid var(--color-terminal-amber)',
                          borderRadius: '2px',
                          background: 'rgba(255, 170, 0, 0.1)',
                          color: 'var(--color-terminal-amber)',
                          letterSpacing: '0.3px',
                          textTransform: 'uppercase',
                          lineHeight: '1.3',
                        }}
                      >
                        DISCOVERY
                      </span>
                      <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--color-terminal-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {getAgentModel('discovery').split('/').pop()}
                      </span>
                    </div>
                    <ModelDropdown
                      value={getAgentModel('discovery')}
                      onChange={(modelId) => setAgentModel('discovery', modelId)}
                      models={availableModels}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div
              style={{
                padding: '8px 14px',
                borderTop: '1px solid var(--color-terminal-border)',
                display: 'flex',
                justifyContent: 'flex-end',
                flexShrink: 0,
              }}
            >
              <button
                onClick={() => setConfigOpen(false)}
                style={{
                  padding: '4px 16px',
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  background: 'var(--color-terminal-blue)',
                  color: 'var(--color-terminal-bg)',
                  border: 'none',
                  borderRadius: '2px',
                  cursor: 'pointer',
                  letterSpacing: '0.3px',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                }}
              >
                DONE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ANALYZE button */}
      <div
        style={{
          padding: '6px 8px',
          borderTop: '1px solid var(--color-terminal-border)',
          flexShrink: 0,
        }}
      >
        <button
          onClick={handleAnalyze}
          disabled={loading}
          style={{
            width: '100%',
            padding: '5px 0',
            background: loading
              ? 'var(--color-terminal-border)'
              : 'var(--color-terminal-blue)',
            color: loading
              ? 'var(--color-terminal-dim)'
              : 'var(--color-terminal-bg)',
            border: 'none',
            borderRadius: '2px',
            fontSize: '12px',
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
            letterSpacing: '0.5px',
            cursor: loading ? 'not-allowed' : 'pointer',
            textTransform: 'uppercase',
            opacity: loading ? 0.7 : 1,
            transition: 'opacity 0.15s ease',
          }}
        >
          {loading ? 'ANALYZING...' : 'ANALYZE'}
        </button>
      </div>

      {/* ── Discovery Dialog (fullscreen) ── */}
      <DiscoveryDialog
        open={projectInfo.discoveryDialogOpen}
        onClose={() => projectInfo.setDiscoveryDialogOpen(false)}
        discovering={projectInfo.discovering}
        discoveryElapsed={projectInfo.discoveryElapsed}
        discoveryLogs={projectInfo.discoveryLogs}
        rawOutput={projectInfo.discoveryRawOutput}
        symbol={symbol.replace(/USDT$|BUSD$|USD$/i, '').toUpperCase()}
      />
    </div>
  )
}
