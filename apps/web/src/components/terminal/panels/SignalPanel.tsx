'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useIntelligence } from '@/hooks/useIntelligence'
import type { VerdictRecord, AnalystVerdict } from '@/lib/intelligence/types'

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

interface SignalPanelProps {
  symbol: string
  onAnalysisComplete?: () => void
  agentModelMap: Record<string, string>
  onAgentModelMapChange: (map: Record<string, string>) => void
}

const DEFAULT_MODEL = 'opencode/big-pickle'

const TIMEFRAMES = [
  { label: '1H', key: 'h1' },
  { label: '4H', key: 'h4' },
  { label: '1D', key: 'd1' },
  { label: '1W', key: 'w1' },
  { label: '1M', key: 'mn' },
] as const

const RECOMMENDED_PROVIDERS = ['opencode', 'github-copilot']

function directionColor(dir: string): string {
  if (dir === 'long' || dir === 'bullish') return 'var(--color-terminal-up)'
  if (dir === 'short' || dir === 'bearish') return 'var(--color-terminal-down)'
  return 'var(--color-terminal-amber)'
}

function directionLabel(dir: string): { text: string; arrow: string } {
  if (dir === 'long' || dir === 'bullish') return { text: 'BUY', arrow: '▲' }
  if (dir === 'short' || dir === 'bearish') return { text: 'SELL', arrow: '▼' }
  return { text: 'NEUTRAL', arrow: '—' }
}

function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${mo}/${day} ${hh}:${mm}`
}

function extractMtfAnalyst(record: VerdictRecord | null): AnalystVerdict | undefined {
  if (!record) return undefined
  return record.analysts.find((a) => a.meta.id === 'mtf-alignment')
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

  // Close on click outside
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

  // Close on Escape
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
    // Include any providers that appear only in filtered results
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

// ─── Main component ───

export function SignalPanel({ symbol, onAnalysisComplete, agentModelMap, onAgentModelMapChange }: SignalPanelProps) {
  const { result, loading, error, history, isStale, analyze } = useIntelligence(symbol)
  const [selectedAgents, setSelectedAgents] = useState<string[]>([])
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([])
  const [availableAgents, setAvailableAgents] = useState<AgentInfo[]>([])
  const [configOpen, setConfigOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
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
      .catch((err) => console.warn('[SignalPanel] Failed to fetch models:', err))
    return () => { cancelled = true }
  }, [])

  const mtf = extractMtfAnalyst(result)
  const indicators = mtf?.indicators as Record<string, string> | undefined

  const toggleAgent = (agentId: string) => {
    setSelectedAgents((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]
    )
  }

  // All agent IDs including 'discovery' for the discover agent
  const allAgentKeys = useMemo(() => {
    const keys = availableAgents.map((a) => a.id)
    if (!keys.includes('discovery')) keys.push('discovery')
    return keys
  }, [availableAgents])

  // Get model for a specific agent — fallback to DEFAULT_MODEL
  const getAgentModel = useCallback((agentId: string) => {
    return agentModelMap[agentId] || DEFAULT_MODEL
  }, [agentModelMap])

  // Set model for a specific agent
  const setAgentModel = useCallback((agentId: string, modelId: string) => {
    onAgentModelMapChange({ ...agentModelMap, [agentId]: modelId })
  }, [agentModelMap, onAgentModelMapChange])

  // Set all agents to the same model
  const setAllModels = useCallback((modelId: string) => {
    const newMap: Record<string, string> = {}
    for (const key of allAgentKeys) {
      newMap[key] = modelId
    }
    onAgentModelMapChange(newMap)
    setSetAllOpen(false)
  }, [allAgentKeys, onAgentModelMapChange])

  // Check if any agent has a non-default model (i.e., LLM is enabled)
  const hasLLMEnabled = allAgentKeys.some((k) => getAgentModel(k) !== '')

  const handleAnalyze = () => {
    if (!loading) {
      // Build agentModelMap to pass — only include agents that are selected (or all if none selected)
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

  const hasData = result !== null

  return (
    <div
      style={{
        ...(isFullscreen ? {
          position: 'fixed' as const,
          top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 9999,
        } : {}),
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--color-terminal-surface)',
        borderRight: isFullscreen ? 'none' : '1px solid var(--color-terminal-border)',
        fontFamily: 'var(--font-mono)',
      }}
    >
      {/* HEADER */}
      <div
        style={{
          padding: '6px 8px',
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
            color: 'var(--color-terminal-muted)',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
          }}
        >
          SIGNAL
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
            style={{
              background: 'transparent',
              border: '1px solid var(--color-terminal-border)',
              color: isFullscreen ? 'var(--color-terminal-amber)' : 'var(--color-terminal-dim)',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              cursor: 'pointer',
              padding: '1px 5px',
              lineHeight: 1,
            }}
          >
            {isFullscreen ? '⊡' : '⊞'}
          </button>
          {isStale && (
            <span
              style={{
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-terminal-amber)',
                background: 'rgba(255, 170, 0, 0.1)',
                padding: '1px 4px',
                borderRadius: '2px',
                letterSpacing: '0.5px',
              }}
            >
              STALE
            </span>
          )}
          <span
            style={{
              fontSize: '12px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-terminal-text)',
            }}
          >
            {symbol}
          </span>
        </div>
      </div>

      {/* SCROLLABLE CONTENT */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {!hasData && !loading && (
          <div
            style={{
              padding: '24px 8px',
              textAlign: 'center',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-terminal-dim)',
              letterSpacing: '0.5px',
            }}
          >
            NO DATA — CLICK ANALYZE
          </div>
        )}

        {error && (
          <div
            style={{
              padding: '6px 8px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-terminal-down)',
            }}
          >
            ERR: {error}
          </div>
        )}

        {/* TIMEFRAME SIGNALS */}
        {hasData && (
          <>
            <div
              style={{
                padding: '4px 8px 2px',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-terminal-dim)',
                letterSpacing: '0.5px',
                borderBottom: '1px solid var(--color-terminal-border)',
              }}
            >
              TIMEFRAME
            </div>
            {TIMEFRAMES.map((tf) => {
              const value = indicators?.[tf.key] ?? 'n/a'
              const color = directionColor(value)
              const { text, arrow } = directionLabel(value)

              return (
                <div
                  key={tf.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '4px 8px',
                    borderBottom: '1px solid var(--color-terminal-border)',
                  }}
                >
                  <span
                    style={{
                      fontSize: '12px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--color-terminal-muted)',
                    }}
                  >
                    {tf.label}
                  </span>
                  <span
                    style={{
                      fontSize: '12px',
                      fontFamily: 'var(--font-mono)',
                      color,
                      fontWeight: 600,
                    }}
                  >
                    {text} {arrow}
                  </span>
                </div>
              )
            })}

            {/* VERDICT */}
            <div
              style={{
                padding: '4px 8px 2px',
                marginTop: '4px',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-terminal-dim)',
                letterSpacing: '0.5px',
                borderBottom: '1px solid var(--color-terminal-border)',
              }}
            >
              VERDICT
            </div>
            <div
              style={{
                padding: '6px 8px',
                borderBottom: '1px solid var(--color-terminal-border)',
              }}
            >
              {/* Direction + Score row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '4px',
                }}
              >
                <span
                  style={{
                    fontSize: '13px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    color: directionColor(result.direction),
                  }}
                >
                  {directionLabel(result.direction).arrow}{' '}
                  {directionLabel(result.direction).text}
                </span>
                <span
                  style={{
                    fontSize: '12px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--color-terminal-text)',
                  }}
                >
                  {result.score.toFixed(1)}
                </span>
              </div>

              {/* Confidence bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginBottom: '4px',
                }}
              >
                <span
                  style={{
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--color-terminal-dim)',
                    flexShrink: 0,
                  }}
                >
                  CONF
                </span>
                <div
                  style={{
                    flex: 1,
                    height: '2px',
                    background: 'var(--color-terminal-border)',
                    borderRadius: '1px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${Math.round(result.confidence * 100)}%`,
                      height: '100%',
                      background: directionColor(result.direction),
                      borderRadius: '1px',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
                <span
                  style={{
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--color-terminal-text)',
                    flexShrink: 0,
                    minWidth: '28px',
                    textAlign: 'right',
                  }}
                >
                  {Math.round(result.confidence * 100)}%
                </span>
              </div>

              {/* Confluence */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span
                  style={{
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--color-terminal-dim)',
                  }}
                >
                  CONFLUENCE
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--color-terminal-muted)',
                  }}
                >
                  {result.confluence}
                </span>
              </div>
            </div>

            {/* HISTORY */}
            {history.length > 0 && (
              <>
                <div
                  style={{
                    padding: '4px 8px 2px',
                    marginTop: '4px',
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--color-terminal-dim)',
                    letterSpacing: '0.5px',
                    borderBottom: '1px solid var(--color-terminal-border)',
                  }}
                >
                  HISTORY
                </div>
                {history.slice(0, 5).map((entry) => {
                  const { text, arrow } = directionLabel(entry.direction)
                  const color = directionColor(entry.direction)

                  return (
                    <div
                      key={entry.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '3px 8px',
                        borderBottom: '1px solid var(--color-terminal-border)',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '11px',
                          fontFamily: 'var(--font-mono)',
                          color,
                        }}
                      >
                        {arrow} {text}
                      </span>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '11px',
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--color-terminal-muted)',
                          }}
                        >
                          {Math.round(entry.confidence * 100)}%
                        </span>
                        <span
                          style={{
                            fontSize: '11px',
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--color-terminal-dim)',
                          }}
                        >
                          {formatDate(entry.createdAt)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </>
        )}
      </div>

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
    </div>
  )
}
