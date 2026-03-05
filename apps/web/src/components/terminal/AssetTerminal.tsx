'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { SignalPanel } from './panels/SignalPanel'
import { ChartPanel } from './panels/ChartPanel'
import { MarketDataPanel } from './panels/MarketDataPanel'
import { AnalysisStrip } from './AnalysisStrip'
import { useIntelligence } from '@/hooks/useIntelligence'

interface AssetTerminalProps {
  symbol: string // base symbol e.g. 'BTC', 'TAO'
}

function ResizeHandle({
  direction,
  onDrag,
}: {
  direction: 'horizontal' | 'vertical'
  onDrag: (delta: number) => void
}) {
  const [dragging, setDragging] = useState(false)
  const [hovered, setHovered] = useState(false)
  const onDragRef = useRef(onDrag)
  onDragRef.current = onDrag

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setDragging(true)
      document.body.style.userSelect = 'none'

      const handleMouseMove = (ev: MouseEvent) => {
        const delta = direction === 'horizontal' ? ev.movementX : ev.movementY
        onDragRef.current(delta)
      }

      const handleMouseUp = () => {
        setDragging(false)
        document.body.style.userSelect = ''
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [direction],
  )

  const isHorizontal = direction === 'horizontal'
  const active = dragging || hovered

  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: isHorizontal ? '4px' : '100%',
        height: isHorizontal ? '100%' : '4px',
        flexShrink: 0,
        cursor: isHorizontal ? 'col-resize' : 'row-resize',
        background: active
          ? 'var(--color-terminal-amber)'
          : 'var(--color-terminal-border)',
        transition: 'background 0.15s ease',
      }}
    />
  )
}

export function AssetTerminal({ symbol }: AssetTerminalProps) {
  const pair = `${symbol}USDT`
  // Shared analysis version counter — incremented after each analyze() call
  // so that all components re-fetch the latest data from the database.
  const [analysisVersion, setAnalysisVersion] = useState(0)
  const { result } = useIntelligence(pair, { refreshKey: analysisVersion })

  // Per-agent model selection — each agent (+ discovery) gets its own model
  // Keys: agent IDs ('wyckoff', 'elliott-wave', ...) + 'discovery' for discover agent
  // Values: model IDs ('opencode/big-pickle', 'github-copilot/claude-sonnet-4', ...)
  const [agentModelMap, setAgentModelMap] = useState<Record<string, string>>({})
  const handleAnalysisComplete = useCallback(() => {
    setAnalysisVersion((v) => v + 1)
  }, [])

  const verdict = result
    ? { direction: result.direction, confidence: result.confidence }
    : null
  const DEFAULTS = { signalWidth: 240, chartWidth: 450, feedHeight: 180 }
  const [signalWidth, setSignalWidth] = useState(DEFAULTS.signalWidth)
  const [chartWidth, setChartWidth] = useState(DEFAULTS.chartWidth)
  const [feedHeight, setFeedHeight] = useState(DEFAULTS.feedHeight)
  const hydratedRef = useRef(false)

  // Restore panel sizes from localStorage on mount (client-side only)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('oculus-panel-sizes')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.signalWidth != null) setSignalWidth(parsed.signalWidth)
        if (parsed.chartWidth != null) setChartWidth(parsed.chartWidth)
        if (parsed.feedHeight != null) setFeedHeight(parsed.feedHeight)
      }
    } catch {
      // ignore corrupt localStorage
    }
    // Mark hydrated after a tick so the save effect skips the initial restore
    requestAnimationFrame(() => {
      hydratedRef.current = true
    })
  }, [])

  const handleSignalResize = useCallback((delta: number) => {
    setSignalWidth((w: number) => Math.min(400, Math.max(160, w + delta)))
  }, [])

  const handleChartResize = useCallback((delta: number) => {
    setChartWidth((w: number) => Math.min(800, Math.max(280, w + delta)))
  }, [])

  const handleFeedResize = useCallback((delta: number) => {
    setFeedHeight((h: number) => Math.min(400, Math.max(80, h - delta)))
  }, [])

  // Persist panel sizes to localStorage on change (only after hydration)
  useEffect(() => {
    if (!hydratedRef.current) return
    localStorage.setItem(
      'oculus-panel-sizes',
      JSON.stringify({ signalWidth, chartWidth, feedHeight }),
    )
  }, [signalWidth, chartWidth, feedHeight])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        overflow: 'hidden',
        background: 'var(--color-terminal-bg)',
      }}
    >
      {/* Top row: Signals + Chart + Intelligence */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {/* Left: Signal Panel */}
        <div
          style={{
            width: signalWidth + 'px',
            flexShrink: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column' as const,
          }}
        >
          <SignalPanel symbol={pair} onAnalysisComplete={handleAnalysisComplete} agentModelMap={agentModelMap} onAgentModelMapChange={setAgentModelMap} />
        </div>

        <ResizeHandle direction="horizontal" onDrag={handleSignalResize} />

        {/* Center: Chart */}
        <div
          style={{
            width: chartWidth + 'px',
            flexShrink: 0,
            overflow: 'hidden',
          }}
        >
          <ChartPanel verdict={verdict} symbol={symbol} />
        </div>

        <ResizeHandle direction="horizontal" onDrag={handleChartResize} />

        {/* Right: Intelligence / Analysis (fills remaining space) */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column' as const,
          }}>
          <AnalysisStrip symbol={pair} refreshKey={analysisVersion} agentModelMap={agentModelMap} />
        </div>
      </div>

      <ResizeHandle direction="vertical" onDrag={handleFeedResize} />

      {/* Bottom: Market Data Feed (compact strip) */}
      <div
        style={{
          height: feedHeight + 'px',
          flexShrink: 0,
          overflow: 'hidden',
        }}
      >
        <MarketDataPanel symbol={symbol} />
      </div>
    </div>
  )
}
