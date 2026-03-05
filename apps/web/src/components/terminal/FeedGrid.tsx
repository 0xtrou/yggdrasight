'use client'

import { useState, useEffect } from 'react'
import { useSignals, type Signal } from '@/hooks/useSignals'

type ViewMode = 'LIST' | 'GRID'

function formatTime(iso: string): string {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

function sourceBadge(source: string): { color: string; bg: string } {
  switch (source.toLowerCase()) {
    case 'tradingview':
      return { color: '#ffaa00', bg: 'rgba(255,170,0,0.1)' }
    case 'telegram':
      return { color: '#4488ff', bg: 'rgba(68,136,255,0.1)' }
    case 'webhook':
      return { color: '#00ff88', bg: 'rgba(0,255,136,0.1)' }
    default:
      return { color: '#888888', bg: 'rgba(136,136,136,0.1)' }
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'active':
      return '#4488ff'
    case 'tp_hit':
      return '#00ff88'
    case 'sl_hit':
      return '#ff3b3b'
    case 'pending':
      return '#ffaa00'
    default:
      return '#888888'
  }
}

function confColor(conf: number): string {
  if (conf >= 0.7) return '#00ff88'
  if (conf < 0.5) return '#ffaa00'
  return '#888888'
}

function FeedListRow({ signal }: { signal: Signal }) {
  const src = sourceBadge(signal.source)
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '8px 12px',
        borderBottom: '1px solid var(--color-terminal-border)',
        fontFamily: 'var(--font-mono)',
        flexWrap: 'nowrap',
        minHeight: '36px',
      }}
    >
      <span style={{ color: 'var(--color-terminal-dim)', fontSize: '11px', minWidth: '64px', flexShrink: 0 }}>
        {formatTime(signal.createdAt)}
      </span>
      <span
        style={{
          color: src.color,
          background: src.bg,
          fontSize: '10px',
          letterSpacing: '0.1em',
          padding: '2px 6px',
          textTransform: 'uppercase',
          flexShrink: 0,
        }}
      >
        {signal.source}
      </span>
      <span
        style={{
          color: 'var(--color-terminal-text)',
          fontSize: '12px',
          fontWeight: 700,
          minWidth: '80px',
          flexShrink: 0,
        }}
      >
        {signal.symbol}
      </span>
      <span
        style={{
          color: signal.direction === 'long' ? '#00ff88' : '#ff3b3b',
          background:
            signal.direction === 'long' ? 'rgba(0,255,136,0.15)' : 'rgba(255,59,59,0.15)',
          fontSize: '10px',
          fontWeight: 700,
          padding: '2px 6px',
          flexShrink: 0,
        }}
      >
        {signal.direction}
      </span>
      <span
        style={{
          color: statusColor(signal.status),
          background: `${statusColor(signal.status)}18`,
          fontSize: '10px',
          padding: '2px 6px',
          flexShrink: 0,
        }}
      >
        {signal.status}
      </span>
      <span style={{ color: 'var(--color-terminal-dim)', fontSize: '11px', flexShrink: 0 }}>
        @ ${signal.entryPrice.toFixed(2)}
      </span>
      <span style={{ color: '#ff3b3b', fontSize: '11px', flexShrink: 0 }}>
        SL ${signal.stopLoss.toFixed(2)}
      </span>
      <span style={{ color: '#00ff88', fontSize: '11px', flexShrink: 0 }}>
        {signal.takeProfits.map((tp) => `TP${tp.level} $${tp.price.toFixed(0)}`).join(' ')}
      </span>
      <span style={{ color: confColor(signal.confidence), fontSize: '11px', marginLeft: 'auto', flexShrink: 0 }}>
        CONF {Math.round(signal.confidence * 100)}%
      </span>
      {Object.keys(signal.indicators).length > 0 && (
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px', flexShrink: 0 }}>
          · {Object.keys(signal.indicators).join(' · ')}
        </span>
      )}
    </div>
  )
}

function FeedGridCard({ signal }: { signal: Signal }) {
  const src = sourceBadge(signal.source)
  const indKeys = Object.keys(signal.indicators)
  return (
    <div
      style={{
        background: 'var(--color-terminal-panel)',
        border: '1px solid var(--color-terminal-border)',
        padding: '12px',
        fontFamily: 'var(--font-mono)',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      {/* Row 1: source badge + direction + symbol */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span
          style={{
            color: src.color,
            background: src.bg,
            fontSize: '10px',
            letterSpacing: '0.1em',
            padding: '2px 6px',
            textTransform: 'uppercase',
          }}
        >
          {signal.source}
        </span>
        <span
          style={{
            color: signal.direction === 'long' ? '#00ff88' : '#ff3b3b',
            background:
              signal.direction === 'long' ? 'rgba(0,255,136,0.15)' : 'rgba(255,59,59,0.15)',
            fontSize: '10px',
            fontWeight: 700,
            padding: '2px 6px',
          }}
        >
          {signal.direction}
        </span>
        <span style={{ color: 'var(--color-terminal-text)', fontSize: '13px', fontWeight: 700 }}>
          {signal.symbol}
        </span>
      </div>
      {/* Row 2: status + confidence */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <span
          style={{
            color: statusColor(signal.status),
            background: `${statusColor(signal.status)}18`,
            fontSize: '10px',
            padding: '2px 6px',
          }}
        >
          {signal.status}
        </span>
        <span style={{ color: confColor(signal.confidence), fontSize: '11px' }}>
          CONF {Math.round(signal.confidence * 100)}%
        </span>
      </div>
      {/* Row 3: entry */}
      <div style={{ display: 'flex', gap: '6px' }}>
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px' }}>ENTRY</span>
        <span style={{ color: 'var(--color-terminal-text)', fontSize: '11px' }}>
          ${signal.entryPrice.toFixed(2)}
        </span>
      </div>
      {/* Row 4: stop + TPs */}
      <div style={{ display: 'flex', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px' }}>STOP</span>
          <span style={{ color: '#ff3b3b', fontSize: '11px' }}>${signal.stopLoss.toFixed(2)}</span>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px' }}>TPS</span>
          <span style={{ color: '#00ff88', fontSize: '11px' }}>
            {signal.takeProfits.map((tp) => `$${tp.price.toFixed(0)}`).join(' ')}
          </span>
        </div>
      </div>
      {/* Row 5: timeframe + exchange */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px' }}>{signal.timeframe}</span>
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px' }}>{signal.exchange}</span>
      </div>
      {/* Row 6: indicator chips */}
      {indKeys.length > 0 && (
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {indKeys.map((k) => (
            <span
              key={k}
              style={{
                color: 'var(--color-terminal-dim)',
                background: 'var(--color-terminal-surface)',
                fontSize: '9px',
                padding: '1px 4px',
                border: '1px solid var(--color-terminal-border)',
              }}
            >
              {k}
            </span>
          ))}
        </div>
      )}
      {/* Row 7: timestamp */}
      <div style={{ color: 'var(--color-terminal-dim)', fontSize: '10px', textAlign: 'right' }}>
        {formatTime(signal.createdAt)}
      </div>
    </div>
  )
}

export function FeedGrid() {
  const { signals, loading, error, refetch } = useSignals()
  const [mode, setMode] = useState<ViewMode>('LIST')

  useEffect(() => {
    const id = setInterval(() => {
      refetch()
    }, 5000)
    return () => clearInterval(id)
  }, [refetch])

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    background: 'transparent',
    border: 'none',
    borderBottom: active
      ? '2px solid var(--color-terminal-amber)'
      : '2px solid transparent',
    color: active ? 'var(--color-terminal-text)' : 'var(--color-terminal-muted)',
    fontSize: '11px',
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.08em',
    padding: '0 12px',
    height: '32px',
    cursor: 'pointer',
  })

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-terminal-bg)',
        fontFamily: 'var(--font-mono)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          height: '40px',
          borderBottom: '1px solid var(--color-terminal-border)',
          background: 'var(--color-terminal-surface)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span
            style={{
              color: 'var(--color-terminal-text)',
              fontSize: '12px',
              fontWeight: 700,
              letterSpacing: '0.1em',
            }}
          >
            INTELLIGENCE FEED
          </span>
          <span style={{ color: 'var(--color-terminal-muted)', fontSize: '11px' }}>
            {signals.length} ENTRIES
          </span>
        </div>
        <div style={{ display: 'flex' }}>
          <button style={tabBtnStyle(mode === 'LIST')} onClick={() => setMode('LIST')}>
            LIST
          </button>
          <button style={tabBtnStyle(mode === 'GRID')} onClick={() => setMode('GRID')}>
            GRID
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
            }}
          >
            <span
              style={{
                color: 'var(--color-terminal-dim)',
                fontSize: '12px',
                letterSpacing: '0.1em',
              }}
            >
              LOADING FEED...
            </span>
          </div>
        )}
        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
            }}
          >
            <span style={{ color: 'var(--color-terminal-down)', fontSize: '12px' }}>
              FEED ERROR: {error}
            </span>
          </div>
        )}
        {!loading && !error && signals.length === 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: '8px',
            }}
          >
            <span
              style={{
                color: 'var(--color-terminal-muted)',
                fontSize: '13px',
                letterSpacing: '0.12em',
              }}
            >
              NO FEED DATA
            </span>
            <span
              style={{
                color: 'var(--color-terminal-dim)',
                fontSize: '11px',
                letterSpacing: '0.08em',
              }}
            >
              AWAITING INBOUND SIGNALS
            </span>
          </div>
        )}
        {!loading && !error && signals.length > 0 && mode === 'LIST' && (
          <div>
            {signals.map((s) => (
              <FeedListRow key={s.id} signal={s} />
            ))}
          </div>
        )}
        {!loading && !error && signals.length > 0 && mode === 'GRID' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px',
              padding: '12px',
            }}
          >
            {signals.map((s) => (
              <FeedGridCard key={s.id} signal={s} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
