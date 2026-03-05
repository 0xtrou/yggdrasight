'use client'

import { useState, useEffect, useCallback } from 'react'

interface MarketDataPanelProps {
  symbol: string
}

type TabKey = 'NEWS' | 'SOCIAL' | 'ON-CHAIN' | 'AGGREGATED'

const TABS: TabKey[] = ['NEWS', 'SOCIAL', 'ON-CHAIN', 'AGGREGATED']

interface MockEntry {
  time: string
  source: string
  sourceColor: string
  headline: string
  sentiment?: 'up' | 'down' | 'neutral'
}

function getMockNews(symbol: string): MockEntry[] {
  return [
    {
      time: '14:32:07',
      source: 'RTRS',
      sourceColor: 'var(--color-terminal-blue)',
      headline: `${symbol} spot ETF inflows reach $847M in single-day record`,
      sentiment: 'up',
    },
    {
      time: '14:28:41',
      source: 'BLOOM',
      sourceColor: 'var(--color-terminal-amber)',
      headline: `Fed officials signal cautious stance on rate cuts amid ${symbol} rally`,
      sentiment: 'neutral',
    },
    {
      time: '14:15:03',
      source: 'CDSK',
      sourceColor: 'var(--color-terminal-blue)',
      headline: `MicroStrategy adds 12,000 ${symbol} to treasury reserves — filing`,
      sentiment: 'up',
    },
    {
      time: '14:02:19',
      source: 'RTRS',
      sourceColor: 'var(--color-terminal-blue)',
      headline: `EU MiCA regulations take effect, exchanges report ${symbol} volume surge`,
      sentiment: 'neutral',
    },
    {
      time: '13:47:55',
      source: 'CWEB',
      sourceColor: 'var(--color-terminal-dim)',
      headline: `${symbol} mining difficulty adjustment expected +3.2% in 48hrs`,
      sentiment: 'neutral',
    },
    {
      time: '13:31:12',
      source: 'BLOOM',
      sourceColor: 'var(--color-terminal-amber)',
      headline: `Grayscale ${symbol} Trust discount narrows to -1.2%, lowest since conversion`,
      sentiment: 'up',
    },
  ]
}

function getMockSocial(symbol: string): MockEntry[] {
  return [
    {
      time: '14:31:42',
      source: 'X/TW',
      sourceColor: 'var(--color-terminal-blue)',
      headline: `@whale_alert: 2,500 ${symbol} transferred from Coinbase to unknown wallet`,
      sentiment: 'neutral',
    },
    {
      time: '14:27:08',
      source: 'RDDT',
      sourceColor: 'var(--color-terminal-amber)',
      headline: `r/cryptocurrency sentiment for ${symbol}: 78% bullish (24h rolling)`,
      sentiment: 'up',
    },
    {
      time: '14:19:33',
      source: 'X/TW',
      sourceColor: 'var(--color-terminal-blue)',
      headline: `@CryptoQuant CEO: "${symbol} exchange reserves at 5-year low — supply squeeze incoming"`,
      sentiment: 'up',
    },
    {
      time: '14:11:05',
      source: 'DISC',
      sourceColor: '#7289da',
      headline: `${symbol} derivatives Discord: large OI buildup at $105K strike for March expiry`,
      sentiment: 'neutral',
    },
    {
      time: '13:58:22',
      source: 'X/TW',
      sourceColor: 'var(--color-terminal-blue)',
      headline: `@glassnode: ${symbol} MVRV Z-Score at 2.1 — approaching overheated territory`,
      sentiment: 'down',
    },
  ]
}

function getMockOnChain(symbol: string): MockEntry[] {
  return [
    {
      time: '14:30:00',
      source: 'GNODE',
      sourceColor: 'var(--color-terminal-up)',
      headline: `${symbol} exchange net outflow: -8,420 ${symbol} (24h) — accumulation signal`,
      sentiment: 'up',
    },
    {
      time: '14:22:16',
      source: 'WHALE',
      sourceColor: 'var(--color-terminal-amber)',
      headline: `Whale wallet 0x3f...a91c moved 1,200 ${symbol} to cold storage`,
      sentiment: 'up',
    },
    {
      time: '14:14:48',
      source: 'DEFIL',
      sourceColor: 'var(--color-terminal-blue)',
      headline: `${symbol} funding rate: +0.012% (8h) — slightly long-biased`,
      sentiment: 'neutral',
    },
    {
      time: '14:05:31',
      source: 'GNODE',
      sourceColor: 'var(--color-terminal-up)',
      headline: `${symbol} realized cap hits new ATH at $467B — strong holder conviction`,
      sentiment: 'up',
    },
    {
      time: '13:52:09',
      source: 'NANSE',
      sourceColor: 'var(--color-terminal-blue)',
      headline: `Smart money wallets net +3,100 ${symbol} in past 7 days`,
      sentiment: 'up',
    },
  ]
}

function getMockAggregated(symbol: string): MockEntry[] {
  return [
    {
      time: '14:33:00',
      source: 'AGGR',
      sourceColor: 'var(--color-terminal-amber)',
      headline: `${symbol} COMPOSITE SCORE: 7.8/10 — Bullish bias across news + on-chain + social`,
      sentiment: 'up',
    },
    {
      time: '14:25:00',
      source: 'AGGR',
      sourceColor: 'var(--color-terminal-amber)',
      headline: `${symbol} cross-signal: ETF inflows + exchange outflows + positive sentiment convergence`,
      sentiment: 'up',
    },
    {
      time: '14:18:00',
      source: 'RISK',
      sourceColor: 'var(--color-terminal-down)',
      headline: `${symbol} risk flag: MVRV approaching overheated zone — monitor for reversal signals`,
      sentiment: 'down',
    },
    {
      time: '14:10:00',
      source: 'AGGR',
      sourceColor: 'var(--color-terminal-amber)',
      headline: `${symbol} 24h summary: 12 bullish signals, 3 neutral, 1 bearish across all feeds`,
      sentiment: 'up',
    },
    {
      time: '14:00:00',
      source: 'META',
      sourceColor: 'var(--color-terminal-dim)',
      headline: `Feed health: NEWS 98% | SOCIAL 94% | ON-CHAIN 99% — all feeds operational`,
      sentiment: 'neutral',
    },
  ]
}

const TAB_META: Record<TabKey, { title: string; subtitle: string; getMockData: (symbol: string) => MockEntry[] }> = {
  NEWS: {
    title: 'NEWS FEED COMING SOON',
    subtitle: 'Real-time crypto news aggregation',
    getMockData: getMockNews,
  },
  SOCIAL: {
    title: 'SOCIAL FEED COMING SOON',
    subtitle: 'Twitter/X, Reddit, Discord sentiment',
    getMockData: getMockSocial,
  },
  'ON-CHAIN': {
    title: 'ON-CHAIN DATA COMING SOON',
    subtitle: 'Whale movements, exchange flows, funding rates',
    getMockData: getMockOnChain,
  },
  AGGREGATED: {
    title: 'AGGREGATED INTEL COMING SOON',
    subtitle: 'Combined market intelligence feed',
    getMockData: getMockAggregated,
  },
}

function SentimentDot({ sentiment }: { sentiment?: 'up' | 'down' | 'neutral' }) {
  if (!sentiment) return null
  const color =
    sentiment === 'up'
      ? 'var(--color-terminal-up)'
      : sentiment === 'down'
        ? 'var(--color-terminal-down)'
        : 'var(--color-terminal-dim)'
  return (
    <span
      style={{
        display: 'inline-block',
        width: 5,
        height: 5,
        borderRadius: '50%',
        backgroundColor: color,
        marginRight: 6,
        flexShrink: 0,
      }}
    />
  )
}

export function MarketDataPanel({ symbol }: MarketDataPanelProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('NEWS')
  const [isFullscreen, setIsFullscreen] = useState(false)

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev)
  }, [])

  useEffect(() => {
    if (!isFullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isFullscreen])

  const meta = TAB_META[activeTab]
  const entries = meta.getMockData(symbol)
  return (
    <div
      style={{
        ...(isFullscreen ? {
          position: 'fixed' as const,
          top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 9999,
        } : {}),
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--color-terminal-bg)',
        fontFamily: 'var(--font-mono)',
        color: 'var(--color-terminal-text)',
        overflow: 'hidden',
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--color-terminal-border)',
          flexShrink: 0,
        }}
      >
        {TABS.map((tab) => {
          const isActive = tab === activeTab
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: isActive
                  ? '2px solid var(--color-terminal-amber)'
                  : '2px solid transparent',
                color: isActive
                  ? 'var(--color-terminal-text)'
                  : 'var(--color-terminal-muted)',
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                letterSpacing: '0.08em',
                height: 32,
                padding: '0 12px',
                cursor: 'pointer',
                transition: 'color 0.15s, border-color 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              {tab}
            </button>
          )
        })}
        {/* Spacer to fill remaining tab bar */}
        <div style={{ flex: 1, borderBottom: '2px solid transparent' }} />
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
          style={{
            background: 'transparent',
            border: '1px solid var(--color-terminal-border)',
            color: isFullscreen ? 'var(--color-terminal-amber)' : 'var(--color-terminal-dim)',
            fontFamily: 'var(--font-mono)',
            fontSize: '13px',
            cursor: 'pointer',
            padding: '1px 5px',
            lineHeight: 1,
            marginRight: '4px',
            alignSelf: 'center',
          }}
        >
          {isFullscreen ? '⊡' : '⊞'}
        </button>
      </div>

      {/* Header banner */}
      <div
        style={{
          padding: '8px 10px 6px',
          borderBottom: '1px solid var(--color-terminal-border)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            color: 'var(--color-terminal-amber)',
            letterSpacing: '0.05em',
            marginBottom: 2,
          }}
        >
          ■ {meta.title}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--color-terminal-dim)',
          }}
        >
          {meta.subtitle} — No data for {symbol}
        </div>
      </div>

      {/* Column headers */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '4px 10px',
          borderBottom: '1px solid var(--color-terminal-border)',
          flexShrink: 0,
          gap: 8,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--color-terminal-dim)',
            width: 64,
            flexShrink: 0,
          }}
        >
          TIME
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--color-terminal-dim)',
            width: 48,
            flexShrink: 0,
          }}
        >
          SRC
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--color-terminal-dim)',
            flex: 1,
          }}
        >
          HEADLINE
        </span>
      </div>

      {/* Scrollable feed */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {entries.map((entry, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              padding: '5px 10px',
              borderBottom: '1px solid var(--color-terminal-border)',
              gap: 8,
              opacity: 0.6,
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '1'
              e.currentTarget.style.backgroundColor = 'var(--color-terminal-surface)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '0.6'
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            {/* Timestamp */}
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: 'var(--color-terminal-dim)',
                width: 64,
                flexShrink: 0,
                lineHeight: '18px',
              }}
            >
              {entry.time}
            </span>

            {/* Source badge */}
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: entry.sourceColor,
                width: 48,
                flexShrink: 0,
                fontWeight: 600,
                lineHeight: '18px',
              }}
            >
              {entry.source}
            </span>

            {/* Headline */}
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                color: 'var(--color-terminal-text)',
                flex: 1,
                lineHeight: '18px',
                display: 'flex',
                alignItems: 'flex-start',
              }}
            >
              <SentimentDot sentiment={entry.sentiment} />
              <span style={{ flex: 1 }}>{entry.headline}</span>
            </span>
          </div>
        ))}

        {/* Footer placeholder */}
        <div
          style={{
            padding: '12px 10px',
            textAlign: 'center',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'var(--color-terminal-dim)',
              letterSpacing: '0.05em',
            }}
          >
            ── MOCK DATA · LIVE FEED PENDING ──
          </span>
        </div>
      </div>
    </div>
  )
}
