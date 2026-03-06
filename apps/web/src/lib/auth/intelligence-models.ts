/**
 * Per-User Intelligence Model Registration
 *
 * Analogous to `getModelsForConnection()` in @oculus/db, but for the
 * intelligence-layer models that live in the web app.
 *
 * Registers all intelligence schemas on a user's Mongoose connection so
 * queries hit that user's dedicated MongoDB instead of the default singleton.
 */
import type mongoose from 'mongoose'

/**
 * Register all intelligence model schemas on a given connection.
 * Returns model constructors scoped to that connection.
 */
export function getIntelligenceModelsForConnection(connection: mongoose.Connection) {
  // Lazy require to avoid circular deps / top-level side-effects
  const {
    ClassificationJobSchema,
    ClassificationSnapshotSchema,
  } = require('../intelligence/models/classification-job.model')

  const {
    DiscoveryJobSchema,
  } = require('../intelligence/models/discovery-job.model')

  const {
    GlobalDiscoveryJobSchema,
    GlobalDiscoveryReportSchema,
  } = require('../intelligence/models/global-discovery-job.model')

  // signal-crawl-job uses an inline schema (not exported as named const),
  // so we reconstruct it here using the same shape
  const {
    SignalCrawlJob: _SignalCrawlJobModel,
  } = require('../intelligence/models/signal-crawl-job.model')
  // Extract the schema from the singleton model
  const SignalCrawlJobSchema = _SignalCrawlJobModel.schema

  const {
    IntelligenceVerdictSchema,
  } = require('../intelligence/models/verdict.model')

  // agent-model-config also uses an inline schema
  const {
    AgentModelConfig: _AgentModelConfigModel,
  } = require('../intelligence/models/agent-model-config.model')
  const AgentModelConfigSchema = _AgentModelConfigModel.schema

  return {
    ClassificationJob:
      connection.models.ClassificationJob ||
      connection.model('ClassificationJob', ClassificationJobSchema),

    ClassificationSnapshot:
      connection.models.ClassificationSnapshot ||
      connection.model('ClassificationSnapshot', ClassificationSnapshotSchema),

    DiscoveryJob:
      connection.models.DiscoveryJob ||
      connection.model('DiscoveryJob', DiscoveryJobSchema),

    GlobalDiscoveryJob:
      connection.models.GlobalDiscoveryJob ||
      connection.model('GlobalDiscoveryJob', GlobalDiscoveryJobSchema),

    GlobalDiscoveryReport:
      connection.models.GlobalDiscoveryReport ||
      connection.model('GlobalDiscoveryReport', GlobalDiscoveryReportSchema),

    SignalCrawlJob:
      connection.models.SignalCrawlJob ||
      connection.model('SignalCrawlJob', SignalCrawlJobSchema),

    IntelligenceVerdict:
      connection.models.IntelligenceVerdict ||
      connection.model('IntelligenceVerdict', IntelligenceVerdictSchema),

    AgentModelConfig:
      connection.models.AgentModelConfig ||
      connection.model('AgentModelConfig', AgentModelConfigSchema),
  }
}

/**
 * Get the agent model map from a user-scoped connection.
 * Equivalent to `getAgentModelMap()` but uses the per-user connection's
 * AgentModelConfig model instead of the singleton.
 */
export async function getAgentModelMapFromConnection(
  connection: mongoose.Connection,
): Promise<Record<string, string>> {
  const models = getIntelligenceModelsForConnection(connection)
  const config = await models.AgentModelConfig.findById('default').lean()
  if (!config?.modelMap) return {}
  const raw = config.modelMap as unknown
  if (raw instanceof Map) return Object.fromEntries(raw)
  if (raw && typeof raw === 'object') return raw as Record<string, string>
  return {}
}
