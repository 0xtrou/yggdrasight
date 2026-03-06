'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useTrackedAssets } from '@/hooks/useTrackedAssets'
import { useMarketCoins } from '@/hooks/useMarketCoins'

/* ─────────────────────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────────────────────── */

function formatPrice(price: number): string {
  if (price === 0) return '—'
  if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (price >= 1) return price.toFixed(2)
  if (price >= 0.01) return price.toFixed(4)
  return price.toFixed(6)
}

function formatChange(change: number): string {
  if (change === 0) return '0.00%'
  const sign = change > 0 ? '+' : ''
  return `${sign}${change.toFixed(2)}%`
}

function formatMarketCap(cap: number): string {
  if (cap === 0) return '—'
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(2)}T`
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(2)}B`
  if (cap >= 1e6) return `$${(cap / 1e6).toFixed(2)}M`
  return `$${cap.toLocaleString()}`
}

function formatVolume(vol: number): string {
  if (vol === 0) return '—'
  if (vol >= 1e9) return `$${(vol / 1e9).toFixed(2)}B`
  if (vol >= 1e6) return `$${(vol / 1e6).toFixed(1)}M`
  return `$${vol.toLocaleString()}`
}

/* ─────────────────────────────────────────────────────────────────────────────
   ADD ASSET FORM
───────────────────────────────────────────────────────────────────────────── */

function AddAssetForm({
  onAdd,
  symbolInputRef,
}: {
  onAdd: (symbol: string, name?: string) => void
  symbolInputRef?: React.RefObject<HTMLInputElement | null>
}) {
  const [symbol, setSymbol] = useState('')
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const activeInputRef = symbolInputRef ?? inputRef

  const handleSubmit = useCallback(() => {
    const s = symbol.trim().toUpperCase().replace(/USDT$/i, '')
    if (!s) return
    onAdd(s, name.trim() || undefined)
    setSymbol('')
    setName('')
    activeInputRef.current?.focus()
  }, [symbol, name, onAdd, activeInputRef])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleSubmit()
    },
    [handleSubmit],
  )

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 18px',
        borderBottom: '1px solid var(--color-terminal-border)',
        background: 'var(--color-terminal-surface)',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontSize: '9px',
          fontFamily: 'var(--font-mono)',
          color: 'var(--color-terminal-dim)',
          letterSpacing: '0.5px',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}
      >
        Add Asset:
      </span>
      <input
        ref={activeInputRef}
        type="text"
        value={symbol}
        onChange={(e) => setSymbol(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Symbol (e.g. BTC)"
        style={{
          width: '120px',
          padding: '3px 8px',
          fontSize: '10px',
          fontFamily: 'var(--font-mono)',
          background: 'var(--color-terminal-bg)',
          border: '1px solid var(--color-terminal-border)',
          borderRadius: '2px',
          color: 'var(--color-terminal-text)',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Name (optional)"
        style={{
          width: '160px',
          padding: '3px 8px',
          fontSize: '10px',
          fontFamily: 'var(--font-mono)',
          background: 'var(--color-terminal-bg)',
          border: '1px solid var(--color-terminal-border)',
          borderRadius: '2px',
          color: 'var(--color-terminal-text)',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      <button
        onClick={handleSubmit}
        disabled={!symbol.trim()}
        style={{
          padding: '3px 12px',
          fontSize: '9px',
          fontFamily: 'var(--font-mono)',
          background: symbol.trim() ? 'var(--color-terminal-blue)' : 'var(--color-terminal-border)',
          color: symbol.trim() ? 'var(--color-terminal-bg)' : 'var(--color-terminal-dim)',
          border: 'none',
          borderRadius: '2px',
          cursor: symbol.trim() ? 'pointer' : 'not-allowed',
          letterSpacing: '0.3px',
          textTransform: 'uppercase',
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        + ADD
      </button>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   ASSET ROW
───────────────────────────────────────────────────────────────────────────── */

function AssetRow({
  symbol,
  name,
  addedAt,
  price,
  change24h,
  marketCap,
  volume,
  rank,
  onRemove,
}: {
  symbol: string
  name: string | null
  addedAt: string
  price: number
  change24h: number
  marketCap: number
  volume: number
  rank: number
  onRemove: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const confirmRef = useRef<NodeJS.Timeout | null>(null)

  // Auto-cancel confirm after 3s
  useEffect(() => {
    if (confirmDelete) {
      confirmRef.current = setTimeout(() => setConfirmDelete(false), 3000)
    }
    return () => {
      if (confirmRef.current) clearTimeout(confirmRef.current)
    }
  }, [confirmDelete])

  const changeColor =
    change24h > 0
      ? 'var(--color-terminal-up)'
      : change24h < 0
        ? 'var(--color-terminal-down)'
        : 'var(--color-terminal-dim)'

  const handleRemoveClick = useCallback(() => {
    if (confirmDelete) {
      onRemove()
      setConfirmDelete(false)
    } else {
      setConfirmDelete(true)
    }
  }, [confirmDelete, onRemove])

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setConfirmDelete(false) }}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '6px 18px',
        borderBottom: '1px solid var(--color-terminal-border)',
        background: hovered ? 'rgba(255, 255, 255, 0.02)' : 'transparent',
        transition: 'background 0.1s ease',
      }}
    >
      {/* Symbol */}
      <div style={{ width: '80px', flexShrink: 0 }}>
        <span
          style={{
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            color: 'var(--color-terminal-amber)',
            letterSpacing: '0.08em',
          }}
        >
          {symbol}
        </span>
      </div>

      {/* Name */}
      <div style={{ width: '140px', flexShrink: 0, overflow: 'hidden' }}>
        <span
          style={{
            fontSize: '10px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-terminal-muted)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: 'block',
          }}
        >
          {name || '—'}
        </span>
      </div>

      {/* Rank */}
      <div style={{ width: '50px', flexShrink: 0, textAlign: 'right' }}>
        <span
          style={{
            fontSize: '10px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-terminal-dim)',
          }}
        >
          {rank < 9999 ? `#${rank}` : '—'}
        </span>
      </div>

      {/* Price */}
      <div style={{ width: '100px', flexShrink: 0, textAlign: 'right' }}>
        <span
          style={{
            fontSize: '10px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-terminal-text)',
          }}
        >
          ${formatPrice(price)}
        </span>
      </div>

      {/* 24h Change */}
      <div style={{ width: '80px', flexShrink: 0, textAlign: 'right' }}>
        <span
          style={{
            fontSize: '10px',
            fontFamily: 'var(--font-mono)',
            color: changeColor,
            fontWeight: 500,
          }}
        >
          {formatChange(change24h)}
        </span>
      </div>

      {/* Market Cap */}
      <div style={{ width: '100px', flexShrink: 0, textAlign: 'right' }}>
        <span
          style={{
            fontSize: '10px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-terminal-text)',
          }}
        >
          {formatMarketCap(marketCap)}
        </span>
      </div>

      {/* Volume */}
      <div style={{ width: '90px', flexShrink: 0, textAlign: 'right' }}>
        <span
          style={{
            fontSize: '10px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-terminal-muted)',
          }}
        >
          {formatVolume(volume)}
        </span>
      </div>

      {/* Added */}
      <div style={{ flex: 1, textAlign: 'right', minWidth: '80px' }}>
        <span
          style={{
            fontSize: '9px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-terminal-dim)',
          }}
        >
          {new Date(addedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      </div>

      {/* Remove */}
      <div style={{ width: '60px', flexShrink: 0, textAlign: 'right' }}>
        {hovered && (
          <button
            onClick={handleRemoveClick}
            style={{
              padding: '1px 8px',
              fontSize: '9px',
              fontFamily: 'var(--font-mono)',
              background: confirmDelete ? 'var(--color-terminal-down)' : 'transparent',
              color: confirmDelete ? '#fff' : 'var(--color-terminal-down)',
              border: `1px solid ${confirmDelete ? 'var(--color-terminal-down)' : 'var(--color-terminal-border)'}`,
              borderRadius: '2px',
              cursor: 'pointer',
              letterSpacing: '0.3px',
              textTransform: 'uppercase',
              fontWeight: 500,
              whiteSpace: 'nowrap',
            }}
          >
            {confirmDelete ? 'CONFIRM' : 'REMOVE'}
          </button>
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   COLUMN HEADERS
───────────────────────────────────────────────────────────────────────────── */

function ColumnHeaders() {
  const headerStyle: React.CSSProperties = {
    fontSize: '9px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--color-terminal-dim)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    fontWeight: 600,
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '4px 18px',
        borderBottom: '1px solid var(--color-terminal-border)',
        background: 'var(--color-terminal-surface)',
        flexShrink: 0,
      }}
    >
      <div style={{ width: '80px', flexShrink: 0 }}>
        <span style={headerStyle}>Symbol</span>
      </div>
      <div style={{ width: '140px', flexShrink: 0 }}>
        <span style={headerStyle}>Name</span>
      </div>
      <div style={{ width: '50px', flexShrink: 0, textAlign: 'right' }}>
        <span style={headerStyle}>Rank</span>
      </div>
      <div style={{ width: '100px', flexShrink: 0, textAlign: 'right' }}>
        <span style={headerStyle}>Price</span>
      </div>
      <div style={{ width: '80px', flexShrink: 0, textAlign: 'right' }}>
        <span style={headerStyle}>24h</span>
      </div>
      <div style={{ width: '100px', flexShrink: 0, textAlign: 'right' }}>
        <span style={headerStyle}>Mkt Cap</span>
      </div>
      <div style={{ width: '90px', flexShrink: 0, textAlign: 'right' }}>
        <span style={headerStyle}>Volume</span>
      </div>
      <div style={{ flex: 1, textAlign: 'right', minWidth: '80px' }}>
        <span style={headerStyle}>Added</span>
      </div>
      <div style={{ width: '60px', flexShrink: 0 }} />
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────────────────────────────────────────── */

export default function AssetsPage() {
  const { assets, loading, error, addAsset, removeAsset } = useTrackedAssets()
  const addAssetInputRef = useRef<HTMLInputElement>(null)
  const symbols = useMemo(() => assets.map((a) => a.symbol), [assets])
  const { coins, loading: coinsLoading } = useMarketCoins(symbols.length > 0 ? symbols : undefined)

  // Build a lookup map from symbol → market data
  const coinMap = useMemo(() => {
    const map = new Map<string, { price: number; change24h: number; marketCap: number; volume: number; rank: number }>()
    if (coins) {
      for (const coin of coins) {
        const base = coin.symbol.toUpperCase().replace(/USDT$/i, '')
        map.set(base, {
          price: coin.currentPrice,
          change24h: coin.priceChange24h,
          marketCap: coin.marketCap,
          volume: coin.volume24h,
          rank: coin.rank,
        })
      }
    }
    return map
  }, [coins])

  const handleAdd = useCallback(
    (symbol: string, name?: string) => {
      addAsset(symbol, name)
    },
    [addAsset],
  )

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        background: 'var(--color-terminal-bg)',
        fontFamily: 'var(--font-mono)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          height: '40px',
          minHeight: '40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 18px',
          borderBottom: '1px solid var(--color-terminal-border)',
          flexShrink: 0,
          background: 'var(--color-terminal-panel)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '10px', color: 'var(--color-terminal-dim)' }}>⬡</span>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--color-terminal-text)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}
          >
            Asset Management
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {coinsLoading && (
            <span
              style={{
                fontSize: '9px',
                color: 'var(--color-terminal-dim)',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.08em',
              }}
            >
              LOADING PRICES...
            </span>
          )}
          <span
            style={{
              fontSize: '9px',
              color: 'var(--color-terminal-muted)',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.05em',
            }}
          >
            {assets.length} ASSET{assets.length !== 1 ? 'S' : ''} TRACKED
          </span>
        </div>
      </div>

      {/* ── Add Asset Form ── */}
      <AddAssetForm onAdd={handleAdd} symbolInputRef={addAssetInputRef} />

      {/* ── Column Headers ── */}
      <ColumnHeaders />

      {/* ── Asset List ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '40px',
              color: 'var(--color-terminal-dim)',
              fontSize: '11px',
              letterSpacing: '0.1em',
            }}
          >
            LOADING ASSETS...
          </div>
        ) : error ? (
          <div
            style={{
              padding: '20px 18px',
              color: 'var(--color-terminal-down)',
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
            }}
          >
            ERROR: {error}
          </div>
        ) : assets.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '60px 20px',
              gap: '12px',
            }}
          >
            <span style={{ fontSize: '24px', opacity: 0.3 }}>⬡</span>
            <span
              style={{
                fontSize: '11px',
                color: 'var(--color-terminal-dim)',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              No assets tracked
            </span>
            <span
              style={{
                fontSize: '10px',
                color: 'var(--color-terminal-muted)',
                fontFamily: 'var(--font-mono)',
                maxWidth: '300px',
                textAlign: 'center',
                lineHeight: 1.5,
              }}
            >
              Add assets above to start tracking. Prices update automatically from CoinGecko.
            </span>
            <button
              onClick={() => {
                window.scrollTo({ top: 0, behavior: 'smooth' })
                setTimeout(() => addAssetInputRef.current?.focus(), 150)
              }}
              style={{
                background: 'transparent',
                border: '1px solid var(--color-terminal-up)',
                color: 'var(--color-terminal-up)',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                letterSpacing: '0.1em',
                padding: '8px 20px',
                cursor: 'pointer',
                transition: 'all 0.15s',
                textTransform: 'uppercase',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(0,255,136,0.08)'
                e.currentTarget.style.borderColor = '#00ff88'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.borderColor = 'var(--color-terminal-up)'
              }}
            >
              ▸ ADD YOUR FIRST ASSET
            </button>
          </div>
        ) : (
          assets.map((asset) => {
            const market = coinMap.get(asset.symbol)
            return (
              <AssetRow
                key={asset.symbol}
                symbol={asset.symbol}
                name={asset.name}
                addedAt={asset.addedAt}
                price={market?.price ?? 0}
                change24h={market?.change24h ?? 0}
                marketCap={market?.marketCap ?? 0}
                volume={market?.volume ?? 0}
                rank={market?.rank ?? 9999}
                onRemove={() => removeAsset(asset.symbol)}
              />
            )
          })
        )}
      </div>
    </div>
  )
}
