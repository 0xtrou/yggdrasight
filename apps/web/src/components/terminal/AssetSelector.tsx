'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useMarketCoins } from '@/hooks/useMarketCoins';

interface AssetSelectorProps {
  selected: string;
  onSelect: (symbol: string) => void;
  customAssets?: string[];
}

interface FallbackAsset {
  symbol: string;
  name: string;
  currentPrice: number;
  priceChange24h: number;
}

const FALLBACK_ASSETS: FallbackAsset[] = [
  { symbol: 'BTCUSDT', name: 'Bitcoin', currentPrice: 0, priceChange24h: 0 },
  { symbol: 'ETHUSDT', name: 'Ethereum', currentPrice: 0, priceChange24h: 0 },
  { symbol: 'SOLUSDT', name: 'Solana', currentPrice: 0, priceChange24h: 0 },
  { symbol: 'BNBUSDT', name: 'BNB', currentPrice: 0, priceChange24h: 0 },
  { symbol: 'TAOUSDT', name: 'Bittensor', currentPrice: 0, priceChange24h: 0 },
];

function stripSuffix(symbol: string): string {
  return symbol.replace(/USDT$/i, '').toUpperCase();
}

function formatPrice(price: number): string {
  if (price === 0) return '—';
  if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(2);
  if (price >= 0.01) return price.toFixed(4);
  return price.toFixed(6);
}

function formatChange(change: number): string {
  if (change === 0) return '0.00%';
  const sign = change > 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}%`;
}

export function AssetSelector({ selected, onSelect, customAssets }: AssetSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Derive all tracked symbols for the market data API
  const trackedSymbols = useMemo(() => {
    const syms = new Set(FALLBACK_ASSETS.map((a) => stripSuffix(a.symbol)));
    if (customAssets) {
      for (const s of customAssets) {
        syms.add(s.toUpperCase().replace(/USDT$/i, ''));
      }
    }
    return Array.from(syms);
  }, [customAssets]);

  const { coins, loading } = useMarketCoins(trackedSymbols);

  // Merge market coins with fallbacks
  const assets = useMemo(() => {
    const coinMap = new Map<string, { symbol: string; name: string; currentPrice: number; priceChange24h: number }>();

    // Add fallbacks first
    for (const fb of FALLBACK_ASSETS) {
      coinMap.set(stripSuffix(fb.symbol), {
        symbol: fb.symbol,
        name: fb.name,
        currentPrice: fb.currentPrice,
        priceChange24h: fb.priceChange24h,
      });
    }

    // Add manually-added custom assets (if not already present)
    if (customAssets) {
      for (const sym of customAssets) {
        const base = stripSuffix(sym);
        if (!coinMap.has(base)) {
          coinMap.set(base, {
            symbol: `${base}USDT`,
            name: base,
            currentPrice: 0,
            priceChange24h: 0,
          });
        }
      }
    }

    // Override with real data from CoinGecko/market
    if (coins && coins.length > 0) {
      for (const coin of coins) {
        const base = stripSuffix(coin.symbol);
        coinMap.set(base, {
          symbol: coin.symbol,
          name: coin.name,
          currentPrice: coin.currentPrice,
          priceChange24h: coin.priceChange24h,
        });
      }
    }

    return Array.from(coinMap.entries()).map(([base, data]) => ({
      base,
      ...data,
    }));
  }, [coins, customAssets]);

  // Filter by search
  const filtered = useMemo(() => {
    if (!search.trim()) return assets;
    const q = search.trim().toLowerCase();
    return assets.filter(
      (a) => a.base.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)
    );
  }, [assets, search]);

  // Auto-focus search input when dropdown opens
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setSearch('');
      }
    },
    []
  );

  const handleSelect = useCallback(
    (symbol: string) => {
      onSelect(stripSuffix(symbol));
      setOpen(false);
      setSearch('');
    },
    [onSelect]
  );

  const displaySelected = stripSuffix(selected);

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }} onKeyDown={handleKeyDown}>
      {/* Trigger Button */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        style={{
          background: open ? 'var(--color-terminal-surface)' : 'transparent',
          border: '1px solid var(--color-terminal-border)',
          color: 'var(--color-terminal-amber)',
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          fontWeight: 700,
          padding: '4px 10px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          letterSpacing: '0.5px',
        }}
      >
        <span>{displaySelected}</span>
        <span style={{ fontSize: '8px', color: 'var(--color-terminal-muted)', marginLeft: '2px' }}>
          {open ? '▴' : '▾'}
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 100,
            width: '300px',
            maxHeight: '400px',
            background: 'var(--color-terminal-bg)',
            border: '1px solid var(--color-terminal-border)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Search Header */}
          <div
            style={{
              padding: '6px',
              borderBottom: '1px solid var(--color-terminal-border)',
              background: 'var(--color-terminal-surface)',
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search symbol..."
              style={{
                width: '100%',
                background: 'var(--color-terminal-bg)',
                border: '1px solid var(--color-terminal-border)',
                color: 'var(--color-terminal-text)',
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                padding: '4px 6px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Column Headers */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '3px 8px',
              borderBottom: '1px solid var(--color-terminal-border)',
              background: 'var(--color-terminal-surface)',
            }}
          >
            <span
              style={{
                flex: 1,
                fontFamily: 'var(--font-mono)',
                fontSize: '9px',
                color: 'var(--color-terminal-dim)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Symbol
            </span>
            <span
              style={{
                width: '80px',
                textAlign: 'right',
                fontFamily: 'var(--font-mono)',
                fontSize: '9px',
                color: 'var(--color-terminal-dim)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Price
            </span>
            <span
              style={{
                width: '60px',
                textAlign: 'right',
                fontFamily: 'var(--font-mono)',
                fontSize: '9px',
                color: 'var(--color-terminal-dim)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              24h
            </span>
          </div>

          {/* Asset List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading && filtered.length === 0 && (
              <div
                style={{
                  padding: '12px 8px',
                  textAlign: 'center',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  color: 'var(--color-terminal-dim)',
                }}
              >
                Loading...
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <div
                style={{
                  padding: '12px 8px',
                  textAlign: 'center',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  color: 'var(--color-terminal-dim)',
                }}
              >
                No matches
              </div>
            )}
            {filtered.map((asset) => {
              const isSelected = asset.base === displaySelected;
              const changeColor =
                asset.priceChange24h > 0
                  ? 'var(--color-terminal-up)'
                  : asset.priceChange24h < 0
                    ? 'var(--color-terminal-down)'
                    : 'var(--color-terminal-dim)';

              return (
                <div
                  key={asset.base}
                  onClick={() => handleSelect(asset.symbol)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '5px 8px',
                    cursor: 'pointer',
                    background: isSelected ? 'var(--color-terminal-panel)' : 'transparent',
                    borderLeft: isSelected ? '2px solid var(--color-terminal-amber)' : '2px solid transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'var(--color-terminal-surface)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = isSelected ? 'var(--color-terminal-panel)' : 'transparent';
                  }}
                >
                  {/* Symbol + Name */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: isSelected ? 'var(--color-terminal-amber)' : 'var(--color-terminal-text)',
                        letterSpacing: '0.3px',
                      }}
                    >
                      {asset.base}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '9px',
                        color: 'var(--color-terminal-dim)',
                        marginLeft: '6px',
                      }}
                    >
                      {asset.name}
                    </span>
                  </div>

                  {/* Price */}
                  <span
                    style={{
                      width: '80px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                      color: 'var(--color-terminal-text)',
                    }}
                  >
                    {formatPrice(asset.currentPrice)}
                  </span>

                  {/* 24h Change */}
                  <span
                    style={{
                      width: '60px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                      color: changeColor,
                      fontWeight: 500,
                    }}
                  >
                    {formatChange(asset.priceChange24h)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '3px 8px',
              borderTop: '1px solid var(--color-terminal-border)',
              background: 'var(--color-terminal-surface)',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '9px',
                color: 'var(--color-terminal-dim)',
              }}
            >
              {filtered.length} assets
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '9px',
                color: 'var(--color-terminal-dim)',
              }}
            >
              ESC to close
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
