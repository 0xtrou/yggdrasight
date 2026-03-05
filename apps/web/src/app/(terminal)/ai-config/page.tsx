'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/* ─────────────────────────────────────────────────────────────────────────────
   TYPES
───────────────────────────────────────────────────────────────────────────── */

interface ModelInfo {
  id: string
  provider: string
  name: string
}

interface AgentInfo {
  id: string
  name: string
  description: string
  category: string
}

/* ─────────────────────────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────────────────────────── */

const INTELLIGENCE_DEFAULT_MODEL = 'github-copilot/gpt-4.1'
const DEFAULT_ANALYSIS_MODEL = 'opencode/big-pickle'
const DEFAULT_DISCOVERY_MODEL = 'opencode/big-pickle'

const AGENT_MODEL_MAP_KEY = 'oculus:agentModelMap'
const DEFAULT_MODEL = DEFAULT_ANALYSIS_MODEL
const RECOMMENDED_PROVIDERS = ['github-copilot', 'opencode']

const SECTION_COLORS = {
  discovery: 'var(--color-terminal-amber)',
  analysis: 'var(--color-terminal-blue)',
  intelligence: '#8e7cc3',
}

/* ─────────────────────────────────────────────────────────────────────────────
   MODEL DROPDOWN
───────────────────────────────────────────────────────────────────────────── */

function ModelDropdown({
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

/* ─────────────────────────────────────────────────────────────────────────────
   SECTION HEADER
───────────────────────────────────────────────────────────────────────────── */

function SectionHeader({
  icon,
  label,
  color,
  description,
}: {
  icon: string
  label: string
  color: string
  description: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        padding: '10px 0 8px',
        borderBottom: `1px solid ${color}30`,
        marginBottom: '10px',
      }}
    >
      <span style={{ fontSize: '16px', marginTop: '1px' }}>{icon}</span>
      <div>
        <div
          style={{
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            color,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: '10px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-terminal-dim)',
            marginTop: '2px',
          }}
        >
          {description}
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   AGENT ROW
───────────────────────────────────────────────────────────────────────────── */

function AgentRow({
  agent,
  modelId,
  onModelChange,
  models,
  accentColor,
}: {
  agent: AgentInfo
  modelId: string
  onModelChange: (modelId: string) => void
  models: ModelInfo[]
  accentColor: string
}) {
  return (
    <div
      style={{
        padding: '8px 10px',
        background: 'var(--color-terminal-bg)',
        border: '1px solid var(--color-terminal-border)',
        borderRadius: '2px',
        marginBottom: '6px',
        borderLeft: `2px solid ${accentColor}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '5px',
        }}
      >
        <div>
          <span
            style={{
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              color: 'var(--color-terminal-text)',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            {agent.name}
          </span>
        </div>
        <span
          style={{
            fontSize: '9px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-terminal-dim)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '120px',
          }}
        >
          {modelId ? modelId.split('/').pop() : DEFAULT_MODEL.split('/').pop()}
        </span>
      </div>
      <div
        style={{
          fontSize: '9px',
          fontFamily: 'var(--font-mono)',
          color: 'var(--color-terminal-muted)',
          marginBottom: '6px',
          lineHeight: 1.4,
        }}
      >
        {agent.description}
      </div>
      <ModelDropdown
        value={modelId || ''}
        onChange={onModelChange}
        models={models}
      />
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────────────────────────────────────────── */

export default function AIConfigPage() {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [agentModelMap, setAgentModelMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [setAllOpen, setSetAllOpen] = useState(false)
  const [setAllModel, setSetAllModel] = useState('')

  // Load models + agents from API
  useEffect(() => {
    fetch('/api/intelligence/models')
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data) => {
        setModels(data.models ?? [])
        setAgents(data.agents ?? [])
        setLoading(false)
      })
      .catch((err) => {
        console.warn('[AIConfigPage] Failed to fetch models:', err)
        setLoading(false)
      })
  }, [])

  // Load persisted agentModelMap from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(AGENT_MODEL_MAP_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') {
          setAgentModelMap(parsed)
        }
      }
    } catch {
      // ignore
    }
  }, [])

  const handleModelChange = useCallback(
    (agentId: string, modelId: string) => {
      setAgentModelMap((prev) => {
        const next = { ...prev, [agentId]: modelId }
        try {
          localStorage.setItem(AGENT_MODEL_MAP_KEY, JSON.stringify(next))
        } catch {
          // ignore
        }
        return next
      })
    },
    []
  )

  const getAgentModel = useCallback(
    (agentId: string) => agentModelMap[agentId] || '',
    [agentModelMap]
  )

  // Set all agents to the same model
  const handleSetAll = useCallback(() => {
    if (!setAllModel) return
    const allKeys = [
      ...agents.map((a) => a.id),
      'crack_mapping', 'visibility', 'narrative_separator', 'power_vector', 'problem_recognition', 'identity_polarity', 'synthesizer',
      'discovery',
    ]
    const next: Record<string, string> = {}
    for (const key of allKeys) {
      next[key] = setAllModel
    }
    setAgentModelMap(next)
    try {
      localStorage.setItem(AGENT_MODEL_MAP_KEY, JSON.stringify(next))
    } catch {
      // ignore
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
    setSetAllOpen(false)
    setSetAllModel('')
  }, [agents, setAllModel])

  const INTELLIGENCE_AGENTS: AgentInfo[] = [
    { id: 'crack_mapping',        name: 'Crack Mapping',        category: 'intelligence', description: 'Identifies which of the 6 philosophical crack archetypes the project maps onto.' },
    { id: 'visibility',           name: 'Visibility',           category: 'intelligence', description: 'Analyzes the project\'s presence and signal strength across market narratives.' },
    { id: 'narrative_separator',  name: 'Narrative Separator',  category: 'intelligence', description: 'Distinguishes the project\'s core narrative from noise and hype layers.' },
    { id: 'power_vector',         name: 'Power Vector',         category: 'intelligence', description: 'Maps the directional forces — capital flows, developer activity, institutional interest.' },
    { id: 'problem_recognition',  name: 'Problem Recognition',  category: 'intelligence', description: 'Evaluates whether the project solves a real, recognized problem with sufficient market pull.' },
    { id: 'identity_polarity',    name: 'Identity Polarity',    category: 'intelligence', description: 'Assesses the polarity and coherence of the project\'s identity signal in the ecosystem.' },
    { id: 'synthesizer',          name: 'Synthesizer',          category: 'intelligence', description: 'Combines all 6 sub-agent outputs into a final philosophical category classification.' },
  ]

  const discoveryAgent: AgentInfo = {
    id: 'discovery',
    name: 'Discovery Agent',
    description: 'Performs deep project research using web search, GitHub, documentation and on-chain data to build investment context.',
    category: 'discovery',
  }


  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        background: 'var(--color-terminal-bg)',
        fontFamily: 'var(--font-mono)',
        padding: '0',
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
          <span style={{ fontSize: '10px', color: 'var(--color-terminal-dim)' }}>◈</span>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--color-terminal-text)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}
          >
            AI Configuration
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {saved && (
            <span
              style={{
                fontSize: '9px',
                color: 'var(--color-terminal-up)',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.08em',
              }}
            >
              ✓ SAVED
            </span>
          )}
          <button
            onClick={() => setSetAllOpen((o) => !o)}
            style={{
              padding: '2px 10px',
              fontSize: '9px',
              fontFamily: 'var(--font-mono)',
              background: 'var(--color-terminal-blue)',
              color: 'var(--color-terminal-bg)',
              border: 'none',
              borderRadius: '2px',
              cursor: 'pointer',
              letterSpacing: '0.3px',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            SET ALL
          </button>
        </div>
      </div>

      {/* ── Set All banner ── */}
      {setAllOpen && (
        <div
          style={{
            padding: '10px 18px',
            borderBottom: '1px solid var(--color-terminal-border)',
            background: 'var(--color-terminal-surface)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
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
            Apply to all agents:
          </span>
          <div style={{ flex: 1, maxWidth: '320px' }}>
            <ModelDropdown
              value={setAllModel}
              onChange={setSetAllModel}
              models={models}
            />
          </div>
          <button
            onClick={handleSetAll}
            disabled={!setAllModel}
            style={{
              padding: '3px 12px',
              fontSize: '9px',
              fontFamily: 'var(--font-mono)',
              background: setAllModel ? 'var(--color-terminal-blue)' : 'var(--color-terminal-border)',
              color: setAllModel ? 'var(--color-terminal-bg)' : 'var(--color-terminal-dim)',
              border: 'none',
              borderRadius: '2px',
              cursor: setAllModel ? 'pointer' : 'not-allowed',
              letterSpacing: '0.3px',
              textTransform: 'uppercase',
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            APPLY
          </button>
          <button
            onClick={() => { setSetAllOpen(false); setSetAllModel('') }}
            style={{
              padding: '3px 8px',
              fontSize: '9px',
              fontFamily: 'var(--font-mono)',
              background: 'transparent',
              color: 'var(--color-terminal-dim)',
              border: '1px solid var(--color-terminal-border)',
              borderRadius: '2px',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Body ── */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '14px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
        }}
      >
        {loading ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-terminal-dim)',
              fontSize: '11px',
              letterSpacing: '0.1em',
            }}
          >
            LOADING MODELS...
          </div>
        ) : (
          <>
            {/* ── INTELLIGENCE section ── */}
            <section>
              <SectionHeader
                icon="◈"
                label="Intelligence"
                color={SECTION_COLORS.intelligence}
                description="Core intelligence engine agents. Configure the model used for global market analysis and classification."
              />
              {INTELLIGENCE_AGENTS.map((agent) => (
                <AgentRow
                  key={agent.id}
                  agent={agent}
                  modelId={getAgentModel(agent.id) || INTELLIGENCE_DEFAULT_MODEL}
                  onModelChange={(m) => handleModelChange(agent.id, m)}
                  models={models}
                  accentColor={SECTION_COLORS.intelligence}
                />
              ))}
            </section>

            {/* ── ANALYSIS section ── */}
            <section>
              <SectionHeader
                icon="◉"
                label="Analysis"
                color={SECTION_COLORS.analysis}
                description="LLM-powered analyst agents. Each applies a distinct investment philosophy to evaluate assets."
              />
              {agents.length === 0 ? (
                <div
                  style={{
                    padding: '10px',
                    fontSize: '9px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--color-terminal-dim)',
                    border: '1px dashed var(--color-terminal-border)',
                    borderRadius: '2px',
                    textAlign: 'center',
                    letterSpacing: '0.08em',
                  }}
                >
                  No analysis agents available.
                </div>
              ) : (
                agents.map((agent) => (
                  <AgentRow
                    key={agent.id}
                    agent={agent}
                    modelId={getAgentModel(agent.id)}
                    onModelChange={(m) => handleModelChange(agent.id, m)}
                    models={models}
                    accentColor={SECTION_COLORS.analysis}
                  />
                ))
              )}
            </section>

            {/* ── DISCOVERY section ── */}
            <section>
              <SectionHeader
                icon="◎"
                label="Discovery"
                color={SECTION_COLORS.discovery}
                description="Deep project research agent. Searches web, GitHub, docs and on-chain data to build investment context."
              />
              <AgentRow
                agent={discoveryAgent}
                modelId={getAgentModel('discovery')}
                onModelChange={(m) => handleModelChange('discovery', m)}
                models={models}
                accentColor={SECTION_COLORS.discovery}
              />
            </section>
          </>
        )}
      </div>
    </div>
  )
}
