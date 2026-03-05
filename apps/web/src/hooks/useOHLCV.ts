'use client'

import { useState, useEffect, useRef } from 'react'

export interface Candle {
  time: number   // Unix seconds
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface UseOHLCVResult {
  candles: Candle[]
  loading: boolean
  error: string | null
}

export function useOHLCV(symbol: string, interval: string): UseOHLCVResult {
  const [candles, setCandles] = useState<Candle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function fetchCandles() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(
          `/api/prices/ohlcv?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=500`,
        )
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
        }
        const data: { candles: Candle[] } = await res.json()
        if (!cancelled && mountedRef.current) {
          setCandles(data.candles ?? [])
        }
      } catch (err) {
        if (!cancelled && mountedRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to fetch OHLCV')
        }
      } finally {
        if (!cancelled && mountedRef.current) {
          setLoading(false)
        }
      }
    }

    fetchCandles()

    return () => {
      cancelled = true
    }
  }, [symbol, interval])

  return { candles, loading, error }
}
