'use client'

import { Suspense, useState, useMemo, useCallback, useEffect, useRef, useId } from 'react'
import { useClassification } from '@/hooks/useClassification'
import type { ClassificationHistoryEntry } from '@/hooks/useClassification'
import { ClassificationDialog } from '@/components/terminal/ClassificationDialog'
import { useMarketCoins } from '@/hooks/useMarketCoins'
import { useTrackedAssets } from '@/hooks/useTrackedAssets'
import {
  CATEGORY_NAMES,
  CRACK_NAMES,
  type ClassificationCategory,
  type CrackId,
  type CategoryWeight,
  type ClassificationResult,
  type SubAgentResult,
  type AgentType,
  type CategoryMigration,
} from '@/lib/intelligence/classification'

/* ═══════════════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════════════ */

/** Category colors — mapped to terminal theme + extensions */
const CATEGORY_COLORS: Record<ClassificationCategory, string> = {
  1: '#00ff88', // Crack Expander — green (expansion, growth)
  2: '#4488ff', // Infrastructure of Disappearance — blue (foundational)
  3: '#aa66ff', // Mirror Builder — purple (reflection, duality)
  4: '#ffaa00', // Narrative Vessel — amber (caution, narrative)
  5: '#ff3b3b', // Ego Builder — red (warning, centralizing)
  6: '#00ddcc', // Consciousness Seed — cyan (potential)
}

const CATEGORY_SHORT: Record<ClassificationCategory, string> = {
  1: 'CRACK EXP',
  2: 'INFRA',
  3: 'MIRROR',
  4: 'NARRATIVE',
  5: 'EGO',
  6: 'SEED',
}

const AGENT_LABELS: Record<string, string> = {
  crack_mapping: 'CRACK MAPPING',
  visibility: 'VISIBILITY',
  narrative_separator: 'NARRATIVE SEP',
  power_vector: 'POWER VECTOR',
  problem_recognition: 'PROBLEM REC',
  identity_polarity: 'IDENTITY POL',
  synthesizer: 'SYNTHESIZER',
}

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function formatElapsed(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

function formatPrice(value: number | null | undefined): string {
  if (value == null) return '—'
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatMarketCap(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}t`
  if (value >= 1e9) return `$${Math.round(value / 1e9)}b`
  if (value >= 1e6) return `$${Math.round(value / 1e6)}m`
  return `$${value}`
}

/* ═══════════════════════════════════════════════════════════════════════════
   PPI RADAR SCOPE — The centerpiece

   A rotating Plan Position Indicator (PPI) radar display.
   6 category axes radiating from center. Blips at distance = weight.
   Rotating sweep line with green afterglow. Concentric range rings.
   ═══════════════════════════════════════════════════════════════════════════ */

function RadarScope({
  weights,
  active,
  size = 320,
}: {
  weights: CategoryWeight[]
  active: boolean // true = sweep animates (classifying or has data)
  size?: number
}) {
  const uid = useId()
  const sweepId = `sweepGrad-${uid}`
  const blipId = `blipGlow-${uid}`
  const gridId = `gridGlow-${uid}`
  const cx = size / 2
  const cy = size / 2
  const maxR = size / 2 - 30 // leave room for labels

  // Build weight map — default to 0 for missing categories
  const weightMap = useMemo(() => {
    const m: Record<ClassificationCategory, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }
    for (const w of weights) {
      m[w.category] = w.weight
    }
    return m
  }, [weights])

  // 6 axes — evenly spaced, starting from top (-90°)
  const categories: ClassificationCategory[] = [1, 2, 3, 4, 5, 6]
  const angleStep = (Math.PI * 2) / 6

  const getPoint = (cat: ClassificationCategory) => {
    const idx = cat - 1
    const angle = -Math.PI / 2 + idx * angleStep
    const r = weightMap[cat] * maxR
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      labelX: cx + (maxR + 18) * Math.cos(angle),
      labelY: cy + (maxR + 18) * Math.sin(angle),
      angle,
      weight: weightMap[cat],
    }
  }

  const points = categories.map(getPoint)
  const polygonPoints = points.map(p => `${p.x},${p.y}`).join(' ')
  const hasData = weights.length > 0

  // Range rings
  const rings = [0.25, 0.5, 0.75, 1.0]

  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          {/* Sweep gradient — fading trail */}
          <linearGradient id={sweepId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#00ff88" stopOpacity="0" />
            <stop offset="70%" stopColor="#00ff88" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#00ff88" stopOpacity="0.3" />
          </linearGradient>
          {/* Glow filter for blips */}
          <filter id={blipId}>
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Radar grid glow */}
          <filter id={gridId}>
            <feGaussianBlur stdDeviation="1" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background circle — scope border */}
        <circle cx={cx} cy={cy} r={maxR + 2} fill="none" stroke="#1a3a2a" strokeWidth="1.5" />

        {/* Range rings */}
        {rings.map((r) => (
          <circle
            key={r}
            cx={cx}
            cy={cy}
            r={r * maxR}
            fill="none"
            stroke="#1a3a2a"
            strokeWidth="0.5"
            strokeDasharray={r < 1 ? '2,4' : 'none'}
          />
        ))}

        {/* Axis lines — from center to edge */}
        {categories.map((cat) => {
          const idx = cat - 1
          const angle = -Math.PI / 2 + idx * angleStep
          const ex = cx + maxR * Math.cos(angle)
          const ey = cy + maxR * Math.sin(angle)
          return (
            <line
              key={cat}
              x1={cx}
              y1={cy}
              x2={ex}
              y2={ey}
              stroke="#1a3a2a"
              strokeWidth="0.5"
            />
          )
        })}

        {/* Rotating sweep line */}
        {active && (
          <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: 'radarSweep 4s linear infinite' }}>
            {/* Sweep cone — wedge behind the line */}
            <path
              d={`M ${cx} ${cy} L ${cx} ${cy - maxR} A ${maxR} ${maxR} 0 0 0 ${cx - maxR * Math.sin(Math.PI / 6)} ${cy - maxR * Math.cos(Math.PI / 6)} Z`}
              fill={`url(#${sweepId})`}
              opacity={0.6}
            />
            {/* Sweep line */}
            <line
              x1={cx}
              y1={cy}
              x2={cx}
              y2={cy - maxR}
              stroke="#00ff88"
              strokeWidth="1"
              opacity={0.7}
              filter={`url(#${gridId})`}
            />
          </g>
        )}

        {/* Filled polygon — consciousness profile */}
        {hasData && (
          <polygon
            points={polygonPoints}
            fill="#00ff8810"
            stroke="#00ff88"
            strokeWidth="1"
            opacity={0.6}
            filter={`url(#${gridId})`}
          />
        )}

        {/* Blips — category data points */}
        {hasData && points.map((p, i) => {
          const cat = categories[i]
          const color = CATEGORY_COLORS[cat]
          const r = p.weight > 0.5 ? 5 : p.weight > 0.2 ? 4 : 3
          return (
            <g key={cat}>
              <circle
                cx={p.x}
                cy={p.y}
                r={r}
                fill={color}
                filter={`url(#${blipId})`}
                opacity={p.weight > 0 ? 0.9 : 0.2}
              />
              {/* Weight label near blip */}
              {p.weight > 0 && (
                <text
                  x={p.x + (p.x > cx ? 10 : -10)}
                  y={p.y + 3}
                  textAnchor={p.x > cx ? 'start' : 'end'}
                  fill={color}
                  fontSize="9"
                  fontFamily="var(--font-mono)"
                  opacity={0.8}
                >
                  {(p.weight * 100).toFixed(0)}
                </text>
              )}
            </g>
          )
        })}

        {/* Center dot */}
        <circle cx={cx} cy={cy} r="2" fill="#00ff88" opacity={0.5} />

        {/* Category labels at outer edge */}
        {categories.map((cat) => {
          const p = getPoint(cat)
          const color = CATEGORY_COLORS[cat]
          return (
            <text
              key={cat}
              x={p.labelX}
              y={p.labelY + 3}
              textAnchor="middle"
              fill={color}
              fontSize="8"
              fontFamily="var(--font-mono)"
              letterSpacing="0.08em"
              opacity={0.7}
            >
              {CATEGORY_SHORT[cat]}
            </text>
          )
        })}

        {/* Scale labels */}
        {rings.map((r) => (
          <text
            key={r}
            x={cx + 4}
            y={cy - r * maxR + 10}
            fill="#1a3a2a"
            fontSize="7"
            fontFamily="var(--font-mono)"
          >
            {(r * 100).toFixed(0)}
          </text>
        ))}
      </svg>

      {/* CSS animations */}
      <style>{`
        @keyframes radarSweep {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   PRIMARY CLASSIFICATION BADGE
   ═══════════════════════════════════════════════════════════════════════════ */

function PrimaryBadge({ category, weight }: { category: ClassificationCategory; weight: number }) {
  const color = CATEGORY_COLORS[category]
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '12px 16px',
      background: `${color}08`,
      border: `1px solid ${color}33`,
      fontFamily: 'var(--font-mono)',
    }}>
      <span style={{
        width: '10px',
        height: '10px',
        borderRadius: '50%',
        background: color,
        boxShadow: `0 0 8px ${color}66`,
        flexShrink: 0,
      }} />
      <div style={{ flex: 1 }}>
        <div style={{ color, fontSize: '13px', fontWeight: 'bold', letterSpacing: '0.1em' }}>
          CAT {category} — {CATEGORY_NAMES[category].toUpperCase()}
        </div>
        <div style={{ color: 'var(--color-terminal-dim)', fontSize: '10px', marginTop: '2px' }}>
          PRIMARY CLASSIFICATION
        </div>
      </div>
      <span style={{ color, fontSize: '20px', fontWeight: 'bold' }}>
        {(weight * 100).toFixed(0)}%
      </span>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   CRACK ALIGNMENT BARS
   ═══════════════════════════════════════════════════════════════════════════ */

function CrackBars({ crackIds, resonance }: {
  crackIds: CrackId[]
  resonance: Partial<Record<CrackId, number>>
}) {
  const allCracks: CrackId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9]
  return (
    <div>
      {allCracks.map((id) => {
        const isAligned = crackIds.includes(id)
        const strength = resonance[id] ?? 0
        const barColor = isAligned ? '#00ff88' : 'var(--color-terminal-border)'
        const textColor = isAligned ? 'var(--color-terminal-text)' : 'var(--color-terminal-dim)'
        return (
          <div
            key={id}
            style={{
              display: 'grid',
              gridTemplateColumns: '180px 1fr 40px',
              alignItems: 'center',
              gap: '8px',
              padding: '3px 0',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <span style={{ color: textColor, fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {CRACK_NAMES[id]}
            </span>
            <div style={{ height: '3px', background: 'var(--color-terminal-border)', borderRadius: '1.5px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${strength * 100}%`,
                background: barColor,
                borderRadius: '1.5px',
                transition: 'width 0.5s ease',
                boxShadow: isAligned ? `0 0 4px ${barColor}44` : 'none',
              }} />
            </div>
            <span style={{ color: isAligned ? '#00ff88' : 'var(--color-terminal-dim)', fontSize: '10px', textAlign: 'right' }}>
              {strength > 0 ? (strength * 100).toFixed(0) : '—'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   SUB-AGENT CARDS
   ═══════════════════════════════════════════════════════════════════════════ */

function SubAgentCard({ agentType, agent, expanded, onToggle }: {
  agentType: string
  agent: SubAgentResult
  expanded: boolean
  onToggle: () => void
}) {
  const isOk = agent.status === 'completed'
  const statusColor = isOk ? 'var(--color-terminal-up)' : 'var(--color-terminal-down)'

  return (
    <div style={{
      border: '1px solid var(--color-terminal-border)',
      background: 'var(--color-terminal-surface)',
      marginBottom: '2px',
    }}>
      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 10px',
          cursor: 'pointer',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
          ▶
        </span>
        <span style={{ color: 'var(--color-terminal-text)', fontSize: '11px', fontWeight: 'bold', letterSpacing: '0.08em', flex: 1 }}>
          {AGENT_LABELS[agentType] ?? agentType.toUpperCase()}
        </span>
        <span style={{ color: statusColor, fontSize: '9px' }}>
          {isOk ? '✓' : '✕'}
        </span>
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '9px' }}>
          {formatDuration(agent.durationMs)}
        </span>
      </div>

      {expanded && !!agent.result && (
        <div style={{
          padding: '8px 10px 10px 26px',
          borderTop: '1px solid var(--color-terminal-border)',
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          lineHeight: 1.6,
          color: 'var(--color-terminal-muted)',
        }}>
          <AgentResultContent agentType={agentType} result={agent.result as Record<string, unknown>} />
          {agent.urlsFetched.length > 0 && (
            <div style={{ marginTop: '6px', color: 'var(--color-terminal-dim)', fontSize: '9px' }}>
              SOURCES: {agent.urlsFetched.length} URLs fetched • {agent.toolCallCount} tool calls
            </div>
          )}
        </div>
      )}

      {expanded && agent.error && (
        <div style={{
          padding: '8px 10px 10px 26px',
          borderTop: '1px solid var(--color-terminal-border)',
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          color: 'var(--color-terminal-down)',
        }}>
          {agent.error}
        </div>
      )}
    </div>
  )
}

/** Render agent-specific result fields */
function AgentResultContent({ agentType, result }: { agentType: string; result: Record<string, unknown> }) {
  const entries = Object.entries(result).filter(([k]) => k !== 'reasoning' && k !== 'evidence')
  const reasoning = result.reasoning as string | undefined
  const evidence = result.evidence as string[] | undefined

  return (
    <>
      {entries.map(([key, val]) => (
        <div key={key} style={{ marginBottom: '3px' }}>
          <span style={{ color: 'var(--color-terminal-dim)', fontSize: '9px', letterSpacing: '0.08em' }}>
            {key.replace(/_/g, ' ').toUpperCase()}:
          </span>{' '}
          <span style={{ color: 'var(--color-terminal-text)' }}>
            {typeof val === 'number' ? (val <= 1 && val >= 0 ? `${(val * 100).toFixed(0)}%` : String(val))
              : typeof val === 'string' ? val
              : Array.isArray(val) ? (val.every(v => typeof v === 'object' && v !== null) ? JSON.stringify(val, null, 2) : val.join(', '))
              : String(val)}
          </span>
        </div>
      ))}
      {reasoning && (
        <div style={{ marginTop: '6px', color: 'var(--color-terminal-muted)', fontStyle: 'italic', fontSize: '10px' }}>
          {reasoning}
        </div>
      )}
      {evidence && evidence.length > 0 && (
        <div style={{ marginTop: '4px' }}>
          <span style={{ color: 'var(--color-terminal-dim)', fontSize: '9px' }}>EVIDENCE:</span>
          {evidence.map((e, i) => (
            <div key={i} style={{ color: 'var(--color-terminal-dim)', fontSize: '10px', paddingLeft: '8px' }}>
              • {e}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION HEADER
   ═══════════════════════════════════════════════════════════════════════════ */

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div style={{
      padding: '8px 0 4px',
      fontSize: '9px',
      letterSpacing: '0.15em',
      color: 'var(--color-terminal-dim)',
      fontFamily: 'var(--font-mono)',
      borderBottom: '1px solid var(--color-terminal-border)',
      marginBottom: '6px',
      marginTop: '16px',
    }}>
      ■ {title}{count != null ? ` (${count})` : ''}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   LIVE CLASSIFICATION VIEW — shown when agents are running
   ═══════════════════════════════════════════════════════════════════════════ */

function LiveClassificationView({
  elapsed,
  logs,
  onOpenDialog,
  onCancel,
}: {
  elapsed: number
  logs: string[]
  onOpenDialog: () => void
  onCancel: () => void
}) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      {/* Radar scope — sweeping, no data */}
      <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <RadarScope weights={[]} active={true} size={260} />
      </div>

      {/* Status bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '8px 16px',
        borderTop: '1px solid var(--color-terminal-border)',
        borderBottom: '1px solid var(--color-terminal-border)',
        background: 'var(--color-terminal-panel)',
        fontFamily: 'var(--font-mono)',
      }}>
        <span style={{ color: 'var(--color-terminal-amber)', fontSize: '12px', fontWeight: 'bold', letterSpacing: '0.1em', animation: 'clf-blink 1.5s infinite' }}>
          ◉ CLASSIFYING
        </span>
        <span style={{ color: 'var(--color-terminal-muted)', fontSize: '11px' }}>
          {formatElapsed(elapsed)}
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={onOpenDialog}
          style={{
            background: 'transparent',
            border: '1px solid var(--color-terminal-border)',
            color: 'var(--color-terminal-blue)',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            cursor: 'pointer',
            padding: '2px 8px',
          }}
        >
          FULL SCREEN ⊞
        </button>
        <button
          onClick={onCancel}
          style={{
            background: 'transparent',
            border: '1px solid var(--color-terminal-down)44',
            color: 'var(--color-terminal-down)',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            cursor: 'pointer',
            padding: '2px 8px',
          }}
        >
          ✕ CANCEL
        </button>
      </div>

      {/* Live logs */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 16px', minHeight: 0 }}>
        {logs.length === 0 ? (
          <span style={{ color: 'var(--color-terminal-dim)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
            Initializing classification agents...
          </span>
        ) : (
          logs.map((log, i) => (
            <div key={i} style={{
              color: 'var(--color-terminal-muted)',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              lineHeight: 1.6,
              borderLeft: '2px solid var(--color-terminal-border)',
              paddingLeft: '10px',
              marginBottom: '1px',
            }}>
              <span style={{ color: 'var(--color-terminal-dim)', marginRight: '8px', fontSize: '9px' }}>
                {String(i + 1).padStart(3, '0')}
              </span>
              {log}
            </div>
          ))
        )}
      </div>

      <style>{`
        @keyframes clf-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   RAW RESONANCE PANEL — collapsible raw LLM output per agent
   ═══════════════════════════════════════════════════════════════════════════ */

function RawResonancePanel({ agentType, rawOutput, expanded, onToggle }: {
  agentType: string
  rawOutput: string
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <div style={{
      border: '1px solid var(--color-terminal-border)',
      background: 'var(--color-terminal-surface)',
      marginBottom: '2px',
    }}>
      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 10px',
          cursor: 'pointer',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
          ▶
        </span>
        <span style={{ color: 'var(--color-terminal-purple)', fontSize: '11px', fontWeight: 'bold', letterSpacing: '0.08em', flex: 1 }}>
          {AGENT_LABELS[agentType] ?? agentType.toUpperCase()}
        </span>
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '9px' }}>
          {rawOutput.length.toLocaleString()} chars
        </span>
      </div>

      {expanded && (
        <div style={{
          borderTop: '1px solid var(--color-terminal-border)',
          maxHeight: '400px',
          overflowY: 'auto',
        }}>
          <pre style={{
            margin: 0,
            padding: '10px 12px',
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            lineHeight: 1.6,
            color: 'var(--color-terminal-muted)',
            background: 'var(--color-terminal-bg)',
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
          }}>
            {rawOutput}
          </pre>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   RESULT VIEW — shown when classification is complete
   ═══════════════════════════════════════════════════════════════════════════ */

function ResultView({
  result,
  subAgentResults,
}: {
  result: ClassificationResult
  subAgentResults: Record<string, SubAgentResult> | null
}) {
  // Get crack mapping resonance data
  const crackResonance: Partial<Record<CrackId, number>> = useMemo(() => {
    if (!subAgentResults?.crack_mapping?.result) return {}
    const r = subAgentResults.crack_mapping.result as unknown as Record<string, unknown>
    return (r.resonance_strength ?? {}) as Partial<Record<CrackId, number>>
  }, [subAgentResults])

  const primaryWeight = result.categories.find(c => c.category === result.primary_category)?.weight ?? 0

  return (
    <div style={{ padding: '16px' }}>
      {/* Radar scope with data */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
        <RadarScope weights={result.categories} active={true} size={280} />
      </div>

      {/* Primary classification badge */}
      <PrimaryBadge category={result.primary_category} weight={primaryWeight} />

      {/* Crack alignment */}
      <SectionHeader title="CRACK ALIGNMENT" count={result.crack_alignment.length} />
      <CrackBars crackIds={result.crack_alignment} resonance={crackResonance} />



      {/* Philosophical assessment */}
      {result.overall_assessment && (
        <>
          <SectionHeader title="PHILOSOPHICAL ASSESSMENT" />
          <div style={{
            color: 'var(--color-terminal-muted)',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            lineHeight: 1.7,
            padding: '4px 0',
          }}>
            {result.overall_assessment}
          </div>
        </>
      )}

      {/* Consciousness contribution */}
      {result.consciousness_contribution && (
        <>
          <SectionHeader title="CONSCIOUSNESS CONTRIBUTION" />
          <div style={{
            color: 'var(--color-terminal-muted)',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            lineHeight: 1.7,
            padding: '4px 0',
          }}>
            {result.consciousness_contribution}
          </div>
        </>
      )}

      {/* Migration prediction */}
      {result.migration_prediction && (
        <>
          <SectionHeader title="MIGRATION PREDICTION" />
          <div style={{
            color: 'var(--color-terminal-muted)',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            lineHeight: 1.7,
            padding: '4px 0',
          }}>
            {result.migration_prediction}
          </div>
        </>
      )}

      {/* Archetype alignment */}
      {result.archetype_alignment && (
        <>
          <SectionHeader title="ARCHETYPE ALIGNMENT" />
          <div style={{
            color: 'var(--color-terminal-purple)',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            lineHeight: 1.7,
            padding: '4px 0',
          }}>
            {result.archetype_alignment}
          </div>
        </>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   EMPTY STATE — no result, not classifying
   ═══════════════════════════════════════════════════════════════════════════ */

function EmptyState({ symbol, onClassify, error }: { symbol: string; onClassify: () => void; error?: string | null }) {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '16px',
      color: 'var(--color-terminal-dim)',
      fontFamily: 'var(--font-mono)',
    }}>
      {/* Dormant radar */}
      <RadarScope weights={[]} active={false} size={220} />
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '12px', letterSpacing: '0.1em', marginBottom: '4px' }}>
          NO CLASSIFICATION FOR {symbol}
        </div>
        <div style={{ fontSize: '10px' }}>
          Run ▶ CLASSIFY to scan this project&apos;s consciousness
        </div>
        <button
          onClick={onClassify}
          style={{
            background: 'transparent',
            border: '1px solid var(--color-terminal-up)',
            color: 'var(--color-terminal-up)',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            letterSpacing: '0.1em',
            padding: '8px 20px',
            cursor: 'pointer',
            transition: 'all 0.15s',
            textTransform: 'uppercase',
            marginTop: '8px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(0,255,136,0.08)'
            e.currentTarget.style.borderColor = '#00ff88'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.borderColor = 'var(--color-terminal-up)'
          }}
        >
          ▸ RUN CLASSIFICATION
        </button>
        {error && (
          <div style={{
            marginTop: '8px',
            fontSize: '10px',
            color: 'var(--color-terminal-down)',
            maxWidth: '320px',
            wordBreak: 'break-word',
          }}>
            ERR: {error}
          </div>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   CLASSIFICATION HISTORY — timeline of past classification snapshots
   ═══════════════════════════════════════════════════════════════════════════ */

function ClassificationHistory({
  history,
  migrations,
}: {
  history: ClassificationHistoryEntry[]
  migrations: CategoryMigration[]
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  return (
    <>
      <SectionHeader title="CLASSIFICATION HISTORY" count={history.length} />

      {/* Migration alerts */}
      {migrations.length > 0 && (
        <div style={{ marginBottom: '8px' }}>
          {migrations.map((m, i) => (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 8px',
              marginBottom: '3px',
              background: 'rgba(255,170,0,0.06)',
              border: '1px solid rgba(255,170,0,0.15)',
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
            }}>
              <span style={{ color: 'var(--color-terminal-amber)', fontWeight: 'bold' }}>⚡ MIGRATION</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ color: CATEGORY_COLORS[m.from_primary] }}>CAT {m.from_primary}</span>
                <span style={{ color: 'var(--color-terminal-dim)' }}>→</span>
                <span style={{ color: CATEGORY_COLORS[m.to_primary] }}>CAT {m.to_primary}</span>
              </span>
              <span style={{ color: 'var(--color-terminal-dim)', marginLeft: 'auto', fontSize: '9px' }}>
                {timeAgo(m.detected_at)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* History table */}
      <div style={{
        border: '1px solid var(--color-terminal-border)',
        fontFamily: 'var(--font-mono)',
        fontSize: '10px',
      }}>
        {/* Header row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '56px 1fr 1fr 80px 24px',
          gap: '0',
          padding: '5px 8px',
          background: 'var(--color-terminal-panel)',
          borderBottom: '1px solid var(--color-terminal-border)',
          color: 'var(--color-terminal-dim)',
          letterSpacing: '0.08em',
          fontSize: '9px',
        }}>
          <span>#</span>
          <span>CATEGORY</span>
          <span>MODEL</span>
          <span>WHEN</span>
          <span></span>
        </div>

        {history.map((entry, idx) => {
          const isExpanded = expandedIdx === idx
          const catColor = CATEGORY_COLORS[entry.primaryCategory]
          const prevEntry = idx < history.length - 1 ? history[idx + 1] : null
          const migrated = prevEntry && prevEntry.primaryCategory !== entry.primaryCategory

          return (
            <div key={entry.id}>
              {/* Row */}
              <div
                onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '56px 1fr 1fr 80px 24px',
                  gap: '0',
                  padding: '5px 8px',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--color-terminal-border)',
                  background: isExpanded ? 'rgba(255,255,255,0.02)' : 'transparent',
                  transition: 'background 0.15s',
                }}
              >
                <span style={{ color: 'var(--color-terminal-dim)' }}>
                  {String(history.length - idx).padStart(3, '0')}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{
                    width: '5px',
                    height: '5px',
                    borderRadius: '50%',
                    background: catColor,
                    display: 'inline-block',
                    flexShrink: 0,
                  }} />
                  <span style={{ color: catColor }}>
                    CAT {entry.primaryCategory} — {CATEGORY_SHORT[entry.primaryCategory]}
                  </span>
                  {migrated && (
                    <span style={{ color: 'var(--color-terminal-amber)', fontSize: '9px' }}>⚡</span>
                  )}
                </span>
                <span style={{ color: 'var(--color-terminal-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.modelId.replace('github-copilot/', '')}
                </span>
                <span style={{ color: 'var(--color-terminal-dim)' }}>
                  {timeAgo(entry.classifiedAt)}
                </span>
                <span style={{ color: 'var(--color-terminal-dim)', textAlign: 'right' }}>
                  {isExpanded ? '▾' : '▸'}
                </span>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{
                  padding: '8px 12px 10px',
                  borderBottom: '1px solid var(--color-terminal-border)',
                  background: 'rgba(0,0,0,0.15)',
                }}>
                  {/* Category weights mini-bar */}
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ color: 'var(--color-terminal-dim)', fontSize: '9px', letterSpacing: '0.08em', marginBottom: '4px' }}>
                      CATEGORY WEIGHTS
                    </div>
                    {entry.categoryWeights
                      .slice()
                      .sort((a, b) => b.weight - a.weight)
                      .map(cw => (
                        <div key={cw.category} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                          <span style={{ width: '70px', color: CATEGORY_COLORS[cw.category], fontSize: '9px' }}>
                            CAT {cw.category} {CATEGORY_SHORT[cw.category]}
                          </span>
                          <div style={{
                            flex: 1,
                            height: '4px',
                            background: 'var(--color-terminal-border)',
                            borderRadius: '2px',
                            overflow: 'hidden',
                          }}>
                            <div style={{
                              width: `${(cw.weight * 100).toFixed(0)}%`,
                              height: '100%',
                              background: CATEGORY_COLORS[cw.category],
                              borderRadius: '2px',
                              opacity: 0.7,
                            }} />
                          </div>
                          <span style={{ width: '32px', textAlign: 'right', color: 'var(--color-terminal-muted)', fontSize: '9px' }}>
                            {(cw.weight * 100).toFixed(0)}%
                          </span>
                        </div>
                      ))}
                  </div>

                  {/* Crack alignment */}
                  {entry.crackAlignment.length > 0 && (
                    <div>
                      <div style={{ color: 'var(--color-terminal-dim)', fontSize: '9px', letterSpacing: '0.08em', marginBottom: '3px' }}>
                        CRACK ALIGNMENT
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {entry.crackAlignment.map(c => (
                          <span key={c} style={{
                            padding: '1px 6px',
                            background: 'rgba(0,255,136,0.06)',
                            border: '1px solid rgba(0,255,136,0.15)',
                            color: '#00ff88',
                            fontSize: '9px',
                            letterSpacing: '0.05em',
                          }}>
                            {CRACK_NAMES[c] ?? c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Assessment excerpt */}
                  {entry.classification?.overall_assessment && (
                    <div style={{ marginTop: '8px' }}>
                      <div style={{ color: 'var(--color-terminal-dim)', fontSize: '9px', letterSpacing: '0.08em', marginBottom: '3px' }}>
                        ASSESSMENT
                      </div>
                      <div style={{
                        color: 'var(--color-terminal-muted)',
                        fontSize: '10px',
                        lineHeight: 1.6,
                        maxHeight: '80px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        {entry.classification.overall_assessment}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   DEEP DATA SECTION — grouped verbose/raw data below the main classification
   Sub-Agents • Raw Resonance • Raw Output • Classification History
   ═══════════════════════════════════════════════════════════════════════════ */

function DeepDataSection({
  subAgentResults,
  history,
  migrations,
}: {
  subAgentResults: Record<string, SubAgentResult> | null
  history: ClassificationHistoryEntry[]
  migrations: CategoryMigration[]
}) {
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set())
  const [expandedResonance, setExpandedResonance] = useState<Set<string>>(new Set())

  const toggleAgent = (key: string) => {
    setExpandedAgents(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleResonance = (key: string) => {
    setExpandedResonance(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Collect raw resonance entries (agents with rawOutput)
  const rawResonanceEntries = useMemo(() => {
    if (!subAgentResults) return []
    return Object.entries(subAgentResults)
      .filter(([, agent]) => (agent as SubAgentResult).rawOutput)
      .map(([key, agent]) => ({ key, rawOutput: (agent as SubAgentResult).rawOutput! }))
  }, [subAgentResults])

  const hasSubAgents = subAgentResults && Object.keys(subAgentResults).length > 0
  const hasResonance = rawResonanceEntries.length > 0
  const hasHistory = history.length > 0

  if (!hasSubAgents && !hasResonance && !hasHistory) return null

  return (
    <div style={{ padding: '0 16px 16px' }}>
      {/* ── Section Divider ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        margin: '8px 0 12px',
        fontFamily: 'var(--font-mono)',
      }}>
        <div style={{ flex: 1, height: '1px', background: 'var(--color-terminal-border)' }} />
        <span style={{
          fontSize: '9px',
          letterSpacing: '0.15em',
          color: 'var(--color-terminal-dim)',
          whiteSpace: 'nowrap',
        }}>
          ◈ DEEP DATA
        </span>
        <div style={{ flex: 1, height: '1px', background: 'var(--color-terminal-border)' }} />
      </div>

      {/* ── Sub-Agents (parsed results) ── */}
      {hasSubAgents && (
        <>
          <SectionHeader title="SUB-AGENTS" count={Object.keys(subAgentResults!).length} />
          {Object.entries(subAgentResults!).map(([key, agent]) => (
            <SubAgentCard
              key={key}
              agentType={key}
              agent={agent as SubAgentResult}
              expanded={expandedAgents.has(key)}
              onToggle={() => toggleAgent(key)}
            />
          ))}
        </>
      )}

      {/* ── Raw Resonance (raw LLM output per agent) ── */}
      {hasResonance && (
        <>
          <SectionHeader title="RAW RESONANCE" count={rawResonanceEntries.length} />
          {rawResonanceEntries.map(({ key, rawOutput }) => (
            <RawResonancePanel
              key={key}
              agentType={key}
              rawOutput={rawOutput}
              expanded={expandedResonance.has(key)}
              onToggle={() => toggleResonance(key)}
            />
          ))}
        </>
      )}

      {/* ── Classification History ── */}
      {hasHistory && (
        <ClassificationHistory history={history} migrations={migrations} />
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   DETAIL PANEL — routes to live/result/empty
   ═══════════════════════════════════════════════════════════════════════════ */

function DetailPanel({
  symbol,
  hook,
  onClassify,
}: {
  symbol: string
  hook: ReturnType<typeof useClassification>
  onClassify: () => void
}) {
  const {
    result,
    subAgentResults,
    classifying,
    classifyElapsed,
    classifyLogs,
    setDialogOpen,
    cancelClassification,
    history,
    migrations,
    error,
  } = hook

  if (classifying) {
    return (
      <LiveClassificationView
        elapsed={classifyElapsed}
        logs={classifyLogs}
        onOpenDialog={() => setDialogOpen(true)}
        onCancel={cancelClassification}
      />
    )
  }

  if (result) {
    return (
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        <ResultView
          result={result}
          subAgentResults={subAgentResults as unknown as Record<string, SubAgentResult> | null}
        />

        {/* ══════ DEEP DATA SECTION ══════ */}
        {(subAgentResults || history.length > 0) && (
          <DeepDataSection
            subAgentResults={subAgentResults as unknown as Record<string, SubAgentResult> | null}
            history={history}
            migrations={migrations}
          />
        )}
      </div>
    )
  }

  /* No result yet — but maybe we have history from past runs */
  if (history.length > 0) {
    return (
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0, padding: '16px' }}>
        <EmptyState symbol={symbol} onClassify={onClassify} error={error} />
        <ClassificationHistory history={history} migrations={migrations} />
      </div>
    )
  }

  return <EmptyState symbol={symbol} onClassify={onClassify} error={error} />
}

/* ═══════════════════════════════════════════════════════════════════════════
   ASSET DETAIL VIEW — full detail page for a single asset
   ═══════════════════════════════════════════════════════════════════════════ */

function AssetDetailView({ symbol, onBack }: { symbol: string; onBack: () => void }) {
  const hook = useClassification(symbol)
  const {
    result, classifying, classifyElapsed, classifyLogs,
    rawOutput, dialogOpen, setDialogOpen, cancelClassification,
  } = hook

  // Read per-agent models from AI config API
  const classifyWithStoredModel = useCallback(async () => {
    const AGENT_KEYS = ['crack_mapping', 'visibility', 'narrative_separator', 'power_vector', 'problem_recognition', 'identity_polarity', 'synthesizer']
    try {
      const res = await fetch('/api/intelligence/models')
      if (res.ok) {
        const data = await res.json()
        const parsed = data.modelMap
        if (parsed && typeof parsed === 'object') {
          const defaultModel: string | undefined = parsed.intelligence || undefined
          const agentModels: Record<string, string> = {}
          for (const key of AGENT_KEYS) {
            const m = parsed[key] || defaultModel
            if (m) agentModels[key] = m
          }
          hook.classify(defaultModel, Object.keys(agentModels).length > 0 ? agentModels : undefined)
          return
        }
      }
    } catch { /* ignore */ }
    hook.classify()
  }, [hook])

  const cat = result?.primary_category
  const catColor = cat ? CATEGORY_COLORS[cat] : 'var(--color-terminal-dim)'
  const primaryWeight = result
    ? result.categories.find(c => c.category === result.primary_category)?.weight ?? 0
    : 0

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      minHeight: 0,
    }}>
      {/* Detail header */}
      <div style={{
        height: '40px',
        minHeight: '40px',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: '10px',
        background: 'var(--color-terminal-panel)',
        borderBottom: '1px solid var(--color-terminal-border)',
        fontFamily: 'var(--font-mono)',
        flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          style={{
            background: 'transparent',
            border: '1px solid var(--color-terminal-border)',
            color: 'var(--color-terminal-muted)',
            fontSize: '10px',
            fontFamily: 'var(--font-mono)',
            cursor: 'pointer',
            padding: '2px 8px',
            flexShrink: 0,
          }}
        >
          ◂ BACK
        </button>

        <span style={{ color: catColor, fontWeight: 'bold', fontSize: '13px', letterSpacing: '0.1em' }}>
          {symbol}
        </span>

        {cat && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: catColor,
              display: 'inline-block',
            }} />
            <span style={{ color: catColor, fontSize: '10px', letterSpacing: '0.06em' }}>
              CAT {cat} — {CATEGORY_NAMES[cat].toUpperCase()} • {(primaryWeight * 100).toFixed(0)}%
            </span>
          </span>
        )}

        <div style={{ flex: 1 }} />

        {!classifying && (
          <button
            onClick={classifyWithStoredModel}
            style={{
              background: 'rgba(0,255,136,0.08)',
              border: '1px solid var(--color-terminal-up)',
              color: 'var(--color-terminal-up)',
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.1em',
              cursor: 'pointer',
              padding: '2px 10px',
              fontWeight: 'bold',
              flexShrink: 0,
            }}
          >
            {result ? '↻ RECLASSIFY' : '▶ CLASSIFY'}
          </button>
        )}

        {classifying && (
          <>
            <span style={{ color: 'var(--color-terminal-amber)', fontSize: '10px', fontWeight: 'bold', animation: 'clf-blink 1.5s infinite' }}>
              ◉ {formatElapsed(classifyElapsed)}
            </span>
            <button
              onClick={() => cancelClassification()}
              style={{
                background: 'transparent',
                border: '1px solid var(--color-terminal-down)44',
                color: 'var(--color-terminal-down)',
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
                padding: '2px 6px',
              }}
            >
              ✕ CANCEL
            </button>
          </>
        )}
      </div>

      {/* Detail panel content */}
      <DetailPanel symbol={symbol} hook={hook} onClassify={classifyWithStoredModel} />

      {/* Fullscreen dialog */}
      <ClassificationDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        classifying={classifying}
        classifyElapsed={classifyElapsed}
        classifyLogs={classifyLogs}
        rawOutput={rawOutput}
        symbol={symbol}
      />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   CLASSIFICATION STATUS — lightweight status info for the table view
   ═══════════════════════════════════════════════════════════════════════════ */

interface AssetClassificationStatus {
  primaryCategory: ClassificationCategory
  classifiedAt: string
}

/* ═══════════════════════════════════════════════════════════════════════════
   ASSET TABLE VIEW — main list of all assets with multi-select
   ═══════════════════════════════════════════════════════════════════════════ */

function AssetTableView({
  onSelectAsset,
  trackedSymbols,
}: {
  onSelectAsset: (symbol: string) => void
  trackedSymbols: string[]
}) {
  const { coins, loading: coinsLoading, error: coinsError } = useMarketCoins(trackedSymbols.length > 0 ? trackedSymbols : undefined)
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
  const [statuses, setStatuses] = useState<Map<string, AssetClassificationStatus>>(new Map())
  const [statusesLoading, setStatusesLoading] = useState(false)
  const [classifyingSymbols, setClassifyingSymbols] = useState<Set<string>>(new Set())
  const fetchedSymbolsRef = useRef<string>('')
  const pollUntilDone = useCallback(async (jobId: string, base: string) => {
    while (true) {
      await new Promise(r => setTimeout(r, 3000))
      try {
        const pollRes = await fetch(`/api/intelligence/classify/${jobId}`)
        const pollJson = await pollRes.json()
        if (pollJson.status === 'completed') {
          if (pollJson.data?.primary_category) {
            setStatuses(prev => {
              const next = new Map(prev)
              next.set(base, {
                primaryCategory: pollJson.data.primary_category,
                classifiedAt: new Date().toISOString(),
              })
              return next
            })
          }
          break
        }
        if (pollJson.status === 'failed') break
      } catch { /* keep polling */ }
    }
    setClassifyingSymbols(prev => { const n = new Set(prev); n.delete(base); return n })
  }, [])

  // Fetch classification status for all coins
  useEffect(() => {
    if (coins.length === 0) return

    const symbolsKey = coins.map(c => c.symbol.toUpperCase()).sort().join(',')
    if (symbolsKey === fetchedSymbolsRef.current) return
    fetchedSymbolsRef.current = symbolsKey

    setStatusesLoading(true)

    const fetchStatuses = async () => {
      const newStatuses = new Map<string, AssetClassificationStatus>()

      // Fetch in parallel, batched
      const promises = coins.map(async (coin) => {
        const sym = coin.symbol.toUpperCase().replace(/USDT$|BUSD$|USD$/i, '')
        if (!sym) return
        try {
          const res = await fetch(`/api/intelligence/classify/history?symbol=${encodeURIComponent(sym)}`)
          const json = await res.json()
          if (json.latest) {
            newStatuses.set(sym, {
              primaryCategory: json.latest.primaryCategory,
              classifiedAt: json.latest.classifiedAt,
            })
          }
        } catch { /* ignore */ }
      })

      await Promise.all(promises)
      setStatuses(newStatuses)

      // Resume polling for any jobs that are actively running
      const activePromises = coins.map(async (coin) => {
        const sym = coin.symbol.toUpperCase().replace(/USDT$|BUSD$|USD$/i, '')
        if (!sym) return
        try {
          const res = await fetch(`/api/intelligence/classify?symbol=${encodeURIComponent(sym)}`)
          const json = await res.json()
          if (json.job && (json.job.status === 'pending' || json.job.status === 'running')) {
            setClassifyingSymbols(prev => new Set(prev).add(sym))
            pollUntilDone(json.job.id, sym)
          }
        } catch { /* ignore */ }
      })
      await Promise.all(activePromises)

      setStatusesLoading(false)
    }

    fetchStatuses()
  }, [coins, pollUntilDone])

  const toggleRow = useCallback((symbol: string) => {
    setSelectedRows(prev => {
      const next = new Set(prev)
      if (next.has(symbol)) next.delete(symbol)
      else next.add(symbol)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    setSelectedRows(prev => {
      if (prev.size === coins.length) return new Set()
      return new Set(coins.map(c => c.symbol.toUpperCase().replace(/USDT$|BUSD$|USD$/i, '')))
    })
  }, [coins])

  const handleClassifySingle = useCallback(async (symbol: string) => {
    const base = symbol.toUpperCase().replace(/USDT$|BUSD$|USD$/i, '')
    if (!base) return
    setClassifyingSymbols(prev => new Set(prev).add(base))

    try {
      // Read model config from API
      let model: string | undefined
      try {
        const res = await fetch('/api/intelligence/models')
        if (res.ok) {
          const data = await res.json()
          if (data.modelMap?.intelligence) model = data.modelMap.intelligence
        }
      } catch { /* ignore */ }

      const res = await fetch('/api/intelligence/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: base, model }),
      })

      if (!res.ok) {
        setClassifyingSymbols(prev => { const n = new Set(prev); n.delete(base); return n })
        return
      }

      const json = await res.json()
      if (!json.jobId) {
        setClassifyingSymbols(prev => { const n = new Set(prev); n.delete(base); return n })
        return
      }

      pollUntilDone(json.jobId, base)
    } catch {
      setClassifyingSymbols(prev => { const n = new Set(prev); n.delete(base); return n })
    }
  }, [])

  const handleClassifySelected = useCallback(() => {
    for (const sym of selectedRows) {
      if (!classifyingSymbols.has(sym)) {
        handleClassifySingle(sym)
      }
    }
  }, [selectedRows, classifyingSymbols, handleClassifySingle])

  const allSelected = coins.length > 0 && selectedRows.size === coins.length
  const someSelected = selectedRows.size > 0

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      minHeight: 0,
    }}>
      {/* Header bar */}
      <div style={{
        height: '40px',
        minHeight: '40px',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: '10px',
        background: 'var(--color-terminal-panel)',
        borderBottom: '1px solid var(--color-terminal-border)',
        fontFamily: 'var(--font-mono)',
        flexShrink: 0,
      }}>
        <span style={{
          color: 'var(--color-terminal-amber)',
          fontSize: '13px',
          fontWeight: 'bold',
          letterSpacing: '0.15em',
          flexShrink: 0,
        }}>
          CLASSIFICATION
        </span>

        <div style={{ flex: 1 }} />

        {someSelected && (
          <button
            onClick={handleClassifySelected}
            disabled={classifyingSymbols.size > 0}
            style={{
              background: classifyingSymbols.size > 0 ? 'transparent' : 'rgba(0,255,136,0.08)',
              border: `1px solid ${classifyingSymbols.size > 0 ? 'var(--color-terminal-border)' : 'var(--color-terminal-up)'}`,
              color: classifyingSymbols.size > 0 ? 'var(--color-terminal-dim)' : 'var(--color-terminal-up)',
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.08em',
              cursor: classifyingSymbols.size > 0 ? 'not-allowed' : 'pointer',
              padding: '2px 10px',
              fontWeight: 'bold',
              flexShrink: 0,
            }}
          >
            {classifyingSymbols.size > 0 ? `◉ RUNNING (${classifyingSymbols.size})` : `▶ CLASSIFY SELECTED (${selectedRows.size})`}
          </button>
        )}

        <span style={{
          color: 'var(--color-terminal-dim)',
          fontSize: '10px',
        }}>
          {coins.length} ASSETS
        </span>
      </div>

      {/* Table */}
      {coinsLoading ? (
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-terminal-dim)',
          fontSize: '11px',
          fontFamily: 'var(--font-mono)',
        }}>
          LOADING MARKET DATA...
        </div>
      ) : coinsError ? (
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-terminal-down)',
          fontSize: '11px',
          fontFamily: 'var(--font-mono)',
        }}>
          UPSTREAM ERR: {coinsError}
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '36px 36px 70px 1fr 70px 100px 90px 90px',
            padding: '6px 12px',
            fontSize: '9px',
            letterSpacing: '0.08em',
            color: 'var(--color-terminal-dim)',
            fontFamily: 'var(--font-mono)',
            borderBottom: '1px solid var(--color-terminal-border)',
            background: 'var(--color-terminal-panel)',
            position: 'sticky',
            top: 0,
            zIndex: 1,
          }}>
            <span
              onClick={toggleAll}
              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <span style={{
                width: '12px',
                height: '12px',
                border: '1px solid var(--color-terminal-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '8px',
                color: allSelected ? 'var(--color-terminal-up)' : 'transparent',
                background: allSelected ? 'rgba(0,255,136,0.1)' : 'transparent',
              }}>
                {allSelected ? '✓' : someSelected ? '—' : ''}
              </span>
            </span>
            <span>#</span>
            <span>SYMBOL</span>
            <span>PRICE</span>
            <span style={{ textAlign: 'right' }}>24H%</span>
            <span style={{ textAlign: 'center' }}>STATUS</span>
            <span style={{ textAlign: 'right' }}>CLASSIFIED</span>
            <span style={{ textAlign: 'center' }}>ACTION</span>
          </div>

          {/* Data rows */}
          {coins.map((coin, i) => {
            const sym = coin.symbol.toUpperCase().replace(/USDT$|BUSD$|USD$/i, '')
            const isSelected = selectedRows.has(sym)
            const status = statuses.get(sym)
            const isClassifying = classifyingSymbols.has(sym)
            const catColor = status ? CATEGORY_COLORS[status.primaryCategory as ClassificationCategory] : undefined

            return (
              <div
                key={coin.id}
                onClick={() => onSelectAsset(sym)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '36px 36px 70px 1fr 70px 100px 90px 90px',
                  padding: '5px 12px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  borderBottom: '1px solid var(--color-terminal-border)',
                  background: isSelected
                    ? 'rgba(255,170,0,0.04)'
                    : i % 2 === 0
                      ? 'var(--color-terminal-surface)'
                      : 'var(--color-terminal-panel)',
                  cursor: 'pointer',
                  alignItems: 'center',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isSelected
                    ? 'rgba(255,170,0,0.04)'
                    : i % 2 === 0
                      ? 'var(--color-terminal-surface)'
                      : 'var(--color-terminal-panel)'
                }}
              >
                {/* Checkbox */}
                <span
                  onClick={(e) => { e.stopPropagation(); toggleRow(sym) }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                >
                  <span style={{
                    width: '12px',
                    height: '12px',
                    border: `1px solid ${isSelected ? 'var(--color-terminal-up)' : 'var(--color-terminal-border)'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '8px',
                    color: isSelected ? 'var(--color-terminal-up)' : 'transparent',
                    background: isSelected ? 'rgba(0,255,136,0.1)' : 'transparent',
                    transition: 'all 0.1s',
                  }}>
                    {isSelected ? '✓' : ''}
                  </span>
                </span>

                {/* Rank */}
                <span style={{ color: 'var(--color-terminal-dim)' }}>{coin.rank}</span>

                {/* Symbol */}
                <span style={{ color: 'var(--color-terminal-amber)', fontWeight: 'bold', letterSpacing: '0.06em' }}>
                  {sym}
                </span>

                {/* Price */}
                <span style={{ color: 'var(--color-terminal-text)' }}>
                  {formatPrice(coin.currentPrice)}
                </span>

                {/* 24h% */}
                <span style={{
                  textAlign: 'right',
                  color: (coin.priceChange24h ?? 0) >= 0 ? 'var(--color-terminal-up)' : 'var(--color-terminal-down)',
                }}>
                  {coin.priceChange24h != null ? `${coin.priceChange24h >= 0 ? '+' : ''}${coin.priceChange24h.toFixed(2)}%` : '—'}
                </span>

                {/* Status */}
                <span style={{ textAlign: 'center' }}>
                  {isClassifying ? (
                    <span style={{ color: 'var(--color-terminal-amber)', fontSize: '9px', fontWeight: 'bold', animation: 'clf-blink 1.5s infinite' }}>
                      ◉ SCANNING
                    </span>
                  ) : status ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: catColor,
                        display: 'inline-block',
                        boxShadow: `0 0 4px ${catColor}66`,
                      }} />
                      <span style={{ color: catColor, fontSize: '9px', fontWeight: 'bold', letterSpacing: '0.06em' }}>
                        CAT {status.primaryCategory}
                      </span>
                    </span>
                  ) : statusesLoading ? (
                    <span style={{ color: 'var(--color-terminal-dim)', fontSize: '9px' }}>...</span>
                  ) : (
                    <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px' }}>—</span>
                  )}
                </span>

                {/* Last Classified */}
                <span style={{ textAlign: 'right', color: 'var(--color-terminal-dim)', fontSize: '10px' }}>
                  {status ? timeAgo(status.classifiedAt) : '—'}
                </span>

                {/* Action */}
                <span style={{ textAlign: 'center' }}>
                  {isClassifying ? (
                    <span style={{ color: 'var(--color-terminal-dim)', fontSize: '9px' }}>...</span>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleClassifySingle(sym) }}
                      style={{
                        background: 'rgba(0,255,136,0.06)',
                        border: '1px solid var(--color-terminal-up)33',
                        color: 'var(--color-terminal-up)',
                        fontSize: '9px',
                        fontFamily: 'var(--font-mono)',
                        letterSpacing: '0.06em',
                        cursor: 'pointer',
                        padding: '1px 6px',
                        fontWeight: 'bold',
                      }}
                    >
                      {status ? '↻' : '▶'}
                    </button>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      )}

      <style>{`
        @keyframes clf-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN PAGE — view router
   ═══════════════════════════════════════════════════════════════════════════ */

function ClassificationContent() {
  const [view, setView] = useState<'table' | 'detail'>('table')
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)
  const { symbols: trackedSymbols } = useTrackedAssets()

  const handleSelectAsset = useCallback((symbol: string) => {
    setSelectedSymbol(symbol)
    setView('detail')
  }, [])

  const handleBack = useCallback(() => {
    setView('table')
  }, [])

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      minHeight: 0,
      background: 'var(--color-terminal-bg)',
      fontFamily: 'var(--font-mono)',
    }}>
      {view === 'detail' && selectedSymbol ? (
        <AssetDetailView symbol={selectedSymbol} onBack={handleBack} />
      ) : (
        <AssetTableView onSelectAsset={handleSelectAsset} trackedSymbols={trackedSymbols} />
      )}
    </div>
  )
}

export default function ClassificationPage() {
  return (
    <Suspense>
      <ClassificationContent />
    </Suspense>
  )
}
