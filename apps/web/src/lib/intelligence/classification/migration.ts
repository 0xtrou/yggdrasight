/**
 * Migration Detector
 *
 * Pure TypeScript module that compares classification snapshots over time
 * to detect category migrations — the highest-value intelligence signal.
 *
 * Key migrations (from the framework):
 *   Cat 4 → Cat 1: Narrative vessel discovers a real crack (highest value)
 *   Cat 4 → Cat 2: Narrative vessel becomes infrastructure (high value)
 *   Cat 3 → Cat 2: Mirror builder transcends mirroring (high value)
 *   Cat 1 → Cat 5: Crack expander centralizes (warning signal)
 *   Cat 6 → Cat 1: Consciousness seed finds its crack (validation)
 */

import type {
  ClassificationCategory,
  CategoryWeight,
  CategoryMigration,
} from './types'
import { CATEGORY_NAMES, MIGRATION_PATTERNS } from './types'

// ── Snapshot interface (matches MongoDB document) ───────────────────────────

interface SnapshotForComparison {
  symbol: string
  primaryCategory: number
  categoryWeights: Array<{ category: number; weight: number }>
  classifiedAt: Date | string
}

// ── Core detection ──────────────────────────────────────────────────────────

/**
 * Compare two snapshots and detect if a meaningful migration occurred.
 * Returns null if no significant migration detected.
 */
export function detectMigration(
  older: SnapshotForComparison,
  newer: SnapshotForComparison,
): CategoryMigration | null {
  if (older.symbol !== newer.symbol) return null
  if (older.primaryCategory === newer.primaryCategory) {
    // Same primary — check if weights shifted significantly
    const drift = computeWeightDrift(older.categoryWeights, newer.categoryWeights)
    if (drift < 0.2) return null // Not significant enough
  }

  const fromPrimary = older.primaryCategory as ClassificationCategory
  const toPrimary = newer.primaryCategory as ClassificationCategory
  const drift = computeWeightDrift(older.categoryWeights, newer.categoryWeights)

  // Only report if drift is meaningful (>0.15) or primary changed
  if (drift < 0.15 && fromPrimary === toPrimary) return null

  const migrationType = classifyMigration(fromPrimary, toPrimary)
  const significance = describeMigration(fromPrimary, toPrimary, drift)

  return {
    symbol: newer.symbol,
    from_primary: fromPrimary,
    to_primary: toPrimary,
    from_weights: older.categoryWeights.map(w => ({
      category: w.category as ClassificationCategory,
      weight: w.weight,
      reasoning: '',
    })),
    to_weights: newer.categoryWeights.map(w => ({
      category: w.category as ClassificationCategory,
      weight: w.weight,
      reasoning: '',
    })),
    drift_magnitude: drift,
    migration_type: migrationType,
    significance,
    detected_at: new Date().toISOString(),
    snapshot_from: new Date(older.classifiedAt).toISOString(),
    snapshot_to: new Date(newer.classifiedAt).toISOString(),
  }
}

/**
 * Detect migrations across a series of snapshots for one symbol.
 * Returns all detected migrations, sorted by significance.
 */
export function detectMigrationsInSeries(
  snapshots: SnapshotForComparison[],
): CategoryMigration[] {
  if (snapshots.length < 2) return []

  // Sort by date ascending
  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.classifiedAt).getTime() - new Date(b.classifiedAt).getTime()
  )

  const migrations: CategoryMigration[] = []

  // Compare consecutive snapshots
  for (let i = 1; i < sorted.length; i++) {
    const migration = detectMigration(sorted[i - 1]!, sorted[i]!)
    if (migration) {
      migrations.push(migration)
    }
  }

  // Also compare first and last for long-term trajectory
  if (sorted.length > 2) {
    const longTermMigration = detectMigration(sorted[0]!, sorted[sorted.length - 1]!)
    if (longTermMigration) {
      longTermMigration.significance = `[LONG-TERM] ${longTermMigration.significance}`
      migrations.push(longTermMigration)
    }
  }

  // Sort by drift magnitude (most significant first)
  return migrations.sort((a, b) => b.drift_magnitude - a.drift_magnitude)
}

// ── Weight drift computation ────────────────────────────────────────────────

/**
 * Compute how much the category weights shifted between two snapshots.
 * Returns a value between 0 (identical) and 1 (completely different).
 */
function computeWeightDrift(
  from: Array<{ category: number; weight: number }>,
  to: Array<{ category: number; weight: number }>,
): number {
  const fromMap = new Map(from.map(w => [w.category, w.weight]))
  const toMap = new Map(to.map(w => [w.category, w.weight]))

  // All categories that appear in either snapshot
  const allCategories = new Set([...fromMap.keys(), ...toMap.keys()])

  let totalDiff = 0
  for (const cat of allCategories) {
    const fromWeight = fromMap.get(cat) ?? 0
    const toWeight = toMap.get(cat) ?? 0
    totalDiff += Math.abs(toWeight - fromWeight)
  }

  // Normalize: max possible drift is 2.0 (from [1,0,0,...] to [0,1,0,...])
  return Math.min(1, totalDiff / 2)
}

// ── Migration classification ────────────────────────────────────────────────

function classifyMigration(
  from: ClassificationCategory,
  to: ClassificationCategory,
): 'upgrade' | 'downgrade' | 'lateral' | 'evolution' {
  // Check against known patterns
  for (const pattern of Object.values(MIGRATION_PATTERNS)) {
    if (pattern.from === from && pattern.to === to) {
      return pattern.type
    }
  }

  // Heuristic classification for other migrations
  // Broadly: moving toward Cat 1, 2, 6 = good; toward Cat 4, 5 = concerning
  const upgradeTargets: ClassificationCategory[] = [1, 2, 6]
  const downgradeTargets: ClassificationCategory[] = [4, 5]

  if (upgradeTargets.includes(to) && !upgradeTargets.includes(from)) return 'upgrade'
  if (downgradeTargets.includes(to) && !downgradeTargets.includes(from)) return 'downgrade'
  if (from === to) return 'lateral'
  return 'evolution'
}

function describeMigration(
  from: ClassificationCategory,
  to: ClassificationCategory,
  drift: number,
): string {
  const fromName = CATEGORY_NAMES[from]
  const toName = CATEGORY_NAMES[to]

  if (from === to) {
    return `Weight distribution shifting within ${fromName} (drift: ${(drift * 100).toFixed(0)}%)`
  }

  // Check known patterns for specific descriptions
  for (const [key, pattern] of Object.entries(MIGRATION_PATTERNS)) {
    if (pattern.from === from && pattern.to === to) {
      switch (key) {
        case 'NARRATIVE_TO_CRACK':
          return `HIGHEST VALUE: ${fromName} → ${toName}. Project discovered a real crack. Narrative vessel becoming genuine infrastructure.`
        case 'NARRATIVE_TO_INFRA':
          return `HIGH VALUE: ${fromName} → ${toName}. Project transitioning from narrative play to invisible infrastructure.`
        case 'MIRROR_TO_INFRA':
          return `HIGH VALUE: ${fromName} → ${toName}. Mirror builder transcending the mirror. Moving beyond reflection into native function.`
        case 'CRACK_TO_EGO':
          return `WARNING: ${fromName} → ${toName}. Crack expander is centralizing. Once-distributed power is concentrating.`
        case 'SEED_TO_CRACK':
          return `HIGH VALUE: ${fromName} → ${toName}. Consciousness seed found its crack. The unrecognized problem is being recognized.`
      }
    }
  }

  // Generic description
  return `Migration: ${fromName} → ${toName} (drift: ${(drift * 100).toFixed(0)}%)`
}
