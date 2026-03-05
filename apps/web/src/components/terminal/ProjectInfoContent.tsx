'use client'

import type { useProjectInfo } from '@/hooks/useProjectInfo'
import type { UnifiedProjectField } from '@/lib/intelligence/types'

interface ProjectInfoContentProps {
  symbol: string
  projectInfo: ReturnType<typeof useProjectInfo>
  agentModelMap?: Record<string, string>
}

export function ProjectInfoContent({ symbol, projectInfo, agentModelMap }: ProjectInfoContentProps) {
  const { unified, loading, discovering, discoveryElapsed, discoveryLogs, error, discover, cancelDiscovery } = projectInfo
  const base = symbol.replace(/USDT$|BUSD$|USD$/i, '').toUpperCase()

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-terminal-dim)', fontSize: '13px', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
        LOADING PROJECT DATA...
      </div>
    )
  }

  if (error && !unified) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', color: 'var(--color-terminal-dim)', fontSize: '13px', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
        <span>{error}</span>
        <button
          onClick={() => discover(agentModelMap?.['discovery'] || 'opencode/big-pickle')}
          disabled={discovering}
          style={{
            background: discovering ? 'var(--color-terminal-surface)' : 'var(--color-terminal-amber)',
            color: discovering ? 'var(--color-terminal-dim)' : '#000',
            border: 'none',
            padding: '6px 16px',
            fontSize: '13px',
            fontWeight: 'bold',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.1em',
            cursor: discovering ? 'wait' : 'pointer',
          }}
        >
          {discovering ? 'DISCOVERING...' : 'DISCOVER VIA AI AGENT'}
        </button>
        {discovering && (
          <button
            onClick={() => cancelDiscovery()}
            style={{
              background: 'transparent',
              color: 'var(--color-terminal-down)',
              border: '1px solid var(--color-terminal-down)44',
              padding: '4px 12px',
              fontSize: '12px',
              fontWeight: 'bold',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.1em',
              cursor: 'pointer',
              marginTop: '4px',
            }}
          >
            CANCEL
          </button>
        )}
        {discovering && discoveryLogs.length > 0 && (
          <div style={{
            width: '100%',
            maxHeight: '200px',
            overflow: 'auto',
            marginTop: '8px',
            background: 'var(--color-terminal-bg)',
            border: '1px solid var(--color-terminal-border)',
            padding: '6px 8px',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            lineHeight: '1.5',
            color: 'var(--color-terminal-muted)',
          }}>
            {discoveryLogs.map((line, i) => (
              <div key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: line.includes('\u2713') ? 'var(--color-terminal-up)' : line.includes('ERROR') || line.includes('[stderr]') ? 'var(--color-terminal-down)' : line.includes('\u25b6') ? 'var(--color-terminal-amber)' : 'var(--color-terminal-dim)' }}>
                {line}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const u = unified!

  // ── Source badge ──
  const sourceBadge = (source: 'api' | 'ai' | 'both'): React.ReactNode => {
    const colors: Record<string, { bg: string; border: string; text: string; label: string }> = {
      api: { bg: 'var(--color-terminal-up)11', border: 'var(--color-terminal-up)44', text: 'var(--color-terminal-up)', label: 'API' },
      ai: { bg: 'var(--color-terminal-amber)11', border: 'var(--color-terminal-amber)44', text: 'var(--color-terminal-amber)', label: 'AI' },
      both: { bg: 'var(--color-terminal-blue)11', border: 'var(--color-terminal-blue)44', text: 'var(--color-terminal-blue)', label: 'API+AI' },
    }
    const c = colors[source]
    return (
      <span style={{ fontSize: '8px', padding: '0 3px', background: c.bg, border: `1px solid ${c.border}`, color: c.text, fontWeight: 'bold', lineHeight: '14px', marginLeft: '4px', flexShrink: 0 }}>{c.label}</span>
    )
  }

  const sectionHeader = (title: string, color: string): React.CSSProperties => ({
    fontSize: '13px', fontWeight: 'bold', letterSpacing: '0.1em', color, fontFamily: 'var(--font-mono)', padding: '6px 10px 3px', borderBottom: `1px solid ${color}33`,
  })

  // ── Unified row — shows source badge ──
  const uRow = <T,>(label: string, field: UnifiedProjectField<T>, fmt?: (v: T) => string, valueColor?: string): React.ReactNode => {
    if (field.value === null || field.value === undefined) return null
    const display = fmt ? fmt(field.value) : String(field.value)
    if (!display || display === '—') return null
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 10px', gap: '8px' }}>
        <span style={{ color: 'var(--color-terminal-muted)', fontSize: '12px', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center' }}>
          {label}{sourceBadge(field.source)}
        </span>
        <span style={{ color: valueColor ?? 'var(--color-terminal-text)', fontSize: '13px', fontFamily: 'var(--font-mono)', fontWeight: 'bold', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{display}</span>
      </div>
    )
  }

  // Number formatters
  const fmtNum = (v: number | null): string => {
    if (v === null || v === undefined) return '—'
    return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(2)
  }
  const fmtPct = (v: number | null): string => {
    if (v === null || v === undefined) return '—'
    return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
  }
  const fmtUsd = (v: number | null): string => {
    if (v === null || v === undefined || isNaN(v)) return '—'
    if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
    if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
    if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`
    return `$${v.toFixed(0)}`
  }
  const changeColor = (v: number | null): string => {
    if (v === null || v === undefined) return 'var(--color-terminal-muted)'
    return v >= 0 ? 'var(--color-terminal-up)' : 'var(--color-terminal-down)'
  }

  // Commit sparkline using Unicode block chars
  const sparkline = (data: number[]): string => {
    if (!data || data.length === 0) return ''
    const max = Math.max(...data, 1)
    const blocks = ['\u2581', '\u2582', '\u2583', '\u2584', '\u2585', '\u2586', '\u2587', '\u2588']
    return data.map(v => blocks[Math.min(Math.floor((v / max) * 7), 7)]).join('')
  }

  // Array/list renderer for pillar data
  const listField = (label: string, field: UnifiedProjectField<string[] | null>, itemColor?: string): React.ReactNode => {
    if (!field.value || field.value.length === 0) return null
    return (
      <div style={{ padding: '2px 10px' }}>
        <div style={{ color: 'var(--color-terminal-muted)', fontSize: '12px', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', marginBottom: '2px' }}>
          {label}{sourceBadge(field.source)}
        </div>
        {field.value.map((item, i) => (
          <div key={i} style={{ color: itemColor ?? 'var(--color-terminal-text)', fontSize: '12px', fontFamily: 'var(--font-mono)', padding: '1px 0', opacity: 0.9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {String.fromCharCode(0x25AA)} {item}
          </div>
        ))}
      </div>
    )
  }

  // Pillar score badge
  const pillarScore = (field: UnifiedProjectField<string | null>): React.ReactNode => {
    if (!field.value) return null
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '2px 10px' }}>
        <span style={{ fontSize: '12px', padding: '2px 8px', background: 'var(--color-terminal-amber)11', border: '1px solid var(--color-terminal-amber)44', color: 'var(--color-terminal-amber)', fontWeight: 'bold', fontFamily: 'var(--font-mono)' }}>
          SCORE: {field.value}
        </span>
      </div>
    )
  }

  // Text block for long-form fields
  const textBlock = (field: UnifiedProjectField<string | null>, borderColor?: string): React.ReactNode => {
    if (!field.value) return null
    return (
      <div style={{ padding: '4px 10px', color: 'var(--color-terminal-text)', fontSize: '12px', fontFamily: 'var(--font-mono)', lineHeight: '1.5', opacity: 0.85, ...(borderColor ? { borderLeft: `2px solid ${borderColor}`, marginLeft: '8px', marginRight: '8px' } : {}) }}>
        {sourceBadge(field.source)} {field.value}
      </div>
    )
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden', fontFamily: 'var(--font-mono)' }}>

      {/* ── DISCOVER BUTTON — always visible at top ── */}
      <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--color-terminal-border)', flexShrink: 0 }}>
        <button
          onClick={() => discover(agentModelMap?.['discovery'] || 'opencode/big-pickle')}
          disabled={discovering}
          style={{
            width: '100%',
            background: discovering ? 'var(--color-terminal-surface)' : (u.hasAiData ? 'transparent' : 'var(--color-terminal-amber)'),
            color: discovering ? 'var(--color-terminal-dim)' : (u.hasAiData ? 'var(--color-terminal-amber)' : '#000'),
            border: u.hasAiData ? `1px solid ${discovering ? 'var(--color-terminal-border)' : 'var(--color-terminal-amber)44'}` : 'none',
            padding: '5px 12px',
            fontSize: '12px',
            fontWeight: 'bold',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.1em',
            cursor: discovering ? 'wait' : 'pointer',
          }}
        >
          {discovering ? `AGENT RESEARCHING... ${discoveryElapsed}s` : (u.hasAiData ? `RE-DISCOVER ${base}` : `DISCOVER ${base} VIA AI AGENT`)}
        </button>
        <div style={{ fontSize: '11px', color: 'var(--color-terminal-dim)', marginTop: '2px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
          {discovering ? 'Worker running off-thread — UI stays responsive' : 'Uses web search + blockchain explorers to find project data'}
        </div>
        {discovering && (
          <button
            onClick={() => cancelDiscovery()}
            style={{
              width: '100%',
              background: 'transparent',
              color: 'var(--color-terminal-down)',
              border: '1px solid var(--color-terminal-down)44',
              padding: '4px 12px',
              fontSize: '11px',
              fontWeight: 'bold',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.1em',
              cursor: 'pointer',
              marginTop: '4px',
            }}
          >
            CANCEL DISCOVERY
          </button>
        )}
        {discovering && discoveryLogs.length > 0 && (
          <div style={{
            width: '100%',
            maxHeight: '200px',
            overflow: 'auto',
            marginTop: '8px',
            background: 'var(--color-terminal-bg)',
            border: '1px solid var(--color-terminal-border)',
            padding: '6px 8px',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            lineHeight: '1.5',
            color: 'var(--color-terminal-muted)',
          }}>
            {discoveryLogs.map((line, i) => (
              <div key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: line.includes('\u2713') ? 'var(--color-terminal-up)' : line.includes('ERROR') || line.includes('[stderr]') ? 'var(--color-terminal-down)' : line.includes('\u25b6') ? 'var(--color-terminal-amber)' : 'var(--color-terminal-dim)' }}>
                {line}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── ASSET IDENTITY ── */}
      <div style={sectionHeader(`${base} \u2014 PROJECT OVERVIEW`, 'var(--color-terminal-amber)')}>
        {base} {String.fromCharCode(0x2014)} PROJECT OVERVIEW
      </div>
      {u.description.value && (
        <div style={{ padding: '4px 10px', color: 'var(--color-terminal-text)', fontSize: '13px', lineHeight: '1.5', opacity: 0.85 }}>
          {u.description.value.slice(0, 300)}{u.description.value.length > 300 ? '...' : ''}
          {sourceBadge(u.description.source)}
        </div>
      )}
      {u.categories.value.length > 0 && (
        <div style={{ padding: '2px 10px', display: 'flex', flexWrap: 'wrap', gap: '3px', alignItems: 'center' }}>
          {u.categories.value.map(cat => (
            <span key={cat} style={{ fontSize: '11px', padding: '1px 5px', background: 'var(--color-terminal-surface)', border: '1px solid var(--color-terminal-border)', color: 'var(--color-terminal-blue)' }}>{cat}</span>
          ))}
          {sourceBadge(u.categories.source)}
        </div>
      )}
      {uRow('Website', u.website)}
      {uRow('Twitter', u.twitter)}
      {uRow('GitHub', u.github)}
      {uRow('Discord', u.discord)}
      {uRow('Telegram', u.telegram)}
      {uRow('Genesis', u.genesisDate)}

      {/* ══════ PILLAR 1: TEAM SURVIVAL FITNESS ══════ */}
      <div style={sectionHeader('1 \u25B8 TEAM SURVIVAL FITNESS', '#5b9bd5')}>
        1 {String.fromCharCode(0x25B8)} TEAM SURVIVAL FITNESS
      </div>
      {listField('Founders', u.founders)}
      {uRow('Team Size', u.teamSize)}
      {textBlock(u.teamBackground)}
      {listField('Funding Rounds', u.fundingRounds)}
      {uRow('Total Funding', u.totalFunding)}
      {listField('Investors', u.investors)}
      {uRow('Treasury', u.treasury)}
      {uRow('Team Activity', u.teamActivity)}
      {uRow('Commits (4w)', u.commitCount4Weeks, (v) => v !== null ? fmtNum(v) : '\u2014', u.commitCount4Weeks.value !== null ? (u.commitCount4Weeks.value > 20 ? 'var(--color-terminal-up)' : u.commitCount4Weeks.value > 5 ? 'var(--color-terminal-amber)' : 'var(--color-terminal-down)') : undefined)}
      {u.commitActivitySeries.value.length > 0 && (
        <div style={{ padding: '2px 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: 'var(--color-terminal-muted)', fontSize: '12px' }}>28d Activity</span>
          {sourceBadge(u.commitActivitySeries.source)}
          <span style={{ color: 'var(--color-terminal-blue)', fontSize: '13px', letterSpacing: '1px', fontFamily: 'var(--font-mono)' }}>{sparkline(u.commitActivitySeries.value)}</span>
        </div>
      )}
      {uRow('PRs Merged', u.pullRequestsMerged, (v) => v !== null ? fmtNum(v) : '\u2014')}
      {uRow('PR Contributors', u.pullRequestContributors, (v) => v !== null ? fmtNum(v) : '\u2014')}
      {u.codeAdditions4Weeks.value !== null && u.codeDeletions4Weeks.value !== null && (
        uRow('Code +/-', u.codeAdditions4Weeks, () => `+${(u.codeAdditions4Weeks.value ?? 0).toLocaleString()} / -${(u.codeDeletions4Weeks.value ?? 0).toLocaleString()}`)
      )}
      {u.issuesClosed.value !== null && u.issuesTotal.value !== null && (
        uRow('Issues Closed/Total', u.issuesClosed, () => `${(u.issuesClosed.value ?? 0).toLocaleString()} / ${(u.issuesTotal.value ?? 0).toLocaleString()}`)
      )}
      {uRow('GitHub Stars', u.githubStars, (v) => v !== null ? fmtNum(v) : '\u2014')}
      {uRow('GitHub Forks', u.githubForks, (v) => v !== null ? fmtNum(v) : '\u2014')}
      {pillarScore(u.pillar1Score)}

      {/* ══════ PILLAR 2: NARRATIVE ALIGNMENT ══════ */}
      <div style={sectionHeader('2 \u25B8 NARRATIVE ALIGNMENT', '#6aa84f')}>
        2 {String.fromCharCode(0x25B8)} NARRATIVE ALIGNMENT
      </div>
      {u.categories.value.length > 0 && (
        <div style={{ padding: '4px 10px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {u.categories.value.map(cat => {
              const hotNarratives = ['Artificial Intelligence', 'AI', 'DePIN', 'Real World Assets', 'RWA', 'Layer 1', 'Layer 2', 'DeFi', 'Gaming', 'Privacy', 'Infrastructure', 'Interoperability']
              const isHot = hotNarratives.some(h => cat.toLowerCase().includes(h.toLowerCase()))
              return (
                <span key={cat} style={{ fontSize: '12px', padding: '2px 6px', background: isHot ? 'var(--color-terminal-up)11' : 'var(--color-terminal-surface)', border: `1px solid ${isHot ? 'var(--color-terminal-up)' : 'var(--color-terminal-border)'}`, color: isHot ? 'var(--color-terminal-up)' : 'var(--color-terminal-muted)', fontWeight: isHot ? 'bold' : 'normal' }}>
                  {cat}
                </span>
              )
            })}
          </div>
        </div>
      )}
      {uRow('Ecosystem', u.ecosystem)}
      {uRow('Narrative Strength', u.narrativeStrength)}
      {uRow('USP', u.uniqueSellingPoint)}
      {listField('Competitors', u.competitors)}
      {listField('Partnerships', u.partnerships)}
      {uRow('Adoption Signals', u.adoptionSignals)}
      {uRow('Sentiment Up', u.sentimentUp, (v) => v !== null ? `${v.toFixed(0)}%` : '\u2014', u.sentimentUp.value !== null ? (u.sentimentUp.value > 60 ? 'var(--color-terminal-up)' : u.sentimentUp.value < 40 ? 'var(--color-terminal-down)' : 'var(--color-terminal-amber)') : undefined)}
      {uRow('Sentiment Down', u.sentimentDown, (v) => v !== null ? `${v.toFixed(0)}%` : '\u2014', u.sentimentDown.value !== null && u.sentimentDown.value > 40 ? 'var(--color-terminal-down)' : 'var(--color-terminal-muted)')}
      {uRow('Twitter Followers', u.twitterFollowers, (v) => v !== null ? fmtNum(v) : '\u2014')}
      {uRow('Reddit Subscribers', u.redditSubscribers, (v) => v !== null ? fmtNum(v) : '\u2014')}
      {uRow('Telegram Users', u.telegramUsers, (v) => v !== null ? fmtNum(v) : '\u2014')}
      {pillarScore(u.pillar2Score)}

      {/* ══════ PILLAR 3: ECONOMIC MOAT ══════ */}
      <div style={sectionHeader('3 \u25B8 ECONOMIC MOAT', '#e69138')}>
        3 {String.fromCharCode(0x25B8)} ECONOMIC MOAT
      </div>
      {uRow('Token Type', u.tokenType)}
      {uRow('Total Supply', u.totalSupply)}
      {uRow('Circulating', u.circulatingSupply)}
      {uRow('Max Supply', u.maxSupply)}
      {uRow('Market Cap', u.marketCap)}
      {uRow('FDV', u.fdv)}
      {uRow('Protocol', u.protocolName)}
      {uRow('Category', u.protocolCategory)}
      {uRow('TVL', u.tvl)}
      {uRow('TVL 24h', u.tvlChange24h, (v) => v !== null ? fmtPct(v) : '\u2014', u.tvlChange24h.value !== null ? changeColor(u.tvlChange24h.value) : undefined)}
      {uRow('TVL 7d', u.tvlChange7d, (v) => v !== null ? fmtPct(v) : '\u2014', u.tvlChange7d.value !== null ? changeColor(u.tvlChange7d.value) : undefined)}
      {uRow('MCap/TVL', u.mcapToTvl, (v) => v !== null ? v.toFixed(2) + 'x' : '\u2014')}
      {u.chains.value.length > 0 && uRow('Chains', u.chains, (v) => v.join(', '))}
      {uRow('Chain TVL', u.chainTvl, (v) => v !== null ? fmtUsd(v) : '\u2014')}
      {uRow('Revenue Model', u.revenueModel)}
      {textBlock(u.moatDescription)}
      {uRow('Mainnet', u.mainnetLaunched)}
      {uRow('Audited', u.audited)}
      {uRow('Audit Details', u.auditDetails)}
      {pillarScore(u.pillar3Score)}

      {/* ══════ PILLAR 4: VALUATION & ACCUMULATION ══════ */}
      <div style={sectionHeader('4 \u25B8 VALUATION & ACCUMULATION', '#8e7cc3')}>
        4 {String.fromCharCode(0x25B8)} VALUATION & ACCUMULATION
      </div>
      {uRow('Fees 24h', u.fees24h, (v) => v !== null ? fmtUsd(v) : '\u2014')}
      {uRow('Fees 7d', u.fees7d, (v) => v !== null ? fmtUsd(v) : '\u2014')}
      {uRow('Fees 30d', u.fees30d, (v) => v !== null ? fmtUsd(v) : '\u2014')}
      {uRow('Revenue 24h', u.revenue24h, (v) => v !== null ? fmtUsd(v) : '\u2014')}
      {uRow('Revenue 7d', u.revenue7d, (v) => v !== null ? fmtUsd(v) : '\u2014')}
      {uRow('Revenue 30d', u.revenue30d, (v) => v !== null ? fmtUsd(v) : '\u2014')}
      {uRow('Current Price', u.currentPrice)}
      {uRow('All-Time High', u.allTimeHigh)}
      {uRow('All-Time Low', u.allTimeLow)}
      {uRow('Price from ATH', u.priceFromATH)}
      {uRow('Vesting Schedule', u.vestingSchedule)}
      {uRow('Inflation Rate', u.inflationRate)}
      {uRow('Staking Yield', u.stakingYield)}
      {textBlock(u.valuationNotes)}
      {pillarScore(u.pillar4Score)}

      {/* ══════ ON-CHAIN ACTIVITY ══════ */}
      {(u.contractAddress.value || u.holderCount.value || u.onChainSummary.value) && (
        <>
          <div style={sectionHeader('ON-CHAIN ACTIVITY', '#e06666')}>
            ON-CHAIN ACTIVITY
          </div>
          {uRow('Chain', u.chain)}
          {uRow('Contract', u.contractAddress)}
          {uRow('Holders', u.holderCount)}
          {uRow('Active Addr 24h', u.activeAddresses24h)}
          {uRow('Whale Activity', u.largeTransactions)}
          {listField('Top Holders', u.topHolders)}
          {textBlock(u.onChainSummary)}
        </>
      )}

      {/* ══════ RISKS & NEWS ══════ */}
      {(u.risks.value && u.risks.value.length > 0) || (u.recentNews.value && u.recentNews.value.length > 0) ? (
        <>
          <div style={sectionHeader('RISKS & NEWS', '#cc0000')}>
            RISKS & NEWS
          </div>
          {u.risks.value && u.risks.value.length > 0 && (
            <div style={{ padding: '4px 10px' }}>
              <div style={{ color: 'var(--color-terminal-down)', fontSize: '12px', fontFamily: 'var(--font-mono)', fontWeight: 'bold', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                RISKS{sourceBadge(u.risks.source)}
              </div>
              {u.risks.value.map((r, i) => (
                <div key={i} style={{ color: 'var(--color-terminal-text)', fontSize: '12px', fontFamily: 'var(--font-mono)', padding: '1px 0', lineHeight: '1.4', opacity: 0.9 }}>
                  {String.fromCharCode(0x25AA)} {r}
                </div>
              ))}
            </div>
          )}
          {u.recentNews.value && u.recentNews.value.length > 0 && (
            <div style={{ padding: '4px 10px' }}>
              <div style={{ color: 'var(--color-terminal-blue)', fontSize: '12px', fontFamily: 'var(--font-mono)', fontWeight: 'bold', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                RECENT NEWS{sourceBadge(u.recentNews.source)}
              </div>
              {u.recentNews.value.map((n, i) => (
                <div key={i} style={{ color: 'var(--color-terminal-text)', fontSize: '12px', fontFamily: 'var(--font-mono)', padding: '1px 0', lineHeight: '1.4', opacity: 0.9 }}>
                  {String.fromCharCode(0x25AA)} {n}
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}

      {/* ══════ AI ASSESSMENT ══════ */}
      {u.aiSummary.value && (
        <>
          <div style={sectionHeader('AI ASSESSMENT', 'var(--color-terminal-amber)')}>
            AI ASSESSMENT
          </div>
          <div style={{ padding: '6px 10px', color: 'var(--color-terminal-text)', fontSize: '13px', fontFamily: 'var(--font-mono)', lineHeight: '1.6', opacity: 0.9, borderLeft: '2px solid var(--color-terminal-amber)', marginLeft: '8px', marginRight: '8px' }}>
            {u.aiSummary.value}
          </div>
        </>
      )}

      {/* ══════ SOURCES ══════ */}
      {u.sourcesUsed.length > 0 && (
        <div style={{ padding: '4px 10px' }}>
          <div style={{ color: 'var(--color-terminal-dim)', fontSize: '11px', fontFamily: 'var(--font-mono)', marginBottom: '2px' }}>SOURCES ({u.sourcesUsed.length})</div>
          {u.sourcesUsed.filter(s => !s.startsWith('search:')).slice(0, 10).map((s, i) => (
            <div key={i} style={{ color: 'var(--color-terminal-blue)', fontSize: '11px', fontFamily: 'var(--font-mono)', padding: '1px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.7 }}>
              {s}
            </div>
          ))}
        </div>
      )}
      {u.discoveredAt && (
        <div style={{ padding: '2px 10px', color: 'var(--color-terminal-dim)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
          Discovered {new Date(u.discoveredAt).toLocaleString()}
        </div>
      )}

      {/* Bottom spacer */}
      <div style={{ height: '12px', flexShrink: 0 }} />
    </div>
  )
}
