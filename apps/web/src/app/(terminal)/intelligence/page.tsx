'use client'

import { Suspense, useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { GlobalDiscoveryPanel } from '@/components/terminal/GlobalDiscoveryPanel'
import { useGlobalDiscovery } from '@/hooks/useGlobalDiscovery'
import { useMarketGlobal } from '@/hooks/useMarketGlobal'

/* ═══════════════════════════════════════════════════════════════════════════
   DYNAMIC LOAD — Three.js bundle only loads client-side (no SSR)
   ═══════════════════════════════════════════════════════════════════════════ */

const YggdrasilTree = dynamic(
  () => import('@/components/terminal/YggdrasilTree').then(m => ({ default: m.YggdrasilTree })),
  { ssr: false, loading: () => <YggdrasilTreeLoader /> }
)

/* ═══════════════════════════════════════════════════════════════════════════
   TYPES + CONSTANTS
   ═══════════════════════════════════════════════════════════════════════════ */

interface DashboardCard {
  id: string
  icon: string
  title: string
  description: string
  path: string
  accentColor: string
}

const DASHBOARD_CARDS: DashboardCard[] = [
  {
    id: 'classification',
    icon: '⬢',
    title: 'CLASSIFICATION',
    description: 'Multi-agent philosophical analysis — 6 parallel agents.',
    path: '/classification',
    accentColor: '#00ff88',
  },
  {
    id: 'discovery',
    icon: '◎',
    title: 'DISCOVERY',
    description: 'Deep research — whitepapers, GitHub, tokenomics.',
    path: '/discovery',
    accentColor: '#4488ff',
  },
  {
    id: 'signals',
    icon: '⚡',
    title: 'SIGNALS',
    description: 'AI-generated trading signals with conviction.',
    path: '/signals',
    accentColor: '#ffaa00',
  },
  {
    id: 'ai-config',
    icon: '⚙',
    title: 'AI CONFIG',
    description: 'Per-agent model configuration.',
    path: '/ai-config',
    accentColor: '#aa66ff',
  },
]

const HANDLE_SIZE = 6
const MIN_SPLIT = 0.2
const MAX_SPLIT = 0.8

const STORAGE_KEY = 'oculus:intelligence-splits'

type PanelId = 'yggdrasil' | 'market-intel' | 'discovery' | 'modules'

/* ═══════════════════════════════════════════════════════════════════════════
   PANEL HEADER — compact terminal-style header with fullscreen toggle
   ═══════════════════════════════════════════════════════════════════════════ */

function PanelHeader({
  icon,
  title,
  isFullscreen,
  onToggleFullscreen,
}: {
  icon: string
  title: string
  isFullscreen: boolean
  onToggleFullscreen: () => void
}) {
  const [btnHovered, setBtnHovered] = useState(false)

  return (
    <div style={{
      height: '28px',
      minHeight: '28px',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '0 10px',
      background: 'var(--color-terminal-panel)',
      borderBottom: '1px solid var(--color-terminal-border)',
      flexShrink: 0,
    }}>
      <span style={{
        fontSize: '11px',
        color: 'var(--color-terminal-dim)',
      }}>
        {icon}
      </span>
      <span style={{
        fontSize: '10px',
        fontWeight: 'bold',
        letterSpacing: '0.12em',
        color: 'var(--color-terminal-dim)',
        fontFamily: 'var(--font-mono)',
      }}>
        {title}
      </span>
      <div style={{ flex: 1 }} />
      <button
        onClick={onToggleFullscreen}
        onMouseEnter={() => setBtnHovered(true)}
        onMouseLeave={() => setBtnHovered(false)}
        title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
        style={{
          background: 'transparent',
          border: `1px solid ${btnHovered ? 'var(--color-terminal-dim)' : 'var(--color-terminal-border)'}`,
          color: isFullscreen ? 'var(--color-terminal-amber)' : 'var(--color-terminal-dim)',
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          cursor: 'pointer',
          padding: '1px 5px',
          lineHeight: 1,
          transition: 'border-color 0.15s ease, color 0.15s ease',
        }}
      >
        {isFullscreen ? '⊡' : '⊞'}
      </button>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   DASHBOARD CARD BUTTON — nav card for module navigation panel
   ═══════════════════════════════════════════════════════════════════════════ */

function DashboardCardButton({
  card,
  onClick,
}: {
  card: DashboardCard
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        padding: '10px 12px',
        background: hovered ? 'rgba(255,255,255,0.02)' : 'transparent',
        border: `1px solid ${hovered ? card.accentColor + '44' : 'var(--color-terminal-border)'}`,
        cursor: 'pointer',
        fontFamily: 'var(--font-mono)',
        textAlign: 'left',
        transition: 'all 0.15s ease',
        width: '100%',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{
          fontSize: '14px',
          color: hovered ? card.accentColor : 'var(--color-terminal-dim)',
          transition: 'color 0.15s ease',
        }}>
          {card.icon}
        </span>
        <span style={{
          fontSize: '12px',
          fontWeight: 'bold',
          letterSpacing: '0.1em',
          color: hovered ? card.accentColor : 'var(--color-terminal-text)',
          transition: 'color 0.15s ease',
        }}>
          {card.title}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{
          fontSize: '11px',
          color: hovered ? card.accentColor : 'var(--color-terminal-dim)',
          transition: 'color 0.15s ease',
          opacity: hovered ? 1 : 0.3,
        }}>
          →
        </span>
      </div>
      <div style={{
        fontSize: '10px',
        lineHeight: 1.5,
        color: 'var(--color-terminal-muted)',
        wordBreak: 'break-word',
        overflowWrap: 'break-word',
      }}>
        {card.description}
      </div>
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   TREND PILL — emerging trend badge
   ═══════════════════════════════════════════════════════════════════════════ */

function TrendPill({ trend }: { trend: string }) {
  const [hovered, setHovered] = useState(false)

  return (
    <span
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-block',
        padding: '3px 8px',
        fontSize: '10px',
        letterSpacing: '0.06em',
        color: hovered ? '#00ff88' : '#88bb88',
        border: `1px solid ${hovered ? '#00ff8844' : '#2a5a3a'}`,
        fontFamily: 'var(--font-mono)',
        transition: 'all 0.15s ease',
        cursor: 'default',
        wordBreak: 'break-word',
        overflowWrap: 'break-word',
      }}
    >
      {trend}
    </span>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   LOADING FALLBACK — shown while Three.js bundle loads
   ═══════════════════════════════════════════════════════════════════════════ */

function YggdrasilTreeLoader() {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      minHeight: '300px',
      background: '#060e0a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-mono)',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontSize: '14px',
          color: '#334433',
          letterSpacing: '0.15em',
          marginBottom: '8px',
        }}>
          INITIALIZING
        </div>
        <div style={{
          fontSize: '10px',
          color: '#223322',
          letterSpacing: '0.1em',
        }}>
          LOADING 3D ENGINE...
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   RESIZE HANDLE HOOK — shared drag logic for resizable panels
   ═══════════════════════════════════════════════════════════════════════════ */

function useResizeHandle(
  direction: 'horizontal' | 'vertical',
  containerRef: React.RefObject<HTMLDivElement | null>,
  onSplitChange: (value: number) => void,
) {
  const [dragging, setDragging] = useState(false)
  const [handleHovered, setHandleHovered] = useState(false)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  useEffect(() => {
    if (!dragging) return

    const onMouseMove = (e: MouseEvent) => {
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      let ratio: number
      if (direction === 'vertical') {
        ratio = (e.clientX - rect.left) / rect.width
      } else {
        ratio = (e.clientY - rect.top) / rect.height
      }
      onSplitChange(Math.max(MIN_SPLIT, Math.min(MAX_SPLIT, ratio)))
    }

    const onMouseUp = () => setDragging(false)

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = direction === 'vertical' ? 'col-resize' : 'row-resize'

    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [dragging, direction, containerRef, onSplitChange])

  return { dragging, handleHovered, onMouseDown, setHandleHovered }
}

/* ═══════════════════════════════════════════════════════════════════════════
   RESIZE HANDLE COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */

function ResizeHandle({
  direction,
  onMouseDown,
  hovered,
  onHoverChange,
  dragging,
}: {
  direction: 'horizontal' | 'vertical'
  onMouseDown: (e: React.MouseEvent) => void
  hovered: boolean
  onHoverChange: (h: boolean) => void
  dragging: boolean
}) {
  const isCol = direction === 'vertical'
  const active = hovered || dragging

  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      style={{
        position: 'relative',
        flexShrink: 0,
        width: isCol ? `${HANDLE_SIZE}px` : '100%',
        height: isCol ? '100%' : `${HANDLE_SIZE}px`,
        cursor: isCol ? 'col-resize' : 'row-resize',
        background: active ? 'rgba(0,255,136,0.12)' : 'transparent',
        transition: dragging ? 'none' : 'background 0.15s ease',
        zIndex: 10,
      }}
    >
      {/* Center line indicator */}
      <div style={{
        position: 'absolute',
        ...(isCol
          ? { top: '30%', bottom: '30%', left: '50%', width: '1px', transform: 'translateX(-50%)' }
          : { left: '30%', right: '30%', top: '50%', height: '1px', transform: 'translateY(-50%)' }
        ),
        background: active ? '#00ff8866' : 'var(--color-terminal-border)',
        transition: dragging ? 'none' : 'background 0.15s ease',
      }} />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   MARKET INTEL PANEL — direction + trends + cross-pillar insights
   ═══════════════════════════════════════════════════════════════════════════ */

function MarketIntelContent({
  marketDirection,
  emergingTrends,
  crossPillarInsights,
}: {
  marketDirection: string | null
  emergingTrends: string[]
  crossPillarInsights: string | null
}) {
  const router = useRouter()

  if (!marketDirection && emergingTrends.length === 0 && !crossPillarInsights) {
    return (
      <div style={{
        minHeight: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        fontFamily: 'var(--font-mono)',
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          textAlign: 'center',
        }}>
          <div style={{
            fontSize: '32px',
            lineHeight: 1,
            color: 'var(--color-terminal-dim)',
            opacity: 0.3,
          }}>
            ◎
          </div>
          <div style={{
            fontSize: '12px',
            color: 'var(--color-terminal-dim)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}>
            NO INTELLIGENCE DATA
          </div>
          <div style={{
            fontSize: '10px',
            color: 'var(--color-terminal-muted)',
          }}>
            Run a global discovery to generate market intelligence
          </div>
          <button
            onClick={() => router.push('/discovery')}
            style={{
              background: 'transparent',
              border: '1px solid var(--color-terminal-up)',
              color: 'var(--color-terminal-up)',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              letterSpacing: '0.1em',
              padding: '8px 20px',
              cursor: 'pointer',
              transition: 'all 0.15s',
              textTransform: 'uppercase',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(0,255,136,0.08)'
              e.currentTarget.style.borderColor = '#00ff88'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.borderColor = 'var(--color-terminal-up)'
            }}
          >
            ▸ LAUNCH DISCOVERY
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      padding: '12px',
      fontFamily: 'var(--font-mono)',
      display: 'flex',
      flexDirection: 'column',
      gap: '14px',
    }}>
      {/* Market Direction */}
      {marketDirection && (
        <div>
          <div style={{
            fontSize: '10px',
            letterSpacing: '0.12em',
            color: 'var(--color-terminal-dim)',
            marginBottom: '6px',
            fontWeight: 'bold',
          }}>
            ◈ MARKET DIRECTION
          </div>
          <div style={{
            fontSize: '11px',
            lineHeight: 1.6,
            color: '#bbddbb',
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
          }}>
            {marketDirection}
          </div>
        </div>
      )}

      {/* Emerging Trends */}
      {emergingTrends.length > 0 && (
        <div>
          <div style={{
            fontSize: '10px',
            letterSpacing: '0.12em',
            color: 'var(--color-terminal-dim)',
            marginBottom: '6px',
            fontWeight: 'bold',
          }}>
            ◈ EMERGING TRENDS
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {emergingTrends.map((trend, i) => (
              <TrendPill key={i} trend={trend} />
            ))}
          </div>
        </div>
      )}

      {/* Cross-Pillar Insights */}
      {crossPillarInsights && (
        <div>
          <div style={{
            fontSize: '10px',
            letterSpacing: '0.12em',
            color: 'var(--color-terminal-dim)',
            marginBottom: '6px',
            fontWeight: 'bold',
          }}>
            ◈ CROSS-PILLAR INSIGHTS
          </div>
          <div style={{
            fontSize: '11px',
            lineHeight: 1.6,
            color: '#99bb99',
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
          }}>
            {crossPillarInsights}
          </div>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   LOCALSTORAGE HELPERS — persist and restore resize splits
   ═══════════════════════════════════════════════════════════════════════════ */

interface SplitState {
  colSplit: number
  rowSplit: number
}

function loadSplits(): SplitState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (
      typeof parsed.colSplit === 'number' &&
      typeof parsed.rowSplit === 'number' &&
      parsed.colSplit >= MIN_SPLIT && parsed.colSplit <= MAX_SPLIT &&
      parsed.rowSplit >= MIN_SPLIT && parsed.rowSplit <= MAX_SPLIT
    ) {
      return parsed as SplitState
    }
  } catch {
    // ignore corrupt localStorage
  }
  return null
}

function saveSplits(state: SplitState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore quota errors
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   FORMAT ELAPSED — helper for discovery timer display
   ═══════════════════════════════════════════════════════════════════════════ */

function formatElapsed(secs: number) {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/* ═══════════════════════════════════════════════════════════════════════════
   INTELLIGENCE DASHBOARD — resizable 2×2 grid with 4 panels

   ┌──────────────────────────────────────────────────────┐
   │  GLOBAL INTELLIGENCE  │  GEN 3 · 42 projects  │ ▶   │  ← 40px page header
   ├──────────────────────┬──────────────────────────┤
   │                      │                          │
   │  ◉ 3D EXPANSION MAP  │  ◈ MARKET INTEL          │
   │                      │                          │
   ├──────────────────────┼──────────────────────────┤
   │                      │                          │
   │  ◎ DISCOVERY PANEL   │  ⬡ MODULE NAV            │
   │                      │                          │
   └──────────────────────┴──────────────────────────┘
   ═══════════════════════════════════════════════════════════════════════════ */

function IntelligenceDashboard() {
  const router = useRouter()
  const {
    latestReport,
    loading: discoveryLoading,
    discovering,
    discoverElapsed,
    discover,
    cancelDiscovery,
  } = useGlobalDiscovery()
  const { data: marketGlobal } = useMarketGlobal()

  const handleNavigate = useCallback((path: string) => {
    router.push(path)
  }, [router])

  const emergingTrends = latestReport?.emergingTrends ?? []
  const crossPillarInsights = latestReport?.crossPillarInsights ?? null
  const marketDirection = latestReport?.marketDirection ?? null

  // ── Page header: discovery controls state ──
  const [depth, setDepth] = useState(20)
  const [agentCount, setAgentCount] = useState(5)

  const generation = latestReport?.generation ?? 0
  const totalProjects = latestReport?.totalProjects ?? 0

  // ── Resize state (restored from localStorage) ──
  const containerRef = useRef<HTMLDivElement>(null)

  const [colSplit, setColSplitRaw] = useState(0.6)
  const [rowSplit, setRowSplitRaw] = useState(0.55)
  const [splitsLoaded, setSplitsLoaded] = useState(false)

  // Restore from localStorage on mount
  useEffect(() => {
    const saved = loadSplits()
    if (saved) {
      setColSplitRaw(saved.colSplit)
      setRowSplitRaw(saved.rowSplit)
    }
    setSplitsLoaded(true)
  }, [])

  // Persist to localStorage on change (debounced via requestAnimationFrame)
  const rafRef = useRef<number | null>(null)
  const splitsRef = useRef({ colSplit, rowSplit })
  splitsRef.current = { colSplit, rowSplit }

  const persistSplits = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      saveSplits(splitsRef.current)
      rafRef.current = null
    })
  }, [])

  const setColSplit = useCallback((v: number) => {
    setColSplitRaw(v)
    persistSplits()
  }, [persistSplits])

  const setRowSplit = useCallback((v: number) => {
    setRowSplitRaw(v)
    persistSplits()
  }, [persistSplits])

  // ── Fullscreen state ──
  const [fullscreenPanel, setFullscreenPanel] = useState<PanelId | null>(null)

  const toggleFullscreen = useCallback((panelId: PanelId) => {
    setFullscreenPanel(prev => prev === panelId ? null : panelId)
  }, [])

  // Escape key exits fullscreen
  useEffect(() => {
    if (!fullscreenPanel) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreenPanel(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreenPanel])

  // ── Resize hooks ──
  const colHandle = useResizeHandle('vertical', containerRef, setColSplit)
  const rowHandle = useResizeHandle('horizontal', containerRef, setRowSplit)

  // Any drag active?
  const anyDragging = colHandle.dragging || rowHandle.dragging

  // ── Fullscreen style helper ──
  const fullscreenStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--color-terminal-bg)',
    overflow: 'hidden',
  }

  // Don't render until splits are loaded to avoid layout flash
  if (!splitsLoaded) {
    return (
      <div style={{
        flex: 1,
        background: 'var(--color-terminal-bg)',
      }} />
    )
  }

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minHeight: 0,
        background: 'var(--color-terminal-bg)',
        fontFamily: 'var(--font-mono)',
        position: 'relative',
      }}
    >
      {/* ── PAGE HEADER — 40px, matches NavDrawer header height ── */}
      <div style={{
        height: '40px',
        minHeight: '40px',
        maxHeight: '40px',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        padding: '0 14px',
        background: 'var(--color-terminal-panel)',
        borderBottom: '1px solid var(--color-terminal-border)',
        flexShrink: 0,
        gap: '12px',
        overflow: 'hidden',
      }}>
        {/* Title */}
        <span style={{
          fontSize: '13px',
          fontWeight: 'bold',
          letterSpacing: '0.15em',
          color: '#00ddcc',
          fontFamily: 'var(--font-mono)',
          whiteSpace: 'nowrap',
        }}>
          GLOBAL INTELLIGENCE
        </span>

        {/* Generation info */}
        <span style={{
          fontSize: '10px',
          color: 'var(--color-terminal-dim)',
          fontFamily: 'var(--font-mono)',
          whiteSpace: 'nowrap',
        }}>
          GEN {generation} · {totalProjects} projects
        </span>

        <div style={{ flex: 1 }} />

        {/* Discovery controls */}
        {discovering ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              color: 'var(--color-terminal-amber)',
              fontWeight: 'bold',
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.08em',
              animation: 'intl-blink 1.5s infinite',
              whiteSpace: 'nowrap',
            }}>
              ◉ DISCOVERING {formatElapsed(discoverElapsed)}
            </span>
            <button
              onClick={cancelDiscovery}
              style={{
                background: 'rgba(255,59,59,0.08)',
                border: '1px solid #ff3b3b33',
                color: '#ff3b3b',
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.08em',
                cursor: 'pointer',
                padding: '3px 8px',
                fontWeight: 'bold',
                whiteSpace: 'nowrap',
              }}
            >
              ✕ CANCEL
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>DEPTH</span>
            <input
              type="number"
              value={depth}
              onChange={e => setDepth(Math.max(1, Math.min(100, Number(e.target.value) || 20)))}
              style={{
                width: '44px',
                background: 'var(--color-terminal-surface)',
                border: '1px solid var(--color-terminal-border)',
                color: 'var(--color-terminal-text)',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                padding: '2px 4px',
                textAlign: 'center',
              }}
            />
            <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>AGENTS</span>
            <input
              type="number"
              value={agentCount}
              onChange={e => setAgentCount(Math.max(1, Math.min(20, Number(e.target.value) || 5)))}
              style={{
                width: '44px',
                background: 'var(--color-terminal-surface)',
                border: '1px solid var(--color-terminal-border)',
                color: 'var(--color-terminal-text)',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                padding: '2px 4px',
                textAlign: 'center',
              }}
            />
            <button
              onClick={() => discover(depth, agentCount)}
              style={{
                background: 'rgba(0,221,204,0.08)',
                border: '1px solid #00ddcc33',
                color: '#00ddcc',
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.08em',
                cursor: 'pointer',
                padding: '3px 8px',
                fontWeight: 'bold',
                whiteSpace: 'nowrap',
              }}
            >
              ▶ LAUNCH DISCOVERY
            </button>
          </div>
        )}
      </div>

      {/* ── EMPTY STATE — no reports yet ── */}
      {!latestReport && !discovering ? (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          minHeight: 0,
        }}>
          <span style={{ fontSize: '40px', opacity: 0.3 }}>◎</span>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: '12px',
              letterSpacing: '0.1em',
              color: 'var(--color-terminal-dim)',
              textTransform: 'uppercase',
              marginBottom: '6px',
            }}>
              NO INTELLIGENCE REPORTS
            </div>
            <div style={{
              fontSize: '10px',
              color: 'var(--color-terminal-muted)',
              maxWidth: '340px',
              lineHeight: 1.6,
            }}>
              Launch a global discovery to generate market intelligence.
              Configure depth and agent count above, then hit LAUNCH DISCOVERY.
            </div>
          </div>
          <button
            onClick={() => discover(depth, agentCount)}
            style={{
              background: 'transparent',
              border: '1px solid var(--color-terminal-up)',
              color: 'var(--color-terminal-up)',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              letterSpacing: '0.1em',
              padding: '8px 20px',
              cursor: 'pointer',
              transition: 'all 0.15s',
              textTransform: 'uppercase',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(0,255,136,0.08)'
              e.currentTarget.style.borderColor = '#00ff88'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.borderColor = 'var(--color-terminal-up)'
            }}
          >
            ▸ LAUNCH DISCOVERY
          </button>
        </div>
      ) : (
        <>
          {/* ── TOP ROW ── */}
          <div style={{
            display: fullscreenPanel ? 'none' : 'flex',
            height: `calc(${rowSplit * 100}% - ${HANDLE_SIZE / 2}px)`,
            minHeight: 0,
            overflow: 'hidden',
          }}>
            {/* TOP-LEFT: 3D Expansion Map */}
            <div style={{
              ...(fullscreenPanel === 'yggdrasil' ? fullscreenStyle : {
                width: `calc(${colSplit * 100}% - ${HANDLE_SIZE / 2}px)`,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column' as const,
                overflow: 'hidden',
                border: '1px solid var(--color-terminal-border)',
                borderTop: 'none',
              }),
            }}>
              <PanelHeader
                icon="◉"
                title="YGGDRASIL"
                isFullscreen={fullscreenPanel === 'yggdrasil'}
                onToggleFullscreen={() => toggleFullscreen('yggdrasil')}
              />
              <div style={{
                flex: 1,
                minHeight: 0,
                position: 'relative',
                overflow: 'hidden',
              }}>
                {fullscreenPanel !== 'yggdrasil' && (
              <YggdrasilTree report={latestReport} marketGlobal={marketGlobal} />
                )}
              </div>
            </div>

            {/* Vertical resize handle */}
            <ResizeHandle
              direction="vertical"
              onMouseDown={colHandle.onMouseDown}
              hovered={colHandle.handleHovered}
              onHoverChange={colHandle.setHandleHovered}
              dragging={colHandle.dragging}
            />

            {/* TOP-RIGHT: Market Intel */}
            <div style={{
              ...(fullscreenPanel === 'market-intel' ? fullscreenStyle : {
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column' as const,
                overflow: 'hidden',
                border: '1px solid var(--color-terminal-border)',
                borderLeft: 'none',
                borderTop: 'none',
              }),
            }}>
              <PanelHeader
                icon="◈"
                title="MARKET INTEL"
                isFullscreen={fullscreenPanel === 'market-intel'}
                onToggleFullscreen={() => toggleFullscreen('market-intel')}
              />
              <div style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                overflowX: 'hidden',
              }}>
                <MarketIntelContent
                  marketDirection={marketDirection}
                  emergingTrends={emergingTrends}
                  crossPillarInsights={crossPillarInsights}
                />
              </div>
            </div>
          </div>

          {/* Horizontal resize handle */}
          {!fullscreenPanel && (
            <ResizeHandle
              direction="horizontal"
              onMouseDown={rowHandle.onMouseDown}
              hovered={rowHandle.handleHovered}
              onHoverChange={rowHandle.setHandleHovered}
              dragging={rowHandle.dragging}
            />
          )}

          {/* ── BOTTOM ROW ── */}
          <div style={{
            display: fullscreenPanel ? 'none' : 'flex',
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
          }}>
            {/* BOTTOM-LEFT: Discovery Panel */}
            <div style={{
              ...(fullscreenPanel === 'discovery' ? fullscreenStyle : {
                width: `calc(${colSplit * 100}% - ${HANDLE_SIZE / 2}px)`,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column' as const,
                overflow: 'hidden',
                border: '1px solid var(--color-terminal-border)',
                borderTop: 'none',
              }),
            }}>
              <PanelHeader
                icon="◎"
                title="DISCOVERY"
                isFullscreen={fullscreenPanel === 'discovery'}
                onToggleFullscreen={() => toggleFullscreen('discovery')}
              />
              <div style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                overflowX: 'hidden',
              }}>
                <GlobalDiscoveryPanel hideHeader />
              </div>
            </div>

            {/* Vertical resize handle (reuses same colSplit) */}
            <ResizeHandle
              direction="vertical"
              onMouseDown={colHandle.onMouseDown}
              hovered={colHandle.handleHovered}
              onHoverChange={colHandle.setHandleHovered}
              dragging={colHandle.dragging}
            />

            {/* BOTTOM-RIGHT: Module Nav */}
            <div style={{
              ...(fullscreenPanel === 'modules' ? fullscreenStyle : {
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column' as const,
                overflow: 'hidden',
                border: '1px solid var(--color-terminal-border)',
                borderTop: 'none',
                borderLeft: 'none',
              }),
            }}>
              <PanelHeader
                icon="⬡"
                title="MODULES"
                isFullscreen={fullscreenPanel === 'modules'}
                onToggleFullscreen={() => toggleFullscreen('modules')}
              />
              <div style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                overflowX: 'hidden',
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}>
                {DASHBOARD_CARDS.map((card) => (
                  <DashboardCardButton
                    key={card.id}
                    card={card}
                    onClick={() => handleNavigate(card.path)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Drag overlay — prevents iframe/canvas from eating mouse events during resize */}
          {anyDragging && (
            <div style={{
              position: 'absolute',
              inset: 0,
              zIndex: 100,
              cursor: colHandle.dragging ? 'col-resize' : 'row-resize',
            }} />
          )}

          {/* ── FULLSCREEN PANELS — rendered outside the grid when active ── */}
          {fullscreenPanel === 'yggdrasil' && (
            <div style={fullscreenStyle}>
              <PanelHeader
                icon="◉"
                title="YGGDRASIL"
                isFullscreen
                onToggleFullscreen={() => toggleFullscreen('yggdrasil')}
              />
              <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
                  <YggdrasilTree report={latestReport} marketGlobal={marketGlobal} />
              </div>
            </div>
          )}

          {fullscreenPanel === 'market-intel' && (
            <div style={fullscreenStyle}>
              <PanelHeader
                icon="◈"
                title="MARKET INTEL"
                isFullscreen
                onToggleFullscreen={() => toggleFullscreen('market-intel')}
              />
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
                <MarketIntelContent
                  marketDirection={marketDirection}
                  emergingTrends={emergingTrends}
                  crossPillarInsights={crossPillarInsights}
                />
              </div>
            </div>
          )}

          {fullscreenPanel === 'discovery' && (
            <div style={fullscreenStyle}>
              <PanelHeader
                icon="◎"
                title="DISCOVERY"
                isFullscreen
                onToggleFullscreen={() => toggleFullscreen('discovery')}
              />
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
                <GlobalDiscoveryPanel hideHeader />
              </div>
            </div>
          )}

          {fullscreenPanel === 'modules' && (
            <div style={fullscreenStyle}>
              <PanelHeader
                icon="⬡"
                title="MODULES"
                isFullscreen
                onToggleFullscreen={() => toggleFullscreen('modules')}
              />
              <div style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                overflowX: 'hidden',
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}>
                {DASHBOARD_CARDS.map((card) => (
                  <DashboardCardButton
                    key={card.id}
                    card={card}
                    onClick={() => handleNavigate(card.path)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Blink animation for discovery status */}
      <style>{`
        @keyframes intl-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE EXPORT
   ═══════════════════════════════════════════════════════════════════════════ */

export default function IntelligencePage() {
  return (
    <Suspense>
      <IntelligenceDashboard />
    </Suspense>
  )
}
