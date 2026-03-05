'use client'

import { Suspense, useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { TopBar } from '@/components/terminal/TopBar'
import { AssetTerminal } from '@/components/terminal/AssetTerminal'
import { StatusBar } from '@/components/terminal/StatusBar'

const CUSTOM_ASSETS_KEY = 'oculus:customAssets'

function loadCustomAssets(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(CUSTOM_ASSETS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.filter((s): s is string => typeof s === 'string')
    }
  } catch { /* ignore */ }
  return []
}

function TerminalContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const initialAsset = searchParams.get('asset')?.toUpperCase() || 'BTC'
  const [selectedSymbol, setSelectedSymbol] = useState(initialAsset)
  const [customAssets, setCustomAssets] = useState<string[]>([])
  const hydratedRef = useRef(false)

  // Hydrate custom assets from localStorage on mount
  useEffect(() => {
    setCustomAssets(loadCustomAssets())
    hydratedRef.current = true
  }, [])

  // Sync selected symbol to URL search param
  const handleSelectSymbol = useCallback((symbol: string) => {
    setSelectedSymbol(symbol)
    const url = new URL(window.location.href)
    url.searchParams.set('asset', symbol)
    router.replace(url.pathname + url.search, { scroll: false })
  }, [router])

  // Persist custom assets to localStorage when they change (after hydration)
  useEffect(() => {
    if (!hydratedRef.current) return
    localStorage.setItem(CUSTOM_ASSETS_KEY, JSON.stringify(customAssets))
  }, [customAssets])

  const handleAddAsset = useCallback((symbol: string) => {
    setCustomAssets((prev) => {
      const upper = symbol.toUpperCase()
      if (prev.includes(upper)) return prev
      return [...prev, upper]
    })
  }, [])

  // Compute all tracked symbols (defaults + custom) for price feeds
  const DEFAULT_SYMBOLS = ['BTC', 'ETH', 'SOL', 'BNB', 'TAO']
  const trackedSymbols = useMemo(() => {
    const syms = new Set(DEFAULT_SYMBOLS)
    for (const s of customAssets) {
      syms.add(s.toUpperCase())
    }
    return Array.from(syms)
  }, [customAssets])
  return (
    <div
      style={{
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-terminal-bg)',
        fontFamily: 'var(--font-mono)',
      }}
    >
      <TopBar
        selectedSymbol={selectedSymbol}
        onSelectSymbol={handleSelectSymbol}
        customAssets={customAssets}
        onAddAsset={handleAddAsset}
        trackedSymbols={trackedSymbols}
      />
      <AssetTerminal symbol={selectedSymbol} />
      <StatusBar />
    </div>
  )
}

export default function TerminalPage() {
  return (
    <Suspense>
      <TerminalContent />
    </Suspense>
  )
}
