'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { AssetSelector } from './AssetSelector'
import { usePriceTicker } from '@/hooks/usePriceTicker'

interface TopBarProps {
  selectedSymbol: string
  onSelectSymbol: (symbol: string) => void
  customAssets: string[]
  onAddAsset: (symbol: string) => void
  trackedSymbols?: string[]
}

export function TopBar({ selectedSymbol, onSelectSymbol, customAssets, onAddAsset, trackedSymbols }: TopBarProps) {
  const [time, setTime] = useState('')
  const { tickers } = usePriceTicker(trackedSymbols)
  const ticker = tickers[`${selectedSymbol}USDT`]
  const [addingAsset, setAddingAsset] = useState(false)
  const [addInput, setAddInput] = useState('')
  const addInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const update = () => setTime(new Date().toLocaleTimeString('en-US', { hour12: false }))
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [])

  // Auto-focus the add input when it appears
  useEffect(() => {
    if (addingAsset && addInputRef.current) {
      addInputRef.current.focus()
    }
  }, [addingAsset])

  const handleAddSubmit = useCallback(() => {
    const symbol = addInput.trim().toUpperCase().replace(/USDT$/i, '')
    if (symbol.length > 0) {
      onAddAsset(symbol)
      onSelectSymbol(symbol)
    }
    setAddInput('')
    setAddingAsset(false)
  }, [addInput, onAddAsset, onSelectSymbol])

  const handleAddKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleAddSubmit()
      } else if (e.key === 'Escape') {
        setAddInput('')
        setAddingAsset(false)
      }
    },
    [handleAddSubmit]
  )

  return (
    <div
      style={{
        height: '40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        background: 'var(--color-terminal-surface)',
        borderBottom: '1px solid var(--color-terminal-border)',
        flexShrink: 0,
        fontFamily: 'var(--font-mono)',
      }}
    >
      {/* Left: Logo + Asset Selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span style={{ color: 'var(--color-terminal-up)', fontWeight: 700, fontSize: '15px', letterSpacing: '0.12em' }}>
            OCULUS
          </span>
          <span style={{ color: 'var(--color-terminal-dim)', fontSize: '9px', letterSpacing: '0.08em' }}>
            TERMINAL
          </span>
        </div>
        <div style={{ width: '1px', height: '20px', background: 'var(--color-terminal-border)' }} />
        <AssetSelector selected={selectedSymbol} onSelect={onSelectSymbol} customAssets={customAssets} />
      </div>

      {/* Center: Live Price + Add Asset */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {ticker ? (
          <>
            <span style={{ color: 'var(--color-terminal-text)', fontSize: '14px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
              ${ticker.price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span
              style={{
                color: ticker.change24h >= 0 ? 'var(--color-terminal-up)' : 'var(--color-terminal-down)',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {ticker.change24h >= 0 ? '▲' : '▼'} {Math.abs(ticker.change24h).toFixed(2)}%
            </span>
          </>
        ) : (
          <span style={{ color: 'var(--color-terminal-dim)', fontSize: '11px' }}>—</span>
        )}

        {/* Add Asset: inline input or button */}
        {addingAsset ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '8px' }}>
            <input
              ref={addInputRef}
              type="text"
              value={addInput}
              onChange={(e) => setAddInput(e.target.value)}
              onKeyDown={handleAddKeyDown}
              onBlur={() => { setAddInput(''); setAddingAsset(false) }}
              placeholder="SYMBOL"
              style={{
                width: '80px',
                background: 'var(--color-terminal-bg)',
                border: '1px solid var(--color-terminal-amber)',
                color: 'var(--color-terminal-text)',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                fontWeight: 700,
                padding: '3px 6px',
                outline: 'none',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            />
            <button
              onMouseDown={(e) => { e.preventDefault(); handleAddSubmit() }}
              style={{
                background: 'var(--color-terminal-amber)',
                border: 'none',
                color: 'var(--color-terminal-bg)',
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                fontWeight: 700,
                padding: '3px 8px',
                cursor: 'pointer',
                height: '24px',
              }}
            >
              ADD
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAddingAsset(true)}
            title="Add asset to track and analyze"
            style={{
              background: 'transparent',
              border: '1px solid var(--color-terminal-amber)',
              color: 'var(--color-terminal-amber)',
              fontFamily: 'var(--font-mono)',
              fontSize: '14px',
              fontWeight: 700,
              width: '28px',
              height: '28px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 0,
              marginLeft: '8px',
              flexShrink: 0,
            }}
          >
            +
          </button>
        )}
      </div>

      {/* Right: Clock + Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '140px', justifyContent: 'flex-end' }}>
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
          {time}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-terminal-up)' }} />
          <span style={{ color: 'var(--color-terminal-up)', fontSize: '10px', letterSpacing: '0.06em' }}>LIVE</span>
        </span>
      </div>
    </div>
  )
}
