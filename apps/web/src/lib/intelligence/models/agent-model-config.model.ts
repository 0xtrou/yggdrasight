import { mongoose } from '@yggdrasight/db'

// ── AgentModelConfig document interface ──────────────────────────────────────
export interface IAgentModelConfig {
  _id: string
  modelMap: Map<string, string>
  updatedAt: Date
}

// ── Schema ────────────────────────────────────────────────────────────────────
const AgentModelConfigSchema = new mongoose.Schema<IAgentModelConfig>(
  {
    _id: { type: String, default: 'default' },
    modelMap: { type: Map, of: String, default: new Map() },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
)

// ── Model ─────────────────────────────────────────────────────────────────────
export const AgentModelConfig: mongoose.Model<IAgentModelConfig> =
  (mongoose.models.AgentModelConfig as mongoose.Model<IAgentModelConfig>) ??
  mongoose.model<IAgentModelConfig>('AgentModelConfig', AgentModelConfigSchema)

// ── Helper: get modelMap as plain object ──────────────────────────────────────
export async function getAgentModelMap(): Promise<Record<string, string>> {
  const config = await AgentModelConfig.findById('default').lean()
  if (!config?.modelMap) return {}
  const raw = config.modelMap as unknown
  // lean() returns Map fields as plain objects, not Map instances
  if (raw instanceof Map) return Object.fromEntries(raw)
  if (raw && typeof raw === 'object') return raw as Record<string, string>
  return {}
}
