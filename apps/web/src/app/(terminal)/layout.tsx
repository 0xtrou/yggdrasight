'use client'

import { useEffect, useState } from 'react'
import { NavDrawer } from '@/components/terminal/NavDrawer'
import { StatusBar } from '@/components/terminal/StatusBar'
import { SplashScreen } from '@/components/terminal/SplashScreen'
import { AuthScreen } from '@/components/terminal/AuthScreen'
import { ChatDrawer } from '@/components/terminal/ChatDrawer'

interface SessionResponse {
  authenticated: boolean
  sessionId?: string
}

export default function TerminalLayout({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [showSplash, setShowSplash] = useState(true)
  const [chatOpen, setChatOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/session', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        })

        if (!response.ok) {
          setIsAuthenticated(false)
          return
        }

        const data: SessionResponse = await response.json()
        setIsAuthenticated(data.authenticated === true)
      } catch {
        setIsAuthenticated(false)
      }
    }

    checkAuth()
  }, [])

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 900)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const handleSplashComplete = () => {
    setShowSplash(false)
  }

  const handleAuthenticated = () => {
    setIsAuthenticated(true)
  }

  // Show loading state while checking authentication
  if (isAuthenticated === null) {
    return (
      <div
        style={{
          height: '100vh',
          width: '100vw',
          background: 'var(--color-terminal-bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ color: 'var(--color-terminal-fg)', fontFamily: 'var(--font-mono)' }}>
          Loading...
        </div>
      </div>
    )
  }

  // Show auth screen if not authenticated
  if (!isAuthenticated) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />
  }

  // Block mobile devices
  if (isMobile) {
    return (
      <div
        style={{
          height: '100vh',
          width: '100vw',
          background: '#0a0a0a',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px',
          fontFamily: "ui-monospace, 'SF Mono', 'JetBrains Mono', monospace",
          textAlign: 'center',
          gap: '24px',
        }}
      >
        <img
          src="/icon-512x512.png"
          alt="Yggdrasight"
          style={{ width: 64, height: 64, opacity: 0.8, filter: 'drop-shadow(0 0 12px rgba(0,255,136,0.3))' }}
        />
        <div style={{ color: '#e8e8e8', fontSize: '16px', fontWeight: 600, letterSpacing: '0.1em' }}>
          DESKTOP ONLY
        </div>
        <div style={{ color: '#888888', fontSize: '12px', lineHeight: 1.7, maxWidth: '320px', letterSpacing: '0.02em' }}>
          Yggdrasight Terminal is built for desktop and tablet devices.
          The information density requires a screen width of at least 900px.
        </div>
        <div style={{ color: '#555555', fontSize: '11px', letterSpacing: '0.04em' }}>
          Please switch to a desktop or tablet to access the terminal.
        </div>
        <a
          href="https://yggdrasight.com"
          style={{
            marginTop: '8px',
            color: '#00ff88',
            fontSize: '11px',
            letterSpacing: '0.08em',
            textDecoration: 'none',
            border: '1px solid rgba(0,255,136,0.3)',
            padding: '8px 20px',
          }}
        >
          VISIT LANDING PAGE
        </a>
      </div>
    )
  }

  // Show terminal UI if authenticated
  return (
    <>
      {showSplash && <SplashScreen onComplete={handleSplashComplete} />}
      <div
        style={{
          height: '100vh',
          width: '100vw',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-terminal-bg)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
          <NavDrawer />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
            {children}
          </div>
        </div>
        <StatusBar />
      </div>
      {/* Ask AI floating button — hidden when drawer is open (drawer has its own close) */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          style={{
            position: 'fixed',
            bottom: '16px',
            right: '16px',
            zIndex: 1000,
            background: 'var(--color-terminal-border)',
            color: 'var(--color-terminal-text)',
            border: '1px solid var(--color-terminal-border)',
            padding: '8px 16px',
            fontFamily: "'SF Mono', 'JetBrains Mono', monospace",
            fontSize: '11px',
            cursor: 'pointer',
            letterSpacing: '0.05em',
          }}
        >
          ◈ ASK AI
        </button>
      )}
      <ChatDrawer open={chatOpen} onClose={() => setChatOpen(false)} />
    </>
  )
}
