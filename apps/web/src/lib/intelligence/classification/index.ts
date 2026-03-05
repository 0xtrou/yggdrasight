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

export {
  buildCrackMappingPrompt,
  buildVisibilityPrompt,
  buildNarrativeSeparatorPrompt,
  buildPowerVectorPrompt,
  buildProblemRecognitionPrompt,
  buildIdentityPolarityPrompt,
  buildSynthesizerPrompt,
  AGENT_PROMPT_BUILDERS,
} from './prompts'
export type { ClassificationAgentType } from './prompts'

export {
  parseCrackMapping,
  parseVisibility,
  parseNarrativeSeparator,
  parsePowerVector,
  parseProblemRecognition,
  parseIdentityPolarity,
  parseClassificationResult,
  AGENT_PARSERS,
} from './parsers'

export {
  detectMigration,
  detectMigrationsInSeries,
} from './migration'
