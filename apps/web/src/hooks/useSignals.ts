'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { SignalStatus, SignalDirection, Exchange, Timeframe } from '@yggdrasight/core'

export interface Signal {
  id: string
  symbol: string
  direction: SignalDirection
  status: SignalStatus
  source: string
  exchange: Exchange
  timeframe: Timeframe
  entryPrice: number
  currentPrice?: number
  stopLoss: number
  takeProfits: { level: number; price: number; hit: boolean; hitAt?: string | null }[]
  leverage?: number
  confidence: number
  indicators: Record<string, unknown>
  notes?: string
  createdAt: string
  updatedAt: string
}

interface UseSignalsReturn {
  signals: Signal[]
  loading: boolean
  error: string | null
  addSignal: (data: Record<string, unknown>) => Promise<Signal | null>
  updateSignal: (id: string, data: Record<string, unknown>) => Promise<Signal | null>
  deleteSignal: (id: string) => Promise<boolean>
  deleteSignals: (ids: string[]) => Promise<number>
  refetch: () => Promise<void>
}

export function useSignals(): UseSignalsReturn {
  const [signals, setSignals] = useState<Signal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const fetchSignals = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/signals')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (mountedRef.current) {
        setSignals(data.signals ?? [])
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to fetch signals')
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    fetchSignals()
    return () => {
      mountedRef.current = false
    }
  }, [fetchSignals])

  // Listen for cross-instance signal updates
  useEffect(() => {
    const handler = () => { fetchSignals() }
    window.addEventListener('signals-updated', handler)
    return () => window.removeEventListener('signals-updated', handler)
  }, [fetchSignals])

  const addSignal = useCallback(
    async (data: Record<string, unknown>): Promise<Signal | null> => {
      try {
        const res = await fetch('/api/signals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || `HTTP ${res.status}`)
        }
        const result = await res.json()
        const created = result.signal as Signal
        // Optimistic: prepend to list
        if (mountedRef.current) {
          setSignals((prev) => [created, ...prev])
        }
        return created
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to create signal')
        }
        return null
      }
    },
    [],
  )

  const updateSignal = useCallback(
    async (id: string, data: Record<string, unknown>): Promise<Signal | null> => {
      try {
        const res = await fetch(`/api/signals/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const result = await res.json()
        const updated = result.signal as Signal
        // Optimistic update
        if (mountedRef.current) {
          setSignals((prev) => prev.map((s) => (s.id === id ? updated : s)))
        }
        return updated
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to update signal')
        }
        return null
      }
    },
    [],
  )

  const deleteSignal = useCallback(async (id: string): Promise<boolean> => {
    try {
      // Optimistic: remove immediately
      if (mountedRef.current) {
        setSignals((prev) => prev.filter((s) => s.id !== id))
      }
      const res = await fetch(`/api/signals/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        // Rollback on failure — refetch
        fetchSignals()
        throw new Error(`HTTP ${res.status}`)
      }
      return true
    } catch {
      return false
    }
  }, [fetchSignals])


  const deleteSignals = useCallback(async (ids: string[]): Promise<number> => {
    if (!ids.length) return 0
    try {
      // Optimistic: remove immediately
      if (mountedRef.current) {
        setSignals((prev) => prev.filter((s) => !ids.includes(s.id)))
      }
      const res = await fetch('/api/signals', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      if (!res.ok) {
        fetchSignals()
        throw new Error(`HTTP ${res.status}`)
      }
      const result = await res.json()
      return result.deleted as number
    } catch {
      return 0
    }
  }, [fetchSignals])

  return { signals, loading, error, addSignal, updateSignal, deleteSignal, deleteSignals, refetch: fetchSignals }
}

// ── Signal Crawl Hook ────────────────────────────────────────────────────────

export interface CrawlJob {
  id: string
  screen: string
  agentSlug: string
  symbols: string[]
  status: 'pending' | 'running' | 'completed' | 'failed'
  signals: {
    symbol: string
    direction: 'long' | 'short'
    entryPrice: number
    stopLoss: number
    takeProfits: { level: number; price: number }[]
    timeframe: string
    confidence: number
    rationale: string
    exchange: string
  }[]
  savedSignalIds: string[]
  logs: string[]
  error: string | null
  startedAt: string
  completedAt: string | null
}

interface UseSignalCrawlReturn {
  crawling: boolean
  job: CrawlJob | null
  startCrawl: (symbols: string[]) => Promise<void>
  cancelCrawl: () => Promise<void>
  clearJob: () => void
}
export function useSignalCrawl(
  onComplete?: () => void,
  screen = 'signals',
  agentSlug = 'signal_crawler',
): UseSignalCrawlReturn {
  const [crawling, setCrawling] = useState(false)
  const [job, setJob] = useState<CrawlJob | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(true)

  const pollJob = useCallback(async (jobId: string) => {
    try {
      const res = await fetch(`/api/signals/crawl/${jobId}`)
      if (!res.ok) return
      const data = await res.json() as CrawlJob
      if (!mountedRef.current) return
      setJob(data)
      if (data.status === 'completed' || data.status === 'failed') {
        setCrawling(false)
        if (pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
        }
        if (data.status === 'completed') onComplete?.()
      }
    } catch {
      // Network error — keep polling
    }
  }, [onComplete])

  useEffect(() => {
    mountedRef.current = true
    // On mount: query the backend for the most recent active job for this screen+agent
    fetch(`/api/signals/crawl?screen=${screen}&agent=${agentSlug}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { jobs?: CrawlJob[] } | null) => {
        if (!mountedRef.current || !data?.jobs?.length) return
        // Pick most recent pending/running job
        const active = data.jobs.find(j => j.status === 'pending' || j.status === 'running')
        if (active) {
          setJob(active)
          setCrawling(true)
          pollRef.current = setInterval(() => pollJob(active.id), 3000)
        } else {
          // Surface most recent finished job so results are visible after reload
          setJob(data.jobs[0] ?? null)
        }
      })
      .catch(() => { /* non-critical — start fresh */ })
    return () => {
      mountedRef.current = false
      if (pollRef.current) clearInterval(pollRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startCrawl = useCallback(async (symbols: string[]) => {
    if (crawling) return
    try {
      setCrawling(true)
      setJob(null)
      const res = await fetch('/api/signals/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols, screen, agentSlug }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      const { jobId } = await res.json() as { jobId: string }
      // Start polling every 3s
      pollRef.current = setInterval(() => pollJob(jobId), 3000)
      // Kick off first poll immediately
      pollJob(jobId)
    } catch (err) {
      setCrawling(false)
      console.error('[useSignalCrawl] startCrawl error:', err)
    }
  }, [crawling, pollJob, screen, agentSlug])

  const clearJob = useCallback(() => {
    setJob(null)
    setCrawling(false)
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])


  const cancelCrawl = useCallback(async () => {
    if (!job?.id) return
    try {
      await fetch(`/api/signals/crawl/${job.id}`, { method: 'DELETE' })
      // Stop polling
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      // Refresh job state from server
      const res = await fetch(`/api/signals/crawl/${job.id}`)
      if (res.ok && mountedRef.current) setJob(await res.json())
      setCrawling(false)
    } catch (err) {
      console.error('[useSignalCrawl] cancelCrawl error:', err)
    }
  }, [job?.id])

  return { crawling, job, startCrawl, cancelCrawl, clearJob }
}
