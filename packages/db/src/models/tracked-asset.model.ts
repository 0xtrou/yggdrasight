import mongoose, { Schema, Model, Document } from 'mongoose'

// ── Document interface ─────────────────────────────────────────────────
export interface ITrackedAssetDocument extends Document {
  symbol: string
  name?: string
  addedAt: Date
}

// ── Schema ─────────────────────────────────────────────────────────────
export const TrackedAssetSchema = new Schema<ITrackedAssetDocument>(
  {
    symbol: { type: String, required: true, unique: true },
    name: { type: String },
    addedAt: { type: Date, default: Date.now },
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
  },
)

// ── Indexes ────────────────────────────────────────────────────────────
TrackedAssetSchema.index({ symbol: 1 }, { unique: true })
TrackedAssetSchema.index({ addedAt: 1 })

// ── Model ──────────────────────────────────────────────────────────────
export const TrackedAsset: Model<ITrackedAssetDocument> =
  mongoose.models.TrackedAsset ||
  mongoose.model<ITrackedAssetDocument>('TrackedAsset', TrackedAssetSchema)
