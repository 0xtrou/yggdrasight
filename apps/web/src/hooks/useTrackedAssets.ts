'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

export interface TrackedAssetEntry {
  symbol: string
  name: string | null
  addedAt: string
}

export interface UseTrackedAssetsResult {
  assets: TrackedAssetEntry[]
  symbols: string[]
  loading: boolean
  error: string | null
  addAsset: (symbol: string, name?: string) => Promise<void>
  removeAsset: (symbol: string) => Promise<void>
  refresh: () => Promise<void>
}

export function useTrackedAssets(): UseTrackedAssetsResult {
  const [assets, setAssets] = useState<TrackedAssetEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const fetchAssets = useCallback(async () => {
    try {
      const res = await fetch('/api/tracked-assets')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      const data: TrackedAssetEntry[] = await res.json()
      if (mountedRef.current) {
        setAssets(data)
        setError(null)
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to fetch tracked assets')
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    fetchAssets()
    return () => {
      mountedRef.current = false
    }
  }, [fetchAssets])

  const addAsset = useCallback(
    async (symbol: string, name?: string) => {
      const upper = symbol.trim().toUpperCase().replace(/USDT$/i, '')
      if (!upper) return

      // Optimistic update
      setAssets((prev) => {
        if (prev.some((a) => a.symbol === upper)) return prev
        return [...prev, { symbol: upper, name: name ?? null, addedAt: new Date().toISOString() }]
      })

      try {
        const res = await fetch('/api/tracked-assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: upper, name }),
        })
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }
        // Re-fetch to get server truth
        await fetchAssets()
      } catch (err) {
        console.error('[useTrackedAssets] addAsset failed:', err)
        // Rollback optimistic update
        await fetchAssets()
      }
    },
    [fetchAssets],
  )

  const removeAsset = useCallback(
    async (symbol: string) => {
      const upper = symbol.trim().toUpperCase().replace(/USDT$/i, '')
      if (!upper) return

      // Optimistic update
      setAssets((prev) => prev.filter((a) => a.symbol !== upper))

      try {
        const res = await fetch(`/api/tracked-assets?symbol=${encodeURIComponent(upper)}`, {
          method: 'DELETE',
        })
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }
        // Re-fetch to get server truth
        await fetchAssets()
      } catch (err) {
        console.error('[useTrackedAssets] removeAsset failed:', err)
        // Rollback optimistic update
        await fetchAssets()
      }
    },
    [fetchAssets],
  )

  const symbols = assets.map((a) => a.symbol)

  return { assets, symbols, loading, error, addAsset, removeAsset, refresh: fetchAssets }
}
