'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import type {
  ClassificationResult,
  ClassificationCategory,
  CategoryWeight,
  CrackId,
  SubAgentResult,
  CrackMappingResult,
  VisibilityResult,
  NarrativeSeparatorResult,
  PowerVectorResult,
  ProblemRecognitionResult,
  IdentityPolarityResult,
  CategoryMigration,
} from '@/lib/intelligence/classification'

// ── Types ────────────────────────────────────────────────────────────────────

export interface ClassificationHistoryEntry {
  id: string
  symbol: string
  modelId: string
  primaryCategory: ClassificationCategory
  categoryWeights: CategoryWeight[]
  crackAlignment: CrackId[]
  classification: ClassificationResult | null
  classifiedAt: string
}

export interface ClassificationJobStatus {
  status: 'pending' | 'running' | 'completed' | 'failed'
  data: ClassificationResult | null
  subAgentResults: {
    crack_mapping: SubAgentResult<CrackMappingResult>
    visibility: SubAgentResult<VisibilityResult>
    narrative_separator: SubAgentResult<NarrativeSeparatorResult>
    power_vector: SubAgentResult<PowerVectorResult>
    problem_recognition: SubAgentResult<ProblemRecognitionResult>
    identity_polarity: SubAgentResult<IdentityPolarityResult>
    synthesizer: SubAgentResult<ClassificationResult>
  } | null
  rawOutput: string | null
  error: string | null
  logs: string[]
  startedAt: string | null
  completedAt: string | null
}

export interface ClassificationHook {
  /** Latest completed classification result */
  result: ClassificationResult | null
  /** Sub-agent results from latest job */
  subAgentResults: ClassificationJobStatus['subAgentResults']
  /** Whether initial data is loading */
  loading: boolean
  /** Whether a classification is running */
  classifying: boolean
  /** Seconds elapsed since classification started */
  classifyElapsed: number
  /** Live agent logs */
  classifyLogs: string[]
  /** Classification history for this symbol */
  history: ClassificationHistoryEntry[]
  /** Detected migrations between snapshots */
  migrations: CategoryMigration[]
  /** Raw output from last completed job */
  rawOutput: string | null
  /** Fullscreen dialog state */
  dialogOpen: boolean
  setDialogOpen: (open: boolean) => void
  /** Error message */
  error: string | null
  /** Start a new classification */
  /** Start a new classification */
  classify: (model?: string, agentModels?: Record<string, string>) => Promise<void>
  /** Cancel active classification */
  cancelClassification: () => Promise<void>
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useClassification(symbol: string): ClassificationHook {
  const [result, setResult] = useState<ClassificationResult | null>(null)
  const [subAgentResults, setSubAgentResults] = useState<ClassificationJobStatus['subAgentResults']>(null)
  const [loading, setLoading] = useState(true)
  const [classifying, setClassifying] = useState(false)
  const [classifyElapsed, setClassifyElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [classifyLogs, setClassifyLogs] = useState<string[]>([])
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const activeJobIdRef = useRef<string | null>(null)
  const [history, setHistory] = useState<ClassificationHistoryEntry[]>([])
  const [migrations, setMigrations] = useState<CategoryMigration[]>([])
  const [rawOutput, setRawOutput] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  // ── Polling helpers ──

  const clearPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
    activeJobIdRef.current = null
  }, [])

  const refreshHistory = useCallback((sym: string) => {
    fetch(`/api/intelligence/classify/history?symbol=${encodeURIComponent(sym)}`)
      .then(r => r.json())
      .then((json: { snapshots: ClassificationHistoryEntry[]; migrations: CategoryMigration[]; latest: ClassificationHistoryEntry | null }) => {
        setHistory(json.snapshots ?? [])
        setMigrations(json.migrations ?? [])
      })
      .catch(() => {})
  }, [])

  const startPolling = useCallback((jobId: string, startedAt: Date | string) => {
    clearPolling()
    activeJobIdRef.current = jobId
    setClassifying(true)

    const origin = typeof startedAt === 'string' ? new Date(startedAt).getTime() : startedAt.getTime()
    setClassifyElapsed(Math.max(0, Math.floor((Date.now() - origin) / 1000)))
    tickRef.current = setInterval(() => {
      setClassifyElapsed(Math.max(0, Math.floor((Date.now() - origin) / 1000)))
    }, 1000)

    // Poll job status every 3s
    pollRef.current = setInterval(async () => {
      try {
        const pollRes = await fetch(`/api/intelligence/classify/${jobId}`)
        const pollJson = await pollRes.json() as ClassificationJobStatus

        if (pollJson.logs && pollJson.logs.length > 0) {
          setClassifyLogs(pollJson.logs)
        }

        if (pollJson.status === 'completed') {
          clearPolling()
          setResult(pollJson.data)
          setSubAgentResults(pollJson.subAgentResults)
          setRawOutput(pollJson.rawOutput ?? null)
          setClassifying(false)
          // Refresh history
          const base = symbol.replace(/USDT$|BUSD$|USD$/i, '').toUpperCase()
          if (base) refreshHistory(base)
        } else if (pollJson.status === 'failed') {
          clearPolling()
          setError(pollJson.error ?? 'Classification failed')
          setClassifying(false)
        }
      } catch {
        // Network error — keep polling
      }
    }, 3000)
  }, [clearPolling, symbol, refreshHistory])

  // ── Start classification ──

  const classify = useCallback(async (model?: string, agentModels?: Record<string, string>) => {
    const base = symbol.replace(/USDT$|BUSD$|USD$/i, '').toUpperCase()
    if (!base) return

    clearPolling()
    setClassifying(true)
    setClassifyElapsed(0)
    setError(null)
    setClassifyLogs([])

    try {
      const res = await fetch('/api/intelligence/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: base, model, agentModels }),
      })

      const json = await res.json() as { jobId: string | null; error?: string }

      if (!res.ok || !json.jobId) {
        setError(json.error ?? 'Failed to start classification')
        setClassifying(false)
        return
      }

      startPolling(json.jobId, new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Classification failed')
      setClassifying(false)
    }
  }, [symbol, clearPolling, startPolling])

  // ── Cancel ──

  const cancelClassification = useCallback(async () => {
    const jobId = activeJobIdRef.current
    if (!jobId) {
      clearPolling()
      setClassifying(false)
      return
    }

    try {
      await fetch(`/api/intelligence/classify?jobId=${encodeURIComponent(jobId)}`, { method: 'DELETE' })
    } catch {
      // Best-effort cancel
    }

    clearPolling()
    setClassifying(false)
    setClassifyElapsed(0)
  }, [clearPolling])

  // ── Init: check for active job + load history on symbol change ──

  useEffect(() => {
    setResult(null)
    setSubAgentResults(null)
    setClassifying(false)
    setClassifyElapsed(0)
    clearPolling()
    setClassifyLogs([])
    setRawOutput(null)
    setHistory([])
    setMigrations([])
    setLoading(true)

    const base = symbol.replace(/USDT$|BUSD$|USD$/i, '').toUpperCase()
    if (!base) { setLoading(false); return }

    let cancelled = false

    Promise.all([
      // Check for active job
      fetch(`/api/intelligence/classify?symbol=${encodeURIComponent(base)}`)
        .then(r => r.json())
        .then((json: { job: { id: string; status: string; startedAt: string } | null }) => {
          if (cancelled) return
          if (json.job) {
            startPolling(json.job.id, json.job.startedAt)
          }
        })
        .catch(() => {}),
      // Fetch history + latest job data (for subAgentResults)
      fetch(`/api/intelligence/classify/history?symbol=${encodeURIComponent(base)}`)
        .then(r => r.json())
        .then(async (json: { snapshots: ClassificationHistoryEntry[]; migrations: CategoryMigration[]; latest: ClassificationHistoryEntry | null }) => {
          if (cancelled) return
          setHistory(json.snapshots ?? [])
          setMigrations(json.migrations ?? [])
          // Auto-load latest result
          if (json.latest?.classification) {
            setResult(json.latest.classification)
          }
          // Fetch job data for subAgentResults if we have a jobId
          const jobId = (json.latest as unknown as Record<string, unknown>)?.jobId as string | undefined
          if (jobId && !cancelled) {
            try {
              const jobRes = await fetch(`/api/intelligence/classify/${jobId}`)
              const jobJson = await jobRes.json()
              if (!cancelled && jobJson.subAgentResults) {
                setSubAgentResults(jobJson.subAgentResults)
              }
            } catch { /* ignore */ }
          }
        })
        .catch(() => {}),
    ]).finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => { cancelled = true }
  }, [symbol, clearPolling, startPolling])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [])

  return {
    result,
    subAgentResults,
    loading,
    classifying,
    classifyElapsed,
    classifyLogs,
    history,
    migrations,
    rawOutput,
    dialogOpen,
    setDialogOpen,
    error,
    classify,
    cancelClassification,
  }
}
