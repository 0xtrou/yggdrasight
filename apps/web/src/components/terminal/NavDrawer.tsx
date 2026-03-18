'use client'

import { useState, useCallback, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

const NAV_COLLAPSED_KEY = 'yggdrasight:navCollapsed'

interface NavItem {
  id: string
  label: string
  icon: string
  path: string
  description: string
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'MARKET',
    items: [
      { id: 'terminal', label: 'TERMINAL', icon: '⊞', path: '/', description: 'Trading Terminal' },
      { id: 'assets', label: 'ASSETS', icon: '⬡', path: '/assets', description: 'Asset Management' },
      { id: 'feeds', label: 'DATA FEEDS', icon: '◉', path: '/feeds', description: 'Market Data Feeds' },
    ],
  },
  {
    label: 'INTELLIGENCE',
    items: [
      { id: 'intelligence', label: 'INTELLIGENCE', icon: '◈', path: '/intelligence', description: 'Global Intelligence' },
      { id: 'classification', label: 'CLASSIFICATION', icon: '⬢', path: '/classification', description: 'Asset Classification' },
      { id: 'discovery', label: 'DISCOVERY', icon: '◎', path: '/discovery', description: 'Discovery Lab' },
    ],
  },
  {
    label: 'TRADING',
    items: [
      { id: 'signals', label: 'SIGNALS', icon: '⚡', path: '/signals', description: 'Signal History' },
    ],
  },
  {
    label: 'SYSTEM',
    items: [
      { id: 'ai-config', label: 'AI CONFIG', icon: '⚙', path: '/ai-config', description: 'AI Model Configuration' },
    ],
  },
]

const COLLAPSED_WIDTH = 48
const EXPANDED_WIDTH = 160

export function NavDrawer() {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(true)
  const [hovered, setHovered] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [logoutHovered, setLogoutHovered] = useState(false)

  // Hydrate collapsed state from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(NAV_COLLAPSED_KEY)
      if (saved !== null) setCollapsed(saved === 'true')
    } catch { /* ignore */ }
  }, [])

  // Fetch session status
  useEffect(() => {
    fetch('/api/auth/session')
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data?.sessionId) setSessionId(data.sessionId) })
      .catch(() => { /* ignore */ })
  }, [])

  const toggleCollapsed = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem(NAV_COLLAPSED_KEY, String(next)) } catch { /* ignore */ }
      return next
    })
  }, [])

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch { /* ignore */ }
    window.location.href = '/'
  }, [])

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/'
    return pathname.startsWith(path)
  }

  const showExpanded = !collapsed || hovered
  const width = showExpanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH

  return (
    <>
      <style>{`
        @keyframes yggdrasightBorderBlink {
          0%, 100% { border-color: var(--color-terminal-amber); box-shadow: 0 0 6px rgba(255,170,0,0.4); }
          50% { border-color: rgba(255,170,0,0.15); box-shadow: none; }
        }
      `}</style>
      <nav
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: `${width}px`,
        minWidth: `${width}px`,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-terminal-panel)',
        borderRight: '1px solid var(--color-terminal-border)',
        fontFamily: 'var(--font-mono)',
        transition: 'width 0.15s ease, min-width 0.15s ease',
        overflow: 'hidden',
        flexShrink: 0,
        zIndex: 100,
      }}
    >
      {/* Logo / Brand */}
        <div style={{
          height: '40px',
          minHeight: '40px',
          maxHeight: '40px',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          borderBottom: '1px solid var(--color-terminal-border)',
          gap: '8px',
          flexShrink: 0,
          cursor: 'pointer',
          overflow: 'hidden',
        }}
        onClick={toggleCollapsed}
        title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
      >
        <div style={{
          width: '32px',
          height: '32px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid var(--color-terminal-amber)',
          animation: 'yggdrasightBorderBlink 2s ease-in-out infinite',
        }}>
          <img src="/logo.png" alt="Yggdrasight" style={{ width: '24px', height: '24px' }} />
        </div>
        {showExpanded && (
          <div style={{ display: 'flex', alignItems: 'baseline', flexShrink: 0 }}>
            <span style={{ color: 'var(--color-terminal-amber)', fontWeight: 700, fontSize: '10px', letterSpacing: '0.12em', textShadow: '0 0 8px rgba(255,170,0,0.4)', whiteSpace: 'nowrap' }}>YGGDRASIGHT</span>
          </div>
        )}
      </div>

      {/* Nav Groups */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '4px 0', overflowY: 'auto', overflowX: 'hidden' }}>
        {NAV_GROUPS.map((group, groupIndex) => (
          <div key={group.label}>
            {/* Section delimiter */}
            <div
              style={{
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                padding: showExpanded ? '0 12px' : '0',
                justifyContent: showExpanded ? 'flex-start' : 'center',
                marginTop: groupIndex === 0 ? '2px' : '6px',
              }}
            >
              {showExpanded ? (
                <span style={{
                  fontSize: '8px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-terminal-dim)',
                  letterSpacing: '0.18em',
                  fontWeight: 700,
                  opacity: 0.5,
                  userSelect: 'none',
                }}>
                  {group.label}
                </span>
              ) : (
                <div style={{
                  width: '18px',
                  height: '1px',
                  background: 'var(--color-terminal-border)',
                  opacity: 0.5,
                }} />
              )}
            </div>
            {/* Items */}
            {group.items.map((item) => {
              const active = isActive(item.path)
              return (
                <NavButton
                  key={item.id}
                  item={item}
                  active={active}
                  showLabel={showExpanded}
                  onClick={() => router.push(item.path)}
                />
              )
            })}
          </div>
        ))}
      </div>

      {/* Session / Logout */}
      <div style={{
        borderTop: '1px solid var(--color-terminal-border)',
        flexShrink: 0,
        padding: showExpanded ? '8px 12px' : '8px 0',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        alignItems: showExpanded ? 'stretch' : 'center',
      }}>
        {sessionId && showExpanded && (
          <div style={{
            fontSize: '8px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-terminal-dim)',
            letterSpacing: '0.05em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            <span style={{ color: 'var(--color-terminal-muted)', marginRight: '4px' }}>SESSION</span>
            <span style={{ color: 'var(--color-terminal-green, #4ade80)' }}>{sessionId}</span>
          </div>
        )}
        {sessionId && (
          <button
            onClick={handleLogout}
            onMouseEnter={() => setLogoutHovered(true)}
            onMouseLeave={() => setLogoutHovered(false)}
            title="Logout"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: showExpanded ? 'flex-start' : 'center',
              gap: '8px',
              padding: showExpanded ? '0 0' : '0',
              height: '28px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              width: '100%',
              textAlign: 'left',
            }}
          >
            <span style={{
              fontSize: '14px',
              color: logoutHovered ? 'var(--color-terminal-red, #f87171)' : 'var(--color-terminal-dim)',
              width: '22px',
              textAlign: 'center',
              flexShrink: 0,
              transition: 'color 0.1s ease',
            }}>⏻</span>
            {showExpanded && (
              <span style={{
                fontSize: '10px',
                color: logoutHovered ? 'var(--color-terminal-red, #f87171)' : 'var(--color-terminal-muted)',
                letterSpacing: '0.08em',
                transition: 'color 0.1s ease',
              }}>LOGOUT</span>
            )}
          </button>
        )}
      </div>

      {/* Bottom: Collapse toggle hint */}
      <div
        style={{
          height: '32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderTop: '1px solid var(--color-terminal-border)',
          flexShrink: 0,
          cursor: 'pointer',
          color: 'var(--color-terminal-dim)',
          fontSize: '10px',
        }}
        onClick={toggleCollapsed}
      >
        {showExpanded ? '◂ COLLAPSE' : '▸'}
      </div>
    </nav>
  </>
  )
}

function NavButton({ item, active, showLabel, onClick }: {
  item: NavItem
  active: boolean
  showLabel: boolean
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={!showLabel ? item.description : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '0 12px',
        height: '36px',
        background: active
          ? 'rgba(255, 170, 0, 0.08)'
          : hovered
            ? 'rgba(255, 255, 255, 0.03)'
            : 'transparent',
        border: 'none',
        borderLeft: active ? '2px solid var(--color-terminal-amber)' : '2px solid transparent',
        cursor: 'pointer',
        fontFamily: 'var(--font-mono)',
        width: '100%',
        textAlign: 'left',
        transition: 'background 0.1s ease',
      }}
    >
      <span style={{
        fontSize: '14px',
        color: active ? 'var(--color-terminal-amber)' : hovered ? 'var(--color-terminal-text)' : 'var(--color-terminal-dim)',
        width: '22px',
        textAlign: 'center',
        flexShrink: 0,
        transition: 'color 0.1s ease',
      }}>
        {item.icon}
      </span>
      {showLabel && (
        <span style={{
          fontSize: '10px',
          fontWeight: active ? 'bold' : 'normal',
          color: active ? 'var(--color-terminal-amber)' : hovered ? 'var(--color-terminal-text)' : 'var(--color-terminal-muted)',
          letterSpacing: '0.08em',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          transition: 'color 0.1s ease',
        }}>
          {item.label}
        </span>
      )}
    </button>
  )
}
