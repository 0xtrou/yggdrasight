'use client'

import { useSignals } from '@/hooks/useSignals'
import { useMarketGlobal } from '@/hooks/useMarketGlobal'
import { useMemo } from 'react'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '2px' }}>
      <div style={{
        padding: '5px 10px 3px',
        fontSize: '9px',
        letterSpacing: '0.12em',
        color: 'var(--color-terminal-dim)',
        background: 'var(--color-terminal-panel)',
        borderBottom: '1px solid var(--color-terminal-border)',
        borderTop: '1px solid var(--color-terminal-border)',
        fontFamily: 'var(--font-mono)',
      }}>
        {title}
      </div>
      <div>{children}</div>
    </div>
  )
}

function StatRow({ label, value, valueColor = 'var(--color-terminal-text)' }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      padding: '5px 10px',
      borderBottom: '1px solid var(--color-terminal-border)',
      fontFamily: 'var(--font-mono)',
      fontSize: '11px',
    }}>
      <span style={{ color: 'var(--color-terminal-muted)' }}>{label}</span>
      <span style={{ color: valueColor }}>{value}</span>
    </div>
  )
}

interface Stats {
  total: number
  active: number
  pending: number
  winRate: number
  avgPnl: number
  tpHit: number
  slHit: number
}

function computeStats(signals: { status: string; pnlPercent?: number }[]): Stats {
  const total = signals.length
  const active = signals.filter((s) => s.status === 'active').length
  const pending = signals.filter((s) => s.status === 'pending').length
  const tpHit = signals.filter((s) => s.status === 'tp_hit').length
  const slHit = signals.filter((s) => s.status === 'sl_hit').length
  const closedCount = tpHit + slHit
  const winRate = closedCount > 0 ? (tpHit / closedCount) * 100 : 0

  // Average PnL from signals that have pnlPercent set
  const withPnl = signals.filter(
    (s) => typeof (s as Record<string, unknown>).pnlPercent === 'number',
  ) as unknown as { pnlPercent: number }[]
  const avgPnl = withPnl.length > 0 ? withPnl.reduce((sum, s) => sum + s.pnlPercent, 0) / withPnl.length : 0

  return { total, active, pending, winRate, avgPnl, tpHit, slHit }
}

function formatMarketCap(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}t`
  if (value >= 1e9) return `$${Math.round(value / 1e9)}b`
  if (value >= 1e6) return `$${Math.round(value / 1e6)}m`
  return `$${value}`
}

export function StatsPanel() {
  const { signals, loading } = useSignals()
  const market = useMarketGlobal()

  const stats = useMemo(() => computeStats(signals as unknown as { status: string; pnlPercent?: number }[]), [signals])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', background: 'var(--color-terminal-surface)' }}>
      {/* Panel header */}
      <div style={{
        padding: '4px 10px',
        background: 'var(--color-terminal-panel)',
        borderBottom: '1px solid var(--color-terminal-border)',
        fontSize: '9px',
        letterSpacing: '0.12em',
        color: 'var(--color-terminal-muted)',
        fontFamily: 'var(--font-mono)',
        flexShrink: 0,
      }}>
        INTELLIGENCE
      </div>

      {loading ? (
        <div
          style={{
            padding: '20px 10px',
            textAlign: 'center',
            fontSize: '10px',
            color: 'var(--color-terminal-dim)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          COMPUTING...
        </div>
      ) : (
        <>
          <Section title="PERFORMANCE">
            <StatRow
              label="Win Rate"
              value={stats.total > 0 ? `${stats.winRate.toFixed(1)}%` : '—'}
              valueColor={stats.winRate >= 50 ? 'var(--color-terminal-up)' : stats.winRate > 0 ? 'var(--color-terminal-down)' : 'var(--color-terminal-dim)'}
            />
            <StatRow label="Total Signals" value={String(stats.total)} />
            <StatRow
              label="Active"
              value={String(stats.active)}
              valueColor="var(--color-terminal-amber)"
            />
            <StatRow
              label="Pending"
              value={String(stats.pending)}
              valueColor="var(--color-terminal-blue)"
            />
            <StatRow
              label="Avg PnL"
              value={stats.avgPnl !== 0 ? `${stats.avgPnl > 0 ? '+' : ''}${stats.avgPnl.toFixed(2)}%` : '—'}
              valueColor={stats.avgPnl > 0 ? 'var(--color-terminal-up)' : stats.avgPnl < 0 ? 'var(--color-terminal-down)' : 'var(--color-terminal-dim)'}
            />
          </Section>

          <Section title="OUTCOMES">
            <StatRow
              label="TP Hit"
              value={String(stats.tpHit)}
              valueColor="var(--color-terminal-up)"
            />
            <StatRow
              label="SL Hit"
              value={String(stats.slHit)}
              valueColor="var(--color-terminal-down)"
            />
            <StatRow
              label="Profit Factor"
              value={stats.slHit > 0 ? `${(stats.tpHit / stats.slHit).toFixed(1)}x` : stats.tpHit > 0 ? '∞' : '—'}
              valueColor={stats.tpHit >= stats.slHit ? 'var(--color-terminal-up)' : 'var(--color-terminal-down)'}
            />
          </Section>

          <Section title="MARKET INTEL">
            <StatRow
              label="BTC Dominance"
              value={market.loading ? 'LOADING...' : market.error ? 'ERR' : market.data ? `${market.data.btcDominance.toFixed(1)}%` : '—'}
              valueColor={market.loading ? 'var(--color-terminal-dim)' : market.error ? 'var(--color-terminal-down)' : market.data && market.data.btcDominance > 50 ? 'var(--color-terminal-amber)' : 'var(--color-terminal-text)'}
            />
            <StatRow
              label="Fear & Greed"
              value={market.loading ? 'LOADING...' : market.error ? 'ERR' : market.data ? `${market.data.fearGreedValue} ${market.data.fearGreedLabel}` : '—'}
              valueColor={market.loading ? 'var(--color-terminal-dim)' : market.error ? 'var(--color-terminal-down)' : market.data ? (market.data.fearGreedValue < 25 ? 'var(--color-terminal-down)' : market.data.fearGreedValue <= 50 ? 'var(--color-terminal-amber)' : market.data.fearGreedValue <= 75 ? 'var(--color-terminal-text)' : 'var(--color-terminal-up)') : 'var(--color-terminal-dim)'}
            />
            <StatRow
              label="Total MCap"
              value={market.loading ? 'LOADING...' : market.error ? 'ERR' : market.data ? formatMarketCap(market.data.totalMarketCap) : '—'}
              valueColor={market.loading ? 'var(--color-terminal-dim)' : market.error ? 'var(--color-terminal-down)' : 'var(--color-terminal-blue)'}
            />
          </Section>
        </>
      )}
    </div>
  )
}
