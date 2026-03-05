'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

export interface FeedEntry {
  id: string
  time: string
  source: string
  headline: string
  url?: string
  sentiment?: 'up' | 'down' | 'neutral'
  value?: number
}

export type FeedTab = 'NEWS' | 'SOCIAL' | 'ON-CHAIN' | 'AGGREGATED'

const TAB_ENDPOINTS: Record<FeedTab, string> = {
  NEWS: '/api/feed/news',
  SOCIAL: '/api/feed/social',
  'ON-CHAIN': '/api/feed/onchain',
  AGGREGATED: '', // Aggregated fetches all three and merges
}

export interface UseMarketFeedResult {
  entries: FeedEntry[]
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useMarketFeed(tab: FeedTab, symbol: string): UseMarketFeedResult {
  const [entries, setEntries] = useState<FeedEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    let cancelled = false

    async function fetchFeed() {
      setLoading(true)
      setError(null)

      try {
        if (tab === 'AGGREGATED') {
          // Fetch all three feeds in parallel and merge
          const [newsRes, socialRes, onchainRes] = await Promise.all([
            fetch(`/api/feed/news?symbol=${symbol}`).then((r) => r.ok ? r.json() : { entries: [] }).catch(() => ({ entries: [] })),
            fetch(`/api/feed/social?symbol=${symbol}`).then((r) => r.ok ? r.json() : { entries: [] }).catch(() => ({ entries: [] })),
            fetch(`/api/feed/onchain?symbol=${symbol}`).then((r) => r.ok ? r.json() : { entries: [] }).catch(() => ({ entries: [] })),
          ])

          if (cancelled) return

          const all: FeedEntry[] = [
            ...(newsRes.entries || []),
            ...(socialRes.entries || []),
            ...(onchainRes.entries || []),
          ]
          // Sort by time descending
          all.sort((a: FeedEntry, b: FeedEntry) => b.time.localeCompare(a.time))

          if (mountedRef.current) {
            setEntries(all)
          }
        } else {
          const endpoint = TAB_ENDPOINTS[tab]
          const res = await fetch(`${endpoint}?symbol=${symbol}`)
          if (cancelled) return

          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`)
          }
          const data = await res.json()
          if (mountedRef.current) {
            setEntries(data.entries || [])
          }
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to fetch feed')
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false)
        }
      }
    }

    fetchFeed()

    // Auto-refresh every 2 minutes
    const interval = setInterval(fetchFeed, 120_000)

    return () => {
      cancelled = true
      mountedRef.current = false
      clearInterval(interval)
    }
  }, [tab, symbol, refreshKey])

  return { entries, loading, error, refresh }
}
