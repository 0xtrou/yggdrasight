/**
 * Global Discovery Response Parsers
 *
 * Parse structured JSON output from the master planner, discovery agents, and synthesizer.
 * Follows the same robust extraction pattern as classification/parsers.ts.
 */

import type { IGlobalDiscoveredProject } from '../models/global-discovery-job.model'

// ── Generic JSON extraction (same as classification parsers) ──────────────────

function extractFirstJson(text: string): Record<string, unknown> | null {
  // Try direct parse
  try { return JSON.parse(text) } catch { /* nope */ }

  // Try code block extraction
  const jsonBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (jsonBlockMatch) {
    try { return JSON.parse(jsonBlockMatch[1]!) } catch { /* nope */ }
  }

  // Try finding a JSON object with a known key
  const knownKeys = [
    'search_assignments', 'global_direction', 'priority_sectors', 'gaps_in_coverage',
    'agent_id', 'projects', 'sector_summary', 'notable_trends',
    'marketDirection', 'crossPillarInsights', 'emergingTrends', 'executiveSummary',
    'newProjects',
  ]
  for (const key of knownKeys) {
    const regex = new RegExp(`\\{[\\s\\S]*"${key}"[\\s\\S]*\\}`)
    const match = text.match(regex)
    if (match) {
      try { return JSON.parse(match[0]) } catch {
        // Try progressive truncation
        const str = match[0]
        for (let end = str.length; end > 50; end--) {
          try { return JSON.parse(str.substring(0, end) + '}') } catch { continue }
        }
      }
    }
  }

  return null
}

// ── Type guards & validators ────────────────────────────────────────────────

function isValidCategory(n: unknown): n is number {
  return typeof n === 'number' && n >= 1 && n <= 6 && Number.isInteger(n)
}

function isValidCrack(n: unknown): n is number {
  return typeof n === 'number' && n >= 1 && n <= 9 && Number.isInteger(n)
}

function clamp01(n: unknown): number {
  if (typeof n !== 'number' || isNaN(n)) return 0.5
  return Math.min(1, Math.max(0, n))
}

function ensureStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return []
  return val.filter((v): v is string => typeof v === 'string')
}

function ensureString(val: unknown, fallback: string = ''): string {
  return typeof val === 'string' ? val : fallback
}

// ── Master Planner Parser ───────────────────────────────────────────────────

export interface MasterPlanResult {
  search_assignments: Array<{
    agent_id: string
    focus_area: string
    search_queries: string[]
    sectors_to_explore: string[]
    avoid_projects: string[]
  }>
  global_direction: string
  priority_sectors: string[]
  gaps_in_coverage: string[]
}

export function parseMasterPlan(text: string): MasterPlanResult | null {
  const raw = extractFirstJson(text)
  if (!raw) return null

  const assignments = Array.isArray(raw.search_assignments) ? raw.search_assignments : []
  if (assignments.length === 0) return null

  const parsedAssignments = assignments
    .filter((a: unknown): a is Record<string, unknown> => typeof a === 'object' && a !== null)
    .map((a: Record<string, unknown>) => ({
      agent_id: ensureString(a.agent_id, `agent_${Math.random().toString(36).slice(2, 6)}`),
      focus_area: ensureString(a.focus_area, 'General crypto landscape exploration'),
      search_queries: ensureStringArray(a.search_queries),
      sectors_to_explore: ensureStringArray(a.sectors_to_explore),
      avoid_projects: ensureStringArray(a.avoid_projects),
    }))

  if (parsedAssignments.length === 0) return null

  return {
    search_assignments: parsedAssignments,
    global_direction: ensureString(raw.global_direction, 'No direction assessment provided'),
    priority_sectors: ensureStringArray(raw.priority_sectors),
    gaps_in_coverage: ensureStringArray(raw.gaps_in_coverage),
  }
}

// ── Discovery Agent Parser ──────────────────────────────────────────────────

export interface DiscoveryAgentResult {
  agent_id: string
  projects: IGlobalDiscoveredProject[]
  sector_summary: string
  notable_trends: string[]
}

function parseProject(raw: Record<string, unknown>): IGlobalDiscoveredProject | null {
  const name = ensureString(raw.name)
  if (!name) return null

  const categoryWeights = Array.isArray(raw.categoryWeights)
    ? (raw.categoryWeights as Array<Record<string, unknown>>)
        .filter(c => typeof c === 'object' && c !== null)
        .map(c => ({
          category: isValidCategory(c.category) ? (c.category as number) : 4,
          weight: clamp01(c.weight),
        }))
        .filter(c => c.weight > 0)
    : null

  return {
    name,
    symbol: typeof raw.symbol === 'string' ? raw.symbol : null,
    description: ensureString(raw.description, 'No description provided'),
    primaryCategory: isValidCategory(raw.primaryCategory) ? (raw.primaryCategory as number) : null,
    categoryWeights: categoryWeights && categoryWeights.length > 0 ? categoryWeights : null,
    crackAlignment: Array.isArray(raw.crackAlignment)
      ? (raw.crackAlignment as unknown[]).filter(isValidCrack)
      : [],
    discoveryReason: ensureString(raw.discoveryReason, 'Discovered during global scan'),
    sector: typeof raw.sector === 'string' ? raw.sector : null,
    launchDate: typeof raw.launchDate === 'string' ? raw.launchDate : null,
    sources: ensureStringArray(raw.sources),
    signalStrength: clamp01(raw.signalStrength),
    logoUrl: typeof raw.logoUrl === 'string' && raw.logoUrl.startsWith('http') ? raw.logoUrl : null,
    marketCap: typeof raw.marketCap === 'number' ? raw.marketCap : null,
    volume24h: typeof raw.volume24h === 'number' ? raw.volume24h : null,
    websiteUrl: typeof raw.websiteUrl === 'string' && raw.websiteUrl.startsWith('http') ? raw.websiteUrl : null,
  }
}

export function parseDiscoveryAgent(text: string): DiscoveryAgentResult | null {
  const raw = extractFirstJson(text)
  if (!raw) return null

  const rawProjects = Array.isArray(raw.projects) ? raw.projects : []
  const projects = rawProjects
    .filter((p: unknown): p is Record<string, unknown> => typeof p === 'object' && p !== null)
    .map(parseProject)
    .filter((p): p is IGlobalDiscoveredProject => p !== null)

  return {
    agent_id: ensureString(raw.agent_id, 'unknown_agent'),
    projects,
    sector_summary: ensureString(raw.sector_summary, 'No sector summary provided'),
    notable_trends: ensureStringArray(raw.notable_trends),
  }
}

// ── Synthesizer Parser ──────────────────────────────────────────────────────

export interface SynthesizerResult {
  projects: IGlobalDiscoveredProject[]
  newProjects: IGlobalDiscoveredProject[]
  marketDirection: string | null
  crossPillarInsights: string | null
  emergingTrends: string[]
  executiveSummary: string
}

export function parseSynthesizerResult(text: string): SynthesizerResult | null {
  const raw = extractFirstJson(text)
  if (!raw) return null

  const parseProjectArray = (arr: unknown): IGlobalDiscoveredProject[] => {
    if (!Array.isArray(arr)) return []
    return arr
      .filter((p: unknown): p is Record<string, unknown> => typeof p === 'object' && p !== null)
      .map(parseProject)
      .filter((p): p is IGlobalDiscoveredProject => p !== null)
  }

  const projects = parseProjectArray(raw.projects)
  const newProjects = parseProjectArray(raw.newProjects)

  const executiveSummary = ensureString(raw.executiveSummary)
  if (!executiveSummary && projects.length === 0) return null

  return {
    projects,
    newProjects,
    marketDirection: typeof raw.marketDirection === 'string' ? raw.marketDirection : null,
    crossPillarInsights: typeof raw.crossPillarInsights === 'string' ? raw.crossPillarInsights : null,
    emergingTrends: ensureStringArray(raw.emergingTrends),
    executiveSummary: executiveSummary || 'No executive summary provided',
  }
}
