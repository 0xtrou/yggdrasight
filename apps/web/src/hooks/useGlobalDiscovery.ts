'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import type { IGlobalDiscoveredProject, IGlobalDiscoveryReport } from '@/lib/intelligence/models/global-discovery-job.model'

// ── Types ────────────────────────────────────────────────────────────────────

export interface GlobalDiscoveryJobStatus {
  status: 'pending' | 'running' | 'completed' | 'failed'
  depth: number
  agentCount: number
  agentResults: Record<string, {
    agentId: string
    status: 'completed' | 'failed'
    projectsFound: number
    rawOutput: string | null
    error: string | null
    durationMs: number
  }> | null
  reportId: string | null
  error: string | null
  logs: string[]
  startedAt: string | null
  completedAt: string | null
}

export interface GlobalDiscoveryReportSummary {
  id: string
  generation: number
  marketDirection: string | null
  executiveSummary: string
  emergingTrends: string[]
  depth: number
  agentCount: number
  totalProjects: number
  newProjectCount: number
  createdAt: string
}

export interface GlobalDiscoveryFullReport {
  id: string
  generation: number
  projects: IGlobalDiscoveredProject[]
  newProjects: IGlobalDiscoveredProject[]
  marketDirection: string | null
  crossPillarInsights: string | null
  emergingTrends: string[]
  executiveSummary: string
  depth: number
  agentCount: number
  totalProjects: number
  newProjectCount: number
  createdAt: string
}

export interface GlobalDiscoveryHook {
  /** Whether initial data is loading */
  loading: boolean
  /** Whether a discovery is running */
  discovering: boolean
  /** Seconds elapsed since discovery started */
  discoverElapsed: number
  /** Live agent logs */
  discoverLogs: string[]
  /** Agent results from current job */
  agentResults: GlobalDiscoveryJobStatus['agentResults']
  /** Latest full report */
  latestReport: GlobalDiscoveryFullReport | null
  /** History of reports (summaries) */
  reportHistory: GlobalDiscoveryReportSummary[]
  /** Error message */
  error: string | null
  /** Start a new discovery */
  discover: (depth?: number, agentCount?: number) => Promise<void>
  /** Cancel active discovery */
  cancelDiscovery: () => Promise<void>
  /** Load a specific report by ID */
  loadReport: (reportId: string) => Promise<GlobalDiscoveryFullReport | null>
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useGlobalDiscovery(): GlobalDiscoveryHook {
  const [loading, setLoading] = useState(true)
  const [discovering, setDiscovering] = useState(false)
  const [discoverElapsed, setDiscoverElapsed] = useState(0)
  const [discoverLogs, setDiscoverLogs] = useState<string[]>([])
  const [agentResults, setAgentResults] = useState<GlobalDiscoveryJobStatus['agentResults']>(null)
  const [latestReport, setLatestReport] = useState<GlobalDiscoveryFullReport | null>(null)
  const [reportHistory, setReportHistory] = useState<GlobalDiscoveryReportSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const activeJobIdRef = useRef<string | null>(null)

  // ── Polling helpers ──

  const clearPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
    activeJobIdRef.current = null
  }, [])

  const refreshHistory = useCallback(() => {
    fetch('/api/intelligence/global-discover/history')
      .then(r => r.json())
      .then((json: { reports: GlobalDiscoveryReportSummary[]; latest: GlobalDiscoveryFullReport | null }) => {
        setReportHistory(json.reports ?? [])
        if (json.latest) {
          setLatestReport(json.latest)
        }
      })
      .catch(() => {})
  }, [])

  const startPolling = useCallback((jobId: string, startedAt: Date | string) => {
    clearPolling()
    activeJobIdRef.current = jobId
    setDiscovering(true)

    const origin = typeof startedAt === 'string' ? new Date(startedAt).getTime() : startedAt.getTime()
    setDiscoverElapsed(Math.max(0, Math.floor((Date.now() - origin) / 1000)))
    tickRef.current = setInterval(() => {
      setDiscoverElapsed(Math.max(0, Math.floor((Date.now() - origin) / 1000)))
    }, 1000)

    // Poll job status every 3s
    pollRef.current = setInterval(async () => {
      try {
        const pollRes = await fetch(`/api/intelligence/global-discover/${jobId}`)
        const pollJson = await pollRes.json() as GlobalDiscoveryJobStatus

        if (pollJson.logs && pollJson.logs.length > 0) {
          setDiscoverLogs(pollJson.logs)
        }

        if (pollJson.agentResults) {
          setAgentResults(pollJson.agentResults)
        }

        if (pollJson.status === 'completed') {
          clearPolling()
          setDiscovering(false)
          // Refresh history to get the new report
          refreshHistory()
        } else if (pollJson.status === 'failed') {
          clearPolling()
          setError(pollJson.error ?? 'Discovery failed')
          setDiscovering(false)
        }
      } catch {
        // Network error — keep polling
      }
    }, 3000)
  }, [clearPolling, refreshHistory])

  // ── Start discovery ──

  const discover = useCallback(async (depth?: number, agentCount?: number) => {
    clearPolling()
    setDiscovering(true)
    setDiscoverElapsed(0)
    setError(null)
    setDiscoverLogs([])
    setAgentResults(null)

    try {
      const res = await fetch('/api/intelligence/global-discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ depth: depth ?? 20, agentCount: agentCount ?? 5 }),
      })

      const json = await res.json() as { jobId: string | null; error?: string }

      if (!res.ok || !json.jobId) {
        setError(json.error ?? 'Failed to start discovery')
        setDiscovering(false)
        return
      }

      startPolling(json.jobId, new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Discovery failed')
      setDiscovering(false)
    }
  }, [clearPolling, startPolling])

  // ── Cancel ──

  const cancelDiscovery = useCallback(async () => {
    const jobId = activeJobIdRef.current
    if (!jobId) {
      clearPolling()
      setDiscovering(false)
      return
    }

    try {
      await fetch(`/api/intelligence/global-discover?jobId=${encodeURIComponent(jobId)}`, { method: 'DELETE' })
    } catch {
      // Best-effort cancel
    }

    clearPolling()
    setDiscovering(false)
    setDiscoverElapsed(0)
  }, [clearPolling])

  // ── Load specific report ──

  const loadReport = useCallback(async (reportId: string): Promise<GlobalDiscoveryFullReport | null> => {
    try {
      const res = await fetch(`/api/intelligence/global-discover/history?reportId=${encodeURIComponent(reportId)}`)
      const json = await res.json() as { report: GlobalDiscoveryFullReport | null }
      if (json.report) {
        setLatestReport(json.report)
      }
      return json.report
    } catch {
      return null
    }
  }, [])

  // ── Init: check for active job + load history ──

  useEffect(() => {
    let cancelled = false

    Promise.all([
      // Check for active job
      fetch('/api/intelligence/global-discover')
        .then(r => r.json())
        .then((json: { job: { id: string; status: string; startedAt: string } | null }) => {
          if (cancelled) return
          if (json.job) {
            startPolling(json.job.id, json.job.startedAt)
          }
        })
        .catch(() => {}),
      // Fetch history + latest report
      fetch('/api/intelligence/global-discover/history')
        .then(r => r.json())
        .then((json: { reports: GlobalDiscoveryReportSummary[]; latest: GlobalDiscoveryFullReport | null }) => {
          if (cancelled) return
          setReportHistory(json.reports ?? [])
          if (json.latest) {
            setLatestReport(json.latest)
          }
        })
        .catch(() => {}),
    ]).finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => { cancelled = true }
  }, [startPolling])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [])

  return {
    loading,
    discovering,
    discoverElapsed,
    discoverLogs,
    agentResults,
    latestReport,
    reportHistory,
    error,
    discover,
    cancelDiscovery,
    loadReport,
  }
}
