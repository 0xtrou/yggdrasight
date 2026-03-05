'use client'

import { usePriceTicker } from '@/hooks/usePriceTicker'

function formatPrice(price: number): string {
  if (price >= 1000) return '$' + price.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (price >= 1) return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 4 })
}

const DISPLAY_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'] as const
const SYMBOL_LABELS: Record<string, string> = {
  BTCUSDT: 'BTC',
  ETHUSDT: 'ETH',
  SOLUSDT: 'SOL',
  BNBUSDT: 'BNB',
}

export function StatusBar() {
  const { tickers, connected } = usePriceTicker()

  return (
    <div
      style={{
        height: '32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        background: 'var(--color-terminal-panel)',
        borderTop: '1px solid var(--color-terminal-border)',
        flexShrink: 0,
        fontFamily: 'var(--font-mono)',
        fontSize: '10px',
      }}
    >
      {/* Left: Connection status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ color: connected ? 'var(--color-terminal-up)' : 'var(--color-terminal-amber)' }}>●</span>
          <span style={{ color: 'var(--color-terminal-muted)' }}>
            {connected ? 'CONNECTED' : 'CONNECTING...'}
          </span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ color: 'var(--color-terminal-up)' }}>◉</span>
          <span style={{ color: 'var(--color-terminal-muted)' }}>MongoDB: Ready</span>
        </span>
      </div>

      {/* Center: Live prices */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0', color: 'var(--color-terminal-text)' }}>
        {DISPLAY_SYMBOLS.map((sym, i) => {
          const ticker = tickers[sym]
          const label = SYMBOL_LABELS[sym]
          return (
            <span key={sym} style={{ display: 'flex', alignItems: 'center' }}>
              {i > 0 && <span style={{ color: 'var(--color-terminal-border)', margin: '0 8px' }}>│</span>}
              <span style={{ color: 'var(--color-terminal-muted)' }}>{label} </span>
              {ticker ? (
                <>
                  <span style={{ color: 'var(--color-terminal-text)' }}>{formatPrice(ticker.price)}</span>
                  <span
                    style={{
                      marginLeft: '4px',
                      fontSize: '9px',
                      color: ticker.change24h >= 0 ? 'var(--color-terminal-up)' : 'var(--color-terminal-down)',
                    }}
                  >
                    {ticker.change24h >= 0 ? '+' : ''}{ticker.change24h.toFixed(2)}%
                  </span>
                </>
              ) : (
                <span style={{ color: 'var(--color-terminal-dim)' }}>—</span>
              )}
            </span>
          )
        })}
      </div>

      {/* Right: Version */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--color-terminal-dim)' }}>
        <span>OCULUS v0.1.0-alpha</span>
        <span>2026-03-04</span>
      </div>
    </div>
  )
}
