'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { VerdictRecord } from '@/lib/intelligence/types'

const STALE_THRESHOLD_MS = 30 * 60 * 1000

function stripErrorAnalysts(verdict: VerdictRecord): VerdictRecord {
  const ERROR_REASONS = ['Mirofish backend unavailable', 'No model specified', 'Failed to parse', 'Mirofish analysis error', 'Mirofish error']
  return {
    ...verdict,
    analysts: verdict.analysts.filter(
      (a) => !(a.meta.id === 'mirofish' && ERROR_REASONS.some(r => a.reason.startsWith(r)))
    ),
  }
}

interface UseIntelligenceOptions {
  /** When this value changes, the hook re-fetches history and latest result from the DB. */
  refreshKey?: number
}

interface UseIntelligenceReturn {
  result: VerdictRecord | null
  loading: boolean
  loadingAgents: Set<string>
  error: string | null
  history: VerdictRecord[]
  isStale: boolean
  analyze: (timeframes?: string[], opts?: { agentModelMap?: Record<string, string>; agentIds?: string[] }) => Promise<void>
  analyzeAgent: (agentId: string, options?: { forceFresh?: boolean }) => Promise<void>
  /** Manually re-fetch history + latest result from the database. */
  refresh: () => Promise<void>
}

export function useIntelligence(symbol: string, options?: UseIntelligenceOptions): UseIntelligenceReturn {
  const [result, setResult] = useState<VerdictRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingAgents, setLoadingAgents] = useState<Set<string>>(new Set())
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
        const verdicts: VerdictRecord[] = (data.verdicts ?? []).map(stripErrorAnalysts)
        setHistory(verdicts)
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

  const pollJobRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())

  const analyzeAgent = useCallback(async (agentId: string, options?: { forceFresh?: boolean }) => {
    if (loadingAgents.has(agentId)) return

    setLoadingAgents(prev => new Set([...prev, agentId]))
    try {
      const res = await fetch('/api/intelligence/analyze/agent', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, agentId, forceFresh: options?.forceFresh }),
      })
      if (!res.ok) {
        setLoadingAgents(prev => { const n = new Set(prev); n.delete(agentId); return n })
        return
      }
      const data = await res.json() as { jobId: string; status: string; alreadyRunning?: boolean }
      const { jobId } = data

      const existingTimer = pollJobRef.current.get(agentId)
      if (existingTimer) clearInterval(existingTimer)

      const timer = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/intelligence/analyze/agent/${jobId}`, { credentials: 'include' })
          if (!pollRes.ok) return
          const job = await pollRes.json() as { status: string }

          if (job.status === 'completed' || job.status === 'failed') {
            clearInterval(timer)
            pollJobRef.current.delete(agentId)
            setLoadingAgents(prev => { const n = new Set(prev); n.delete(agentId); return n })
            if (job.status === 'completed') {
              await fetchHistory()
            }
          }
        } catch { }
      }, 3000)

      pollJobRef.current.set(agentId, timer)
    } catch {
      setLoadingAgents(prev => { const n = new Set(prev); n.delete(agentId); return n })
    }
  }, [symbol, loadingAgents, fetchHistory])

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
        const [verdictsRes, jobsRes] = await Promise.all([
          fetch(`/api/intelligence/verdicts?symbol=${encodeURIComponent(symbol)}&limit=50`),
          fetch(`/api/intelligence/analyze/agent?symbol=${encodeURIComponent(symbol)}`),
        ])

        if (cancelled) return

        if (verdictsRes.ok) {
          const data = await verdictsRes.json()
          const verdicts: VerdictRecord[] = (data.verdicts ?? []).map(stripErrorAnalysts)
          setHistory(verdicts)
          if (verdicts.length > 0) {
            setResult(verdicts[0])
            const age = Date.now() - new Date(verdicts[0].createdAt).getTime()
            setIsStale(age > STALE_THRESHOLD_MS)
          }
        }

        if (jobsRes.ok) {
          const jobsData = await jobsRes.json() as { jobs: Array<{ id: string; agentId: string; status: string }> }
          const activeAgentIds = new Set<string>()
          for (const j of jobsData.jobs ?? []) {
            if (j.status === 'pending' || j.status === 'running') {
              activeAgentIds.add(j.agentId)
              const timer = setInterval(async () => {
                try {
                  const r = await fetch(`/api/intelligence/analyze/agent/${j.id}`, { credentials: 'include' })
                  if (!r.ok) return
                  const s = await r.json() as { status: string }
                  if (s.status === 'completed' || s.status === 'failed') {
                    clearInterval(timer)
                    pollJobRef.current.delete(j.agentId)
                    setLoadingAgents(prev => { const n = new Set(prev); n.delete(j.agentId); return n })
                    if (s.status === 'completed') fetchHistory()
                  }
                } catch { }
              }, 3000)
              pollJobRef.current.set(j.agentId, timer)
            }
          }
          if (activeAgentIds.size > 0) {
            setLoadingAgents(activeAgentIds)
          }
        }
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
      for (const timer of pollJobRef.current.values()) clearInterval(timer)
      pollJobRef.current.clear()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol])

  return { result, loading, loadingAgents, error, history, isStale, analyze, analyzeAgent, refresh: fetchHistory }
}
