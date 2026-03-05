'use client'

import { useEffect, useRef } from 'react'

interface ClassificationDialogProps {
  open: boolean
  onClose: () => void
  classifying: boolean
  classifyElapsed: number
  classifyLogs: string[]
  rawOutput: string | null
  symbol: string
}

function formatElapsed(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function ClassificationDialog({
  open,
  onClose,
  classifying,
  classifyElapsed,
  classifyLogs,
  rawOutput,
  symbol,
}: ClassificationDialogProps) {
  const logsEndRef = useRef<HTMLDivElement>(null)

  // Escape key
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Auto-scroll
  useEffect(() => {
    if (open && classifying) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [classifyLogs, open, classifying])

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-terminal-bg)',
        fontFamily: 'var(--font-mono)',
      }}
    >
      <div
        style={{ position: 'absolute', inset: 0, zIndex: -1 }}
        onClick={onClose}
      />

      <div
        style={{
          position: 'relative',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'var(--color-terminal-bg)',
          border: '1px solid var(--color-terminal-border)',
          margin: 0,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            height: '44px',
            minHeight: '44px',
            display: 'flex',
            alignItems: 'center',
            padding: '0 16px',
            gap: '12px',
            background: 'var(--color-terminal-panel)',
            borderBottom: '1px solid var(--color-terminal-border)',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: classifying ? 'var(--color-terminal-amber)' : 'var(--color-terminal-up)',
              display: 'inline-block',
              flexShrink: 0,
              animation: classifying ? 'clf-pulse 1s infinite' : 'none',
            }}
          />
          <span style={{ color: 'var(--color-terminal-text)', fontSize: '13px', fontWeight: 'bold', letterSpacing: '0.1em' }}>
            {symbol}
          </span>
          <span style={{ color: 'var(--color-terminal-amber)', fontSize: '11px', letterSpacing: '0.08em' }}>
            CLASSIFICATION
          </span>
          <span style={{ color: 'var(--color-terminal-muted)', fontSize: '11px' }}>
            {classifying ? 'AGENTS RUNNING...' : 'COMPLETED'}
          </span>
          {classifying && (
            <span style={{ color: 'var(--color-terminal-amber)', fontSize: '11px', fontWeight: 'bold', letterSpacing: '0.08em' }}>
              {formatElapsed(classifyElapsed)}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid var(--color-terminal-border)',
              color: 'var(--color-terminal-dim)',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              cursor: 'pointer',
              padding: '3px 10px',
              letterSpacing: '0.08em',
            }}
          >
            ✕ CLOSE
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '16px',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          {classifying ? (
            <>
              {classifyLogs.length === 0 ? (
                <span style={{ color: 'var(--color-terminal-dim)', fontSize: '11px' }}>
                  Initializing classification agents...
                </span>
              ) : (
                classifyLogs.map((log, i) => (
                  <div
                    key={i}
                    style={{
                      color: 'var(--color-terminal-muted)',
                      fontSize: '11px',
                      lineHeight: 1.7,
                      borderLeft: '2px solid var(--color-terminal-border)',
                      paddingLeft: '10px',
                    }}
                  >
                    <span style={{ color: 'var(--color-terminal-dim)', marginRight: '8px', fontSize: '9px' }}>
                      {String(i + 1).padStart(3, '0')}
                    </span>
                    {log}
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </>
          ) : rawOutput ? (
            <pre
              style={{
                color: 'var(--color-terminal-text)',
                fontSize: '12px',
                lineHeight: 1.7,
                fontFamily: 'var(--font-mono)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                margin: 0,
              }}
            >
              {rawOutput}
            </pre>
          ) : (
            <div style={{ color: 'var(--color-terminal-dim)', fontSize: '11px' }}>
              No output available.
            </div>
          )}
        </div>

        <style>{`
          @keyframes clf-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
          }
        `}</style>
      </div>
    </div>
  )
}
