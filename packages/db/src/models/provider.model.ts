import mongoose, { Schema, Model, Document } from 'mongoose'
import { ProviderType } from '@yggdrasight/core'

// ── Document interface ─────────────────────────────────────────────────
export interface ISignalProviderDocument extends Document {
  name: string
  type: ProviderType
  isActive: boolean
  description?: string
  config: Record<string, unknown>
  credentials?: Record<string, unknown>
  lastSyncAt?: Date
  signalCount: number
  successRate?: number
  createdAt: Date
  updatedAt: Date
}

// ── Schema ─────────────────────────────────────────────────────────────
export const SignalProviderSchema = new Schema<ISignalProviderDocument>(
  {
    name: { type: String, required: true },
    type: {
      type: String,
      enum: Object.values(ProviderType),
      required: true,
    },
    isActive: { type: Boolean, default: true },
    description: { type: String },
    config: { type: Schema.Types.Mixed, default: {} },
    credentials: { type: Schema.Types.Mixed },
    lastSyncAt: { type: Date },
    signalCount: { type: Number, default: 0 },
    successRate: { type: Number, min: 0, max: 1 },
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
        // Never expose credentials in JSON serialization
        delete ret.credentials
        return ret
      },
    },
  },
)

// ── Indexes ────────────────────────────────────────────────────────────
SignalProviderSchema.index({ type: 1 })
SignalProviderSchema.index({ isActive: 1 })

// ── Model ──────────────────────────────────────────────────────────────
export const SignalProvider: Model<ISignalProviderDocument> =
  mongoose.models.SignalProvider ||
  mongoose.model<ISignalProviderDocument>('SignalProvider', SignalProviderSchema)
