'use client'

import { useState } from 'react'
import { NavDrawer } from '@/components/terminal/NavDrawer'
import { StatusBar } from '@/components/terminal/StatusBar'
import { SplashScreen } from '@/components/terminal/SplashScreen'
export default function TerminalLayout({ children }: { children: React.ReactNode }) {
  const [showSplash, setShowSplash] = useState(true)

  const handleSplashComplete = () => {
    setShowSplash(false)
  }

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
