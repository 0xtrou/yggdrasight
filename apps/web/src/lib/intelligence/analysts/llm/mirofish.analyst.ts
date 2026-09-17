import { SignalDirection } from '@yggdrasight/core'
import type { Analyst, AnalystMeta, AnalystVerdict, AnalysisContext, Candle, LLMAnalystDefinition } from '../../types'
import { writeFileSync, mkdirSync, existsSync, readdirSync, statSync, readFileSync } from 'fs'
import { resolve, join } from 'path'
import { fetchOHLCV } from '../../../data/ohlcv-provider'

const MIROFISH_WEIGHT = 6.3
const MIROFISH_API = process.env.MIROFISH_BACKEND_URL ?? 'http://mirofish-backend:5001'
const MIROFISH_RESULTS_DIR = resolve(process.cwd(), 'docker', 'mirofish', 'results')
const POLL_INTERVAL_MS = 10_000
const MAX_POLL_ATTEMPTS = 60

export const mirofishDefinition: LLMAnalystDefinition = {
  meta: {
    id: 'mirofish',
    name: 'Mirofish Prediction',
    description: 'Swarm intelligence prediction — spawns AI agent personas on simulated social platforms, runs consensus simulation, extracts crowd-derived price prediction',
    weight: MIROFISH_WEIGHT,
    type: 'llm',
    category: 'mirofish-prediction',
    systemPrompt: '',
    requiredData: ['candles', 'market-global'],
  },
}

async function mfetch(path: string, options?: RequestInit & { timeout?: number }): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options?.timeout ?? 30_000)
  try {
    return await fetch(`${MIROFISH_API}${path}`, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function pollTask(taskId: string, statusPath: string, body?: Record<string, string>): Promise<string> {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
    try {
      const res = body
        ? await mfetch(statusPath, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task_id: taskId, ...body }) })
        : await mfetch(`${statusPath}/${taskId}`)
      const data = await res.json() as { data?: { status?: string } }
      const status = data?.data?.status ?? ''
      console.log(`[mirofish] poll ${statusPath} [${i + 1}/${MAX_POLL_ATTEMPTS}]: ${status}`)
      if (status === 'completed' || status === 'ready') return 'completed'
      if (status === 'failed') return 'failed'
    } catch { }
  }
  return 'timeout'
}

function findRecentResult(symbol: string): { simulationId: string; data: Record<string, unknown> } | null {
  const dir = join(MIROFISH_RESULTS_DIR, 'crypto')
  if (!existsSync(dir)) return null
  try {
    const files = readdirSync(dir).filter(f => f.startsWith('result_') && f.endsWith('.json')).sort((a, b) => {
      try { return statSync(join(dir, b)).mtimeMs - statSync(join(dir, a)).mtimeMs } catch { return 0 }
    })
    for (const file of files) {
      try {
        const raw = JSON.parse(readFileSync(join(dir, file), 'utf-8'))
        const age = Date.now() - new Date(raw.created_at).getTime()
        if (age < 24 * 3600_000 && raw.simulation_id) {
          return { simulationId: raw.simulation_id, data: raw }
        }
      } catch { }
    }
  } catch { }
  return null
}

function buildSeedMaterial(
  ctx: AnalysisContext,
  dailyCandles: Candle[],
  candles: Candle[],
  mg: { btcDominance: number; fearGreedIndex: number; fearGreedLabel: string; totalMarketCap: number; totalMarketCapChange24h: number },
): string {
  const sections: string[] = [`# ${ctx.symbol} — 30-Day Price Analysis & Prediction`]

  if (dailyCandles.length > 2) {
    const currentPrice = dailyCandles[dailyCandles.length - 1].close
    const price7dAgo = dailyCandles[Math.max(0, dailyCandles.length - 8)]?.close ?? currentPrice
    const price14dAgo = dailyCandles[Math.max(0, dailyCandles.length - 15)]?.close ?? currentPrice
    const price30dAgo = dailyCandles[0].close
    const high30d = Math.max(...dailyCandles.map(c => c.close))
    const low30d = Math.min(...dailyCandles.map(c => c.close))
    const change7d = ((currentPrice - price7dAgo) / price7dAgo * 100).toFixed(2)
    const change14d = ((currentPrice - price14dAgo) / price14dAgo * 100).toFixed(2)
    const change30d = ((currentPrice - price30dAgo) / price30dAgo * 100).toFixed(2)
    const distFromHigh = ((currentPrice - high30d) / high30d * 100).toFixed(2)
    const distFromLow = ((currentPrice - low30d) / low30d * 100).toFixed(2)

    const sma7 = dailyCandles.slice(-7).reduce((s, c) => s + c.close, 0) / 7
    const sma14 = dailyCandles.slice(-14).reduce((s, c) => s + c.close, 0) / Math.min(14, dailyCandles.length)
    const sma30 = dailyCandles.reduce((s, c) => s + c.close, 0) / dailyCandles.length
    const trendSma = currentPrice > sma7 && sma7 > sma14 ? 'BULLISH (price > SMA7 > SMA14)' :
      currentPrice < sma7 && sma7 < sma14 ? 'BEARISH (price < SMA7 < SMA14)' : 'MIXED'

    const recentVols = dailyCandles.slice(-7).map(c => c.volume)
    const olderVols = dailyCandles.slice(-14, -7).map(c => c.volume)
    const avgRecentVol = recentVols.length > 0 ? recentVols.reduce((s, v) => s + v, 0) / recentVols.length : 0
    const avgOlderVol = olderVols.length > 0 ? olderVols.reduce((s, v) => s + v, 0) / olderVols.length : 1
    const volChange = avgOlderVol > 0 ? ((avgRecentVol - avgOlderVol) / avgOlderVol * 100).toFixed(1) : '0'

    sections.push(
      '',
      '## 30-Day Price Action (daily)',
      `Current Price: $${currentPrice.toPrecision(6)}`,
      `30-Day High: $${high30d.toPrecision(6)} (${distFromHigh}% from current)`,
      `30-Day Low: $${low30d.toPrecision(6)} (${distFromLow}% from current)`,
      `7-Day Change: ${change7d}%`,
      `14-Day Change: ${change14d}%`,
      `30-Day Change: ${change30d}%`,
      '',
      '## Trend Indicators',
      `SMA7: $${sma7.toPrecision(6)} | SMA14: $${sma14.toPrecision(6)} | SMA30: $${sma30.toPrecision(6)}`,
      `Trend: ${trendSma}`,
      `Volume Trend (7d vs prior 7d): ${volChange}%`,
      '',
      '## Daily Price History (last 30 days)',
      '| Date | Price (USD) | Daily Change |',
      '|------|------------|-------------|',
    )
    for (let i = 1; i < dailyCandles.length; i++) {
      const date = new Date(dailyCandles[i].time * 1000).toISOString().split('T')[0]
      const pct = ((dailyCandles[i].close - dailyCandles[i - 1].close) / dailyCandles[i - 1].close * 100).toFixed(2)
      sections.push(`| ${date} | $${dailyCandles[i].close.toPrecision(6)} | ${pct}% |`)
    }
  } else if (candles.length > 0) {
    const latest = candles[candles.length - 1]
    const earliest = candles[0]
    const change = ((latest.close - earliest.open) / earliest.open * 100).toFixed(2)
    sections.push(
      '',
      '## Price Data (from exchange candles)',
      `Current Price: ${latest.close}`,
      `Period Change: ${change}% (${candles.length} candles)`,
      `Range: ${Math.min(...candles.map(c => c.low))} - ${Math.max(...candles.map(c => c.high))}`,
    )
  }

  sections.push(
    '',
    '## Market Context',
    `Fear & Greed Index: ${mg.fearGreedIndex} (${mg.fearGreedLabel})`,
    `BTC Dominance: ${mg.btcDominance.toFixed(1)}%`,
    `Total Crypto Market Cap 24h Change: ${mg.totalMarketCapChange24h.toFixed(2)}%`,
    '',
    '## Bull Case',
    `- Analyze the 7d/14d/30d price changes above and identify bullish patterns`,
    `- Consider if price is near 30d low (potential reversal) or above moving averages`,
    `- Note if volume is increasing (confirms momentum)`,
    '',
    '## Bear Case',
    `- Analyze if the trend is clearly downward (price < SMA7 < SMA14)`,
    `- Consider if price is near 30d high (potential exhaustion)`,
    `- Note if volume is declining (weakening conviction)`,
    '',
    '## Prediction Question',
    `Based on the 30-day price action, trend indicators, volume, and macro context above:`,
    `Will ${ctx.symbol} price be BULLISH or BEARISH over the next 24-72 hours?`,
    `You MUST pick a side. Neutral is only acceptable if the data genuinely shows zero directional bias.`,
  )

  return sections.join('\n')
}

export const mirofishAnalyst: Analyst = {
  meta: {
    id: 'mirofish',
    name: 'Mirofish Prediction',
    description: 'Swarm intelligence prediction — spawns AI agent personas on simulated social platforms, runs consensus simulation, extracts crowd-derived price prediction',
    weight: MIROFISH_WEIGHT,
  },
  analyze: async (ctx: AnalysisContext): Promise<AnalystVerdict> => {
    const meta: AnalystMeta = mirofishAnalyst.meta
    const startTime = Date.now()

    try {
      const healthRes = await mfetch('/health', { timeout: 5000 }).catch(() => null)
      if (!healthRes?.ok) {
        return { meta, direction: SignalDirection.NEUTRAL, confidence: 0.1, reason: 'Mirofish backend unavailable' }
      }

      const cached = ctx.forceFresh ? null : findRecentResult(ctx.symbol)
      if (cached) {
        console.log(`[mirofish] Found cached result, using report/chat for ${ctx.symbol}`)
        try {
          const chatRes = await mfetch('/api/report/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              simulation_id: cached.simulationId,
              message: `You MUST return a prediction with a clear majority. 50/50 is FORBIDDEN. If the data seems balanced, examine each agent's arguments more carefully — one side always has slightly stronger reasoning. Pick that side and assign it at least 55%.\n\nAnswer EXACTLY:\n1. Bullish percentage (e.g. "65% bullish")\n2. Bearish percentage (e.g. "35% bearish")\n3. Single strongest factor driving the consensus\n\nRules:\n- Bull + Bear percentages MUST sum to 100\n- The majority MUST be at least 55%\n- If truly uncertain, lean toward the side with more agents convinced\n- Be decisive. Indecision is the enemy of good prediction.`,
            }),
            timeout: 60_000,
          })
          if (chatRes.ok) {
            const chatData = await chatRes.json() as { data?: { response?: string } }
            const response = chatData?.data?.response ?? ''
            return parseChatResponse(meta, response, cached.data, startTime)
          }
        } catch { }
      }

      // Full pipeline: ontology → graph → simulation → report → chat
      console.log(`[mirofish] Running full pipeline for ${ctx.symbol}`)

      let candles: Candle[] = []
      let mg = { btcDominance: 0, fearGreedIndex: 0, fearGreedLabel: 'N/A', totalMarketCap: 0, totalMarketCapChange24h: 0 }
      try { candles = await ctx.getCandles(ctx.primaryTimeframe) } catch { }
      try { mg = await ctx.getMarketGlobal() } catch { }

      const dailyCandles = await fetchOHLCV({ symbol: ctx.symbol, interval: '1d', days: 30 })

      if (dailyCandles.length === 0 && candles.length === 0) {
        return { meta, direction: SignalDirection.NEUTRAL, confidence: 0.1, reason: 'No price data available' }
      }

      const seed = buildSeedMaterial(ctx, dailyCandles, candles, mg)

      // Step 1: Generate ontology
      const formData = new FormData()
      formData.append('files', new Blob([seed], { type: 'text/markdown' }), `${ctx.symbol}-seed.md`)
      formData.append('simulation_requirement', `Will ${ctx.symbol} price be bullish, bearish, or neutral over the next 24-72 hours?`)
      formData.append('project_name', `${ctx.symbol}-crypto-prediction`)
      formData.append('additional_context', 'Crypto market price direction prediction using technical and sentiment signals.')

      const ontRes = await mfetch('/api/graph/ontology/generate', { method: 'POST', body: formData, timeout: 120_000 })
      if (!ontRes.ok) return { meta, direction: SignalDirection.NEUTRAL, confidence: 0.1, reason: `Ontology generation failed: HTTP ${ontRes.status}`, indicators: { durationMs: Date.now() - startTime } }
      const ontData = await ontRes.json() as { data?: { project_id?: string } }
      const projectId = ontData?.data?.project_id
      if (!projectId) return { meta, direction: SignalDirection.NEUTRAL, confidence: 0.1, reason: 'No project_id from ontology', indicators: { durationMs: Date.now() - startTime } }
      console.log(`[mirofish] project_id: ${projectId}`)

      // Step 2: Build knowledge graph
      const buildRes = await mfetch('/api/graph/build', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, graph_name: `${ctx.symbol}-graph` }),
        timeout: 60_000,
      })
      if (!buildRes.ok) return { meta, direction: SignalDirection.NEUTRAL, confidence: 0.1, reason: `Graph build failed: HTTP ${buildRes.status}`, indicators: { durationMs: Date.now() - startTime } }
      const buildData = await buildRes.json() as { data?: { task_id?: string } }
      const graphTaskId = buildData?.data?.task_id
      if (graphTaskId) {
        const graphStatus = await pollTask(graphTaskId, '/api/graph/task')
        if (graphStatus !== 'completed') return { meta, direction: SignalDirection.NEUTRAL, confidence: 0.1, reason: `Graph build ${graphStatus}`, indicators: { durationMs: Date.now() - startTime } }
      }

      // Step 3: Create simulation
      const simRes = await mfetch('/api/simulation/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, enable_twitter: true, enable_reddit: true }),
        timeout: 30_000,
      })
      if (!simRes.ok) return { meta, direction: SignalDirection.NEUTRAL, confidence: 0.1, reason: `Simulation create failed: HTTP ${simRes.status}`, indicators: { durationMs: Date.now() - startTime } }
      const simData = await simRes.json() as { data?: { simulation_id?: string } }
      const simId = simData?.data?.simulation_id
      if (!simId) return { meta, direction: SignalDirection.NEUTRAL, confidence: 0.1, reason: 'No simulation_id', indicators: { durationMs: Date.now() - startTime } }
      console.log(`[mirofish] simulation_id: ${simId}`)

      // Step 4: Prepare simulation (generate profiles)
      const prepRes = await mfetch('/api/simulation/prepare', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulation_id: simId, use_llm_for_profiles: true, parallel_profile_count: 5 }),
        timeout: 30_000,
      })
      if (prepRes.ok) {
        const prepData = await prepRes.json() as { data?: { task_id?: string } }
        if (prepData?.data?.task_id) {
          const prepStatus = await pollTask(prepData.data.task_id, '/api/simulation/prepare/status', { simulation_id: simId })
          if (prepStatus !== 'completed') return { meta, direction: SignalDirection.NEUTRAL, confidence: 0.1, reason: `Simulation prepare ${prepStatus}`, indicators: { durationMs: Date.now() - startTime } }
        }
      }

      // Step 5: Run simulation
      await mfetch('/api/simulation/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulation_id: simId, platform: 'parallel', max_rounds: 25, enable_graph_memory_update: true }),
        timeout: 30_000,
      })
      for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
        await new Promise(r => setTimeout(r, 15_000))
        try {
          const statusRes = await mfetch(`/api/simulation/${simId}/run-status`)
          const statusData = await statusRes.json() as { data?: { runner_status?: string; current_round?: number } }
          const st = statusData?.data?.runner_status ?? ''
          console.log(`[mirofish] simulation [${i + 1}]: ${st} round ${statusData?.data?.current_round ?? '?'}/25`)
          if (st === 'completed' || st === 'stopped') break
          if (st === 'failed') return { meta, direction: SignalDirection.NEUTRAL, confidence: 0.1, reason: 'Simulation failed', indicators: { durationMs: Date.now() - startTime } }
        } catch { }
      }

      // Step 6: Generate report
      const rptRes = await mfetch('/api/report/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulation_id: simId }),
        timeout: 30_000,
      })
      if (rptRes.ok) {
        const rptData = await rptRes.json() as { data?: { task_id?: string; report_id?: string } }
        if (rptData?.data?.task_id) {
          const rptStatus = await pollTask(rptData.data.task_id, '/api/report/generate/status', { simulation_id: simId })
          if (rptStatus !== 'completed') console.warn(`[mirofish] Report generation ${rptStatus}`)
        }
      }

      // Step 7: Extract prediction via chat
      const chatRes = await mfetch('/api/report/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          simulation_id: simId,
          message: `You MUST return a prediction with a clear majority. 50/50 is FORBIDDEN. If the data seems balanced, examine each agent's arguments more carefully — one side always has slightly stronger reasoning. Pick that side and assign it at least 55%.\n\nAnswer EXACTLY:\n1. Bullish percentage (e.g. "65% bullish")\n2. Bearish percentage (e.g. "35% bearish")\n3. Single strongest factor driving the consensus\n\nRules:\n- Bull + Bear percentages MUST sum to 100\n- The majority MUST be at least 55%\n- If truly uncertain, lean toward the side with more agents convinced\n- Be decisive. Indecision is the enemy of good prediction.`,
        }),
        timeout: 60_000,
      })

      let chatResponse = ''
      if (chatRes.ok) {
        const chatData = await chatRes.json() as { data?: { response?: string } }
        chatResponse = chatData?.data?.response ?? ''
      }

      // Save result for caching
      try {
        const resultsDir = join(MIROFISH_RESULTS_DIR, 'crypto')
        mkdirSync(resultsDir, { recursive: true })
        const n = readdirSync(resultsDir).filter(f => f.startsWith('result_')).length + 1
        writeFileSync(join(resultsDir, `result_${n}_${simId.slice(-8)}.json`), JSON.stringify({
          id: `result_${n}`,
          category: 'crypto',
          created_at: new Date().toISOString(),
          simulation_id: simId,
          project_id: projectId,
          symbol: ctx.symbol,
        }), 'utf-8')
      } catch { }

      return parseChatResponse(meta, chatResponse, { simulation_id: simId }, startTime)
    } catch (err) {
      return {
        meta,
        direction: SignalDirection.NEUTRAL,
        confidence: 0.1,
        reason: `Mirofish error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        indicators: { durationMs: Date.now() - startTime },
      }
    }
  },
}

function parseChatResponse(meta: AnalystMeta, response: string, rawData: Record<string, unknown>, startTime: number): AnalystVerdict {
  if (!response || response.trim().length === 0) {
    return {
      meta,
      direction: SignalDirection.NEUTRAL,
      confidence: 0.2,
      reason: 'Mirofish returned empty chat response',
      output: '[EMPTY RESPONSE]',
      indicators: { consensusBullPct: 0, consensusBearPct: 0, durationMs: Date.now() - startTime },
    }
  }

  const bullPatterns = [
    /(\d+(?:\.\d+)?)\s*%\s*(?:of\s+\w+\s+)?(?:were\s+)?bullish/i,
    /(\d+(?:\.\d+)?)\s*%\s*(?:bull|bullish)/i,
    /(\d+(?:\.\d+)?)\s+(?:bullish|bull)/i,
    /bull(?:ish)?[:\s]+(\d+(?:\.\d+)?)\s*%/i,
    /bull\s*[:=]\s*(\d+(?:\.\d+)?)/i,
  ]
  const bearPatterns = [
    /(\d+(?:\.\d+)?)\s*%\s*(?:of\s+\w+\s+)?(?:were\s+)?bearish/i,
    /(\d+(?:\.\d+)?)\s*%\s*(?:bear|bearish)/i,
    /(\d+(?:\.\d+)?)\s+(?:bearish|bear)/i,
    /bear(?:ish)?[:\s]+(\d+(?:\.\d+)?)\s*%/i,
    /bear\s*[:=]\s*(\d+(?:\.\d+)?)/i,
  ]

  let bullPct = 0
  let bearPct = 0
  let parseMethod = 'regex'

  // Try standard patterns first
  for (const p of bullPatterns) {
    const m = response.match(p)
    if (m) { bullPct = parseFloat(m[1]); break }
  }
  for (const p of bearPatterns) {
    const m = response.match(p)
    if (m) { bearPct = parseFloat(m[1]); break }
  }

  // Try split format: "55/45", "55-45" near bull/bear keywords
  if (bullPct === 0 && bearPct === 0) {
    const splitMatch = response.match(/(\d+(?:\.\d+)?)\s*[\/\-]\s*(\d+(?:\.\d+)?)/)
    if (splitMatch) {
      const a = parseFloat(splitMatch[1])
      const b = parseFloat(splitMatch[2])
      const lower = response.toLowerCase()
      // If bull mentioned first or more often, first number is bull
      const bullFirst = /bull/i.test(response.split(/[\/\-]/)[0] ?? '')
      if (bullFirst) { bullPct = a; bearPct = b }
      else { bullPct = b; bearPct = a }
      parseMethod = 'split-pattern'
    }
  }

  // Keyword counting fallback — NO 50/50 DEFAULT
  if (bullPct === 0 && bearPct === 0) {
    const lower = response.toLowerCase()
    const bullKw = (lower.match(/bullish|bull case|bull\b/g) ?? []).length
    const bearKw = (lower.match(/bearish|bear case|bear\b/g) ?? []).length
    if (bullKw > bearKw) { bullPct = 60; bearPct = 40; parseMethod = 'keyword-fallback' }
    else if (bearKw > bullKw) { bullPct = 40; bearPct = 60; parseMethod = 'keyword-fallback' }
    else {
      // Cannot parse — return NEUTRAL with very low confidence instead of 50/50
      return {
        meta,
        direction: SignalDirection.NEUTRAL,
        confidence: 0.15,
        reason: 'Could not parse prediction — response was ambiguous or unstructured',
        output: response,
        indicators: { consensusBullPct: 0, consensusBearPct: 0, parseMethod: 'unparseable', durationMs: Date.now() - startTime },
      }
    }
  }

  const total = bullPct + bearPct
  if (total > 0 && (total < 90 || total > 110)) {
    bullPct = Math.round((bullPct / total) * 100)
    bearPct = 100 - bullPct
  }

  let direction: SignalDirection
  let confidence: number

  if (bullPct > bearPct + 5) {
    direction = SignalDirection.LONG
    confidence = Math.min(0.95, Math.max(0.3, bullPct / 100))
  } else if (bearPct > bullPct + 5) {
    direction = SignalDirection.SHORT
    confidence = Math.min(0.95, Math.max(0.3, bearPct / 100))
  } else {
    direction = SignalDirection.NEUTRAL
    confidence = 0.3
  }

  const reasonMatch = response.match(/(?:strongest factor|key factor|driven by|primarily)[:\s]+(.+?)(?:\.|$)/i)
  const factor = reasonMatch?.[1]?.trim() ?? ''
  const methodLabel = parseMethod === 'keyword-fallback' ? ' (estimated from keywords)' : ''
  const reason = `Crowd consensus: ${bullPct.toFixed(0)}% bullish, ${bearPct.toFixed(0)}% bearish.${methodLabel}${factor ? ` Key factor: ${factor}.` : ''}`

  return {
    meta,
    direction,
    confidence,
    reason,
    output: response,
    indicators: {
      consensusBullPct: bullPct,
      consensusBearPct: bearPct,
      parseMethod,
      durationMs: Date.now() - startTime,
    },
  }
}
