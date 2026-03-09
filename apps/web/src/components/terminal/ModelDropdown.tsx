'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

/* ─────────────────────────────────────────────────────────────────────────────
   TYPES
───────────────────────────────────────────────────────────────────────────── */

export interface ModelInfo {
  id: string
  provider: string
  name: string
}

/* ─────────────────────────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────────────────────────── */

export const RECOMMENDED_PROVIDERS = ['github-copilot', 'opencode']

const DEFAULT_MODEL = 'opencode/big-pickle'

/* ─────────────────────────────────────────────────────────────────────────────
   MODEL DROPDOWN
───────────────────────────────────────────────────────────────────────────── */

export function ModelDropdown({
  value,
  onChange,
  models,
}: {
  value: string
  onChange: (modelId: string) => void
  models: ModelInfo[]
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const modelsByProvider = useMemo(() => {
    return models.reduce<Record<string, ModelInfo[]>>((acc, m) => {
      if (!acc[m.provider]) acc[m.provider] = []
      acc[m.provider].push(m)
      return acc
    }, {})
  }, [models])

  const orderedProviders = useMemo(() => {
    return Object.keys(modelsByProvider).sort((a, b) => {
      const aIdx = RECOMMENDED_PROVIDERS.indexOf(a)
      const bIdx = RECOMMENDED_PROVIDERS.indexOf(b)
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx
      if (aIdx !== -1) return -1
      if (bIdx !== -1) return 1
      return a.localeCompare(b)
    })
  }, [modelsByProvider])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? models.filter(
          (m) =>
            m.id.toLowerCase().includes(q) ||
            m.name.toLowerCase().includes(q) ||
            m.provider.toLowerCase().includes(q)
        )
      : models

    const byProvider = list.reduce<Record<string, ModelInfo[]>>((acc, m) => {
      if (!acc[m.provider]) acc[m.provider] = []
      acc[m.provider].push(m)
      return acc
    }, {})

    const providers = orderedProviders.filter((p) => byProvider[p]?.length)
    Object.keys(byProvider).forEach((p) => {
      if (!providers.includes(p)) providers.push(p)
    })

    return { byProvider, providers }
  }, [query, models, orderedProviders])

  const displayName = value
    ? models.find((m) => m.id === value)?.name ?? value.split('/').pop() ?? value
    : DEFAULT_MODEL.split('/').pop()

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          padding: '3px 8px',
          fontSize: '10px',
          fontFamily: 'var(--font-mono)',
          background: 'var(--color-terminal-bg)',
          border: '1px solid ' + (open ? 'var(--color-terminal-blue)' : 'var(--color-terminal-border)'),
          borderRadius: '2px',
          color: 'var(--color-terminal-text)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '4px',
          userSelect: 'none',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayName}
        </span>
        <span style={{ color: 'var(--color-terminal-dim)', fontSize: '8px', flexShrink: 0 }}>▾</span>
      </div>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 2px)',
            left: 0,
            right: 0,
            zIndex: 9999,
            background: 'var(--color-terminal-surface)',
            border: '1px solid var(--color-terminal-border)',
            borderRadius: '2px',
            maxHeight: '240px',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{ padding: '4px', borderBottom: '1px solid var(--color-terminal-border)', flexShrink: 0 }}>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models..."
              style={{
                width: '100%',
                padding: '2px 6px',
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
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.providers.map((provider) => (
              <div key={provider}>
                <div
                  style={{
                    padding: '2px 6px 1px',
                    fontSize: '8px',
                    fontFamily: 'var(--font-mono)',
                    color: RECOMMENDED_PROVIDERS.includes(provider)
                      ? 'var(--color-terminal-amber)'
                      : 'var(--color-terminal-dim)',
                    letterSpacing: '0.5px',
                    textTransform: 'uppercase',
                    borderTop: '1px solid var(--color-terminal-border)',
                    marginTop: '1px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                  }}
                >
                  {provider}
                  {RECOMMENDED_PROVIDERS.includes(provider) && (
                    <span style={{ fontSize: '7px', color: 'var(--color-terminal-amber)', opacity: 0.7 }}>★</span>
                  )}
                </div>
                {(filtered.byProvider[provider] ?? []).map((m) => {
                  const isActive = value === m.id
                  return (
                    <div
                      key={m.id}
                      onClick={() => {
                        onChange(m.id)
                        setOpen(false)
                        setQuery('')
                      }}
                      style={{
                        padding: '2px 10px',
                        fontSize: '10px',
                        fontFamily: 'var(--font-mono)',
                        color: isActive ? 'var(--color-terminal-blue)' : 'var(--color-terminal-text)',
                        cursor: 'pointer',
                        background: isActive ? 'rgba(68, 136, 255, 0.1)' : 'transparent',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'var(--color-terminal-panel)'
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent'
                      }}
                    >
                      {m.name}
                    </div>
                  )
                })}
              </div>
            ))}
            {filtered.providers.length === 0 && (
              <div
                style={{
                  padding: '8px',
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-terminal-dim)',
                  textAlign: 'center',
                }}
              >
                No models matching &quot;{query}&quot;
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
