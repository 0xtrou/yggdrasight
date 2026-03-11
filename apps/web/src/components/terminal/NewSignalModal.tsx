'use client'

import { useState, useCallback } from 'react'
import { Exchange, SignalDirection, Timeframe, ProviderType, AssetClass } from '@yggdrasight/core'

interface NewSignalModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: Record<string, unknown>) => Promise<unknown>
}

const EXCHANGE_OPTIONS = Object.values(Exchange).filter((e) => e !== Exchange.UNKNOWN)
const TIMEFRAME_OPTIONS = Object.values(Timeframe)

export function NewSignalModal({ open, onClose, onSubmit }: NewSignalModalProps) {
  const [symbol, setSymbol] = useState('')
  const [exchange, setExchange] = useState<Exchange>(Exchange.BINANCE)
  const [direction, setDirection] = useState<SignalDirection>(SignalDirection.LONG)
  const [entryPrice, setEntryPrice] = useState('')
  const [stopLoss, setStopLoss] = useState('')
  const [takeProfit1, setTakeProfit1] = useState('')
  const [timeframe, setTimeframe] = useState<Timeframe>(Timeframe.H4)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const reset = useCallback(() => {
    setSymbol('')
    setExchange(Exchange.BINANCE)
    setDirection(SignalDirection.LONG)
    setEntryPrice('')
    setStopLoss('')
    setTakeProfit1('')
    setTimeframe(Timeframe.H4)
    setNotes('')
    setError('')
  }, [])

  const handleClose = useCallback(() => {
    reset()
    onClose()
  }, [onClose, reset])

  const handleSubmit = useCallback(async () => {
    // Validate
    if (!symbol.trim()) { setError('Symbol is required'); return }
    if (!entryPrice || isNaN(Number(entryPrice))) { setError('Valid entry price required'); return }
    if (!stopLoss || isNaN(Number(stopLoss))) { setError('Valid stop loss required'); return }
    if (!takeProfit1 || isNaN(Number(takeProfit1))) { setError('Valid take profit required'); return }

    setSubmitting(true)
    setError('')

    try {
      await onSubmit({
        symbol: symbol.trim().toUpperCase(),
        exchange,
        direction,
        entryPrice: Number(entryPrice),
        stopLoss: Number(stopLoss),
        takeProfits: [{ level: 1, price: Number(takeProfit1) }],
        timeframe,
        source: ProviderType.MANUAL,
        sourceProvider: 'manual',
        assetClass: AssetClass.CRYPTO,
        confidenceScore: 50,
        notes: notes.trim() || undefined,
      })
      reset()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create signal')
    } finally {
      setSubmitting(false)
    }
  }, [symbol, exchange, direction, entryPrice, stopLoss, takeProfit1, timeframe, notes, onSubmit, onClose, reset])

  if (!open) return null

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--color-terminal-bg)',
    border: '1px solid var(--color-terminal-border)',
    color: 'var(--color-terminal-text)',
    fontFamily: 'var(--font-mono)',
    fontSize: '12px',
    padding: '8px 10px',
    outline: 'none',
    borderRadius: 0,
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '9px',
    letterSpacing: '0.12em',
    color: 'var(--color-terminal-dim)',
    fontFamily: 'var(--font-mono)',
    marginBottom: '4px',
    display: 'block',
  }

  return (
    <div
      onClick={handleClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '420px',
          background: 'var(--color-terminal-surface)',
          border: '1px solid var(--color-terminal-border)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 12px',
            background: 'var(--color-terminal-panel)',
            borderBottom: '1px solid var(--color-terminal-border)',
          }}
        >
          <span style={{ fontSize: '10px', letterSpacing: '0.12em', color: 'var(--color-terminal-amber)' }}>
            NEW SIGNAL
          </span>
          <button
            onClick={handleClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-terminal-muted)',
              cursor: 'pointer',
              fontSize: '14px',
              fontFamily: 'var(--font-mono)',
              padding: '0 4px',
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Symbol */}
          <div>
            <label style={labelStyle}>SYMBOL</label>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="BTC/USDT"
              style={inputStyle}
              autoFocus
            />
          </div>

          {/* Exchange + Timeframe row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div>
              <label style={labelStyle}>EXCHANGE</label>
              <select
                value={exchange}
                onChange={(e) => setExchange(e.target.value as Exchange)}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                {EXCHANGE_OPTIONS.map((ex) => (
                  <option key={ex} value={ex}>
                    {ex.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>TIMEFRAME</label>
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value as Timeframe)}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                {TIMEFRAME_OPTIONS.map((tf) => (
                  <option key={tf} value={tf}>
                    {tf}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Direction toggle */}
          <div>
            <label style={labelStyle}>DIRECTION</label>
            <div style={{ display: 'flex', gap: '0' }}>
              {[SignalDirection.LONG, SignalDirection.SHORT].map((dir) => (
                <button
                  key={dir}
                  onClick={() => setDirection(dir)}
                  style={{
                    flex: 1,
                    padding: '8px',
                    background:
                      direction === dir
                        ? dir === SignalDirection.LONG
                          ? 'rgba(0,255,136,0.15)'
                          : 'rgba(255,59,59,0.15)'
                        : 'var(--color-terminal-bg)',
                    border: `1px solid ${
                      direction === dir
                        ? dir === SignalDirection.LONG
                          ? 'var(--color-terminal-up)'
                          : 'var(--color-terminal-down)'
                        : 'var(--color-terminal-border)'
                    }`,
                    color:
                      direction === dir
                        ? dir === SignalDirection.LONG
                          ? 'var(--color-terminal-up)'
                          : 'var(--color-terminal-down)'
                        : 'var(--color-terminal-muted)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    fontWeight: direction === dir ? 700 : 400,
                    letterSpacing: '0.08em',
                    cursor: 'pointer',
                    borderRadius: 0,
                  }}
                >
                  {dir.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Price fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
            <div>
              <label style={labelStyle}>ENTRY PRICE</label>
              <input
                type="number"
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                placeholder="0.00"
                style={inputStyle}
                step="any"
              />
            </div>
            <div>
              <label style={labelStyle}>STOP LOSS</label>
              <input
                type="number"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                placeholder="0.00"
                style={{ ...inputStyle, borderColor: 'rgba(255,59,59,0.3)' }}
                step="any"
              />
            </div>
            <div>
              <label style={labelStyle}>TAKE PROFIT</label>
              <input
                type="number"
                value={takeProfit1}
                onChange={(e) => setTakeProfit1(e.target.value)}
                placeholder="0.00"
                style={{ ...inputStyle, borderColor: 'rgba(0,255,136,0.3)' }}
                step="any"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label style={labelStyle}>NOTES (OPTIONAL)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Analysis notes..."
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', minHeight: '48px' }}
            />
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                padding: '6px 10px',
                background: 'rgba(255,59,59,0.1)',
                border: '1px solid rgba(255,59,59,0.3)',
                color: 'var(--color-terminal-down)',
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
            padding: '10px 12px',
            borderTop: '1px solid var(--color-terminal-border)',
            background: 'var(--color-terminal-panel)',
          }}
        >
          <button
            onClick={handleClose}
            style={{
              background: 'transparent',
              border: '1px solid var(--color-terminal-border)',
              color: 'var(--color-terminal-muted)',
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              letterSpacing: '0.08em',
              padding: '6px 16px',
              cursor: 'pointer',
              borderRadius: 0,
            }}
          >
            CANCEL
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              background: submitting ? 'var(--color-terminal-dim)' : 'rgba(0,255,136,0.15)',
              border: '1px solid var(--color-terminal-up)',
              color: 'var(--color-terminal-up)',
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              padding: '6px 16px',
              cursor: submitting ? 'default' : 'pointer',
              borderRadius: 0,
              opacity: submitting ? 0.5 : 1,
            }}
          >
            {submitting ? 'SENDING...' : 'SUBMIT SIGNAL'}
          </button>
        </div>
      </div>
    </div>
  )
}
