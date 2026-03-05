'use client'

import { Suspense, useState } from 'react'
import { MarketDataPanel } from '@/components/terminal/panels/MarketDataPanel'

function FeedsContent() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', background: 'var(--color-terminal-bg)' }}>
      {/* Header bar */}
      <div
        style={{
          height: '40px',
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          background: 'var(--color-terminal-surface)',
          borderBottom: '1px solid var(--color-terminal-border)',
          flexShrink: 0,
          fontFamily: 'var(--font-mono)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ color: 'var(--color-terminal-amber)', fontWeight: 700, fontSize: '13px', letterSpacing: '0.12em' }}>
            DATA FEEDS
          </span>
          <span style={{ color: 'var(--color-terminal-dim)', fontSize: '10px', letterSpacing: '0.06em' }}>
            NEWS · SOCIAL · ON-CHAIN · AGGREGATED
          </span>
        </div>
      </div>

      {/* Market Data Panel — takes remaining space */}
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <MarketDataPanel />
      </div>
    </div>
  )
}

export default function FeedsPage() {
  return (
    <Suspense>
      <FeedsContent />
    </Suspense>
  )
}
