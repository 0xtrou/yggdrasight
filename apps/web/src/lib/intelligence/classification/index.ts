export type {
  ClassificationCategory,
  CrackId,
  CrackMappingResult,
  VisibilityResult,
  NarrativeSeparatorResult,
  PowerVectorResult,
  ProblemRecognitionResult,
  IdentityPolarityResult,
  CategoryWeight,
  ClassificationResult,
  AgentType,
  SubAgentResult,
  ClassificationSnapshot,
  CategoryMigration,
} from './types'

export { CATEGORY_NAMES, CRACK_NAMES, MIGRATION_PATTERNS } from './types'

export { runTypeSafeClassification } from './typesafe-classifier'

export {
  detectMigration,
  detectMigrationsInSeries,
} from './migration'
