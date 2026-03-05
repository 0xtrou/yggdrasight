'use client'

import { useEffect, useRef } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChartSettings {
  candleUpColor: string
  candleDownColor: string
  gridVisible: boolean
  crosshairVisible: boolean
}

export const DEFAULT_CHART_SETTINGS: ChartSettings = {
  candleUpColor: '#00ff88',
  candleDownColor: '#ff3b3b',
  gridVisible: true,
  crosshairVisible: true,
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ChartSettingsModalProps {
  open: boolean
  onClose: () => void
  settings: ChartSettings
  onSettingsChange: (settings: ChartSettings) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ChartSettingsModal({ open, onClose, settings, onSettingsChange }: ChartSettingsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    window.addEventListener('mousedown', onMouseDown)
    return () => window.removeEventListener('mousedown', onMouseDown)
  }, [open, onClose])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const handleReset = () => onSettingsChange(DEFAULT_CHART_SETTINGS)

  // ── Styles ──
  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 2000,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0,0,0,0.6)',
  }
  const modal: React.CSSProperties = {
    background: '#1a1a1a', border: '1px solid #333', borderRadius: 8,
    padding: 0, width: 320, fontFamily: 'JetBrains Mono, monospace',
    boxShadow: '0 16px 48px rgba(0,0,0,0.8)',
  }
  const header: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 16px', borderBottom: '1px solid #2a2a2a',
  }
  const titleStyle: React.CSSProperties = {
    color: '#e5e5e5', fontSize: 12, fontWeight: 700,
    letterSpacing: '0.06em', textTransform: 'uppercase',
  }
  const closeBtn: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer',
    color: '#666', fontSize: 16, lineHeight: 1, padding: '0 2px',
  }
  const body: React.CSSProperties = { padding: '12px 16px' }
  const sectionLabel: React.CSSProperties = {
    color: '#555', fontSize: 10, letterSpacing: '0.08em',
    textTransform: 'uppercase', marginBottom: 8, marginTop: 4,
  }
  const row: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 10,
  }
  const labelStyle: React.CSSProperties = { color: '#aaa', fontSize: 11 }
  const colorWrap: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
  }
  const hexLabel: React.CSSProperties = { color: '#666', fontSize: 10 }
  const footer: React.CSSProperties = {
    padding: '10px 16px', borderTop: '1px solid #2a2a2a',
    display: 'flex', justifyContent: 'flex-end',
  }
  const resetBtn: React.CSSProperties = {
    background: 'none', border: '1px solid #444', borderRadius: 4,
    color: '#888', fontSize: 10, letterSpacing: '0.04em',
    padding: '4px 10px', cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace',
  }

  const checkbox = (checked: boolean): React.CSSProperties => ({
    width: 14, height: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    border: checked ? '1px solid #00ff88' : '1px solid #555',
    background: checked ? '#00ff88' : 'transparent',
    borderRadius: 2, cursor: 'pointer', flexShrink: 0,
  })
  const checkmark: React.CSSProperties = { color: '#000', fontSize: 9, fontWeight: 700, lineHeight: 1 }

  return (
    <div style={overlay}>
      <div ref={modalRef} style={modal}>
        <div style={header}>
          <span style={titleStyle}>Chart Settings</span>
          <button style={closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={body}>
          <div style={sectionLabel}>Candle Colors</div>
          <div style={row}>
            <span style={labelStyle}>Up Color</span>
            <div style={colorWrap}>
              <span style={hexLabel}>{settings.candleUpColor}</span>
              <input
                type="color"
                value={settings.candleUpColor}
                onChange={e => onSettingsChange({ ...settings, candleUpColor: e.target.value })}
                style={{ width: 28, height: 20, border: 'none', padding: 0, cursor: 'pointer', background: 'none' }}
              />
            </div>
          </div>
          <div style={row}>
            <span style={labelStyle}>Down Color</span>
            <div style={colorWrap}>
              <span style={hexLabel}>{settings.candleDownColor}</span>
              <input
                type="color"
                value={settings.candleDownColor}
                onChange={e => onSettingsChange({ ...settings, candleDownColor: e.target.value })}
                style={{ width: 28, height: 20, border: 'none', padding: 0, cursor: 'pointer', background: 'none' }}
              />
            </div>
          </div>
          <div style={{ ...sectionLabel, marginTop: 14 }}>Display</div>
          <div style={row}>
            <span style={labelStyle}>Show Grid</span>
            <div
              style={checkbox(settings.gridVisible)}
              onClick={() => onSettingsChange({ ...settings, gridVisible: !settings.gridVisible })}
            >
              {settings.gridVisible && <span style={checkmark}>✓</span>}
            </div>
          </div>
          <div style={row}>
            <span style={labelStyle}>Show Crosshair</span>
            <div
              style={checkbox(settings.crosshairVisible)}
              onClick={() => onSettingsChange({ ...settings, crosshairVisible: !settings.crosshairVisible })}
            >
              {settings.crosshairVisible && <span style={checkmark}>✓</span>}
            </div>
          </div>
        </div>
        <div style={footer}>
          <button style={resetBtn} onClick={handleReset}>Reset to Defaults</button>
        </div>
      </div>
    </div>
  )
}
