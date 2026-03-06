'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSignals, useSignalCrawl, type Signal, type CrawlJob } from '@/hooks/useSignals'
import { useTrackedAssets } from '@/hooks/useTrackedAssets'
import { NewSignalModal } from './NewSignalModal'

type ViewMode = 'LIST' | 'GRID'

function formatTime(iso: string): string {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

function formatPrice(price: number): string {
  if (price === 0) return '0'
  if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (price >= 1) return price.toFixed(4)
  // For small prices: show up to 10 significant decimal digits, strip trailing zeros
  const fixed = price.toFixed(10)
  return fixed.replace(/\.?(0+)$/, '') || fixed
}
function sourceBadge(source: string): { color: string; bg: string } {
  switch (source.toLowerCase()) {
    case 'tradingview':
      return { color: '#ffaa00', bg: 'rgba(255,170,0,0.1)' }
    case 'telegram':
      return { color: '#4488ff', bg: 'rgba(68,136,255,0.1)' }
    case 'webhook':
      return { color: '#00ff88', bg: 'rgba(0,255,136,0.1)' }
    default:
      return { color: '#888888', bg: 'rgba(136,136,136,0.1)' }
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'active':
      return '#4488ff'
    case 'tp_hit':
      return '#00ff88'
    case 'sl_hit':
      return '#ff3b3b'
    case 'pending':
      return '#ffaa00'
    default:
      return '#888888'
  }
}

function confColor(conf: number): string {
  if (conf >= 0.7) return '#00ff88'
  if (conf < 0.5) return '#ffaa00'
  return '#888888'
}

/** R:R ratio — positive = favorable. Returns null if data missing. */
function calcRR(signal: Signal): number | null {
  if (!signal.takeProfits.length) return null
  const tp = signal.takeProfits[0].price
  const entry = signal.entryPrice
  const sl = signal.stopLoss
  const risk = Math.abs(entry - sl)
  if (risk === 0) return null
  const reward = signal.direction === 'long' ? tp - entry : entry - tp
  return reward / risk
}

/** P&L % of currentPrice vs entryPrice */
function calcPnL(signal: Signal): number | null {
  if (signal.currentPrice == null) return null
  const diff = signal.direction === 'long'
    ? signal.currentPrice - signal.entryPrice
    : signal.entryPrice - signal.currentPrice
  return (diff / signal.entryPrice) * 100
}

/** Action buttons for live statuses */
function StatusActions({
  signal,
  onUpdate,
}: {
  signal: Signal
  onUpdate: (id: string, data: Record<string, unknown>) => Promise<unknown>
}) {
  const [busy, setBusy] = useState(false)

  const act = useCallback(
    async (status: string) => {
      setBusy(true)
      await onUpdate(signal.id, { status })
      setBusy(false)
    },
    [signal.id, onUpdate],
  )

  if (signal.status !== 'pending' && signal.status !== 'active') return null

  const btnStyle = (color: string): React.CSSProperties => ({
    background: 'transparent',
    border: `1px solid ${color}40`,
    color,
    fontFamily: 'var(--font-mono)',
    fontSize: '9px',
    letterSpacing: '0.08em',
    padding: '2px 6px',
    cursor: busy ? 'default' : 'pointer',
    opacity: busy ? 0.5 : 1,
    borderRadius: 0,
    flexShrink: 0,
  })

  return (
    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
      {signal.status === 'pending' && (
        <button style={btnStyle('#4488ff')} disabled={busy} onClick={() => act('active')}>
          ACTIVATE
        </button>
      )}
      <button style={btnStyle('#00ff88')} disabled={busy} onClick={() => act('tp_hit')}>
        TP HIT
      </button>
      <button style={btnStyle('#ff3b3b')} disabled={busy} onClick={() => act('sl_hit')}>
        SL HIT
      </button>
      <button style={btnStyle('#888888')} disabled={busy} onClick={() => act('closed')}>
        CLOSE
      </button>
    </div>
  )
}

function FeedListRow({
  signal,
  onUpdate,
  selected,
  onToggleSelect,
}: {
  signal: Signal
  onUpdate: (id: string, data: Record<string, unknown>) => Promise<unknown>
  selected: boolean
  onToggleSelect: (id: string) => void
}) {
  const src = sourceBadge(signal.source)
  const rr = calcRR(signal)
  const pnl = calcPnL(signal)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 12px',
        borderBottom: '1px solid var(--color-terminal-border)',
        fontFamily: 'var(--font-mono)',
        flexWrap: 'wrap',
        minHeight: '36px',
        background: selected ? 'rgba(255,59,59,0.04)' : 'transparent',
        outline: selected ? '1px solid rgba(255,59,59,0.2)' : 'none',
        outlineOffset: '-1px',
      }}
    >
      {/* Checkbox */}
      {/* Time */}
      <input
        type='checkbox'
        checked={selected}
        onChange={() => onToggleSelect(signal.id)}
        style={{ cursor: 'pointer', accentColor: '#ff3b3b', width: '12px', height: '12px', flexShrink: 0 }}
      />
      <span style={{ color: 'var(--color-terminal-dim)', fontSize: '11px', minWidth: '64px', flexShrink: 0 }}>
        {formatTime(signal.createdAt)}
      </span>
      {/* Source */}
      <span
        style={{
          color: src.color,
          background: src.bg,
          fontSize: '10px',
          letterSpacing: '0.1em',
          padding: '2px 6px',
          textTransform: 'uppercase',
          flexShrink: 0,
        }}
      >
        {signal.source}
      </span>
      {/* Symbol */}
      <span
        style={{
          color: 'var(--color-terminal-text)',
          fontSize: '12px',
          fontWeight: 700,
          minWidth: '80px',
          flexShrink: 0,
        }}
      >
        {signal.symbol}
      </span>
      {/* Direction */}
      <span
        style={{
          color: signal.direction === 'long' ? '#00ff88' : '#ff3b3b',
          background: signal.direction === 'long' ? 'rgba(0,255,136,0.15)' : 'rgba(255,59,59,0.15)',
          fontSize: '10px',
          fontWeight: 700,
          padding: '2px 6px',
          flexShrink: 0,
        }}
      >
        {signal.direction}
      </span>
      {/* Status */}
      <span
        style={{
          color: statusColor(signal.status),
          background: `${statusColor(signal.status)}18`,
          fontSize: '10px',
          padding: '2px 6px',
          flexShrink: 0,
        }}
      >
        {signal.status}
      </span>
      {/* Entry */}
      <span style={{ color: 'var(--color-terminal-dim)', fontSize: '11px', flexShrink: 0 }}>
        @ ${formatPrice(signal.entryPrice)}
      </span>
      {/* SL */}
      <span style={{ color: '#ff3b3b', fontSize: '11px', flexShrink: 0 }}>
        SL ${formatPrice(signal.stopLoss)}
      </span>
      {/* TPs */}
      <span style={{ color: '#00ff88', fontSize: '11px', flexShrink: 0 }}>
        {signal.takeProfits.map((tp) => `TP${tp.level} $${formatPrice(tp.price)}`).join(' ')}
      </span>
      {/* R:R */}
      {rr !== null && (
        <span
          style={{
            color: rr >= 2 ? '#00ff88' : rr >= 1 ? '#ffaa00' : '#ff3b3b',
            fontSize: '10px',
            flexShrink: 0,
          }}
        >
          R:R {rr.toFixed(1)}
        </span>
      )}
      {/* P&L */}
      {pnl !== null && (
        <span
          style={{
            color: pnl >= 0 ? '#00ff88' : '#ff3b3b',
            fontSize: '10px',
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}%
        </span>
      )}
      {/* Leverage */}
      {signal.leverage != null && signal.leverage > 1 && (
        <span style={{ color: '#ffaa00', fontSize: '10px', flexShrink: 0 }}>
          {signal.leverage}x
        </span>
      )}
      {/* Confidence */}
      <span style={{ color: confColor(signal.confidence), fontSize: '11px', marginLeft: 'auto', flexShrink: 0 }}>
        CONF {Math.round(signal.confidence * 100)}%
      </span>
      {/* Indicators */}
      {Object.keys(signal.indicators).length > 0 && (
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px', flexShrink: 0 }}>
          · {Object.keys(signal.indicators).join(' · ')}
        </span>
      )}
      {/* Status actions */}
      <StatusActions signal={signal} onUpdate={onUpdate} />
      {/* Notes */}
      {signal.notes && (
        <div
          style={{
            width: '100%',
            color: 'var(--color-terminal-dim)',
            fontSize: '10px',
            paddingLeft: '64px',
            paddingTop: '2px',
            borderTop: '1px solid var(--color-terminal-border)',
            marginTop: '2px',
          }}
        >
          {signal.notes}
        </div>
      )}
    </div>
  )
}

function FeedGridCard({
  signal,
  onUpdate,
  selected,
  onToggleSelect,
}: {
  signal: Signal
  onUpdate: (id: string, data: Record<string, unknown>) => Promise<unknown>
  selected: boolean
  onToggleSelect: (id: string) => void
}) {
  const src = sourceBadge(signal.source)
  const indKeys = Object.keys(signal.indicators)
  const rr = calcRR(signal)
  const pnl = calcPnL(signal)

  return (
    <div
      style={{
        background: selected ? 'rgba(255,59,59,0.04)' : 'var(--color-terminal-panel)',
        border: selected ? '1px solid rgba(255,59,59,0.4)' : '1px solid var(--color-terminal-border)',
        padding: '12px',
        fontFamily: 'var(--font-mono)',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        cursor: 'default',
      }}
    >
      {/* Checkbox + Row 1: source badge + direction + symbol */}
      {/* Row 1: source badge + direction + symbol */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <input
          type='checkbox'
          checked={selected}
          onChange={() => onToggleSelect(signal.id)}
          style={{ cursor: 'pointer', accentColor: '#ff3b3b', width: '12px', height: '12px' }}
        />
        <span
          style={{
            color: src.color,
            background: src.bg,
            fontSize: '10px',
            letterSpacing: '0.1em',
            padding: '2px 6px',
            textTransform: 'uppercase',
          }}
        >
          {signal.source}
        </span>
        <span
          style={{
            color: signal.direction === 'long' ? '#00ff88' : '#ff3b3b',
            background: signal.direction === 'long' ? 'rgba(0,255,136,0.15)' : 'rgba(255,59,59,0.15)',
            fontSize: '10px',
            fontWeight: 700,
            padding: '2px 6px',
          }}
        >
          {signal.direction}
        </span>
        <span style={{ color: 'var(--color-terminal-text)', fontSize: '13px', fontWeight: 700 }}>
          {signal.symbol}
        </span>
        {signal.leverage != null && signal.leverage > 1 && (
          <span style={{ color: '#ffaa00', fontSize: '10px', marginLeft: 'auto' }}>
            {signal.leverage}x
          </span>
        )}
      </div>
      {/* Row 2: status + confidence + P&L */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <span
          style={{
            color: statusColor(signal.status),
            background: `${statusColor(signal.status)}18`,
            fontSize: '10px',
            padding: '2px 6px',
          }}
        >
          {signal.status}
        </span>
        <span style={{ color: confColor(signal.confidence), fontSize: '11px' }}>
          CONF {Math.round(signal.confidence * 100)}%
        </span>
        {pnl !== null && (
          <span
            style={{
              color: pnl >= 0 ? '#00ff88' : '#ff3b3b',
              fontSize: '11px',
              fontWeight: 700,
              marginLeft: 'auto',
            }}
          >
            {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}%
          </span>
        )}
      </div>
      {/* Row 3: entry + R:R */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px' }}>ENTRY</span>
          <span style={{ color: 'var(--color-terminal-text)', fontSize: '11px' }}>
            ${formatPrice(signal.entryPrice)}
          </span>
        </div>
        {rr !== null && (
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px' }}>R:R</span>
            <span
              style={{
                color: rr >= 2 ? '#00ff88' : rr >= 1 ? '#ffaa00' : '#ff3b3b',
                fontSize: '11px',
                fontWeight: 700,
              }}
            >
              {rr.toFixed(1)}
            </span>
          </div>
        )}
      </div>
      {/* Row 4: stop + TPs */}
      <div style={{ display: 'flex', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px' }}>STOP</span>
          <span style={{ color: '#ff3b3b', fontSize: '11px' }}>${formatPrice(signal.stopLoss)}</span>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px' }}>TPS</span>
          <span style={{ color: '#00ff88', fontSize: '11px' }}>
            {signal.takeProfits.map((tp) => `$${formatPrice(tp.price)}`).join(' ')}
          </span>
        </div>
      </div>
      {/* Row 5: timeframe + exchange */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px' }}>{signal.timeframe}</span>
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px' }}>{signal.exchange}</span>
      </div>
      {/* Row 6: indicator chips */}
      {indKeys.length > 0 && (
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {indKeys.map((k) => (
            <span
              key={k}
              style={{
                color: 'var(--color-terminal-dim)',
                background: 'var(--color-terminal-surface)',
                fontSize: '9px',
                padding: '1px 4px',
                border: '1px solid var(--color-terminal-border)',
              }}
            >
              {k}
            </span>
          ))}
        </div>
      )}
      {/* Row 7: notes */}
      {signal.notes && (
        <div
          style={{
            color: 'var(--color-terminal-dim)',
            fontSize: '10px',
            borderTop: '1px solid var(--color-terminal-border)',
            paddingTop: '6px',
            lineHeight: 1.4,
          }}
        >
          {signal.notes}
        </div>
      )}
      {/* Row 8: status actions */}
      <StatusActions signal={signal} onUpdate={onUpdate} />
      {/* Row 9: timestamp */}
      <div style={{ color: 'var(--color-terminal-dim)', fontSize: '10px', textAlign: 'right' }}>
        {formatTime(signal.createdAt)}
      </div>
    </div>
  )
}

export function FeedGrid() {
  const { signals, loading, error, refetch, addSignal, updateSignal, deleteSignals } = useSignals()
  const { crawling, job: crawlJob, startCrawl, cancelCrawl, clearJob } = useSignalCrawl(refetch)
  const { symbols: trackedSymbols } = useTrackedAssets()
  const [mode, setMode] = useState<ViewMode>('LIST')
  const [showNewModal, setShowNewModal] = useState(false)
  const [showCrawlPanel, setShowCrawlPanel] = useState(false)
  const [crawlSymbolInput, setCrawlSymbolInput] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  // Filters
  const [filterSymbol, setFilterSymbol] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterDirection, setFilterDirection] = useState('all')

  useEffect(() => {
    const id = setInterval(() => {
      refetch()
    }, 5000)
    return () => clearInterval(id)
  }, [refetch])

  // Auto-open crawl panel when a job rehydrates from localStorage on mount
  useEffect(() => {
    if (crawlJob && (crawlJob.status === 'pending' || crawlJob.status === 'running')) {
      setShowCrawlPanel(true)
    }
  // Only react to job identity changes, not every poll update
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crawlJob?.id])

  const filteredSignals = signals.filter((s) => {
    if (filterSymbol && !s.symbol.toLowerCase().includes(filterSymbol.toLowerCase())) return false
    if (filterStatus !== 'all' && s.status !== filterStatus) return false
    if (filterDirection !== 'all' && s.direction !== filterDirection) return false
    return true
  })

  // ── Selection helpers ───────────────────────────────────────────────────
  const allFilteredSelected = filteredSignals.length > 0 && filteredSignals.every((s) => selectedIds.has(s.id))
  const someSelected = selectedIds.size > 0

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        filteredSignals.forEach((s) => next.delete(s.id))
        return next
      })
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        filteredSignals.forEach((s) => next.add(s.id))
        return next
      })
    }
  }, [allFilteredSelected, filteredSignals])

  const handleBulkDelete = useCallback(async () => {
    if (!selectedIds.size || deleting) return
    setDeleting(true)
    await deleteSignals(Array.from(selectedIds))
    setSelectedIds(new Set())
    setDeleting(false)
  }, [selectedIds, deleting, deleteSignals])


  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    background: 'transparent',
    border: 'none',
    borderBottom: active
      ? '2px solid var(--color-terminal-amber)'
      : '2px solid transparent',
    color: active ? 'var(--color-terminal-text)' : 'var(--color-terminal-muted)',
    fontSize: '11px',
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.08em',
    padding: '0 12px',
    height: '32px',
    cursor: 'pointer',
  })

  const filterSelectStyle: React.CSSProperties = {
    background: 'var(--color-terminal-bg)',
    border: '1px solid var(--color-terminal-border)',
    color: 'var(--color-terminal-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    padding: '2px 6px',
    outline: 'none',
    borderRadius: 0,
    cursor: 'pointer',
    height: '24px',
  }

  const filterInputStyle: React.CSSProperties = {
    background: 'var(--color-terminal-bg)',
    border: '1px solid var(--color-terminal-border)',
    color: 'var(--color-terminal-text)',
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    padding: '2px 8px',
    outline: 'none',
    borderRadius: 0,
    width: '100px',
    height: '24px',
  }

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-terminal-bg)',
        fontFamily: 'var(--font-mono)',
        overflow: 'hidden',
      }}
    >
  {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          height: '40px',
          borderBottom: '1px solid var(--color-terminal-border)',
          background: 'var(--color-terminal-surface)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span
            style={{
              color: 'var(--color-terminal-text)',
              fontSize: '12px',
              fontWeight: 700,
              letterSpacing: '0.1em',
            }}
          >
            INTELLIGENCE FEED
          </span>
          <span style={{ color: 'var(--color-terminal-muted)', fontSize: '11px' }}>
            {filteredSignals.length}/{signals.length}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* CRAWL SIGNAL */}
          <button
            onClick={() => setShowCrawlPanel((v) => !v)}
            style={{
              background: crawling ? 'rgba(68,136,255,0.12)' : showCrawlPanel ? 'rgba(68,136,255,0.08)' : 'transparent',
              border: `1px solid ${crawling ? 'rgba(68,136,255,0.6)' : 'rgba(68,136,255,0.3)'}`,
              color: '#4488ff',
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              padding: '0 10px',
              height: '24px',
              cursor: 'pointer',
              borderRadius: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            {crawling ? (
              <>
                <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#4488ff', animation: 'pulse 1s infinite' }} />
                CRAWLING...
              </>
            ) : '◈ CRAWL SIGNAL'}
          </button>
          {/* + NEW SIGNAL */}
          <button
            onClick={() => setShowNewModal(true)}
            style={{
              background: 'rgba(0,255,136,0.08)',
              border: '1px solid rgba(0,255,136,0.3)',
              color: 'var(--color-terminal-up)',
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              padding: '0 10px',
              height: '24px',
              cursor: 'pointer',
              borderRadius: 0,
            }}
          >
            + NEW SIGNAL
          </button>
          {/* View toggle */}
          <div style={{ display: 'flex' }}>
            <button style={tabBtnStyle(mode === 'LIST')} onClick={() => setMode('LIST')}>
              LIST
            </button>
            <button style={tabBtnStyle(mode === 'GRID')} onClick={() => setMode('GRID')}>
              GRID
            </button>
          </div>
        </div>
      </div>

      {/* Crawl Panel */}
      {showCrawlPanel && (
        <CrawlPanel
          crawling={crawling}
          job={crawlJob}
          availableSymbols={trackedSymbols}
          crawlSymbolInput={crawlSymbolInput}
          setCrawlSymbolInput={setCrawlSymbolInput}
          onStartCrawl={(syms) => { startCrawl(syms); }}
          onCancelCrawl={cancelCrawl}
          onClearJob={clearJob}
          onClose={() => setShowCrawlPanel(false)}
        />
      )}

      {/* Filter bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 12px',
          borderBottom: '1px solid var(--color-terminal-border)',
          background: 'var(--color-terminal-surface)',
          flexShrink: 0,
        }}
      >
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '9px', letterSpacing: '0.1em' }}>
          FILTER
        </span>
        <input
          type="text"
          placeholder="SYMBOL"
          value={filterSymbol}
          onChange={(e) => setFilterSymbol(e.target.value)}
          style={filterInputStyle}
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={filterSelectStyle}
        >
          <option value="all">ALL STATUS</option>
          <option value="pending">PENDING</option>
          <option value="active">ACTIVE</option>
          <option value="tp_hit">TP HIT</option>
          <option value="sl_hit">SL HIT</option>
          <option value="closed">CLOSED</option>
        </select>
        <select
          value={filterDirection}
          onChange={(e) => setFilterDirection(e.target.value)}
          style={filterSelectStyle}
        >
          <option value="all">ALL DIR</option>
          <option value="long">LONG</option>
          <option value="short">SHORT</option>
        </select>
        {(filterSymbol || filterStatus !== 'all' || filterDirection !== 'all') && (
          <button
            onClick={() => { setFilterSymbol(''); setFilterStatus('all'); setFilterDirection('all') }}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-terminal-dim)',
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              cursor: 'pointer',
              padding: '0 4px',
            }}
          >
            CLEAR
          </button>
        )}
      </div>

{/* Bulk action bar */}
      {someSelected && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '0 12px',
            height: '32px',
            background: 'rgba(255,59,59,0.06)',
            borderBottom: '1px solid rgba(255,59,59,0.25)',
            flexShrink: 0,
          }}
        >
          <span style={{ color: '#ff3b3b', fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.08em' }}>
            {selectedIds.size} SELECTED
          </span>
          <button
            onClick={handleBulkDelete}
            disabled={deleting}
            style={{
              background: deleting ? 'transparent' : 'rgba(255,59,59,0.12)',
              border: '1px solid rgba(255,59,59,0.5)',
              color: '#ff3b3b',
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              padding: '0 10px',
              height: '22px',
              cursor: deleting ? 'default' : 'pointer',
              borderRadius: 0,
              opacity: deleting ? 0.5 : 1,
            }}
          >
            {deleting ? 'DELETING...' : '✕ DELETE SELECTED'}
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-terminal-dim)',
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              cursor: 'pointer',
              padding: '0 4px',
            }}
          >
            DESELECT ALL
          </button>
        </div>
      )}
      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
            }}
          >
            <span
              style={{
                color: 'var(--color-terminal-dim)',
                fontSize: '12px',
                letterSpacing: '0.1em',
              }}
            >
              LOADING FEED...
            </span>
          </div>
        )}
        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
            }}
          >
            <span style={{ color: 'var(--color-terminal-down)', fontSize: '12px' }}>
              FEED ERROR: {error}
            </span>
          </div>
        )}
        {!loading && !error && filteredSignals.length === 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: '8px',
            }}
          >
            <span
              style={{
                color: 'var(--color-terminal-muted)',
                fontSize: '13px',
                letterSpacing: '0.12em',
              }}
            >
              {signals.length > 0 ? 'NO MATCHING SIGNALS' : 'NO FEED DATA'}
            </span>
            <span
              style={{
                color: 'var(--color-terminal-dim)',
                fontSize: '11px',
                letterSpacing: '0.08em',
              }}
            >
              {signals.length > 0 ? 'ADJUST FILTERS OR CLEAR' : 'AWAITING INBOUND SIGNALS'}
            </span>
          </div>
        )}
        {!loading && !error && filteredSignals.length > 0 && mode === 'LIST' && (
          <div>
            {/* Select-all row */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 12px',
                borderBottom: '1px solid var(--color-terminal-border)',
                background: 'var(--color-terminal-surface)',
              }}
            >
              <input
                type='checkbox'
                checked={allFilteredSelected}
                onChange={toggleSelectAll}
                style={{ cursor: 'pointer', accentColor: '#ff3b3b', width: '12px', height: '12px' }}
              />
              <span style={{ color: 'var(--color-terminal-dim)', fontSize: '9px', letterSpacing: '0.1em' }}>
                SELECT ALL ({filteredSignals.length})
              </span>
            </div>
            {filteredSignals.map((s) => (
              <FeedListRow key={s.id} signal={s} onUpdate={updateSignal} selected={selectedIds.has(s.id)} onToggleSelect={toggleSelect} />
            ))}
          </div>
        )}
        {!loading && !error && filteredSignals.length > 0 && mode === 'GRID' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px',
              padding: '12px',
            }}
          >
            {filteredSignals.map((s) => (
              <FeedGridCard key={s.id} signal={s} onUpdate={updateSignal} selected={selectedIds.has(s.id)} onToggleSelect={toggleSelect} />
            ))}
          </div>
        )}
      </div>

      {/* New Signal Modal */}
      <NewSignalModal
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        onSubmit={addSignal}
      />
    </div>
  )
}

// ── CrawlPanel ──────────────────────────────────────────────────────────────


function CrawlPanel({
  crawling,
  job,
  availableSymbols,
  crawlSymbolInput,
  setCrawlSymbolInput,
  onStartCrawl,
  onCancelCrawl,
  onClearJob,
  onClose,
}: {
  crawling: boolean
  job: CrawlJob | null
  availableSymbols: string[]
  crawlSymbolInput: string
  setCrawlSymbolInput: (v: string) => void
  onStartCrawl: (symbols: string[]) => void
  onCancelCrawl: () => void
  onClearJob: () => void
  onClose: () => void
}) {
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([])
  const logsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [job?.logs?.length])

  const toggleSymbol = (sym: string) => {
    setSelectedSymbols((prev) =>
      prev.includes(sym) ? prev.filter((s) => s !== sym) : [...prev, sym],
    )
  }

  const addCustomSymbol = () => {
    const sym = crawlSymbolInput.trim().toUpperCase()
    if (!sym || selectedSymbols.includes(sym)) {
      setCrawlSymbolInput('')
      return
    }
    setSelectedSymbols((prev) => [...prev, sym])
    setCrawlSymbolInput('')
  }

  const handleStart = () => {
    if (!selectedSymbols.length || crawling) return
    onStartCrawl(selectedSymbols)
  }

  const statusColor = job?.status === 'completed'
    ? '#00ff88'
    : job?.status === 'failed'
      ? '#ff3b3b'
      : job?.status === 'running'
        ? '#4488ff'
        : 'var(--color-terminal-muted)'

  return (
    <div
      style={{
        borderBottom: '1px solid var(--color-terminal-border)',
        background: 'var(--color-terminal-surface)',
        flexShrink: 0,
        maxHeight: '320px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Panel header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', borderBottom: '1px solid var(--color-terminal-border)' }}>
        <span style={{ color: '#4488ff', fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.1em' }}>
          ◈ AI SIGNAL CRAWLER
        </span>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--color-terminal-dim)', cursor: 'pointer', fontSize: '14px', padding: '0 4px', fontFamily: 'var(--font-mono)' }}>
          ×
        </button>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left: symbol picker */}
        <div style={{ width: '220px', minWidth: '220px', borderRight: '1px solid var(--color-terminal-border)', padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ color: 'var(--color-terminal-dim)', fontSize: '9px', letterSpacing: '0.12em' }}>SELECT ASSETS</span>
          {/* Quick-pick chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {availableSymbols.map((sym) => {
              const active = selectedSymbols.includes(sym)
              return (
                <button
                  key={sym}
                  onClick={() => toggleSymbol(sym)}
                  style={{
                    background: active ? 'rgba(68,136,255,0.15)' : 'transparent',
                    border: `1px solid ${active ? '#4488ff' : 'var(--color-terminal-border)'}`,
                    color: active ? '#4488ff' : 'var(--color-terminal-muted)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '9px',
                    letterSpacing: '0.06em',
                    padding: '2px 6px',
                    cursor: 'pointer',
                    borderRadius: 0,
                  }}
                >
                  {sym}
                </button>
              )
            })}
          </div>
          {/* Custom symbol input */}
          <div style={{ display: 'flex', gap: '4px' }}>
            <input
              type='text'
              placeholder='CUSTOM...'
              value={crawlSymbolInput}
              onChange={(e) => setCrawlSymbolInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === 'Enter') addCustomSymbol() }}
              style={{
                background: 'var(--color-terminal-bg)',
                border: '1px solid var(--color-terminal-border)',
                color: 'var(--color-terminal-text)',
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                padding: '2px 6px',
                outline: 'none',
                flex: 1,
                height: '24px',
                borderRadius: 0,
              }}
            />
            <button
              onClick={addCustomSymbol}
              style={{
                background: 'transparent',
                border: '1px solid var(--color-terminal-border)',
                color: 'var(--color-terminal-dim)',
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                padding: '0 8px',
                height: '24px',
                cursor: 'pointer',
                borderRadius: 0,
              }}
            >
              ADD
            </button>
          </div>
          {/* Selected list */}
          {selectedSymbols.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px' }}>
              <span style={{ width: '100%', color: 'var(--color-terminal-dim)', fontSize: '9px', letterSpacing: '0.1em' }}>QUEUED</span>
              {selectedSymbols.map((sym) => (
                <span
                  key={sym}
                  style={{
                    background: 'rgba(68,136,255,0.1)',
                    border: '1px solid rgba(68,136,255,0.4)',
                    color: '#4488ff',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '9px',
                    padding: '1px 6px',
                    display: 'flex', alignItems: 'center', gap: '4px',
                    cursor: 'pointer',
                  }}
                  onClick={() => toggleSymbol(sym)}
                  title='Click to remove'
                >
                  {sym} ×
                </span>
              ))}
            </div>
          )}
          {/* Start button */}
          <button
            onClick={handleStart}
            disabled={!selectedSymbols.length || crawling}
            style={{
              marginTop: 'auto',
              background: selectedSymbols.length && !crawling ? 'rgba(68,136,255,0.15)' : 'transparent',
              border: `1px solid ${selectedSymbols.length && !crawling ? '#4488ff' : 'var(--color-terminal-border)'}`,
              color: selectedSymbols.length && !crawling ? '#4488ff' : 'var(--color-terminal-dim)',
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              padding: '0 12px',
              height: '28px',
              cursor: selectedSymbols.length && !crawling ? 'pointer' : 'not-allowed',
              borderRadius: 0,
              width: '100%',
            }}
          >
            {crawling ? 'CRAWLING...' : `▶ START CRAWL (${selectedSymbols.length})`}
          </button>
        </div>

        {/* Right: job status / logs */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '8px' }}>
          {!job && !crawling && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: 'var(--color-terminal-dim)', fontSize: '11px', letterSpacing: '0.08em' }}>
                Select assets and start crawl to generate AI signals
              </span>
            </div>
          )}
          {job && (
            <>
              {/* Status bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px', flexShrink: 0 }}>
                <span style={{ color: statusColor, fontSize: '10px', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', fontWeight: 700 }}>
                  {job.status.toUpperCase()}
                </span>
                <span style={{ color: 'var(--color-terminal-dim)', fontSize: '9px' }}>
                  [{job.symbols.join(', ')}]
                </span>
                {job.status === 'completed' && (
                  <span style={{ color: '#00ff88', fontSize: '9px', marginLeft: 'auto' }}>
                    {job.savedSignalIds.length} signals saved
                  </span>
                )}
                {job.status === 'failed' && (
                  <span style={{ color: '#ff3b3b', fontSize: '9px', marginLeft: 'auto' }}>
                    {job.error}
                  </span>
                )}
                {(job.status === 'completed' || job.status === 'failed') && (
                  <button
                    onClick={onClearJob}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--color-terminal-dim)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '9px',
                      cursor: 'pointer',
                      padding: '0 4px',
                      marginLeft: job.status === 'completed' ? '0' : 'auto',
                    }}
                  >
                    CLEAR
                  </button>
                )}
                {(job.status === 'pending' || job.status === 'running') && (
                  <button
                    onClick={onCancelCrawl}
                    style={{
                      background: 'transparent',
                      border: '1px solid rgba(255,59,59,0.4)',
                      color: '#ff3b3b',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '9px',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      padding: '0 8px',
                      height: '20px',
                      cursor: 'pointer',
                      borderRadius: 0,
                      marginLeft: 'auto',
                    }}
                  >
                    ■ CANCEL
                  </button>
                )}
              </div>
              {/* Logs */}
              <div
                style={{
                  flex: 1,
                  overflow: 'auto',
                  background: 'var(--color-terminal-bg)',
                  border: '1px solid var(--color-terminal-border)',
                  padding: '6px 8px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  color: 'var(--color-terminal-muted)',
                  lineHeight: '1.6',
                }}
              >
                {job.logs.length === 0 && (
                  <span style={{ color: 'var(--color-terminal-dim)' }}>Waiting for agent...</span>
                )}
                {job.logs.map((line, i) => (
                  <div key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {line}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
