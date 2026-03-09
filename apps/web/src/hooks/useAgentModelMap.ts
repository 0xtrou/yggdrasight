'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

interface UseAgentModelMapReturn {
  /** Full model map from DB */
  modelMap: Record<string, string>
  /** Whether initial fetch is still loading */
  isLoading: boolean
  /** Get model for a specific agent key, with optional fallback */
  getModel: (key: string, fallback?: string) => string
  /** Set model for a specific key — persists to DB immediately */
  setModel: (key: string, value: string) => void
  /** Replace the full map (used by AI config page) — persists to DB */
  setFullMap: (map: Record<string, string>) => void
  /** Available models list */
  models: Array<{ id: string; provider: string; name: string }>
  /** Refresh from server */
  refresh: () => Promise<void>
}

export function useAgentModelMap(): UseAgentModelMapReturn {
  const [modelMap, setModelMap] = useState<Record<string, string>>({})
  const [models, setModels] = useState<Array<{ id: string; provider: string; name: string }>>([])
  const [isLoading, setIsLoading] = useState(true)
  const mapRef = useRef(modelMap) // Keep ref for callbacks
  mapRef.current = modelMap

  const fetchFromAPI = useCallback(async () => {
    try {
      const res = await fetch('/api/intelligence/models')
      if (!res.ok) return
      const data = await res.json()
      if (data.modelMap && typeof data.modelMap === 'object') {
        setModelMap(data.modelMap)
      }
      if (Array.isArray(data.models)) {
        setModels(data.models)
      }
    } catch { /* ignore */ } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchFromAPI() }, [fetchFromAPI])

  const getModel = useCallback((key: string, fallback?: string): string => {
    return mapRef.current[key] || fallback || ''
  }, [])

  const setModel = useCallback((key: string, value: string) => {
    setModelMap(prev => ({ ...prev, [key]: value }))
    // Fire and forget — persist to DB
    fetch('/api/intelligence/models', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    }).catch(() => { /* ignore */ })
  }, [])

  const setFullMap = useCallback((map: Record<string, string>) => {
    setModelMap(map)
    fetch('/api/intelligence/models', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelMap: map }),
    }).catch(() => { /* ignore */ })
  }, [])

  return { modelMap, isLoading, getModel, setModel, setFullMap, models, refresh: fetchFromAPI }
}
