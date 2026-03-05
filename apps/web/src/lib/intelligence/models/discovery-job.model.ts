import { mongoose } from '@oculus/db'
import type { DiscoveredProjectInfo } from '../types'

// ── Discovery job document interface ──────────────────────────────────────────
export interface IDiscoveryJob extends mongoose.Document {
  symbol: string
  modelId: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  result: DiscoveredProjectInfo | null
  error: string | null
  pid: number | null
  logs: string[]
  startedAt: Date
  completedAt: Date | null
}

// ── Discovery job schema ──────────────────────────────────────────────────────
export const DiscoveryJobSchema = new mongoose.Schema<IDiscoveryJob>(
  {
    symbol: { type: String, required: true, index: true },
    modelId: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'running', 'completed', 'failed'],
      default: 'pending',
    },
    result: { type: mongoose.Schema.Types.Mixed, default: null },
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
DiscoveryJobSchema.index({ symbol: 1, startedAt: -1 })
DiscoveryJobSchema.index({ status: 1 })

// ── Model ────────────────────────────────────────────────────────────────────
export const DiscoveryJob: mongoose.Model<IDiscoveryJob> =
  mongoose.models.DiscoveryJob ||
  mongoose.model<IDiscoveryJob>('DiscoveryJob', DiscoveryJobSchema)
