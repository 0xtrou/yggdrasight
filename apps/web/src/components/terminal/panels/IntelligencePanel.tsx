'use client'

import { useIntelligence } from '@/hooks/useIntelligence'
import type { VerdictRecord, AnalystVerdict } from '@/lib/intelligence/types'
import { useState } from 'react'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '2px' }}>
      <div style={{
        padding: '5px 10px 3px',
        fontSize: '9px',
        letterSpacing: '0.12em',
        color: 'var(--color-terminal-dim)',
        background: 'var(--color-terminal-panel)',
        borderBottom: '1px solid var(--color-terminal-border)',
        borderTop: '1px solid var(--color-terminal-border)',
        fontFamily: 'var(--font-mono)',
      }}>
        {title}
      </div>
      <div>{children}</div>
    </div>
  )
}

function StatRow({ label, value, valueColor = 'var(--color-terminal-text)' }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      padding: '5px 10px',
      borderBottom: '1px solid var(--color-terminal-border)',
      fontFamily: 'var(--font-mono)',
      fontSize: '11px',
    }}>
      <span style={{ color: 'var(--color-terminal-muted)' }}>{label}</span>
      <span style={{ color: valueColor }}>{value}</span>
    </div>
  )
}

function VerdictBadge({ direction }: { direction: 'long' | 'short' | 'neutral' }) {
  const directionMap = {
    long: { label: 'BUY ▲', color: 'var(--color-terminal-up)' },
    short: { label: 'SELL ▼', color: 'var(--color-terminal-down)' },
    neutral: { label: 'NEUTRAL —', color: 'var(--color-terminal-amber)' },
  }
  
  const { label, color } = directionMap[direction]
  
  return (
    <span style={{ color, fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 'bold' }}>
      {label}
    </span>
  )
}

function ConfidenceBar({ confidence, color }: { confidence: number; color: string }) {
  return (
    <div style={{
      height: '2px',
      backgroundColor: color,
      width: `${confidence * 100}%`,
      transition: 'width 0.3s ease',
    }} />
  )
}

interface IntelligencePanelProps {
  symbol: string
}

export function IntelligencePanel({ symbol }: IntelligencePanelProps) {
  const { result, loading, error, history, analyze } = useIntelligence(symbol)
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  const handleAnalyze = async () => {
    setIsAnalyzing(true)
    try {
      await analyze()
    } finally {
      setIsAnalyzing(false)
    }
  }

  const getDirectionColor = (direction: 'long' | 'short' | 'neutral') => {
    switch (direction) {
      case 'long':
        return 'var(--color-terminal-up)'
      case 'short':
        return 'var(--color-terminal-down)'
      case 'neutral':
        return 'var(--color-terminal-amber)'
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', background: 'var(--color-terminal-surface)' }}>
      {/* Panel header */}
      <div style={{
        padding: '4px 10px',
        background: 'var(--color-terminal-panel)',
        borderBottom: '1px solid var(--color-terminal-border)',
        fontSize: '9px',
        letterSpacing: '0.12em',
        color: 'var(--color-terminal-muted)',
        fontFamily: 'var(--font-mono)',
        flexShrink: 0,
      }}>
        INTELLIGENCE
      </div>

      {error && (
        <div style={{
          padding: '10px',
          background: 'var(--color-terminal-panel)',
          borderBottom: '1px solid var(--color-terminal-border)',
          fontSize: '9px',
          color: 'var(--color-terminal-down)',
          fontFamily: 'var(--font-mono)',
        }}>
          ERROR: {error}
        </div>
      )}

      {loading && !result ? (
        <div style={{
          padding: '20px 10px',
          textAlign: 'center',
          fontSize: '10px',
          color: 'var(--color-terminal-dim)',
          fontFamily: 'var(--font-mono)',
        }}>
          COMPUTING...
        </div>
      ) : result ? (
        <>
          {/* Verdict Section */}
          <Section title="VERDICT">
            <div style={{
              padding: '10px',
              borderBottom: '1px solid var(--color-terminal-border)',
              fontFamily: 'var(--font-mono)',
            }}>
              <div style={{ marginBottom: '5px' }}>
                <VerdictBadge direction={result.direction} />
              </div>
              <ConfidenceBar confidence={result.confidence} color={getDirectionColor(result.direction)} />
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: '5px',
                fontSize: '10px',
                color: 'var(--color-terminal-muted)',
              }}>
                <span>Confidence: {(result.confidence * 100).toFixed(0)}%</span>
                <span>Score: {result.score.toFixed(2)}</span>
              </div>
            </div>
            <StatRow label="Confluence" value={`${(result.confluence * 100).toFixed(0)}%`} valueColor="var(--color-terminal-blue)" />
          </Section>

          {/* Analysts Section */}
          {result.analysts && result.analysts.length > 0 && (
            <Section title={`ANALYSTS (${result.analysts.length})`}>
              {result.analysts.map((analyst: AnalystVerdict, idx: number) => (
                <div key={idx} style={{
                  padding: '8px 10px',
                  borderBottom: '1px solid var(--color-terminal-border)',
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '3px',
                  }}>
                    <span style={{ color: 'var(--color-terminal-text)' }}>{analyst.meta.name}</span>
                    <span style={{
                      color: getDirectionColor(analyst.direction as any),
                      fontSize: '9px',
                      fontWeight: 'bold',
                    }}>
                      {analyst.direction === 'long' ? '▲ LONG' : analyst.direction === 'short' ? '▼ SHORT' : '— NEUTRAL'}
                    </span>
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '3px',
                  }}>
                    <span style={{ color: 'var(--color-terminal-muted)', fontSize: '9px' }}>
                      {analyst.meta.description}
                    </span>
                    <span style={{ color: 'var(--color-terminal-blue)', fontSize: '9px' }}>
                      {(analyst.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  {analyst.reason && (
                    <div style={{
                      color: 'var(--color-terminal-dim)',
                      fontSize: '8px',
                      marginTop: '2px',
                      lineHeight: '1.3',
                    }}>
                      {analyst.reason}
                    </div>
                  )}
                </div>
              ))}
            </Section>
          )}

          {/* History Section */}
          {history.length > 0 && (
            <Section title={`HISTORY (${history.length})`}>
              {history.slice(0, 5).map((record: VerdictRecord, idx: number) => (
                <div key={idx} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '5px 10px',
                  borderBottom: '1px solid var(--color-terminal-border)',
                  fontSize: '9px',
                  fontFamily: 'var(--font-mono)',
                }}>
                  <span style={{ color: getDirectionColor(record.direction as any) }}>
                    {record.direction === 'long' ? '▲ BUY' : record.direction === 'short' ? '▼ SELL' : '— NEUTRAL'}
                  </span>
                  <span style={{ color: 'var(--color-terminal-blue)' }}>
                    {(record.confidence * 100).toFixed(0)}%
                  </span>
                  <span style={{ color: 'var(--color-terminal-muted)' }}>
                    {new Date(record.createdAt).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </Section>
          )}
        </>

      ) : (
        <div style={{
          padding: '20px 10px',
          textAlign: 'center',
          fontSize: '10px',
          color: 'var(--color-terminal-dim)',
          fontFamily: 'var(--font-mono)',
        }}>
          NO VERDICTS
        </div>
      )}

      {/* Analyze Button */}
      <div style={{
        padding: '10px',
        marginTop: 'auto',
        borderTop: '1px solid var(--color-terminal-border)',
      }}>
        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing}
          style={{
            width: '100%',
            background: 'var(--color-terminal-blue)',
            color: '#fff',
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
  )
}
