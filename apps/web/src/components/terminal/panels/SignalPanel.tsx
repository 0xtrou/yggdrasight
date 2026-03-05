'use client'

import { useState, useEffect, useCallback } from 'react'
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
}

const TIMEFRAMES = [
  { label: '1H', key: 'h1' },
  { label: '4H', key: 'h4' },
  { label: '1D', key: 'd1' },
  { label: '1W', key: 'w1' },
  { label: '1M', key: 'mn' },
] as const

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

export function SignalPanel({ symbol, onAnalysisComplete }: SignalPanelProps) {
  const { result, loading, error, history, isStale, analyze } = useIntelligence(symbol)

  const [selectedModel, setSelectedModel] = useState<string>('')
  const [selectedAgents, setSelectedAgents] = useState<string[]>([])
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([])
  const [availableAgents, setAvailableAgents] = useState<AgentInfo[]>([])
  const [configOpen, setConfigOpen] = useState(false)
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

  const modelsByProvider = availableModels.reduce<Record<string, ModelInfo[]>>((acc, m) => {
    if (!acc[m.provider]) acc[m.provider] = []
    acc[m.provider].push(m)
    return acc
  }, {})

  const handleAnalyze = () => {
    if (!loading) {
      analyze(undefined, {
        model: selectedModel || undefined,
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
            fontSize: '13px',
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
              fontSize: '13px',
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
                fontSize: '11px',
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
              fontSize: '13px',
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
              fontSize: '12px',
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
              fontSize: '12px',
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
                fontSize: '12px',
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
                      fontSize: '13px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--color-terminal-muted)',
                    }}
                  >
                    {tf.label}
                  </span>
                  <span
                    style={{
                      fontSize: '13px',
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
                fontSize: '12px',
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
                    fontSize: '14px',
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
                    fontSize: '13px',
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
                    fontSize: '12px',
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
                    fontSize: '12px',
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
                    fontSize: '12px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--color-terminal-dim)',
                  }}
                >
                  CONFLUENCE
                </span>
                <span
                  style={{
                    fontSize: '12px',
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
                    fontSize: '12px',
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
                          fontSize: '12px',
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
                            fontSize: '12px',
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--color-terminal-muted)',
                          }}
                        >
                          {Math.round(entry.confidence * 100)}%
                        </span>
                        <span
                          style={{
                            fontSize: '12px',
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

      {/* AI CONFIG */}
      <div
        style={{
          borderTop: '1px solid var(--color-terminal-border)',
          flexShrink: 0,
        }}
      >
        <div
          onClick={() => setConfigOpen(!configOpen)}
          style={{
            padding: '4px 8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <span
            style={{
              fontSize: '12px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-terminal-dim)',
              letterSpacing: '0.5px',
            }}
          >
            AI CONFIG
          </span>
          <span
            style={{
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-terminal-dim)',
            }}
          >
            {configOpen ? '▾' : '▸'}
          </span>
        </div>
        {configOpen && (
          <div style={{ padding: '0 8px 6px' }}>
            {/* Model Selector */}
            <div style={{ marginBottom: '6px' }}>
              <label
                style={{
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-terminal-dim)',
                  letterSpacing: '0.5px',
                  display: 'block',
                  marginBottom: '2px',
                }}
              >
                MODEL
              </label>
              <select
                value={selectedModel}
                onChange={(e) => {
                  setSelectedModel(e.target.value)
                  if (!e.target.value) setSelectedAgents([])
                }}
                style={{
                  width: '100%',
                  padding: '3px 4px',
                  background: 'var(--color-terminal-bg)',
                  color: 'var(--color-terminal-text)',
                  border: '1px solid var(--color-terminal-border)',
                  borderRadius: '2px',
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono)',
                  outline: 'none',
                  cursor: 'pointer',
                  appearance: 'none' as const,
                  WebkitAppearance: 'none' as const,
                }}
              >
                <option value="">(Deterministic Only)</option>
                {Object.entries(modelsByProvider).map(([provider, models]) => (
                  <optgroup key={provider} label={provider.toUpperCase()}>
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            {/* Agent Chips */}
            {selectedModel && availableAgents.length > 0 && (
              <div>
                <label
                  style={{
                  fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--color-terminal-dim)',
                    letterSpacing: '0.5px',
                    display: 'block',
                    marginBottom: '3px',
                  }}
                >
                  AGENTS
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                  {availableAgents.map((agent) => {
                    const isSelected = selectedAgents.includes(agent.id)
                    return (
                      <button
                        key={agent.id}
                        onClick={() => toggleAgent(agent.id)}
                        title={agent.description}
                        style={{
                          padding: '2px 6px',
                          fontSize: '11px',
                          fontFamily: 'var(--font-mono)',
                          border: '1px solid ' + (isSelected ? 'var(--color-terminal-blue)' : 'var(--color-terminal-border)'),
                          borderRadius: '2px',
                          background: isSelected ? 'rgba(68, 136, 255, 0.15)' : 'var(--color-terminal-bg)',
                          color: isSelected ? 'var(--color-terminal-blue)' : 'var(--color-terminal-muted)',
                          cursor: 'pointer',
                          letterSpacing: '0.3px',
                          lineHeight: '1.4',
                          textTransform: 'uppercase',
                        }}
                      >
                        {agent.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

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
            fontSize: '13px',
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
