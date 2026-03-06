'use client'

import { useEffect, useState } from 'react'
import { NavDrawer } from '@/components/terminal/NavDrawer'
import { StatusBar } from '@/components/terminal/StatusBar'
import { SplashScreen } from '@/components/terminal/SplashScreen'
import { AuthScreen } from '@/components/terminal/AuthScreen'

interface SessionResponse {
  authenticated: boolean
  sessionId?: string
}

export default function TerminalLayout({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [showSplash, setShowSplash] = useState(true)

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
    </>
  )
}
