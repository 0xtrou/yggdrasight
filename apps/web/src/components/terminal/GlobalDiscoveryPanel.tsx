'use client'

import { useState, useMemo } from 'react'
import { useGlobalDiscovery } from '@/hooks/useGlobalDiscovery'
import type { IGlobalDiscoveredProject } from '@/lib/intelligence/models/global-discovery-job.model'

// ── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_NAMES: Record<number, string> = {
  1: 'Crack Expander',
  2: 'Infra of Disappearance',
  3: 'Mirror Builder',
  4: 'Narrative Vessel',
  5: 'Ego Builder',
  6: 'Consciousness Seed',
}

const CATEGORY_COLORS: Record<number, string> = {
  1: '#00ff88',
  2: '#4488ff',
  3: '#aa66ff',
  4: '#ffaa00',
  5: '#ff3b3b',
  6: '#00ddcc',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatElapsed(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ── Sub-components ───────────────────────────────────────────────────────────

function CategoryBadge({ cat }: { cat: number | null }) {
  if (!cat || cat < 1 || cat > 6) return <span style={{ color: 'var(--color-terminal-dim)' }}>—</span>
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
    }}>
      <span style={{
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: CATEGORY_COLORS[cat],
        display: 'inline-block',
        boxShadow: `0 0 4px ${CATEGORY_COLORS[cat]}66`,
      }} />
      <span style={{
        color: CATEGORY_COLORS[cat],
        fontSize: '9px',
        fontWeight: 'bold',
        letterSpacing: '0.06em',
      }}>
        CAT {cat}
      </span>
    </span>
  )
}

function SignalBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = value >= 0.8 ? '#00ff88' : value >= 0.5 ? '#ffaa00' : '#ff3b3b'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
      <span style={{
        width: '40px',
        height: '4px',
        background: 'var(--color-terminal-border)',
        borderRadius: '2px',
        overflow: 'hidden',
        display: 'inline-block',
      }}>
        <span style={{
          width: `${pct}%`,
          height: '100%',
          background: color,
          display: 'block',
          borderRadius: '2px',
        }} />
      </span>
      <span style={{ fontSize: '9px', color: 'var(--color-terminal-dim)' }}>{pct}%</span>
    </span>
  )
}

function ProjectTable({ projects, title }: { projects: IGlobalDiscoveredProject[]; title: string }) {
  const [sortBy, setSortBy] = useState<'signal' | 'category' | 'name'>('signal')
  const [expanded, setExpanded] = useState<string | null>(null)

  const sorted = useMemo(() => {
    const copy = [...projects]
    if (sortBy === 'signal') copy.sort((a, b) => b.signalStrength - a.signalStrength)
    else if (sortBy === 'category') copy.sort((a, b) => (a.primaryCategory ?? 99) - (b.primaryCategory ?? 99))
    else copy.sort((a, b) => a.name.localeCompare(b.name))
    return copy
  }, [projects, sortBy])

  if (projects.length === 0) {
    return (
      <div style={{ padding: '12px', color: 'var(--color-terminal-dim)', fontSize: '11px', textAlign: 'center' }}>
        No projects found
      </div>
    )
  }

  return (
    <div style={{ fontSize: '11px' }}>
      {/* Table header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '30px minmax(0, 1fr) 54px 70px 80px minmax(100px, 1.2fr)',
        minWidth: 0,
        padding: '4px 8px',
        fontSize: '9px',
        fontWeight: 'bold',
        color: 'var(--color-terminal-dim)',
        letterSpacing: '0.1em',
        borderBottom: '1px solid var(--color-terminal-border)',
      }}>
        <span>#</span>
        <span onClick={() => setSortBy('name')} style={{ cursor: 'pointer' }}>
          {title} {sortBy === 'name' ? '▼' : ''}
        </span>
        <span>SYMBOL</span>
        <span onClick={() => setSortBy('category')} style={{ cursor: 'pointer' }}>
          CAT {sortBy === 'category' ? '▼' : ''}
        </span>
        <span onClick={() => setSortBy('signal')} style={{ cursor: 'pointer' }}>
          SIG {sortBy === 'signal' ? '▼' : ''}
        </span>
        <span>SECTOR</span>
      </div>

      {/* Rows */}
      {sorted.map((p, i) => {
        const isExpanded = expanded === p.name
        return (
          <div key={`${p.name}-${i}`}>
            <div
              onClick={() => setExpanded(isExpanded ? null : p.name)}
              style={{
                display: 'grid',
                gridTemplateColumns: '30px minmax(0, 1fr) 54px 70px 80px minmax(100px, 1.2fr)',
                minWidth: 0,
                padding: '4px 8px',
                borderBottom: '1px solid var(--color-terminal-border)',
                background: i % 2 === 0 ? 'var(--color-terminal-surface)' : 'var(--color-terminal-panel)',
                cursor: 'pointer',
                alignItems: 'center',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = i % 2 === 0
                  ? 'var(--color-terminal-surface)'
                  : 'var(--color-terminal-panel)'
              }}
            >
              <span style={{ color: 'var(--color-terminal-dim)' }}>{i + 1}</span>
              <span style={{ color: 'var(--color-terminal-text)', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{p.name}</span>
              <span style={{ color: 'var(--color-terminal-amber)' }}>{p.symbol ?? '—'}</span>
              <CategoryBadge cat={p.primaryCategory} />
              <SignalBar value={p.signalStrength} />
              <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px' }}>{p.sector ?? '—'}</span>
            </div>

            {isExpanded && (
              <div style={{
                padding: '8px 12px 8px 44px',
                background: 'rgba(0,0,0,0.2)',
                borderBottom: '1px solid var(--color-terminal-border)',
                fontSize: '10px',
                lineHeight: '1.6',
              }}>
                <div style={{ color: 'var(--color-terminal-text)', marginBottom: '4px', wordBreak: 'break-word', overflowWrap: 'break-word' }}>{p.description}</div>
                <div style={{ color: 'var(--color-terminal-dim)', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                  <strong>Reason:</strong> {p.discoveryReason}
                </div>
                {p.crackAlignment.length > 0 && (
                  <div style={{ color: 'var(--color-terminal-dim)', marginTop: '2px' }}>
                    <strong>Cracks:</strong> {p.crackAlignment.join(', ')}
                  </div>
                )}
                {p.launchDate && (
                  <div style={{ color: 'var(--color-terminal-dim)', marginTop: '2px' }}>
                    <strong>Launch:</strong> {p.launchDate}
                  </div>
                )}
                {p.sources.length > 0 && (
                  <div style={{ color: 'var(--color-terminal-dim)', marginTop: '2px' }}>
                    <strong>Sources:</strong> {p.sources.length} reference{p.sources.length !== 1 ? 's' : ''}
                  </div>
                )}
                {p.categoryWeights && p.categoryWeights.length > 0 && (
                  <div style={{ marginTop: '4px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {p.categoryWeights.map((cw, j) => (
                      <span key={j} style={{ color: CATEGORY_COLORS[cw.category], fontSize: '9px' }}>
                        {CATEGORY_NAMES[cw.category] ?? `Cat ${cw.category}`}: {Math.round(cw.weight * 100)}%
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function CategoryBreakdown({ projects }: { projects: IGlobalDiscoveredProject[] }) {
  const breakdown = useMemo(() => {
    const counts: Record<number, number> = {}
    for (const p of projects) {
      const cat = p.primaryCategory ?? 0
      counts[cat] = (counts[cat] ?? 0) + 1
    }
    return Object.entries(counts)
      .map(([cat, count]) => ({ cat: Number(cat), count }))
      .sort((a, b) => b.count - a.count)
  }, [projects])

  return (
    <div style={{
      display: 'flex',
      gap: '12px',
      flexWrap: 'wrap',
      padding: '8px 0',
    }}>
      {breakdown.map(({ cat, count }) => (
        <div key={cat} style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 8px',
          background: `${CATEGORY_COLORS[cat] ?? '#666'}11`,
          border: `1px solid ${CATEGORY_COLORS[cat] ?? '#666'}33`,
          borderRadius: '2px',
        }}>
          <span style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: CATEGORY_COLORS[cat] ?? '#666',
          }} />
          <span style={{ fontSize: '10px', color: CATEGORY_COLORS[cat] ?? '#666', fontWeight: 'bold' }}>
            {cat >= 1 && cat <= 6 ? CATEGORY_NAMES[cat] : 'Uncategorized'}
          </span>
          <span style={{ fontSize: '10px', color: 'var(--color-terminal-dim)' }}>
            {count}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export function GlobalDiscoveryPanel({ hideHeader }: { hideHeader?: boolean }) {
  const {
    loading,
    discovering,
    discoverElapsed,
    discoverLogs,
    agentResults,
    latestReport,
    reportHistory,
    error,
    discover,
    cancelDiscovery,
    loadReport,
  } = useGlobalDiscovery()

  const [depth, setDepth] = useState(20)
  const [agentCount, setAgentCount] = useState(5)
  const [showLogs, setShowLogs] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState<'report' | 'history'>('report')

  if (loading) {
    return (
      <div style={{
        padding: '16px',
        color: 'var(--color-terminal-dim)',
        fontSize: '11px',
        fontFamily: 'var(--font-mono)',
        textAlign: 'center',
      }}>
        Loading global intelligence...
      </div>
    )
  }

  return (
    <div style={{
      ...(hideHeader ? {} : { borderBottom: '2px solid var(--color-terminal-border)' }),
      fontFamily: 'var(--font-mono)',
      overflow: 'hidden',
      ...(hideHeader ? { display: 'flex', flexDirection: 'column' as const, height: '100%' } : {}),
    }}>
      {/* Header — hidden when page-level header is used */}
      {!hideHeader && (
      <div style={{
        height: '40px',
        minHeight: '40px',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: '10px',
        background: 'var(--color-terminal-panel)',
        borderBottom: '1px solid var(--color-terminal-border)',
        flexShrink: 0,
      }}>
        <span
          onClick={() => setCollapsed(!collapsed)}
          style={{
            cursor: 'pointer',
            color: 'var(--color-terminal-dim)',
            fontSize: '10px',
            width: '14px',
          }}
        >
          {collapsed ? '▸' : '▾'}
        </span>

        <span style={{
          color: '#00ddcc',
          fontSize: '13px',
          fontWeight: 'bold',
          letterSpacing: '0.15em',
          flexShrink: 0,
        }}>
          GLOBAL INTELLIGENCE
        </span>

        {latestReport && (
          <span style={{
            color: 'var(--color-terminal-dim)',
            fontSize: '10px',
          }}>
            GEN {latestReport.generation} · {latestReport.totalProjects} projects
          </span>
        )}

        <div style={{ flex: 1 }} />

        {discovering && (
          <span style={{
            color: 'var(--color-terminal-amber)',
            fontSize: '10px',
            fontWeight: 'bold',
            animation: 'clf-blink 1.5s infinite',
          }}>
            ◉ DISCOVERING {formatElapsed(discoverElapsed)}
          </span>
        )}

        {!discovering && !collapsed && (
          <>
            {/* Depth control */}
            <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px' }}>DEPTH</span>
            <input
              type="number"
              value={depth}
              onChange={e => setDepth(Math.max(1, Math.min(100, Number(e.target.value) || 20)))}
              style={{
                width: '44px',
                background: 'var(--color-terminal-surface)',
                border: '1px solid var(--color-terminal-border)',
                color: 'var(--color-terminal-text)',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                padding: '1px 4px',
                textAlign: 'center',
              }}
            />

            {/* Agent count control */}
            <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px' }}>AGENTS</span>
            <input
              type="number"
              value={agentCount}
              onChange={e => setAgentCount(Math.max(1, Math.min(20, Number(e.target.value) || 5)))}
              style={{
                width: '44px',
                background: 'var(--color-terminal-surface)',
                border: '1px solid var(--color-terminal-border)',
                color: 'var(--color-terminal-text)',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                padding: '1px 4px',
                textAlign: 'center',
              }}
            />

            <button
              onClick={() => discover(depth, agentCount)}
              style={{
                background: 'rgba(0,221,204,0.08)',
                border: '1px solid #00ddcc33',
                color: '#00ddcc',
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.08em',
                cursor: 'pointer',
                padding: '2px 10px',
                fontWeight: 'bold',
              }}
            >
              ▶ LAUNCH DISCOVERY
            </button>
          </>
        )}

        {discovering && (
          <button
            onClick={cancelDiscovery}
            style={{
              background: 'rgba(255,59,59,0.08)',
              border: '1px solid #ff3b3b33',
              color: '#ff3b3b',
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.08em',
              cursor: 'pointer',
              padding: '2px 10px',
              fontWeight: 'bold',
            }}
          >
            ✕ CANCEL
          </button>
        )}
      </div>
      )}

      {/* Body — collapsible */}
      {(hideHeader || !collapsed) && (
        <div style={{
          ...(hideHeader ? { flex: 1 } : { maxHeight: '500px' }),
          overflowY: 'auto',
          overflowX: 'hidden',
        }}>
          {/* Error */}
          {error && (
            <div style={{
              padding: '8px 16px',
              background: 'rgba(255,59,59,0.06)',
              borderBottom: '1px solid #ff3b3b33',
              color: '#ff3b3b',
              fontSize: '11px',
            }}>
              ✕ {error}
            </div>
          )}

          {/* Discovering — show progress */}
          {discovering && (
            <div style={{ padding: '12px 16px' }}>
              {/* Agent progress */}
              {agentResults && (
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--color-terminal-dim)', marginBottom: '4px', letterSpacing: '0.1em' }}>
                    AGENT STATUS
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {Object.values(agentResults).map((r) => (
                      <div key={r.agentId} style={{
                        padding: '3px 8px',
                        background: r.status === 'completed' ? 'rgba(0,255,136,0.06)' : 'rgba(255,59,59,0.06)',
                        border: `1px solid ${r.status === 'completed' ? '#00ff8833' : '#ff3b3b33'}`,
                        fontSize: '10px',
                        color: r.status === 'completed' ? '#00ff88' : '#ff3b3b',
                      }}>
                        {r.agentId}: {r.projectsFound} found
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Log toggle */}
              <div
                onClick={() => setShowLogs(!showLogs)}
                style={{
                  cursor: 'pointer',
                  fontSize: '10px',
                  color: 'var(--color-terminal-dim)',
                  marginBottom: '4px',
                }}
              >
                {showLogs ? '▾' : '▸'} LOGS ({discoverLogs.length})
              </div>

              {showLogs && discoverLogs.length > 0 && (
                <div style={{
                  maxHeight: '200px',
                  overflowY: 'auto',
                  background: 'rgba(0,0,0,0.3)',
                  padding: '6px 8px',
                  fontSize: '10px',
                  lineHeight: '1.5',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-terminal-dim)',
                  border: '1px solid var(--color-terminal-border)',
                }}>
                  {discoverLogs.map((line, i) => (
                    <div key={i} style={{
                      color: line.includes('Done:') || line.includes('succeeded')
                        ? '#00ff88'
                        : line.includes('FAILED') || line.includes('ERROR')
                          ? '#ff3b3b'
                          : line.includes('Phase')
                            ? 'var(--color-terminal-amber)'
                            : 'var(--color-terminal-dim)',
                    }}>
                      {line}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Report content */}
          {!discovering && latestReport && (
            <div>
              {/* Tabs */}
              <div style={{
                display: 'flex',
                borderBottom: '1px solid var(--color-terminal-border)',
              }}>
                <button
                  onClick={() => setActiveTab('report')}
                  style={{
                    padding: '6px 16px',
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 'bold',
                    letterSpacing: '0.08em',
                    background: activeTab === 'report' ? 'var(--color-terminal-surface)' : 'transparent',
                    border: 'none',
                    borderBottom: activeTab === 'report' ? '2px solid #00ddcc' : '2px solid transparent',
                    color: activeTab === 'report' ? '#00ddcc' : 'var(--color-terminal-dim)',
                    cursor: 'pointer',
                  }}
                >
                  LATEST REPORT
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  style={{
                    padding: '6px 16px',
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 'bold',
                    letterSpacing: '0.08em',
                    background: activeTab === 'history' ? 'var(--color-terminal-surface)' : 'transparent',
                    border: 'none',
                    borderBottom: activeTab === 'history' ? '2px solid #00ddcc' : '2px solid transparent',
                    color: activeTab === 'history' ? '#00ddcc' : 'var(--color-terminal-dim)',
                    cursor: 'pointer',
                  }}
                >
                  HISTORY ({reportHistory.length})
                </button>
              </div>

              {activeTab === 'report' && (
                <div>
                  {/* Summary bar */}
                  <div style={{
                    padding: '10px 16px',
                    display: 'flex',
                    gap: '20px',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    borderBottom: '1px solid var(--color-terminal-border)',
                    background: 'rgba(0,221,204,0.02)',
                  }}>
                    <div style={{ fontSize: '10px' }}>
                      <span style={{ color: 'var(--color-terminal-dim)' }}>GEN </span>
                      <span style={{ color: '#00ddcc', fontWeight: 'bold' }}>{latestReport.generation}</span>
                    </div>
                    <div style={{ fontSize: '10px' }}>
                      <span style={{ color: 'var(--color-terminal-dim)' }}>TOTAL </span>
                      <span style={{ color: 'var(--color-terminal-text)', fontWeight: 'bold' }}>{latestReport.totalProjects}</span>
                    </div>
                    <div style={{ fontSize: '10px' }}>
                      <span style={{ color: 'var(--color-terminal-dim)' }}>NEW </span>
                      <span style={{ color: '#00ff88', fontWeight: 'bold' }}>+{latestReport.newProjectCount}</span>
                    </div>
                    <div style={{ fontSize: '10px' }}>
                      <span style={{ color: 'var(--color-terminal-dim)' }}>DEPTH </span>
                      <span style={{ color: 'var(--color-terminal-text)' }}>{latestReport.depth}</span>
                    </div>
                    <div style={{ fontSize: '10px' }}>
                      <span style={{ color: 'var(--color-terminal-dim)' }}>AGENTS </span>
                      <span style={{ color: 'var(--color-terminal-text)' }}>{latestReport.agentCount}</span>
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--color-terminal-dim)' }}>
                      {latestReport.createdAt ? timeAgo(latestReport.createdAt) : ''}
                    </div>
                  </div>

                  {/* Market direction */}
                  {latestReport.marketDirection && (
                    <div style={{
                      padding: '8px 16px',
                      fontSize: '11px',
                      color: 'var(--color-terminal-text)',
                      borderBottom: '1px solid var(--color-terminal-border)',
                      lineHeight: '1.5',
                    }}>
                      <span style={{ color: 'var(--color-terminal-dim)', fontSize: '9px', letterSpacing: '0.1em' }}>MARKET DIRECTION</span>
                      <div style={{ marginTop: '2px', wordBreak: 'break-word', overflowWrap: 'break-word' }}>{latestReport.marketDirection}</div>
                    </div>
                  )}

                  {/* Executive summary */}
                  <div style={{
                    padding: '8px 16px',
                    fontSize: '11px',
                    color: 'var(--color-terminal-text)',
                    borderBottom: '1px solid var(--color-terminal-border)',
                    lineHeight: '1.5',
                  }}>
                    <span style={{ color: 'var(--color-terminal-dim)', fontSize: '9px', letterSpacing: '0.1em' }}>EXECUTIVE SUMMARY</span>
                    <div style={{ marginTop: '2px', wordBreak: 'break-word', overflowWrap: 'break-word' }}>{latestReport.executiveSummary}</div>
                  </div>

                  {/* Emerging trends */}
                  {latestReport.emergingTrends.length > 0 && (
                    <div style={{
                      padding: '8px 16px',
                      borderBottom: '1px solid var(--color-terminal-border)',
                    }}>
                      <span style={{ color: 'var(--color-terminal-dim)', fontSize: '9px', letterSpacing: '0.1em' }}>EMERGING TRENDS</span>
                      <div style={{ marginTop: '4px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {latestReport.emergingTrends.map((t, i) => (
                          <span key={i} style={{
                            padding: '2px 8px',
                            background: 'rgba(0,221,204,0.06)',
                            border: '1px solid #00ddcc22',
                            color: '#00ddcc',
                            fontSize: '10px',
                            wordBreak: 'break-word',
                            overflowWrap: 'break-word',
                          }}>
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Cross-pillar insights */}
                  {latestReport.crossPillarInsights && (
                    <div style={{
                      padding: '8px 16px',
                      fontSize: '11px',
                      color: 'var(--color-terminal-text)',
                      borderBottom: '1px solid var(--color-terminal-border)',
                      lineHeight: '1.5',
                    }}>
                      <span style={{ color: 'var(--color-terminal-dim)', fontSize: '9px', letterSpacing: '0.1em' }}>CROSS-PILLAR INSIGHTS</span>
                      <div style={{ marginTop: '2px', wordBreak: 'break-word', overflowWrap: 'break-word' }}>{latestReport.crossPillarInsights}</div>
                    </div>
                  )}

                  {/* Category breakdown */}
                  {latestReport.projects && latestReport.projects.length > 0 && (
                    <div style={{
                      padding: '8px 16px',
                      borderBottom: '1px solid var(--color-terminal-border)',
                    }}>
                      <span style={{ color: 'var(--color-terminal-dim)', fontSize: '9px', letterSpacing: '0.1em' }}>CATEGORY DISTRIBUTION</span>
                      <CategoryBreakdown projects={latestReport.projects} />
                    </div>
                  )}

                  {/* New projects table */}
                  {latestReport.newProjects && latestReport.newProjects.length > 0 && (
                    <div style={{ borderBottom: '1px solid var(--color-terminal-border)' }}>
                      <div style={{
                        padding: '8px 16px 4px',
                        fontSize: '9px',
                        color: '#00ff88',
                        letterSpacing: '0.1em',
                        fontWeight: 'bold',
                      }}>
                        NEW DISCOVERIES ({latestReport.newProjects.length})
                      </div>
                      <ProjectTable projects={latestReport.newProjects} title="PROJECT" />
                    </div>
                  )}

                  {/* All projects table */}
                  {latestReport.projects && latestReport.projects.length > 0 && (
                    <div>
                      <div style={{
                        padding: '8px 16px 4px',
                        fontSize: '9px',
                        color: 'var(--color-terminal-dim)',
                        letterSpacing: '0.1em',
                        fontWeight: 'bold',
                      }}>
                        ALL TRACKED PROJECTS ({latestReport.projects.length})
                      </div>
                      <ProjectTable projects={latestReport.projects} title="PROJECT" />
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'history' && (
                <div style={{ fontSize: '11px' }}>
                  {/* History header */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '50px minmax(0, 280px) 60px 60px 60px 80px',
                    padding: '4px 12px',
                    fontSize: '9px',
                    fontWeight: 'bold',
                    color: 'var(--color-terminal-dim)',
                    letterSpacing: '0.1em',
                    borderBottom: '1px solid var(--color-terminal-border)',
                  }}>
                    <span>GEN</span>
                    <span>SUMMARY</span>
                    <span>TOTAL</span>
                    <span>NEW</span>
                    <span>AGENTS</span>
                    <span>DATE</span>
                  </div>

                  {reportHistory.map((r, i) => (
                    <div
                      key={r.id}
                      onClick={() => loadReport(r.id)}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '50px minmax(0, 280px) 60px 60px 60px 80px',
                        padding: '6px 12px',
                        borderBottom: '1px solid var(--color-terminal-border)',
                        background: i % 2 === 0 ? 'var(--color-terminal-surface)' : 'var(--color-terminal-panel)',
                        cursor: 'pointer',
                        alignItems: 'center',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = i % 2 === 0
                          ? 'var(--color-terminal-surface)'
                          : 'var(--color-terminal-panel)'
                      }}
                    >
                      <span style={{ color: '#00ddcc', fontWeight: 'bold' }}>{r.generation}</span>
                      <span style={{
                        color: 'var(--color-terminal-text)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        minWidth: 0,
                        paddingRight: '8px',
                      }}>
                        {r.executiveSummary.substring(0, 80)}{r.executiveSummary.length > 80 ? '...' : ''}
                      </span>
                      <span style={{ color: 'var(--color-terminal-text)' }}>{r.totalProjects}</span>
                      <span style={{ color: '#00ff88' }}>+{r.newProjectCount}</span>
                      <span style={{ color: 'var(--color-terminal-dim)' }}>{r.agentCount}</span>
                      <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px' }}>
                        {r.createdAt ? timeAgo(r.createdAt) : ''}
                      </span>
                    </div>
                  ))}

                  {reportHistory.length === 0 && (
                    <div style={{
                      padding: '20px',
                      textAlign: 'center',
                      color: 'var(--color-terminal-dim)',
                      fontSize: '11px',
                    }}>
                      No discovery reports yet. Launch a discovery to begin building the intelligence dataset.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* No report yet */}
          {!discovering && !latestReport && (
            <div style={{
              padding: '24px 16px',
              textAlign: 'center',
              color: 'var(--color-terminal-dim)',
              fontSize: '11px',
              lineHeight: '1.6',
            }}>
              <div style={{ color: '#00ddcc', fontSize: '14px', marginBottom: '8px' }}>◎</div>
              <div>No global intelligence data yet.</div>
              <div style={{ marginTop: '4px' }}>Configure depth and agent count above, then launch discovery.</div>
              <div style={{ marginTop: '4px', fontSize: '10px' }}>
                Each run compounds — agents inherit context from previous reports.
              </div>
            </div>
          )}
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
