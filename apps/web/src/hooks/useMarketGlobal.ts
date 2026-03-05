'use client'

import { useState, useEffect, useRef } from 'react'

export interface MarketGlobalData {
  btcDominance: number
  totalMarketCap: number
  totalVolume24h: number
  fearGreedValue: number
  fearGreedLabel: string
}

export interface UseMarketGlobalResult {
  data: MarketGlobalData | null
  loading: boolean
  error: string | null
}

export function useMarketGlobal(): UseMarketGlobalResult {
  const [data, setData] = useState<MarketGlobalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true

    async function fetchGlobal() {
      try {
        const res = await fetch('/api/market/global')
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
        }
        const json: MarketGlobalData = await res.json()
        if (mountedRef.current) {
          setData(json)
          setError(null)
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to fetch market data')
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false)
        }
      }
    }

    fetchGlobal()

    const interval = setInterval(fetchGlobal, 60_000)

    return () => {
      mountedRef.current = false
      clearInterval(interval)
    }
  }, [])

  return { data, loading, error }
}
