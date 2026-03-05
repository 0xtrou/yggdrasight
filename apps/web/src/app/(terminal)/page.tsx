'use client'

import { Suspense, useState, useCallback, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { TopBar } from '@/components/terminal/TopBar'
import { AssetTerminal } from '@/components/terminal/AssetTerminal'
import { useTrackedAssets } from '@/hooks/useTrackedAssets'

function TerminalContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const initialAsset = searchParams.get('asset')?.toUpperCase() || 'BTC'
  const [selectedSymbol, setSelectedSymbol] = useState(initialAsset)
  const { symbols: trackedSymbols, addAsset } = useTrackedAssets()

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
    syms.add(selectedSymbol)
    return Array.from(syms)
  }, [trackedSymbols, selectedSymbol])

  return (
    <>
      <TopBar
        selectedSymbol={selectedSymbol}
        onSelectSymbol={handleSelectSymbol}
        customAssets={trackedSymbols}
        onAddAsset={handleAddAsset}
        trackedSymbols={allSymbols}
      />
      <AssetTerminal symbol={selectedSymbol} />
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
