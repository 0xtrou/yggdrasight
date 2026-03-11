import { mongoose } from '@yggdrasight/db'
import type { ClassificationResult, SubAgentResult } from '../classification/types'

// ── Classification job document interface ──────────────────────────────────
export interface IClassificationJob extends mongoose.Document {
  symbol: string
  modelId: string
  /** Per-agent model overrides. Keys: crack_mapping | visibility | narrative_separator | power_vector | problem_recognition | identity_polarity | synthesizer */
  agentModels: Record<string, string> | null
  status: 'pending' | 'running' | 'completed' | 'failed'
  /** Final synthesized classification */
  result: ClassificationResult | null
  /** Individual sub-agent results for auditability */
  subAgentResults: Record<string, SubAgentResult> | null
  rawOutput: string | null
  error: string | null
  pid: number | null
  logs: string[]
  startedAt: Date
  completedAt: Date | null
}

// ── Classification job schema ──────────────────────────────────────────────
export const ClassificationJobSchema = new mongoose.Schema<IClassificationJob>(
  {
    symbol: { type: String, required: true, index: true },
    modelId: { type: String, required: true },
    agentModels: { type: mongoose.Schema.Types.Mixed, default: null },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'running', 'completed', 'failed'],
      default: 'pending',
    },
    result: { type: mongoose.Schema.Types.Mixed, default: null },
    subAgentResults: { type: mongoose.Schema.Types.Mixed, default: null },
    rawOutput: { type: String, default: null },
    error: { type: String, default: null },
    pid: { type: Number, default: null },
    logs: { type: [String], default: [] },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
  },
  {
    timestamps: false,
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
ClassificationJobSchema.index({ symbol: 1, startedAt: -1 })
ClassificationJobSchema.index({ status: 1 })
ClassificationJobSchema.index({ symbol: 1, completedAt: -1 })

// ── Model ────────────────────────────────────────────────────────────────────
export const ClassificationJob: mongoose.Model<IClassificationJob> =
  mongoose.models.ClassificationJob ||
  mongoose.model<IClassificationJob>('ClassificationJob', ClassificationJobSchema)

// ── Classification snapshot document interface ─────────────────────────────
// Time-series record for tracking category migrations over time
export interface IClassificationSnapshot extends mongoose.Document {
  symbol: string
  modelId: string
  /** Primary category at this point in time */
  primaryCategory: number
  /** All category weights */
  categoryWeights: Array<{ category: number; weight: number }>
  /** Crack alignment */
  crackAlignment: number[]
  /** Full classification result */
  classification: ClassificationResult | null
  /** Reference to the job that produced this */
  jobId: mongoose.Types.ObjectId
  classifiedAt: Date
}

// ── Classification snapshot schema ─────────────────────────────────────────
export const ClassificationSnapshotSchema = new mongoose.Schema<IClassificationSnapshot>(
  {
    symbol: { type: String, required: true, index: true },
    modelId: { type: String, required: true },
    primaryCategory: { type: Number, required: true, min: 1, max: 6 },
    categoryWeights: {
      type: [{
        category: { type: Number, required: true, min: 1, max: 6 },
        weight: { type: Number, required: true, min: 0, max: 1 },
      }],
      default: [],
    },
    crackAlignment: { type: [Number], default: [] },
    classification: { type: mongoose.Schema.Types.Mixed, default: null },
    jobId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'ClassificationJob' },
    classifiedAt: { type: Date, required: true, default: Date.now },
  },
  {
    timestamps: false,
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

// ── Indexes (optimized for time-series migration queries) ──────────────────
ClassificationSnapshotSchema.index({ symbol: 1, classifiedAt: -1 }) // Latest snapshot per symbol
ClassificationSnapshotSchema.index({ symbol: 1, primaryCategory: 1, classifiedAt: -1 }) // Migration detection
ClassificationSnapshotSchema.index({ classifiedAt: -1 }) // Global timeline

// ── Model ────────────────────────────────────────────────────────────────────
export const ClassificationSnapshot: mongoose.Model<IClassificationSnapshot> =
  mongoose.models.ClassificationSnapshot ||
  mongoose.model<IClassificationSnapshot>('ClassificationSnapshot', ClassificationSnapshotSchema)
