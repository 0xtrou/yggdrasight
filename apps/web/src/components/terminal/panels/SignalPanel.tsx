'use client'

import { useState, useEffect, useCallback } from 'react'
import { useIntelligence } from '@/hooks/useIntelligence'
import type { VerdictRecord, AnalystVerdict } from '@/lib/intelligence/types'

interface SignalPanelProps {
  symbol: string
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

// ─── Main component ───

export function SignalPanel({ symbol }: SignalPanelProps) {
  const { result, loading, error, history, isStale } = useIntelligence(symbol)
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

  const mtf = extractMtfAnalyst(result)
  const indicators = mtf?.indicators as Record<string, string> | undefined

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

        {hasData && (
          <>
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

            {/* TIMEFRAME */}
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
    </div>
  )
}
