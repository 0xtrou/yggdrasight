'use client'

import { useMarketCoins } from '@/hooks/useMarketCoins'

function formatMarketCap(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}t`
  if (value >= 1e9) return `$${Math.round(value / 1e9)}b`
  if (value >= 1e6) return `$${Math.round(value / 1e6)}m`
  return `$${value}`
}

export function FundamentalsPanel() {
  const { coins, loading, error } = useMarketCoins()

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
        FUNDAMENTALS
      </div>

      {loading ? (
        <div style={{
          padding: '20px 10px',
          textAlign: 'center',
          fontSize: '10px',
          color: 'var(--color-terminal-dim)',
          fontFamily: 'var(--font-mono)',
        }}>
          LOADING...
        </div>
      ) : error ? (
        <div style={{
          padding: '20px 10px',
          textAlign: 'center',
          fontSize: '10px',
          color: 'var(--color-terminal-down)',
          fontFamily: 'var(--font-mono)',
        }}>
          UPSTREAM ERR
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '30px 50px 1fr 70px 1fr 1fr',
            padding: '4px 10px',
            fontSize: '9px',
            letterSpacing: '0.08em',
            color: 'var(--color-terminal-dim)',
            fontFamily: 'var(--font-mono)',
            borderBottom: '1px solid var(--color-terminal-border)',
            background: 'var(--color-terminal-panel)',
          }}>
            <span>#</span>
            <span>SYM</span>
            <span>PRICE</span>
            <span style={{ textAlign: 'right' }}>24H%</span>
            <span style={{ textAlign: 'right' }}>MCAP</span>
            <span style={{ textAlign: 'right' }}>VOL</span>
          </div>

          {/* Data rows */}
          {coins.map((coin, i) => (
            <div
              key={coin.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '30px 50px 1fr 70px 1fr 1fr',
                padding: '4px 10px',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                borderBottom: '1px solid var(--color-terminal-border)',
                background: i % 2 === 0 ? 'var(--color-terminal-surface)' : 'var(--color-terminal-panel)',
              }}
            >
              <span style={{ color: 'var(--color-terminal-dim)' }}>{coin.rank}</span>
              <span style={{ color: 'var(--color-terminal-amber)', textTransform: 'uppercase' }}>{coin.symbol}</span>
              <span style={{ color: 'var(--color-terminal-text)' }}>
                ${coin.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span style={{
                textAlign: 'right',
                color: coin.priceChange24h >= 0 ? 'var(--color-terminal-up)' : 'var(--color-terminal-down)',
              }}>
                {coin.priceChange24h >= 0 ? '+' : ''}{coin.priceChange24h.toFixed(2)}%
              </span>
              <span style={{ textAlign: 'right', color: 'var(--color-terminal-blue)' }}>
                {formatMarketCap(coin.marketCap)}
              </span>
              <span style={{ textAlign: 'right', color: 'var(--color-terminal-muted)' }}>
                {formatMarketCap(coin.volume24h)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
