'use client'

import { useCallback, useEffect, useState } from 'react'
import { ModelDropdown, RECOMMENDED_PROVIDERS } from '@/components/terminal/ModelDropdown'
import type { ModelInfo } from '@/components/terminal/ModelDropdown'


interface AgentInfo {
  id: string
  name: string
  description: string
  category: string
}

/* ─────────────────────────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────────────────────────── */

const INTELLIGENCE_DEFAULT_MODEL = 'opencode/big-pickle'
const DEFAULT_ANALYSIS_MODEL = 'opencode/big-pickle'
const DEFAULT_DISCOVERY_MODEL = 'opencode/big-pickle'
const DEFAULT_SIGNALS_MODEL = 'opencode/big-pickle'

const DEFAULT_MODEL = DEFAULT_ANALYSIS_MODEL

const SECTION_COLORS = {
  chatAgent: '#00cc88',
  discovery: 'var(--color-terminal-amber)',
  analysis: 'var(--color-terminal-blue)',
  intelligence: '#8e7cc3',
  globalDiscovery: '#00ddcc',
  signals: '#ff6b35',
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
  const [refreshInterval, setRefreshInterval] = useState<string>('10')
  const [chatHealth, setChatHealth] = useState<{
    container: { running: boolean; name: string; uptime?: string; image?: string }
    refreshLoop: { running: boolean }
    workspace: { exists: boolean; lastUpdated?: string; assetCount?: number }
  } | null>(null)
  const [healthLoading, setHealthLoading] = useState(true)

  // Load models + agents + persisted modelMap from API
  useEffect(() => {
    fetch('/api/intelligence/models')
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data) => {
        setModels(data.models ?? [])
        setAgents(data.agents ?? [])
        if (data.modelMap && typeof data.modelMap === 'object') {
          setAgentModelMap(data.modelMap)
          const storedInterval = data.modelMap.chatDataRefreshInterval
          if (storedInterval !== undefined) setRefreshInterval(String(storedInterval))
        }
        setLoading(false)
      })
      .catch((err) => {
        console.warn('[AIConfigPage] Failed to fetch models:', err)
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    const fetchHealth = () => {
      fetch('/api/chat/health')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) setChatHealth(data as typeof chatHealth)
          setHealthLoading(false)
        })
        .catch(() => setHealthLoading(false))
    }
    fetchHealth()
    const timer = setInterval(fetchHealth, 15000)
    return () => clearInterval(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleModelChange = useCallback(
    (agentId: string, modelId: string) => {
      setAgentModelMap((prev) => {
        const next = { ...prev, [agentId]: modelId }
        fetch('/api/intelligence/models', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modelMap: next }),
        }).catch((err) => console.warn('[AIConfigPage] Failed to save model config:', err))
        return next
      })
    },
    []
  )

  const handleIntervalChange = useCallback(
    (value: string) => {
      setRefreshInterval(value)
      handleModelChange('chatDataRefreshInterval', value)
      fetch('/api/chat/refresh-data/restart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval: parseInt(value, 10) }),
      }).catch(() => { /* ignore */ })
    },
    [handleModelChange],
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
      'master_planner', 'discovery_agent', 'global_synthesizer',
      'signal_crawler',
      'chat',
    ]
    const next: Record<string, string> = {}
    for (const key of allKeys) {
      next[key] = setAllModel
    }
    setAgentModelMap(next)
    fetch('/api/intelligence/models', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelMap: next }),
    })
      .then(() => {
        setSaved(true)
        setTimeout(() => setSaved(false), 1500)
      })
      .catch((err) => console.warn('[AIConfigPage] Failed to save model config:', err))
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

  const GLOBAL_DISCOVERY_AGENTS: AgentInfo[] = [
    { id: 'master_planner',     name: 'Master Planner',     category: 'global_discovery', description: 'Reads previous reports, analyzes gaps, and creates search assignments for discovery agents.' },
    { id: 'discovery_agent',    name: 'Discovery Agent',    category: 'global_discovery', description: 'Template model for all N parallel discovery agents. Each explores assigned sectors and finds new projects.' },
    { id: 'global_synthesizer', name: 'Synthesizer',        category: 'global_discovery', description: 'Combines all agent findings with previous report into a unified, compounding intelligence report.' },
  ]

  const signalCrawlerAgent: AgentInfo = {
    id: 'signal_crawler',
    name: 'Signal Crawler',
    description: 'AI agent that researches crypto assets and generates structured trading signals with entry, stop-loss, take-profit and confidence score.',
    category: 'signals',
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
            {/* ── CHAT AGENT section ── */}
            <section>
              <SectionHeader
                icon="◎"
                label="Chat Agent"
                color={SECTION_COLORS.chatAgent}
                description="Interactive chat assistant. Answers questions about tracked assets, analysis results, and market intelligence."
              />
              <AgentRow
                agent={{
                  id: 'chat',
                  name: 'Chat Assistant',
                  description: 'AI model for the interactive chat agent. Answers questions about tracked assets, analysis results, and market intelligence.',
                  category: 'chat',
                }}
                modelId={getAgentModel('chat')}
                onModelChange={(m) => handleModelChange('chat', m)}
                models={models}
                accentColor={SECTION_COLORS.chatAgent}
              />
              {/* Container Health */}
              <div style={{
                padding: '8px 10px',
                background: 'var(--color-terminal-bg)',
                border: '1px solid var(--color-terminal-border)',
                borderRadius: '2px',
                marginBottom: '6px',
                borderLeft: `2px solid ${SECTION_COLORS.chatAgent}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-terminal-text)', letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>
                    Container Health
                  </span>
                  {healthLoading ? (
                    <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--color-terminal-dim)' }}>checking...</span>
                  ) : chatHealth?.container.running ? (
                    <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--color-terminal-up)' }}>● RUNNING</span>
                  ) : (
                    <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--color-terminal-down)' }}>● STOPPED</span>
                  )}
                </div>
                {chatHealth && !healthLoading && (
                  <div style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--color-terminal-muted)', lineHeight: 1.6 }}>
                    <div>Container: <span style={{ color: 'var(--color-terminal-dim)' }}>{chatHealth.container.name}</span></div>
                    {chatHealth.container.uptime && (
                      <div>Started: <span style={{ color: 'var(--color-terminal-dim)' }}>{new Date(chatHealth.container.uptime).toLocaleString()}</span></div>
                    )}
                    {chatHealth.container.image && (
                      <div>Image: <span style={{ color: 'var(--color-terminal-dim)' }}>{chatHealth.container.image}</span></div>
                    )}
                    <div>Refresh Loop: <span style={{ color: chatHealth.refreshLoop.running ? 'var(--color-terminal-up)' : 'var(--color-terminal-down)' }}>{chatHealth.refreshLoop.running ? '● Active' : '● Inactive'}</span></div>
                    <div>Workspace: <span style={{ color: 'var(--color-terminal-dim)' }}>
                      {chatHealth.workspace.exists ? `${chatHealth.workspace.assetCount || 0} assets` : 'No data'}
                      {chatHealth.workspace.lastUpdated ? ` · Updated ${new Date(chatHealth.workspace.lastUpdated).toLocaleTimeString()}` : ''}
                    </span></div>
                  </div>
                )}
              </div>
              {/* Data Refresh Interval row */}
              <div style={{
                padding: '8px 10px',
                background: 'var(--color-terminal-bg)',
                border: '1px solid var(--color-terminal-border)',
                borderRadius: '2px',
                marginBottom: '6px',
                borderLeft: `2px solid ${SECTION_COLORS.chatAgent}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <div>
                    <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-terminal-text)', letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>
                      Data Refresh Interval
                    </span>
                  </div>
                  <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--color-terminal-dim)' }}>
                    {refreshInterval === '0' ? 'disabled' : `every ${refreshInterval}s`}
                  </span>
                </div>
                <div style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--color-terminal-muted)', marginBottom: '6px', lineHeight: 1.4 }}>
                  How often the workspace data is refreshed from the database while a chat session is active.
                </div>
                <select
                  value={refreshInterval}
                  onChange={(e) => handleIntervalChange(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    background: 'var(--color-terminal-surface)',
                    color: 'var(--color-terminal-text)',
                    border: '1px solid var(--color-terminal-border)',
                    borderRadius: '2px',
                    outline: 'none',
                    cursor: 'pointer',
                    appearance: 'none' as const,
                    WebkitAppearance: 'none' as const,
                  }}
                >
                  <option value="0">Disabled</option>
                  <option value="5">Every 5 seconds</option>
                  <option value="10">Every 10 seconds</option>
                  <option value="30">Every 30 seconds</option>
                  <option value="60">Every 60 seconds</option>
                  <option value="120">Every 2 minutes</option>
                </select>
              </div>
            </section>

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

            {/* ── SIGNALS section ── */}
            <section>
              <SectionHeader
                icon="◈"
                label="Signals"
                color={SECTION_COLORS.signals}
                description="AI signal generation agents. Crawls assets, applies technical analysis and generates actionable trading signals."
              />
              <AgentRow
                agent={signalCrawlerAgent}
                modelId={getAgentModel('signal_crawler') || DEFAULT_SIGNALS_MODEL}
                onModelChange={(m) => handleModelChange('signal_crawler', m)}
                models={models}
                accentColor={SECTION_COLORS.signals}
              />
            </section>

            {/* ── GLOBAL DISCOVERY section ── */}
            <section>
              <SectionHeader
                icon="◉"
                label="Global Discovery"
                color={SECTION_COLORS.globalDiscovery}
                description="Multi-agent global intelligence pipeline. Master planner assigns sectors, N agents explore in parallel, synthesizer combines into compounding reports."
              />
              {GLOBAL_DISCOVERY_AGENTS.map((agent) => (
                <AgentRow
                  key={agent.id}
                  agent={agent}
                  modelId={getAgentModel(agent.id)}
                  onModelChange={(m) => handleModelChange(agent.id, m)}
                  models={models}
                  accentColor={SECTION_COLORS.globalDiscovery}
                />
              ))}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
