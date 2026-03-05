'use client'

import { useSignals } from '@/hooks/useSignals'
import type { Signal } from '@/hooks/useSignals'

function statusColor(status: string): string {
  if (status === 'active') return 'var(--color-terminal-up)'
  if (status === 'pending') return 'var(--color-terminal-amber)'
  if (status === 'tp_hit') return 'var(--color-terminal-up)'
  if (status === 'sl_hit') return 'var(--color-terminal-down)'
  return 'var(--color-terminal-dim)'
}

function statusLabel(status: string): string {
  return status.replace('_', ' ').toUpperCase()
}

function formatPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (price >= 1) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return price.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 6 })
}

interface SignalRowProps {
  sig: Signal
  index: number
  onSelect: () => void
  isSelected: boolean
}

function SignalRow({ sig, index, onSelect, isSelected }: SignalRowProps) {
  const dirLong = sig.direction === 'long'
  const tp1 = sig.takeProfits[0]

  return (
    <div
      style={{
        padding: '7px 10px',
        borderBottom: '1px solid var(--color-terminal-border)',
        background: isSelected ? 'rgba(68,136,255,0.08)' : (index % 2 === 0 ? 'var(--color-terminal-surface)' : 'var(--color-terminal-bg)'),
        outline: isSelected ? '1px solid var(--color-terminal-blue)' : 'none',
        fontFamily: 'var(--font-mono)',
        cursor: 'pointer',
      }}
      onClick={onSelect}
    >
      {/* Row 1: symbol + direction + status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-terminal-text)' }}>{sig.symbol}</span>
        <span
          style={{
            fontSize: '9px',
            padding: '1px 4px',
            background: dirLong ? 'rgba(0,255,136,0.15)' : 'rgba(255,59,59,0.15)',
            color: dirLong ? 'var(--color-terminal-up)' : 'var(--color-terminal-down)',
            border: `1px solid ${dirLong ? 'var(--color-terminal-up)' : 'var(--color-terminal-down)'}`,
          }}
        >
          {sig.direction.toUpperCase()}
        </span>
        <span style={{ fontSize: '9px', color: statusColor(sig.status), marginLeft: 'auto' }}>
          ● {statusLabel(sig.status)}
        </span>
      </div>
      {/* Row 2: entry / sl */}
      <div style={{ fontSize: '10px', color: 'var(--color-terminal-muted)', marginBottom: '2px' }}>
        Entry: <span style={{ color: 'var(--color-terminal-text)' }}>{formatPrice(sig.entryPrice)}</span>
        <span style={{ margin: '0 6px', color: 'var(--color-terminal-border)' }}>│</span>
        SL: <span style={{ color: 'var(--color-terminal-down)' }}>{formatPrice(sig.stopLoss)}</span>
      </div>
      {/* Row 3: TPs */}
      {tp1 && (
        <div style={{ fontSize: '10px', color: 'var(--color-terminal-muted)', marginBottom: '2px' }}>
          TP1: <span style={{ color: 'var(--color-terminal-up)' }}>{formatPrice(tp1.price)}</span>
          {sig.takeProfits[1] && (
            <>
              <span style={{ margin: '0 6px', color: 'var(--color-terminal-border)' }}>│</span>
              TP2: <span style={{ color: 'var(--color-terminal-up)' }}>{formatPrice(sig.takeProfits[1].price)}</span>
            </>
          )}
        </div>
      )}
      {/* Row 4: source / tf */}
      <div style={{ fontSize: '9px', color: 'var(--color-terminal-dim)' }}>
        {sig.source} · {sig.timeframe}
      </div>
    </div>
  )
}

interface SignalFeedPanelProps {
  onSelectSymbol: (symbol: string) => void
  selectedSymbol: string
}

export function SignalFeedPanel({ onSelectSymbol, selectedSymbol }: SignalFeedPanelProps) {
  const { signals, loading, error } = useSignals()

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        borderRight: '1px solid var(--color-terminal-border)',
      }}
    >
      {/* Panel header */}
      <div
        style={{
          padding: '4px 10px',
          background: 'var(--color-terminal-panel)',
          borderBottom: '1px solid var(--color-terminal-border)',
          fontSize: '9px',
          letterSpacing: '0.12em',
          color: 'var(--color-terminal-muted)',
          fontFamily: 'var(--font-mono)',
          flexShrink: 0,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>SIGNAL FEED</span>
        <span style={{ color: 'var(--color-terminal-dim)' }}>
          {loading ? '...' : `${signals.length} signals`}
        </span>
      </div>

      {/* Signal rows */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {loading && (
          <div
            style={{
              padding: '20px 10px',
              textAlign: 'center',
              fontSize: '10px',
              color: 'var(--color-terminal-dim)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            LOADING SIGNALS...
          </div>
        )}

        {error && !loading && (
          <div
            style={{
              padding: '20px 10px',
              textAlign: 'center',
              fontSize: '10px',
              color: 'var(--color-terminal-down)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            ERR: {error}
          </div>
        )}

        {!loading && !error && signals.length === 0 && (
          <div
            style={{
              padding: '30px 10px',
              textAlign: 'center',
              fontSize: '10px',
              color: 'var(--color-terminal-dim)',
              fontFamily: 'var(--font-mono)',
              lineHeight: 1.8,
            }}
          >
            NO SIGNALS
            <br />
            <span style={{ color: 'var(--color-terminal-muted)', fontSize: '9px' }}>
              Press + to create your first signal
            </span>
          </div>
        )}

        {!loading &&
          signals.map((sig, i) => {
            const baseSym = sig.symbol.replace(/\/USDT$/i, '').replace(/USDT$/i, '').replace(/[^A-Z]/gi, '').toUpperCase()
            return (
              <SignalRow
                key={sig.id}
                sig={sig}
                index={i}
                onSelect={() => onSelectSymbol(baseSym)}
                isSelected={baseSym === selectedSymbol}
              />
            )
          })}

      </div>
    </div>
  )
}
