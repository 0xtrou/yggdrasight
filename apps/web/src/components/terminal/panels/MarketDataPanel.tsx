'use client'

import { useState, useEffect, useCallback } from 'react'
import { useMarketFeed, type FeedTab } from '@/hooks/useMarketFeed'

interface MarketDataPanelProps {
  symbol: string
}

const TABS: FeedTab[] = ['NEWS', 'SOCIAL', 'ON-CHAIN', 'AGGREGATED']

const TAB_SUBTITLES: Record<FeedTab, string> = {
  NEWS: 'CryptoCompare real-time news aggregation',
  SOCIAL: 'CoinGecko community, Reddit, Twitter/X, trending',
  'ON-CHAIN': 'Binance funding rates, OI, long/short ratios, taker volume',
  AGGREGATED: 'Combined feed from all sources',
}

const SOURCE_COLORS: Record<string, string> = {
  // News sources
  COINCU: 'var(--color-terminal-blue)',
  COINJO: 'var(--color-terminal-blue)',
  COINTE: 'var(--color-terminal-amber)',
  CRYPT: 'var(--color-terminal-blue)',
  THEBL: 'var(--color-terminal-amber)',
  AMBCR: 'var(--color-terminal-blue)',
  DECRY: 'var(--color-terminal-amber)',
  BITCO: 'var(--color-terminal-up)',
  NEWS: 'var(--color-terminal-blue)',
  CGKO: 'var(--color-terminal-up)',
  // Social sources
  'X/TW': 'var(--color-terminal-blue)',
  RDDT: 'var(--color-terminal-amber)',
  GH: 'var(--color-terminal-dim)',
  TREND: 'var(--color-terminal-amber)',
  // On-chain sources
  BFUND: 'var(--color-terminal-up)',
  'BL/S': 'var(--color-terminal-amber)',
  BOI: 'var(--color-terminal-blue)',
  BTOP: 'var(--color-terminal-amber)',
  BTVOL: 'var(--color-terminal-blue)',
}

function getSourceColor(source: string): string {
  return SOURCE_COLORS[source] || 'var(--color-terminal-dim)'
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
  const [activeTab, setActiveTab] = useState<FeedTab>('NEWS')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const { entries, loading, error, refresh } = useMarketFeed(activeTab, symbol)

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

  const subtitle = TAB_SUBTITLES[activeTab]

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
                fontSize: 12,
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
        {/* Spacer + entry count + refresh + fullscreen */}
        <div style={{ flex: 1, borderBottom: '2px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, paddingRight: 4 }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: 'var(--color-terminal-dim)',
              letterSpacing: '0.05em',
            }}
          >
            {loading ? 'LOADING...' : `${entries.length} ITEMS`}
          </span>
          <button
            onClick={refresh}
            title="Refresh feed"
            style={{
              background: 'transparent',
              border: '1px solid var(--color-terminal-border)',
              color: 'var(--color-terminal-dim)',
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              cursor: 'pointer',
              padding: '1px 5px',
              lineHeight: 1,
            }}
          >
            ↻
          </button>
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
            style={{
              background: 'transparent',
              border: '1px solid var(--color-terminal-border)',
              color: isFullscreen ? 'var(--color-terminal-amber)' : 'var(--color-terminal-dim)',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              cursor: 'pointer',
              padding: '1px 5px',
              lineHeight: 1,
            }}
          >
            {isFullscreen ? '⊡' : '⊞'}
          </button>
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
            fontSize: 11,
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
            fontSize: 11,
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
            fontSize: 11,
            color: 'var(--color-terminal-dim)',
            flex: 1,
          }}
        >
          {activeTab === 'NEWS' ? 'HEADLINE' : activeTab === 'ON-CHAIN' ? 'METRIC' : activeTab === 'SOCIAL' ? 'SOCIAL DATA' : 'FEED'}
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
        {/* Loading state */}
        {loading && entries.length === 0 && (
          <div style={{ padding: '20px 10px', textAlign: 'center' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-terminal-dim)', letterSpacing: '0.05em' }}>
              ■ FETCHING {activeTab} DATA FOR {symbol}...
            </span>
          </div>
        )}

        {/* Error state */}
        {error && entries.length === 0 && (
          <div style={{ padding: '20px 10px', textAlign: 'center' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-terminal-down)', letterSpacing: '0.05em' }}>
              ■ FEED ERROR: {error}
            </span>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && entries.length === 0 && (
          <div style={{ padding: '20px 10px', textAlign: 'center' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-terminal-dim)', letterSpacing: '0.05em' }}>
              ■ NO {activeTab} DATA AVAILABLE FOR {symbol}
            </span>
          </div>
        )}

        {/* Feed entries */}
        {entries.map((entry) => (
          <div
            key={entry.id}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              padding: '5px 10px',
              borderBottom: '1px solid var(--color-terminal-border)',
              gap: 8,
              opacity: 0.75,
              transition: 'opacity 0.15s, background-color 0.15s',
              cursor: entry.url ? 'pointer' : 'default',
            }}
            onClick={() => {
              if (entry.url) window.open(entry.url, '_blank', 'noopener')
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '1'
              e.currentTarget.style.backgroundColor = 'var(--color-terminal-surface)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '0.75'
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            {/* Timestamp */}
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
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
                fontSize: 11,
                color: getSourceColor(entry.source),
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
                fontSize: 12,
                color: 'var(--color-terminal-text)',
                flex: 1,
                lineHeight: '18px',
                display: 'flex',
                alignItems: 'flex-start',
              }}
            >
              <SentimentDot sentiment={entry.sentiment} />
              <span style={{ flex: 1 }}>{entry.headline}</span>
              {entry.url && (
                <span style={{ color: 'var(--color-terminal-dim)', fontSize: 9, marginLeft: 6, flexShrink: 0 }}>↗</span>
              )}
            </span>
          </div>
        ))}

        {/* Footer */}
        {entries.length > 0 && (
          <div
            style={{
              padding: '8px 10px',
              textAlign: 'center',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--color-terminal-dim)',
                letterSpacing: '0.05em',
              }}
            >
              ── {subtitle} · {entries.length} entries · auto-refresh 2min ──
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
