'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { VerdictRecord } from '@/lib/intelligence/types'

const STALE_THRESHOLD_MS = 30 * 60 * 1000

interface UseIntelligenceOptions {
  /** When this value changes, the hook re-fetches history and latest result from the DB. */
  refreshKey?: number
}

interface UseIntelligenceReturn {
  result: VerdictRecord | null
  loading: boolean
  error: string | null
  history: VerdictRecord[]
  isStale: boolean
  analyze: (timeframes?: string[], opts?: { agentModelMap?: Record<string, string>; agentIds?: string[] }) => Promise<void>
  /** Manually re-fetch history + latest result from the database. */
  refresh: () => Promise<void>
}

export function useIntelligence(symbol: string, options?: UseIntelligenceOptions): UseIntelligenceReturn {
  const [result, setResult] = useState<VerdictRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<VerdictRecord[]>([])
  const [isStale, setIsStale] = useState(false)
  const mountedRef = useRef(true)
  const refreshKey = options?.refreshKey ?? 0

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/intelligence/verdicts?symbol=${encodeURIComponent(symbol)}&limit=50`
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (mountedRef.current) {
        const verdicts: VerdictRecord[] = data.verdicts ?? []
        setHistory(verdicts)
        // Also update result to the latest verdict
        if (verdicts.length > 0) {
          setResult(verdicts[0])
          setIsStale(false)
        }
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to fetch history')
      }
    }
  }, [symbol])

  const analyze = useCallback(
    async (timeframes?: string[], opts?: { agentModelMap?: Record<string, string>; agentIds?: string[] }): Promise<void> => {
      try {
        setLoading(true)
        setError(null)
        const res = await fetch('/api/intelligence/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol,
            timeframes: timeframes ?? ['1h', '4h', '1d', '1w', '1M'],
            agentModelMap: opts?.agentModelMap,
            agentIds: opts?.agentIds,
          }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (mountedRef.current) {
          setResult(data.verdict ?? null)
          setIsStale(false)
        }
        // Re-fetch history after analyze
        await fetchHistory()
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to analyze')
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false)
        }
      }
    },
    [symbol, fetchHistory]
  )

  // Re-fetch when refreshKey changes (triggered by other components completing analysis)
  useEffect(() => {
    if (refreshKey > 0) {
      fetchHistory()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  useEffect(() => {
    mountedRef.current = true
    let cancelled = false

    const init = async () => {
      try {
        const res = await fetch(
          `/api/intelligence/verdicts?symbol=${encodeURIComponent(symbol)}&limit=50`
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (cancelled) return
        const verdicts: VerdictRecord[] = data.verdicts ?? []
        setHistory(verdicts)
        if (verdicts.length > 0) {
          // Show most recent verdict immediately
          setResult(verdicts[0])
          // Check staleness — flag it but do NOT auto re-analyze
          const age = Date.now() - new Date(verdicts[0].createdAt).getTime()
          setIsStale(age > STALE_THRESHOLD_MS)
        }
        // No history — leave result null, user triggers analysis manually via UI
      } catch (err) {
        if (!cancelled && mountedRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to fetch history')
        }
      }
    }

    init()
    return () => {
      cancelled = true
      mountedRef.current = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol])

  return { result, loading, error, history, isStale, analyze, refresh: fetchHistory }
}
