'use client'

import { Suspense, useState, useCallback, useMemo, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { TopBar } from '@/components/terminal/TopBar'
import { AssetTerminal } from '@/components/terminal/AssetTerminal'
import { useTrackedAssets } from '@/hooks/useTrackedAssets'

function TerminalContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const urlAsset = searchParams.get('asset')?.toUpperCase() || null
  const [selectedSymbol, setSelectedSymbol] = useState(urlAsset ?? '')
  const { symbols: trackedSymbols, addAsset } = useTrackedAssets()

  // Once tracked assets load, pick a valid selected symbol:
  // - If URL param matches a tracked asset, use it
  // - Otherwise default to first tracked asset (or '' if none)
  useEffect(() => {
    if (trackedSymbols.length === 0) {
      setSelectedSymbol('')
      return
    }
    if (selectedSymbol && trackedSymbols.includes(selectedSymbol)) return
    const pick = urlAsset && trackedSymbols.includes(urlAsset) ? urlAsset : trackedSymbols[0]
    setSelectedSymbol(pick)
  }, [trackedSymbols, urlAsset, selectedSymbol])

  // Sync selected symbol to URL search param
  const handleSelectSymbol = useCallback((symbol: string) => {
    setSelectedSymbol(symbol)
    const url = new URL(window.location.href)
    url.searchParams.set('asset', symbol)
    router.replace(url.pathname + url.search, { scroll: false })
  }, [router])

  const handleAddAsset = useCallback((symbol: string) => {
    addAsset(symbol)
    handleSelectSymbol(symbol)
  }, [addAsset, handleSelectSymbol])

  // All tracked symbols + currently selected (in case it's not tracked yet)
  const allSymbols = useMemo(() => {
    const syms = new Set(trackedSymbols)
    if (selectedSymbol) syms.add(selectedSymbol)
    return Array.from(syms)
  }, [trackedSymbols, selectedSymbol])

  const hasAssets = trackedSymbols.length > 0 && !!selectedSymbol

  return (
    <>
      <TopBar
        selectedSymbol={selectedSymbol}
        onSelectSymbol={handleSelectSymbol}
        customAssets={trackedSymbols}
        onAddAsset={handleAddAsset}
        trackedSymbols={allSymbols}
        hasAssets={hasAssets}
      />
      {trackedSymbols.length === 0 ? (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--color-terminal-bg)',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <span style={{ fontSize: '40px', opacity: 0.3 }}>⬢</span>
            <span
              style={{
                fontSize: '12px',
                color: 'var(--color-terminal-dim)',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              NO ASSETS TRACKED
            </span>
            <span
              style={{
                fontSize: '10px',
                color: 'var(--color-terminal-muted)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              Add your first asset to begin analysis
            </span>
            <button
              onClick={() => router.push('/assets')}
              style={{
                background: 'transparent',
                border: '1px solid var(--color-terminal-up)',
                color: 'var(--color-terminal-up)',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                letterSpacing: '0.1em',
                padding: '8px 20px',
                cursor: 'pointer',
                transition: 'all 0.15s',
                textTransform: 'uppercase',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(0,255,136,0.08)'
                e.currentTarget.style.borderColor = '#00ff88'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.borderColor = 'var(--color-terminal-up)'
              }}
            >
              ▸ TRACK AN ASSET
            </button>
          </div>
        </div>
      ) : (
        <AssetTerminal symbol={selectedSymbol} />
      )}
    </>
  )
}

export default function TerminalPage() {
  return (
    <Suspense>
      <TerminalContent />
    </Suspense>
  )
}
