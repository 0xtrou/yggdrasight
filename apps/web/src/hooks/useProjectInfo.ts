'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import type {
  DeveloperData,
  DefiProtocolData,
  DiscoveredProjectInfo,
  UnifiedProjectInfo,
  UnifiedProjectField,
} from '@/lib/intelligence/types'

export interface ProjectInfoHook {
  unified: UnifiedProjectInfo | null
  loading: boolean
  discovering: boolean
  discoveryElapsed: number
  discoveryLogs: string[]
  error: string | null
  discover: (model?: string) => Promise<void>
  cancelDiscovery: () => Promise<void>
}

// Helper: create a unified field with source attribution
function f<T>(value: T, source: 'api' | 'ai' | 'both'): UnifiedProjectField<T> {
  return { value, source }
}

// Helper: merge API + AI values — API takes priority, AI fills gaps
function merge<T>(apiVal: T | null | undefined, aiVal: T | null | undefined): UnifiedProjectField<T | null> {
  if (apiVal != null && aiVal != null) return f(apiVal as T, 'both')
  if (apiVal != null) return f(apiVal as T, 'api')
  if (aiVal != null) return f(aiVal as T, 'ai')
  return f(null, 'api')
}

// Merge string specifically — for fields that are strings in both sources
function mergeStr(apiVal: string | null | undefined, aiVal: string | null | undefined): UnifiedProjectField<string | null> {
  const a = apiVal || null
  const b = aiVal || null
  if (a && b) return f(a, 'both')
  if (a) return f(a, 'api')
  if (b) return f(b, 'ai')
  return f(null, 'api')
}

// Merge arrays — combine both if present
function mergeArr(apiVal: string[] | null | undefined, aiVal: string[] | null | undefined): UnifiedProjectField<string[]> {
  const a = apiVal && apiVal.length > 0 ? apiVal : null
  const b = aiVal && aiVal.length > 0 ? aiVal : null
  if (a && b) {
    // Dedupe by combining, preferring API first
    const combined = [...a]
    for (const item of b) {
      if (!combined.some(c => c.toLowerCase() === item.toLowerCase())) {
        combined.push(item)
      }
    }
    return f(combined, 'both')
  }
  if (a) return f(a, 'api')
  if (b) return f(b, 'ai')
  return f([], 'api')
}

// Merge number — API priority
function mergeNum(apiVal: number | null | undefined, aiVal: number | null | undefined): UnifiedProjectField<number | null> {
  if (apiVal != null && aiVal != null) return f(apiVal, 'both')
  if (apiVal != null) return f(apiVal, 'api')
  if (aiVal != null) return f(aiVal, 'ai')
  return f(null, 'api')
}

/**
 * Merge all data sources into a single UnifiedProjectInfo.
 */
function mergeProjectData(
  dev: DeveloperData | null,
  defi: DefiProtocolData | null,
  disc: DiscoveredProjectInfo | null,
): UnifiedProjectInfo {
  const hasApi = dev !== null || defi !== null
  const hasAi = disc !== null

  return {
    // ── Identity ──
    name: mergeStr(dev?.name, disc?.projectName),
    description: mergeStr(dev?.description, disc?.description),
    categories: mergeArr(dev?.categories, disc?.categories),
    genesisDate: mergeStr(dev?.genesisDate, disc?.genesisDate),
    website: mergeStr(dev?.homepage, disc?.website),
    twitter: mergeStr(dev?.twitterHandle, disc?.twitter),
    github: mergeStr(dev?.githubRepos?.[0] ?? null, disc?.github),
    discord: merge(null, disc?.discord),
    telegram: merge(null, disc?.telegram),

    // ── PILLAR 1: Team Survival Fitness ──
    founders: merge(null, disc?.founders),
    teamSize: merge(null, disc?.teamSize),
    teamBackground: merge(null, disc?.teamBackground),
    fundingRounds: merge(null, disc?.fundingRounds),
    totalFunding: merge(null, disc?.totalFunding),
    investors: merge(null, disc?.investors),
    treasury: merge(null, disc?.treasury),
    teamActivity: merge(null, disc?.teamActivity),
    commitCount4Weeks: merge(dev?.commitCount4Weeks ?? null, null),
    commitActivitySeries: f(dev?.commitActivitySeries ?? [], dev ? 'api' : 'ai'),
    pullRequestsMerged: merge(dev?.pullRequestsMerged ?? null, null),
    pullRequestContributors: merge(dev?.pullRequestContributors ?? null, null),
    codeAdditions4Weeks: merge(dev?.codeAdditions4Weeks ?? null, null),
    codeDeletions4Weeks: merge(dev?.codeDeletions4Weeks ?? null, null),
    issuesClosed: merge(dev?.closedIssues ?? null, null),
    issuesTotal: merge(dev?.totalIssues ?? null, null),
    githubStars: merge(dev?.stars ?? null, null),
    githubForks: merge(dev?.forks ?? null, null),
    pillar1Score: merge(null, disc?.pillar1Score),

    // ── PILLAR 2: Narrative Alignment ──
    ecosystem: merge(null, disc?.ecosystem),
    narrativeStrength: merge(null, disc?.narrativeStrength),
    uniqueSellingPoint: merge(null, disc?.uniqueSellingPoint),
    competitors: merge(null, disc?.competitors),
    partnerships: merge(null, disc?.partnerships),
    adoptionSignals: merge(null, disc?.adoptionSignals),
    sentimentUp: merge(dev?.sentimentUp ?? null, null),
    sentimentDown: merge(dev?.sentimentDown ?? null, null),
    twitterFollowers: merge(dev?.twitterFollowers ?? null, null),
    redditSubscribers: merge(dev?.redditSubscribers ?? null, null),
    telegramUsers: merge(dev?.telegramUsers ?? null, null),
    pillar2Score: merge(null, disc?.pillar2Score),

    // ── PILLAR 3: Economic Moat ──
    tokenType: merge(null, disc?.tokenType),
    totalSupply: merge(null, disc?.totalSupply),
    circulatingSupply: merge(null, disc?.circulatingSupply),
    maxSupply: merge(null, disc?.maxSupply),
    protocolName: merge(defi?.protocolName ?? null, null),
    protocolCategory: merge(defi?.category ?? null, null),
    tvl: mergeStr(defi?.tvl != null ? formatUsd(defi.tvl) : null, disc?.tvl),
    tvlChange24h: merge(defi?.tvlChange24h ?? null, null),
    tvlChange7d: merge(defi?.tvlChange7d ?? null, null),
    mcapToTvl: merge(defi?.mcapToTvl ?? null, null),
    chains: mergeArr(defi?.chains, null),
    chainTvl: merge(defi?.chainTvl ?? null, null),
    marketCap: merge(null, disc?.marketCap),
    fdv: merge(null, disc?.fdv),
    revenueModel: merge(null, disc?.revenueModel),
    moatDescription: merge(null, disc?.moatDescription),
    mainnetLaunched: mergeStr(disc?.mainnetLaunched === true ? 'Yes' : disc?.mainnetLaunched === false ? 'No' : null, null),
    audited: mergeStr(disc?.audited === true ? 'Yes' : disc?.audited === false ? 'No' : null, null),
    auditDetails: merge(null, disc?.auditDetails),
    pillar3Score: merge(null, disc?.pillar3Score),

    // ── PILLAR 4: Valuation & Accumulation Zone ──
    fees24h: merge(defi?.fees24h ?? null, null),
    fees7d: merge(defi?.fees7d ?? null, null),
    fees30d: merge(defi?.fees30d ?? null, null),
    revenue24h: merge(defi?.revenue24h ?? null, null),
    revenue7d: merge(defi?.revenue7d ?? null, null),
    revenue30d: merge(defi?.revenue30d ?? null, null),
    currentPrice: merge(null, disc?.currentPrice),
    allTimeHigh: merge(null, disc?.allTimeHigh),
    allTimeLow: merge(null, disc?.allTimeLow),
    priceFromATH: merge(null, disc?.priceFromATH),
    vestingSchedule: merge(null, disc?.vestingSchedule),
    inflationRate: merge(null, disc?.inflationRate),
    stakingYield: merge(null, disc?.stakingYield),
    valuationNotes: merge(null, disc?.valuationNotes),
    pillar4Score: merge(null, disc?.pillar4Score),

    // ── On-chain Activity ──
    contractAddress: merge(null, disc?.contractAddress),
    chain: merge(null, disc?.chain),
    holderCount: merge(null, disc?.holderCount),
    activeAddresses24h: merge(null, disc?.activeAddresses24h),
    largeTransactions: merge(null, disc?.largeTransactions),
    topHolders: merge(null, disc?.topHolders),
    onChainSummary: merge(null, disc?.onChainSummary),

    // ── Risks & News ──
    risks: merge(null, disc?.risks),
    recentNews: merge(null, disc?.recentNews),

    // ── AI Assessment ──
    aiSummary: merge(null, disc?.aiSummary),

    // ── Metadata ──
    hasApiData: hasApi,
    hasAiData: hasAi,
    discoveredAt: disc?.discoveredAt ?? null,
    sourcesUsed: disc?.sourcesUsed ?? [],
  }
}

function formatUsd(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`
  return `$${v.toFixed(0)}`
}

export function useProjectInfo(symbol: string): ProjectInfoHook {
  const [developer, setDeveloper] = useState<DeveloperData | null>(null)
  const [defi, setDefi] = useState<DefiProtocolData | null>(null)
  const [discovered, setDiscovered] = useState<DiscoveredProjectInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [discovering, setDiscovering] = useState(false)
  const [discoveryElapsed, setDiscoveryElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [discoveryLogs, setDiscoveryLogs] = useState<string[]>([])
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const activeJobIdRef = useRef<string | null>(null)

  // ── Polling helpers (reused by discover() and active-job check) ──
  const clearPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
    activeJobIdRef.current = null
  }, [])

  const startPolling = useCallback((jobId: string, startedAt: Date | string) => {
    clearPolling()
    activeJobIdRef.current = jobId
    setDiscovering(true)

    // Elapsed time ticker — compute from original startedAt
    const origin = typeof startedAt === 'string' ? new Date(startedAt).getTime() : startedAt.getTime()
    setDiscoveryElapsed(Math.max(0, Math.floor((Date.now() - origin) / 1000)))
    tickRef.current = setInterval(() => {
      setDiscoveryElapsed(Math.max(0, Math.floor((Date.now() - origin) / 1000)))
    }, 1000)

    // Poll GET /api/feed/discover/[jobId] every 3s
    pollRef.current = setInterval(async () => {
      try {
        const pollRes = await fetch(`/api/feed/discover/${jobId}`)
        const pollJson = await pollRes.json() as {
          status: 'pending' | 'running' | 'completed' | 'failed'
          data: DiscoveredProjectInfo | null
          error: string | null
          logs: string[]
        }

        // Update logs from poll response
        if (pollJson.logs && pollJson.logs.length > 0) {
          setDiscoveryLogs(pollJson.logs)
        }

        if (pollJson.status === 'completed') {
          clearPolling()
          setDiscovered(pollJson.data)
          setDiscovering(false)
        } else if (pollJson.status === 'failed') {
          clearPolling()
          setError(pollJson.error ?? 'Agent discovery failed')
          setDiscovering(false)
        }
        // 'pending' or 'running' — keep polling
      } catch {
        // Network error on poll — keep trying
      }
    }, 3000)
  }, [clearPolling])

  const fetchData = useCallback(async () => {
    const base = symbol.replace(/USDT$|BUSD$|USD$/i, '').toUpperCase()
    if (!base) return

    setLoading(true)
    setError(null)

    try {
      const [devRes, defiRes] = await Promise.all([
        fetch(`/api/feed/developer?symbol=${encodeURIComponent(base)}`),
        fetch(`/api/feed/defi?symbol=${encodeURIComponent(base)}`),
      ])

      const devJson = devRes.ok ? await devRes.json() as { data: DeveloperData | null } : { data: null }
      const defiJson = defiRes.ok ? await defiRes.json() as { data: DefiProtocolData | null } : { data: null }

      setDeveloper(devJson.data ?? null)
      setDefi(defiJson.data ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch project info')
    } finally {
      setLoading(false)
    }
  }, [symbol])

  // Agent discovery — spawns worker via POST, then polls for result
  const discover = useCallback(async (model?: string) => {
    const base = symbol.replace(/USDT$|BUSD$|USD$/i, '').toUpperCase()
    if (!base) return

    clearPolling()
    setDiscovering(true)
    setDiscoveryElapsed(0)
    setError(null)
    setDiscoveryLogs([])

    try {
      // POST to create the job — returns immediately with jobId
      const res = await fetch('/api/feed/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: base, model }),
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
  }, [symbol, clearPolling, startPolling])

  // Cancel an active discovery job
  const cancelDiscovery = useCallback(async () => {
    const jobId = activeJobIdRef.current
    if (!jobId) {
      clearPolling()
      setDiscovering(false)
      return
    }

    try {
      await fetch(`/api/feed/discover?jobId=${encodeURIComponent(jobId)}`, { method: 'DELETE' })
    } catch {
      // Best-effort cancel
    }

    clearPolling()
    setDiscovering(false)
    setDiscoveryElapsed(0)
  }, [clearPolling])

  // Reset state and check for active discovery jobs when symbol changes
  useEffect(() => {
    setDiscovered(null)
    setDiscovering(false)
    setDiscoveryElapsed(0)
    clearPolling()
    setDiscoveryLogs([])

    // Check if there's already an active (pending/running) job for this symbol
    const base = symbol.replace(/USDT$|BUSD$|USD$/i, '').toUpperCase()
    if (!base) return

    let cancelled = false
    fetch(`/api/feed/discover?symbol=${encodeURIComponent(base)}`)
      .then(res => res.json())
      .then((json: { job: { id: string; status: string; startedAt: string } | null }) => {
        if (cancelled) return
        if (json.job) {
          // Active job found — resume polling
          startPolling(json.job.id, json.job.startedAt)
        }
      })
      .catch(() => { /* ignore — no active job check is non-critical */ })

    return () => { cancelled = true }
  }, [symbol, clearPolling, startPolling])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Merge all data sources into unified view
  const unified = useMemo(
    () => (!loading ? mergeProjectData(developer, defi, discovered) : null),
    [developer, defi, discovered, loading],
  )

  return { unified, loading, discovering, discoveryElapsed, discoveryLogs, error, discover, cancelDiscovery }
}
