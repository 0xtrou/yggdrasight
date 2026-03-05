'use client'

import { useState } from 'react'
import { SignalFeedPanel } from './panels/SignalFeedPanel'
import { ChartPanel } from './panels/ChartPanel'
import { StatsPanel } from './panels/StatsPanel'
import { FundamentalsPanel } from './panels/FundamentalsPanel'

export function PanelGrid() {
  const [selectedSymbol, setSelectedSymbol] = useState<string>('BTC')

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 2fr 1fr',
        gridTemplateRows: 'auto 200px',
        height: 'calc(100vh - 40px - 32px)',
        overflow: 'hidden',
        flex: 1,
      }}
    >
      <SignalFeedPanel onSelectSymbol={setSelectedSymbol} selectedSymbol={selectedSymbol} />
      <ChartPanel symbol={selectedSymbol} />
      <StatsPanel />
      <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--color-terminal-border)', overflow: 'hidden' }}>
        <FundamentalsPanel />
      </div>
    </div>
  )
}
