'use client'

import { Suspense, useState, useEffect, useCallback, useRef } from 'react'
import { useTrackedAssets } from '@/hooks/useTrackedAssets'
import { useProjectInfo } from '@/hooks/useProjectInfo'
import type { DiscoveryHistoryEntry } from '@/hooks/useProjectInfo'
import { useMarketCoins } from '@/hooks/useMarketCoins'
import { DiscoveryDialog } from '@/components/terminal/DiscoveryDialog'
import { ProjectInfoContent } from '@/components/terminal/ProjectInfoContent'


/* ── Helpers ── */
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function formatElapsed(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatPrice(price: number): string {
  if (price >= 1000) return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (price >= 1) return `$${price.toFixed(2)}`
  if (price >= 0.01) return `$${price.toFixed(4)}`
  return `$${price.toFixed(6)}`
}

/* ── Discovery status for table rows ── */
interface AssetDiscoveryStatus {
  discoveredAt: string
  modelId: string
  hasData: boolean
}

/* ═══════════════════════════════════════════════════════════════════════════
   DEEP DATA SECTION — raw output + discovery history below main data
   ═══════════════════════════════════════════════════════════════════════════ */

function DiscoveryDeepData({
  entry,
  history,
}: {
  entry: DiscoveryHistoryEntry | null
  history: DiscoveryHistoryEntry[]
}) {
  const [rawExpanded, setRawExpanded] = useState(false)
  const [historyExpanded, setHistoryExpanded] = useState(true)
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<Set<string>>(new Set())

  const toggleHistoryRow = (id: string) => {
    setExpandedHistoryIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const rawOutput = entry?.rawOutput
  const hasRaw = !!rawOutput
  const hasHistory = history.length > 0

  if (!hasRaw && !hasHistory) return null

  return (
    <div style={{ padding: '0 16px 16px' }}>
      {/* ── Section Divider ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        margin: '8px 0 12px',
        fontFamily: 'var(--font-mono)',
      }}>
        <div style={{ flex: 1, height: '1px', background: 'var(--color-terminal-border)' }} />
        <span style={{
          fontSize: '9px',
          letterSpacing: '0.15em',
          color: 'var(--color-terminal-dim)',
          whiteSpace: 'nowrap',
        }}>
          ◈ DEEP DATA
        </span>
        <div style={{ flex: 1, height: '1px', background: 'var(--color-terminal-border)' }} />
      </div>

      {/* ── Raw Agent Output ── */}
      {hasRaw && (
        <>
          <button
            onClick={() => setRawExpanded(!rawExpanded)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 10px',
              background: 'var(--color-terminal-surface)',
              border: '1px solid var(--color-terminal-border)',
              borderBottom: rawExpanded ? 'none' : '1px solid var(--color-terminal-border)',
              color: 'var(--color-terminal-text)',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              fontWeight: 'bold',
              letterSpacing: '0.08em',
              cursor: 'pointer',
              marginBottom: rawExpanded ? 0 : '8px',
            }}
          >
            <span style={{ color: 'var(--color-terminal-amber)' }}>■</span>
            RAW AGENT OUTPUT
            <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px', marginLeft: 'auto' }}>
              {rawOutput!.length.toLocaleString()} chars
            </span>
            <span style={{ color: 'var(--color-terminal-dim)' }}>{rawExpanded ? '▾' : '▸'}</span>
          </button>
          {rawExpanded && (
            <div style={{
              border: '1px solid var(--color-terminal-border)',
              borderTop: 'none',
              padding: '10px',
              marginBottom: '8px',
              maxHeight: '400px',
              overflow: 'auto',
            }}>
              <pre style={{
                color: 'var(--color-terminal-muted)',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                lineHeight: 1.7,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                margin: 0,
              }}>
                {rawOutput}
              </pre>
            </div>
          )}
        </>
      )}

      {/* ── Discovery History ── */}
      {hasHistory && (
        <>
          <button
            onClick={() => setHistoryExpanded(!historyExpanded)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 10px',
              background: 'var(--color-terminal-surface)',
              border: '1px solid var(--color-terminal-border)',
              borderBottom: historyExpanded ? 'none' : '1px solid var(--color-terminal-border)',
              color: 'var(--color-terminal-text)',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              fontWeight: 'bold',
              letterSpacing: '0.08em',
              cursor: 'pointer',
              marginBottom: historyExpanded ? 0 : '8px',
            }}
          >
            <span style={{ color: 'var(--color-terminal-blue)' }}>■</span>
            DISCOVERY HISTORY
            <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px', marginLeft: 'auto' }}>
              {history.length} {history.length === 1 ? 'run' : 'runs'}
            </span>
            <span style={{ color: 'var(--color-terminal-dim)' }}>{historyExpanded ? '▾' : '▸'}</span>
          </button>
          {historyExpanded && (
            <div style={{
              border: '1px solid var(--color-terminal-border)',
              borderTop: 'none',
              marginBottom: '8px',
            }}>
              {/* Header row */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '24px 1fr 1fr 80px 60px',
                gap: '8px',
                padding: '4px 10px',
                borderBottom: '1px solid var(--color-terminal-border)',
                fontFamily: 'var(--font-mono)',
                fontSize: '9px',
                letterSpacing: '0.1em',
                color: 'var(--color-terminal-dim)',
              }}>
                <span />
                <span>MODEL</span>
                <span>DATE</span>
                <span>STATUS</span>
                <span />
              </div>
              {history.map(h => {
                const isExpanded = expandedHistoryIds.has(h.id)
                const isCompleted = h.status === 'completed'
                return (
                  <div key={h.id}>
                    <div
                      onClick={() => toggleHistoryRow(h.id)}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '24px 1fr 1fr 80px 60px',
                        gap: '8px',
                        padding: '5px 10px',
                        borderBottom: isExpanded ? 'none' : '1px solid var(--color-terminal-border)',
                        cursor: h.rawOutput ? 'pointer' : 'default',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        transition: 'background 0.1s',
                      }}
                    >
                      <span style={{ color: 'var(--color-terminal-dim)' }}>{h.rawOutput ? (isExpanded ? '▾' : '▸') : ' '}</span>
                      <span style={{ color: 'var(--color-terminal-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {h.modelId.split('/').pop() ?? h.modelId}
                      </span>
                      <span style={{ color: 'var(--color-terminal-muted)' }}>{timeAgo(h.completedAt)}</span>
                      <span style={{ color: isCompleted ? 'var(--color-terminal-up)' : 'var(--color-terminal-down)', fontSize: '10px', letterSpacing: '0.08em' }}>
                        {h.status.toUpperCase()}
                      </span>
                      <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px' }}>
                        {h.rawOutput ? `${h.rawOutput.length.toLocaleString()}c` : '—'}
                      </span>
                    </div>
                    {isExpanded && h.rawOutput && (
                      <div style={{
                        padding: '8px 10px',
                        borderBottom: '1px solid var(--color-terminal-border)',
                        background: 'rgba(0,0,0,0.15)',
                        maxHeight: '200px',
                        overflow: 'auto',
                      }}>
                        <pre style={{
                          color: 'var(--color-terminal-muted)',
                          fontSize: '10px',
                          fontFamily: 'var(--font-mono)',
                          lineHeight: 1.6,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          margin: 0,
                        }}>
                          {h.rawOutput}
                        </pre>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}


/* ═══════════════════════════════════════════════════════════════════════════
   ASSET TABLE VIEW — grid list of all tracked assets with discovery status
   ═══════════════════════════════════════════════════════════════════════════ */

function AssetTableView({
  onSelectAsset,
  trackedSymbols,
}: {
  onSelectAsset: (symbol: string) => void
  trackedSymbols: string[]
}) {
  const { coins, loading: coinsLoading, error: coinsError } = useMarketCoins(trackedSymbols.length > 0 ? trackedSymbols : undefined)
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
  const [statuses, setStatuses] = useState<Map<string, AssetDiscoveryStatus>>(new Map())
  const [statusesLoading, setStatusesLoading] = useState(false)
  const [discoveringSymbols, setDiscoveringSymbols] = useState<Set<string>>(new Set())
  const fetchedSymbolsRef = useRef<string>('')
  const pollUntilDone = useCallback(async (jobId: string, base: string) => {
    while (true) {
      await new Promise(r => setTimeout(r, 3000))
      try {
        const pollRes = await fetch(`/api/feed/discover/${jobId}`)
        const pollJson = await pollRes.json()
        if (pollJson.status === 'completed') {
          setStatuses(prev => {
            const next = new Map(prev)
            next.set(base, {
              discoveredAt: new Date().toISOString(),
              modelId: pollJson.data?.modelId ?? 'default',
              hasData: !!pollJson.data,
            })
            return next
          })
          break
        }
        if (pollJson.status === 'failed') break
      } catch { /* keep polling */ }
    }
    setDiscoveringSymbols(prev => { const n = new Set(prev); n.delete(base); return n })
  }, [])

  // Fetch discovery status for all coins
  useEffect(() => {
    if (coins.length === 0) return

    const symbolsKey = coins.map(c => c.symbol.toUpperCase()).sort().join(',')
    if (symbolsKey === fetchedSymbolsRef.current) return
    fetchedSymbolsRef.current = symbolsKey

    setStatusesLoading(true)

    const fetchStatuses = async () => {
      const newStatuses = new Map<string, AssetDiscoveryStatus>()

      const promises = coins.map(async (coin) => {
        const sym = coin.symbol.toUpperCase().replace(/USDT$|BUSD$|USD$/i, '')
        if (!sym) return
        try {
          const res = await fetch(`/api/feed/discover/history?symbol=${encodeURIComponent(sym)}&limit=1`)
          const json = await res.json()
          if (json.latest) {
            newStatuses.set(sym, {
              discoveredAt: json.latest.completedAt,
              modelId: json.latest.modelId,
              hasData: !!json.latest.result,
            })
          }
        } catch { /* ignore */ }
      })

      await Promise.all(promises)
      setStatuses(newStatuses)

      // Resume polling for any jobs that are actively running
      const activePromises = coins.map(async (coin) => {
        const sym = coin.symbol.toUpperCase().replace(/USDT$|BUSD$|USD$/i, '')
        if (!sym) return
        try {
          const res = await fetch(`/api/feed/discover?symbol=${encodeURIComponent(sym)}`)
          const json = await res.json()
          if (json.job && (json.job.status === 'pending' || json.job.status === 'running')) {
            setDiscoveringSymbols(prev => new Set(prev).add(sym))
            pollUntilDone(json.job.id, sym)
          }
        } catch { /* ignore */ }
      })
      await Promise.all(activePromises)

      setStatusesLoading(false)
    }

    fetchStatuses()
  }, [coins, pollUntilDone])

  const toggleRow = useCallback((symbol: string) => {
    setSelectedRows(prev => {
      const next = new Set(prev)
      if (next.has(symbol)) next.delete(symbol)
      else next.add(symbol)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    setSelectedRows(prev => {
      if (prev.size === coins.length) return new Set()
      return new Set(coins.map(c => c.symbol.toUpperCase().replace(/USDT$|BUSD$|USD$/i, '')))
    })
  }, [coins])

  const handleDiscoverSingle = useCallback(async (symbol: string) => {
    const base = symbol.toUpperCase().replace(/USDT$|BUSD$|USD$/i, '')
    if (!base) return
    setDiscoveringSymbols(prev => new Set(prev).add(base))

    try {
      let model: string | undefined
      try {
        const raw = localStorage.getItem('oculus:agentModelMap')
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed?.discovery) model = parsed.discovery
        }
      } catch { /* ignore */ }

      const res = await fetch('/api/feed/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: base, model }),
      })

      if (!res.ok) {
        setDiscoveringSymbols(prev => { const n = new Set(prev); n.delete(base); return n })
        return
      }

      const json = await res.json()
      if (!json.jobId) {
        setDiscoveringSymbols(prev => { const n = new Set(prev); n.delete(base); return n })
        return
      }

      pollUntilDone(json.jobId, base)
    } catch {
      setDiscoveringSymbols(prev => { const n = new Set(prev); n.delete(base); return n })
    }
  }, [])

  const handleDiscoverSelected = useCallback(() => {
    for (const sym of selectedRows) {
      if (!discoveringSymbols.has(sym)) {
        handleDiscoverSingle(sym)
      }
    }
  }, [selectedRows, discoveringSymbols, handleDiscoverSingle])

  const allSelected = coins.length > 0 && selectedRows.size === coins.length
  const someSelected = selectedRows.size > 0

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      minHeight: 0,
    }}>
      {/* Header bar */}
      <div style={{
        height: '40px',
        minHeight: '40px',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: '10px',
        background: 'var(--color-terminal-panel)',
        borderBottom: '1px solid var(--color-terminal-border)',
        fontFamily: 'var(--font-mono)',
        flexShrink: 0,
      }}>
        <span style={{
          color: 'var(--color-terminal-amber)',
          fontSize: '13px',
          fontWeight: 'bold',
          letterSpacing: '0.15em',
          flexShrink: 0,
        }}>
          DISCOVERY LAB
        </span>

        <div style={{ flex: 1 }} />

        {someSelected && (
          <button
            onClick={handleDiscoverSelected}
            disabled={discoveringSymbols.size > 0}
            style={{
              background: discoveringSymbols.size > 0 ? 'transparent' : 'rgba(0,255,136,0.08)',
              border: `1px solid ${discoveringSymbols.size > 0 ? 'var(--color-terminal-border)' : 'var(--color-terminal-up)'}`,
              color: discoveringSymbols.size > 0 ? 'var(--color-terminal-dim)' : 'var(--color-terminal-up)',
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.08em',
              cursor: discoveringSymbols.size > 0 ? 'not-allowed' : 'pointer',
              padding: '2px 10px',
              fontWeight: 'bold',
              flexShrink: 0,
            }}
          >
            {discoveringSymbols.size > 0 ? `◉ RUNNING (${discoveringSymbols.size})` : `▶ DISCOVER SELECTED (${selectedRows.size})`}
          </button>
        )}

        <span style={{
          color: 'var(--color-terminal-dim)',
          fontSize: '10px',
        }}>
          {coins.length} ASSETS
        </span>
      </div>

      {/* Table */}
      {coinsLoading ? (
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-terminal-dim)',
          fontSize: '11px',
          fontFamily: 'var(--font-mono)',
        }}>
          LOADING MARKET DATA...
        </div>
      ) : coinsError ? (
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-terminal-down)',
          fontSize: '11px',
          fontFamily: 'var(--font-mono)',
        }}>
          UPSTREAM ERR: {coinsError}
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '36px 36px 70px 1fr 70px 100px 90px 90px',
            padding: '6px 12px',
            fontSize: '9px',
            letterSpacing: '0.08em',
            color: 'var(--color-terminal-dim)',
            fontFamily: 'var(--font-mono)',
            borderBottom: '1px solid var(--color-terminal-border)',
            background: 'var(--color-terminal-panel)',
            position: 'sticky',
            top: 0,
            zIndex: 1,
          }}>
            <span
              onClick={toggleAll}
              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <span style={{
                width: '12px',
                height: '12px',
                border: '1px solid var(--color-terminal-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '8px',
                color: allSelected ? 'var(--color-terminal-up)' : 'transparent',
                background: allSelected ? 'rgba(0,255,136,0.1)' : 'transparent',
              }}>
                {allSelected ? '✓' : someSelected ? '—' : ''}
              </span>
            </span>
            <span>#</span>
            <span>SYMBOL</span>
            <span>PRICE</span>
            <span style={{ textAlign: 'right' }}>24H%</span>
            <span style={{ textAlign: 'center' }}>STATUS</span>
            <span style={{ textAlign: 'right' }}>DISCOVERED</span>
            <span style={{ textAlign: 'center' }}>ACTION</span>
          </div>

          {/* Data rows */}
          {coins.map((coin, i) => {
            const sym = coin.symbol.toUpperCase().replace(/USDT$|BUSD$|USD$/i, '')
            const isSelected = selectedRows.has(sym)
            const status = statuses.get(sym)
            const isDiscovering = discoveringSymbols.has(sym)

            return (
              <div
                key={coin.id}
                onClick={() => onSelectAsset(sym)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '36px 36px 70px 1fr 70px 100px 90px 90px',
                  padding: '5px 12px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  borderBottom: '1px solid var(--color-terminal-border)',
                  background: isSelected
                    ? 'rgba(255,170,0,0.04)'
                    : i % 2 === 0
                      ? 'var(--color-terminal-surface)'
                      : 'var(--color-terminal-panel)',
                  cursor: 'pointer',
                  alignItems: 'center',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isSelected
                    ? 'rgba(255,170,0,0.04)'
                    : i % 2 === 0
                      ? 'var(--color-terminal-surface)'
                      : 'var(--color-terminal-panel)'
                }}
              >
                {/* Checkbox */}
                <span
                  onClick={(e) => { e.stopPropagation(); toggleRow(sym) }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                >
                  <span style={{
                    width: '12px',
                    height: '12px',
                    border: `1px solid ${isSelected ? 'var(--color-terminal-up)' : 'var(--color-terminal-border)'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '8px',
                    color: isSelected ? 'var(--color-terminal-up)' : 'transparent',
                    background: isSelected ? 'rgba(0,255,136,0.1)' : 'transparent',
                    transition: 'all 0.1s',
                  }}>
                    {isSelected ? '✓' : ''}
                  </span>
                </span>

                {/* Rank */}
                <span style={{ color: 'var(--color-terminal-dim)' }}>{coin.rank}</span>

                {/* Symbol */}
                <span style={{ color: 'var(--color-terminal-amber)', fontWeight: 'bold', letterSpacing: '0.06em' }}>
                  {sym}
                </span>

                {/* Price */}
                <span style={{ color: 'var(--color-terminal-text)' }}>
                  {formatPrice(coin.currentPrice)}
                </span>

                {/* 24h% */}
                <span style={{
                  textAlign: 'right',
                  color: (coin.priceChange24h ?? 0) >= 0 ? 'var(--color-terminal-up)' : 'var(--color-terminal-down)',
                }}>
                  {coin.priceChange24h != null ? `${coin.priceChange24h >= 0 ? '+' : ''}${coin.priceChange24h.toFixed(2)}%` : '—'}
                </span>

                {/* Status */}
                <span style={{ textAlign: 'center' }}>
                  {isDiscovering ? (
                    <span style={{ color: 'var(--color-terminal-amber)', fontSize: '9px', fontWeight: 'bold', animation: 'disc-blink 1.5s infinite' }}>
                      ◉ SCANNING
                    </span>
                  ) : status?.hasData ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: 'var(--color-terminal-up)',
                        display: 'inline-block',
                        boxShadow: '0 0 4px var(--color-terminal-up)66',
                      }} />
                      <span style={{ color: 'var(--color-terminal-up)', fontSize: '9px', fontWeight: 'bold', letterSpacing: '0.06em' }}>
                        DONE
                      </span>
                    </span>
                  ) : statusesLoading ? (
                    <span style={{ color: 'var(--color-terminal-dim)', fontSize: '9px' }}>...</span>
                  ) : (
                    <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px' }}>—</span>
                  )}
                </span>

                {/* Last Discovered */}
                <span style={{ textAlign: 'right', color: 'var(--color-terminal-dim)', fontSize: '10px' }}>
                  {status ? timeAgo(status.discoveredAt) : '—'}
                </span>

                {/* Action */}
                <span style={{ textAlign: 'center' }}>
                  {isDiscovering ? (
                    <span style={{ color: 'var(--color-terminal-dim)', fontSize: '9px' }}>...</span>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDiscoverSingle(sym) }}
                      style={{
                        background: 'rgba(0,255,136,0.06)',
                        border: '1px solid var(--color-terminal-up)33',
                        color: 'var(--color-terminal-up)',
                        fontSize: '9px',
                        fontFamily: 'var(--font-mono)',
                        letterSpacing: '0.06em',
                        cursor: 'pointer',
                        padding: '1px 6px',
                        fontWeight: 'bold',
                      }}
                    >
                      {status ? '↻' : '▶'}
                    </button>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      )}

      <style>{`
        @keyframes disc-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}


/* ═══════════════════════════════════════════════════════════════════════════
   ASSET DETAIL VIEW — full detail page for a single asset
   Main Data (ProjectInfoContent) + Deep Data (raw output + history)
   ═══════════════════════════════════════════════════════════════════════════ */

function AssetDetailView({ symbol, onBack }: { symbol: string; onBack: () => void }) {
  const projectInfo = useProjectInfo(symbol)
  const {
    discovering,
    discoveryElapsed,
    discoveryLogs,
    discoveryHistory,
    discoveryRawOutput,
    discoveryDialogOpen,
    setDiscoveryDialogOpen,
    unified,
    discover,
    cancelDiscovery,
  } = projectInfo

  const latestEntry = discoveryHistory[0] ?? null
  const hasData = !!unified?.hasAiData

  // Read model from AI config localStorage
  const discoverWithStoredModel = useCallback(() => {
    try {
      const raw = localStorage.getItem('oculus:agentModelMap')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed?.discovery) {
          discover(parsed.discovery)
          return
        }
      }
    } catch { /* ignore */ }
    discover()
  }, [discover])

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      minHeight: 0,
    }}>
      {/* Detail header */}
      <div style={{
        height: '40px',
        minHeight: '40px',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: '10px',
        background: 'var(--color-terminal-panel)',
        borderBottom: '1px solid var(--color-terminal-border)',
        fontFamily: 'var(--font-mono)',
        flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          style={{
            background: 'transparent',
            border: '1px solid var(--color-terminal-border)',
            color: 'var(--color-terminal-muted)',
            fontSize: '10px',
            fontFamily: 'var(--font-mono)',
            cursor: 'pointer',
            padding: '2px 8px',
            flexShrink: 0,
          }}
        >
          ◂ BACK
        </button>

        <span style={{ color: 'var(--color-terminal-amber)', fontWeight: 'bold', fontSize: '13px', letterSpacing: '0.1em' }}>
          {symbol}
        </span>

        {hasData && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: 'var(--color-terminal-up)',
              display: 'inline-block',
            }} />
            <span style={{ color: 'var(--color-terminal-up)', fontSize: '10px', letterSpacing: '0.06em' }}>
              DISCOVERED
            </span>
          </span>
        )}

        <div style={{ flex: 1 }} />

        {!discovering && (
          <button
            onClick={discoverWithStoredModel}
            style={{
              background: 'rgba(0,255,136,0.08)',
              border: '1px solid var(--color-terminal-up)',
              color: 'var(--color-terminal-up)',
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.1em',
              cursor: 'pointer',
              padding: '2px 10px',
              fontWeight: 'bold',
              flexShrink: 0,
            }}
          >
            {hasData ? '↻ RE-DISCOVER' : '▶ DISCOVER'}
          </button>
        )}

        {discovering && (
          <>
            <span style={{ color: 'var(--color-terminal-amber)', fontSize: '10px', fontWeight: 'bold', animation: 'disc-blink 1.5s infinite' }}>
              ◉ {formatElapsed(discoveryElapsed)}
            </span>
            <button
              onClick={() => setDiscoveryDialogOpen(true)}
              style={{
                background: 'transparent',
                border: '1px solid var(--color-terminal-border)',
                color: 'var(--color-terminal-blue)',
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
                padding: '2px 8px',
              }}
            >
              ⊞ FULL
            </button>
            <button
              onClick={() => cancelDiscovery()}
              style={{
                background: 'transparent',
                border: '1px solid var(--color-terminal-down)44',
                color: 'var(--color-terminal-down)',
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
                padding: '2px 6px',
              }}
            >
              ✕ CANCEL
            </button>
          </>
        )}
      </div>

      {/* Content: live logs OR main data + deep data */}
      {discovering ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px', gap: '8px', overflow: 'auto', minHeight: 0 }}>
          <div style={{
            flex: 1, overflow: 'auto', background: 'var(--color-terminal-surface)',
            border: '1px solid var(--color-terminal-border)', padding: '8px', minHeight: 0,
          }}>
            {discoveryLogs.length === 0 ? (
              <span style={{ color: 'var(--color-terminal-dim)', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>Initializing agent...</span>
            ) : (
              discoveryLogs.map((log, i) => (
                <div key={i} style={{ color: 'var(--color-terminal-muted)', fontSize: '12px', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
                  {log}
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          {/* ══════ MAIN DATA ══════ */}
          <ProjectInfoContent symbol={symbol} projectInfo={projectInfo} />

          {/* ══════ DEEP DATA SECTION ══════ */}
          <DiscoveryDeepData entry={latestEntry} history={discoveryHistory} />
        </div>
      )}

      {/* Fullscreen dialog */}
      <DiscoveryDialog
        open={discoveryDialogOpen}
        onClose={() => setDiscoveryDialogOpen(false)}
        discovering={discovering}
        discoveryElapsed={discoveryElapsed}
        discoveryLogs={discoveryLogs}
        rawOutput={discoveryRawOutput}
        symbol={symbol}
      />

      <style>{`
        @keyframes disc-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}


/* ═══════════════════════════════════════════════════════════════════════════
   MAIN PAGE — view router (table ↔ detail)
   ═══════════════════════════════════════════════════════════════════════════ */

function DiscoveryContent() {
  const [view, setView] = useState<'table' | 'detail'>('table')
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)
  const { symbols: trackedSymbols } = useTrackedAssets()

  const handleSelectAsset = useCallback((symbol: string) => {
    setSelectedSymbol(symbol)
    setView('detail')
  }, [])

  const handleBack = useCallback(() => {
    setView('table')
  }, [])

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      minHeight: 0,
      background: 'var(--color-terminal-bg)',
      fontFamily: 'var(--font-mono)',
    }}>
      {view === 'detail' && selectedSymbol ? (
        <AssetDetailView symbol={selectedSymbol} onBack={handleBack} />
      ) : (
        <AssetTableView onSelectAsset={handleSelectAsset} trackedSymbols={trackedSymbols} />
      )}
    </div>
  )
}

export default function DiscoveryPage() {
  return (
    <Suspense>
      <DiscoveryContent />
    </Suspense>
  )
}
