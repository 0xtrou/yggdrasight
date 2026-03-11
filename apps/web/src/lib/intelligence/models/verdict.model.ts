import { mongoose } from '@yggdrasight/db'
import { AnalystVerdict } from '../types'

// ── Intelligence verdict document interface ──────────────────────────────────
export interface IIntelligenceVerdict extends mongoose.Document {
  symbol: string
  timeframes: string[]
  direction: string // 'long' | 'short' | 'neutral'
  confidence: number // 0.0 – 1.0
  score: number // raw weighted score
  confluence: number // 0.0 – 1.0
  llmModel?: string
  analysts: AnalystVerdict[]
  createdAt: Date
  updatedAt: Date
}

// ── Analyst verdict subdocument schema ────────────────────────────────────────
const AnalystVerdictSchema = new mongoose.Schema(
  {
    meta: {
      id: { type: String, required: true },
      name: { type: String, required: true },
      description: { type: String, default: '' },
      weight: { type: Number, required: true },
    },
    direction: { type: String, required: true },
    confidence: { type: Number, required: true, min: 0, max: 1 },
    reason: { type: String, required: true },
    output: { type: String, default: null },
    indicators: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false }
)

// ── Intelligence verdict schema ──────────────────────────────────────────────
export const IntelligenceVerdictSchema = new mongoose.Schema<IIntelligenceVerdict>(
  {
    symbol: { type: String, required: true, index: true },
    timeframes: { type: [String], required: true },
    direction: {
      type: String,
      required: true,
      enum: ['long', 'short', 'neutral'],
    },
    confidence: { type: Number, required: true, min: 0, max: 1 },
    score: { type: Number, required: true },
    confluence: { type: Number, required: true, min: 0, max: 1 },
    llmModel: { type: String, default: null },
    analysts: { type: [AnalystVerdictSchema], default: [] },
  },
  {
    timestamps: true,
    strict: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        ret.id = ret._id
        delete ret._id
        delete ret.__v
        return ret
      },
    },
  }
)

// ── Indexes ──────────────────────────────────────────────────────────────────
IntelligenceVerdictSchema.index({ symbol: 1 })
IntelligenceVerdictSchema.index({ createdAt: -1 })

// ── Model ────────────────────────────────────────────────────────────────────
export const IntelligenceVerdict: mongoose.Model<IIntelligenceVerdict> =
  mongoose.models.IntelligenceVerdict ||
  mongoose.model<IIntelligenceVerdict>(
    'IntelligenceVerdict',
    IntelligenceVerdictSchema
  )
