'use client'

import { Suspense, useState } from 'react'
import { useProjectInfo } from '@/hooks/useProjectInfo'
import type { DiscoveryHistoryEntry } from '@/hooks/useProjectInfo'
import { DiscoveryDialog } from '@/components/terminal/DiscoveryDialog'
import { ProjectInfoContent } from '@/components/terminal/ProjectInfoContent'

/* ── Constants ── */
const ASSETS = ['BTC', 'ETH', 'SOL', 'BNB', 'TAO'] as const
type Asset = (typeof ASSETS)[number]

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

/* ── History entry row ── */
function HistoryRow({
  entry,
  selected,
  onClick,
}: {
  entry: DiscoveryHistoryEntry
  selected: boolean
  onClick: () => void
}) {
  const isCompleted = entry.status === 'completed'
  const statusColor = isCompleted ? 'var(--color-terminal-up)' : 'var(--color-terminal-down)'

  return (
    <div
      onClick={onClick}
      style={{
        padding: '8px 12px',
        borderBottom: '1px solid var(--color-terminal-border)',
        background: selected ? 'rgba(255,170,0,0.07)' : 'transparent',
        borderLeft: selected ? '2px solid var(--color-terminal-amber)' : '2px solid transparent',
        cursor: 'pointer',
        fontFamily: 'var(--font-mono)',
        transition: 'background 0.1s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '3px' }}>
        <span style={{ color: 'var(--color-terminal-text)', fontSize: '13px', fontWeight: 'bold' }}>
          {entry.symbol}
        </span>
        <span style={{ color: statusColor, fontSize: '11px', letterSpacing: '0.08em' }}>
          {entry.status.toUpperCase()}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <span style={{ color: 'var(--color-terminal-muted)', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>
          {entry.modelId.split('/').pop() ?? entry.modelId}
        </span>
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '11px', flexShrink: 0 }}>
          {timeAgo(entry.completedAt)}
        </span>
      </div>
    </div>
  )
}

/* ── Detail panel ── */
function DetailPanel({
  entry,
  discovering,
  discoveryElapsed,
  discoveryLogs,
  onOpenDialog,
  symbol,
  projectInfo,
  onCancel,
}: {
  entry: DiscoveryHistoryEntry | null
  discovering: boolean
  discoveryElapsed: number
  discoveryLogs: string[]
  onOpenDialog: () => void
  symbol: string
  onCancel: () => void
  projectInfo: ReturnType<typeof useProjectInfo>
}) {
  const [view, setView] = useState<'project-info' | 'raw'>('project-info')

  // Active discovery state
  if (discovering) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px', gap: '12px', overflow: 'hidden', minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: 'var(--color-terminal-amber)', fontSize: '13px', fontWeight: 'bold', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' }}>
            ◉ AGENT RUNNING
          </span>
          <span style={{ color: 'var(--color-terminal-muted)', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
            {formatElapsed(discoveryElapsed)}
          </span>
          <button
            onClick={onOpenDialog}
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: '1px solid var(--color-terminal-border)',
              color: 'var(--color-terminal-blue)',
              fontSize: '12px',
              fontFamily: 'var(--font-mono)',
              cursor: 'pointer',
              padding: '2px 8px',
            }}
          >
            FULL SCREEN ⊞
          </button>
          <button
            onClick={onCancel}
            style={{
              background: 'transparent',
              border: '1px solid var(--color-terminal-down)44',
              color: 'var(--color-terminal-down)',
              fontSize: '12px',
              fontFamily: 'var(--font-mono)',
              cursor: 'pointer',
              padding: '2px 8px',
            }}
          >
            ✕ CANCEL
          </button>
        </div>

        {/* Live logs */}
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
    )
  }

  // No entry selected — still show project info
  if (!entry) {
    return <ProjectInfoContent symbol={symbol} projectInfo={projectInfo} />
  }

  const rawOutput = entry.rawOutput

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      {/* Header */}
      <div style={{
        padding: '10px 16px',
        background: 'var(--color-terminal-panel)',
        borderBottom: '1px solid var(--color-terminal-border)',
        display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0,
        fontFamily: 'var(--font-mono)',
      }}>
        <span style={{ color: 'var(--color-terminal-text)', fontSize: '12px', fontWeight: 'bold' }}>{entry.symbol}</span>
        <span style={{ color: 'var(--color-terminal-muted)', fontSize: '12px' }}>{timeAgo(entry.completedAt)}</span>
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
          {entry.modelId}
        </span>

        {/* View toggle */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
          {(['project-info', 'raw'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                background: view === v ? 'rgba(255,170,0,0.1)' : 'transparent',
                border: `1px solid ${view === v ? 'var(--color-terminal-amber)' : 'var(--color-terminal-border)'}`,
                color: view === v ? 'var(--color-terminal-amber)' : 'var(--color-terminal-dim)',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.08em',
                cursor: 'pointer',
                padding: '2px 8px',
              }}
            >
              {v === 'project-info' ? 'PROJECT INFO' : 'RAW'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {view === 'raw' ? (
        <div style={{ flex: 1, overflow: 'auto', padding: '16px', minHeight: 0 }}>
          <pre style={{
            color: 'var(--color-terminal-muted)', fontSize: '12px', fontFamily: 'var(--font-mono)',
            lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0,
          }}>
            {rawOutput ?? '(no raw output saved)'}
          </pre>
        </div>
      ) : (
        <ProjectInfoContent symbol={symbol} projectInfo={projectInfo} />
      )}
    </div>
  )
}

/* ── Main component ── */
function DiscoveryContent() {
  const [selectedAsset, setSelectedAsset] = useState<Asset>('BTC')
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null)

  const projectInfo = useProjectInfo(selectedAsset)

  const {
    discovering,
    discoveryElapsed,
    discoveryLogs,
    discoveryHistory,
    discoveryDialogOpen,
    setDiscoveryDialogOpen,
    discoveryRawOutput,
    discover,
    cancelDiscovery,
  } = projectInfo

  const selectedEntry = selectedHistoryId
    ? discoveryHistory.find(e => e.id === selectedHistoryId) ?? null
    : discoveryHistory[0] ?? null

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, background: 'var(--color-terminal-bg)', fontFamily: 'var(--font-mono)' }}>
      {/* Header */}
      <div style={{
        height: '40px', minHeight: '40px', display: 'flex', alignItems: 'center',
        padding: '0 16px', gap: '8px',
        background: 'var(--color-terminal-panel)', borderBottom: '1px solid var(--color-terminal-border)',
        flexShrink: 0,
      }}>
        <span style={{ color: 'var(--color-terminal-amber)', fontSize: '13px', fontWeight: 'bold', letterSpacing: '0.15em', marginRight: '8px' }}>
          DISCOVERY LAB
        </span>

        {/* Asset buttons */}
        {ASSETS.map(asset => (
          <button
            key={asset}
            onClick={() => { setSelectedAsset(asset); setSelectedHistoryId(null) }}
            style={{
              background: selectedAsset === asset ? 'rgba(255,170,0,0.1)' : 'transparent',
              border: `1px solid ${selectedAsset === asset ? 'var(--color-terminal-amber)' : 'var(--color-terminal-border)'}`,
              color: selectedAsset === asset ? 'var(--color-terminal-amber)' : 'var(--color-terminal-muted)',
              fontSize: '12px',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.08em',
              cursor: 'pointer',
              padding: '3px 10px',
              fontWeight: selectedAsset === asset ? 'bold' : 'normal',
            }}
          >
            {asset}
          </button>
        ))}

        {/* Run discovery button */}
        <button
          onClick={() => discover()}
          disabled={discovering}
          style={{
            marginLeft: 'auto',
            background: discovering ? 'transparent' : 'rgba(0,255,136,0.08)',
            border: `1px solid ${discovering ? 'var(--color-terminal-border)' : 'var(--color-terminal-up)'}`,
            color: discovering ? 'var(--color-terminal-dim)' : 'var(--color-terminal-up)',
            fontSize: '12px',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.1em',
            cursor: discovering ? 'not-allowed' : 'pointer',
            padding: '4px 14px',
            fontWeight: 'bold',
          }}
        >
          {discovering ? `◉ RUNNING ${formatElapsed(discoveryElapsed)}` : '▶ RUN DISCOVERY'}
        </button>
        {discovering && (
          <button
            onClick={() => cancelDiscovery()}
            style={{
              background: 'transparent',
              border: '1px solid var(--color-terminal-down)44',
              color: 'var(--color-terminal-down)',
              fontSize: '12px',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.1em',
              cursor: 'pointer',
              padding: '4px 14px',
              fontWeight: 'bold',
            }}
          >
            ✕ CANCEL
          </button>
        )}
      </div>

      {/* Body: history list + detail */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {/* Left: history list */}
        <div style={{ width: '280px', minWidth: '240px', flexShrink: 0, borderRight: '1px solid var(--color-terminal-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{
            padding: '6px 12px',
            background: 'var(--color-terminal-panel)', borderBottom: '1px solid var(--color-terminal-border)',
            color: 'var(--color-terminal-dim)', fontSize: '11px', letterSpacing: '0.1em', flexShrink: 0,
          }}>
            HISTORY ({discoveryHistory.length})
          </div>
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {discoveryHistory.length === 0 ? (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '80px', color: 'var(--color-terminal-dim)', fontSize: '12px',
              }}>
                NO RUNS YET
              </div>
            ) : (
              discoveryHistory.map(entry => (
                <HistoryRow
                  key={entry.id}
                  entry={entry}
                  selected={selectedEntry?.id === entry.id}
                  onClick={() => setSelectedHistoryId(entry.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* Right: detail */}
        <DetailPanel
          entry={selectedEntry}
          discovering={discovering}
          discoveryElapsed={discoveryElapsed}
          discoveryLogs={discoveryLogs}
          onOpenDialog={() => setDiscoveryDialogOpen(true)}
          symbol={selectedAsset}
          projectInfo={projectInfo}
          onCancel={() => cancelDiscovery()}
        />
      </div>

      {/* Fullscreen dialog */}
      <DiscoveryDialog
        open={discoveryDialogOpen}
        onClose={() => setDiscoveryDialogOpen(false)}
        discovering={discovering}
        discoveryElapsed={discoveryElapsed}
        discoveryLogs={discoveryLogs}
        rawOutput={discoveryRawOutput}
        symbol={selectedAsset}
      />
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
