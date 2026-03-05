'use client'

import { useEffect, useRef } from 'react'

interface DiscoveryDialogProps {
  open: boolean
  onClose: () => void
  discovering: boolean
  discoveryElapsed: number
  discoveryLogs: string[]
  rawOutput: string | null
  symbol: string
}

function formatElapsed(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function DiscoveryDialog({
  open,
  onClose,
  discovering,
  discoveryElapsed,
  discoveryLogs,
  rawOutput,
  symbol,
}: DiscoveryDialogProps) {
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

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (open && discovering) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [discoveryLogs, open, discovering])

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
      {/* Backdrop click area — covers everything, click outside header closes */}
      <div
        style={{ position: 'absolute', inset: 0, zIndex: -1 }}
        onClick={onClose}
      />

      {/* Dialog panel — stop propagation so inner clicks don't close */}
      <div
        style={{
          position: 'relative',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'var(--color-terminal-bg)',
          border: '1px solid var(--color-terminal-border)',
          margin: '0',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
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
          {/* Status dot */}
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: discovering ? 'var(--color-terminal-amber)' : 'var(--color-terminal-up)',
              display: 'inline-block',
              flexShrink: 0,
              animation: discovering ? 'pulse 1s infinite' : 'none',
            }}
          />

          {/* Symbol + state */}
          <span style={{ color: 'var(--color-terminal-text)', fontSize: '13px', fontWeight: 'bold', letterSpacing: '0.1em' }}>
            {symbol}
          </span>
          <span style={{ color: 'var(--color-terminal-muted)', fontSize: '11px' }}>
            {discovering ? 'AGENT REASONING...' : 'COMPLETED'}
          </span>

          {/* Elapsed timer (only while running) */}
          {discovering && (
            <span
              style={{
                color: 'var(--color-terminal-amber)',
                fontSize: '11px',
                fontWeight: 'bold',
                letterSpacing: '0.08em',
              }}
            >
              {formatElapsed(discoveryElapsed)}
            </span>
          )}

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Close button */}
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
              transition: 'color 0.1s, border-color 0.1s',
            }}
          >
            ✕ CLOSE
          </button>
        </div>

        {/* ── Body ── */}
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
          {discovering ? (
            /* Live logs */
            <>
              {discoveryLogs.length === 0 ? (
                <span style={{ color: 'var(--color-terminal-dim)', fontSize: '11px' }}>Initializing agent process...</span>
              ) : (
                discoveryLogs.map((log, i) => (
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
            /* Raw output */
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

        {/* Pulse animation style */}
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
          }
        `}</style>
      </div>
    </div>
  )
}
