'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { SignalStatus, SignalDirection, Exchange, Timeframe } from '@oculus/core'

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

  return { signals, loading, error, addSignal, updateSignal, deleteSignal, refetch: fetchSignals }
}
