'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { SignalPanel } from './panels/SignalPanel'
import { ChartPanel } from './panels/ChartPanel'
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

  // Per-agent model selection — shared with AI Config page via localStorage
  // Keys: agent IDs ('wyckoff', 'elliott-wave', ...) + 'discovery'
  // Values: model IDs ('opencode/big-pickle', 'github-copilot/claude-sonnet-4', ...)
  const [agentModelMap, setAgentModelMapState] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      const raw = localStorage.getItem('oculus:agentModelMap')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') return parsed as Record<string, string>
      }
    } catch { /* ignore */ }
    return {}
  })
  const setAgentModelMap = useCallback((next: Record<string, string>) => {
    setAgentModelMapState(next)
    try { localStorage.setItem('oculus:agentModelMap', JSON.stringify(next)) } catch { /* ignore */ }
  }, [])
  const handleAnalysisComplete = useCallback(() => {
    setAnalysisVersion((v) => v + 1)
  }, [])

  const verdict = result
    ? { direction: result.direction, confidence: result.confidence }
    : null
  const DEFAULTS = { rightColumnWidth: 550, chartRatio: 0.65 }
  const [rightColumnWidth, setRightColumnWidth] = useState(DEFAULTS.rightColumnWidth)
  const [chartRatio, setChartRatio] = useState(DEFAULTS.chartRatio)
  const rightColumnRef = useRef<HTMLDivElement>(null)
  const hydratedRef = useRef(false)

  // Restore panel sizes from localStorage on mount (client-side only)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('oculus-panel-sizes')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.rightColumnWidth != null) setRightColumnWidth(parsed.rightColumnWidth)
        if (parsed.chartRatio != null) setChartRatio(parsed.chartRatio)
      }
    } catch {
      // ignore corrupt localStorage
    }
    // Mark hydrated after a tick so the save effect skips the initial restore
    requestAnimationFrame(() => {
      hydratedRef.current = true
    })
  }, [])

  const handleColumnResize = useCallback((delta: number) => {
    // Dragging the handle RIGHT makes the right column SMALLER (analysis grows)
    setRightColumnWidth((w: number) => Math.min(900, Math.max(350, w - delta)))
  }, [])

  const handleChartSignalResize = useCallback((delta: number) => {
    if (!rightColumnRef.current) return
    const totalHeight = rightColumnRef.current.clientHeight
    if (totalHeight <= 0) return
    setChartRatio((r: number) => {
      const newRatio = r + delta / totalHeight
      return Math.min(0.85, Math.max(0.3, newRatio))
    })
  }, [])

  // Persist panel sizes to localStorage on change (only after hydration)
  useEffect(() => {
    if (!hydratedRef.current) return
    localStorage.setItem(
      'oculus-panel-sizes',
      JSON.stringify({ rightColumnWidth, chartRatio }),
    )
  }, [rightColumnWidth, chartRatio])

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
      {/* Main row: Analysis (left) + Chart/Signal (right) */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {/* Left: Analysis (main panel, fills remaining space) */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column' as const,
          }}
        >
          <AnalysisStrip symbol={pair} refreshKey={analysisVersion} agentModelMap={agentModelMap} onAnalysisComplete={handleAnalysisComplete} onAgentModelMapChange={setAgentModelMap} />
        </div>

        <ResizeHandle direction="horizontal" onDrag={handleColumnResize} />

        {/* Right column: Chart (top) + Signal (bottom) */}
        <div
          ref={rightColumnRef}
          style={{
            width: rightColumnWidth + 'px',
            flexShrink: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column' as const,
          }}
        >
          {/* Top-right: Chart (larger portion) */}
          <div
            style={{
              flex: `${chartRatio} 0 0`,
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            <ChartPanel verdict={verdict} symbol={symbol} />
          </div>

          <ResizeHandle direction="vertical" onDrag={handleChartSignalResize} />

          {/* Bottom-right: Signal Panel */}
          <div
            style={{
              flex: `${1 - chartRatio} 0 0`,
              minHeight: 0,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column' as const,
            }}
          >
            <SignalPanel symbol={pair} />
          </div>
        </div>
      </div>
    </div>
  )
}
