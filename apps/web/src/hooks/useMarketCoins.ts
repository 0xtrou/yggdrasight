'use client'

import { useState, useEffect, useRef } from 'react'

export interface CoinData {
  id: string
  symbol: string
  name: string
  currentPrice: number
  marketCap: number
  volume24h: number
  priceChange24h: number
  rank: number
}

export interface UseMarketCoinsResult {
  coins: CoinData[]
  loading: boolean
  error: string | null
}

export function useMarketCoins(symbols?: string[]): UseMarketCoinsResult {
  const [coins, setCoins] = useState<CoinData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  // Stable key for the symbols array to avoid unnecessary refetches
  const symbolsKey = symbols ? symbols.sort().join(',') : ''

  useEffect(() => {
    mountedRef.current = true

    async function fetchCoins() {
      try {
        let url = '/api/market/coins'
        if (symbolsKey) {
          url += `?symbols=${encodeURIComponent(symbolsKey)}`
        }
        const res = await fetch(url)
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
        }
        const json: CoinData[] = await res.json()
        if (mountedRef.current) {
          setCoins(json)
          setError(null)
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to fetch coin data')
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false)
        }
      }
    }

    fetchCoins()

    const interval = setInterval(fetchCoins, 60_000)

    return () => {
      mountedRef.current = false
      clearInterval(interval)
    }
  }, [symbolsKey])

  return { coins, loading, error }
}
