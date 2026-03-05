'use client'

import { useState, useCallback, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

const NAV_COLLAPSED_KEY = 'oculus:navCollapsed'

interface NavItem {
  id: string
  label: string
  icon: string
  path: string
  description: string
}

const NAV_ITEMS: NavItem[] = [
  { id: 'terminal', label: 'TERMINAL', icon: '⊞', path: '/', description: 'Trading Terminal' },
  { id: 'feeds', label: 'DATA FEEDS', icon: '◉', path: '/feeds', description: 'Market Data Feeds' },
  { id: 'intelligence', label: 'INTELLIGENCE', icon: '◈', path: '/intelligence', description: 'Global Intelligence' },
  { id: 'signals', label: 'SIGNALS', icon: '⚡', path: '/signals', description: 'Signal History' },
  { id: 'discovery', label: 'DISCOVERY', icon: '◎', path: '/discovery', description: 'Discovery Lab' },
  { id: 'ai-config', label: 'AI CONFIG', icon: '⚙', path: '/ai-config', description: 'AI Model Configuration' },
]

const COLLAPSED_WIDTH = 48
const EXPANDED_WIDTH = 160

export function NavDrawer() {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(true)
  const [hovered, setHovered] = useState(false)

  // Hydrate collapsed state from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(NAV_COLLAPSED_KEY)
      if (saved !== null) setCollapsed(saved === 'true')
    } catch { /* ignore */ }
  }, [])

  const toggleCollapsed = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem(NAV_COLLAPSED_KEY, String(next)) } catch { /* ignore */ }
      return next
    })
  }, [])

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/'
    return pathname.startsWith(path)
  }

  const showExpanded = !collapsed || hovered
  const width = showExpanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH

  return (
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
      <div
        style={{
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
        <img src="/logo.png" alt="Oculus" style={{ width: '22px', height: '22px', flexShrink: 0 }} />
        {showExpanded && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexShrink: 0 }}>
            <span style={{ color: '#4ade80', fontWeight: 700, fontSize: '13px', letterSpacing: '0.12em' }}>OCULUS</span>
            <span style={{ color: 'var(--color-terminal-dim)', fontSize: '9px', letterSpacing: '0.08em' }}>TERMINAL</span>
          </div>
        )}
      </div>

      {/* Nav Items */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '4px 0', gap: '1px' }}>
        {NAV_ITEMS.map((item) => {
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
