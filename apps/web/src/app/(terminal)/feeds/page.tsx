'use client'

import { Suspense, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { MarketDataPanel } from '@/components/terminal/panels/MarketDataPanel'

const DEFAULT_SYMBOL = 'BTC'
const POPULAR_SYMBOLS = ['BTC', 'ETH', 'SOL', 'BNB', 'TAO', 'DOGE', 'XRP', 'ADA', 'AVAX', 'DOT']

function FeedsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const initialAsset = searchParams.get('asset')?.toUpperCase() || DEFAULT_SYMBOL
  const [selectedSymbol, setSelectedSymbol] = useState(initialAsset)

  const handleSelectSymbol = useCallback((symbol: string) => {
    setSelectedSymbol(symbol)
    const url = new URL(window.location.href)
    url.searchParams.set('asset', symbol)
    router.replace(url.pathname + url.search, { scroll: false })
  }, [router])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', background: 'var(--color-terminal-bg)' }}>
      {/* Header bar */}
      <div
        style={{
          height: '40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          background: 'var(--color-terminal-surface)',
          borderBottom: '1px solid var(--color-terminal-border)',
          flexShrink: 0,
          fontFamily: 'var(--font-mono)',
        }}
      >
        {/* Left: Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ color: 'var(--color-terminal-amber)', fontWeight: 700, fontSize: '13px', letterSpacing: '0.12em' }}>
            DATA FEEDS
          </span>
          <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px', letterSpacing: '0.06em' }}>
            NEWS · SOCIAL · ON-CHAIN · AGGREGATED
          </span>
        </div>

        {/* Right: Symbol selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px', marginRight: '4px' }}>ASSET</span>
          {POPULAR_SYMBOLS.map((sym) => {
            const active = sym === selectedSymbol
            return (
              <button
                key={sym}
                onClick={() => handleSelectSymbol(sym)}
                style={{
                  background: active ? 'var(--color-terminal-amber)' : 'transparent',
                  border: active ? 'none' : '1px solid var(--color-terminal-border)',
                  color: active ? '#000' : 'var(--color-terminal-muted)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  fontWeight: active ? 700 : 400,
                  padding: '2px 8px',
                  cursor: 'pointer',
                  letterSpacing: '0.05em',
                  transition: 'all 0.1s ease',
                }}
              >
                {sym}
              </button>
            )
          })}
        </div>
      </div>

      {/* Market Data Panel — takes remaining space */}
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <MarketDataPanel symbol={selectedSymbol} />
      </div>
    </div>
  )
}

export default function FeedsPage() {
  return (
    <Suspense>
      <FeedsContent />
    </Suspense>
  )
}
