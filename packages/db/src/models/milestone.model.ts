import mongoose, { Schema, Model, Document } from 'mongoose'

// ── Document interface ─────────────────────────────────────────────────
export interface IMilestoneDocument extends Document {
  projectId: mongoose.Types.ObjectId
  title: string
  description?: string
  scheduledAt: Date
  completedAt?: Date
  status: 'upcoming' | 'in_progress' | 'completed' | 'missed' | 'cancelled'
  impact?: 'low' | 'medium' | 'high' | 'critical'
  category?: string
  source?: string
  sourceUrl?: string
  createdAt: Date
  updatedAt: Date
}

// ── Schema ─────────────────────────────────────────────────────────────
export const MilestoneSchema = new Schema<IMilestoneDocument>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'CryptoProject', required: true },
    title: { type: String, required: true },
    description: { type: String },
    scheduledAt: { type: Date, required: true },
    completedAt: { type: Date },
    status: {
      type: String,
      enum: ['upcoming', 'in_progress', 'completed', 'missed', 'cancelled'],
      default: 'upcoming',
    },
    impact: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
    },
    category: { type: String },
    source: { type: String },
    sourceUrl: { type: String },
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
  },
)

// ── Indexes ────────────────────────────────────────────────────────────
MilestoneSchema.index({ projectId: 1 })
MilestoneSchema.index({ scheduledAt: 1 })
MilestoneSchema.index({ status: 1 })

// ── Model ──────────────────────────────────────────────────────────────
export const Milestone: Model<IMilestoneDocument> =
  mongoose.models.Milestone ||
  mongoose.model<IMilestoneDocument>('Milestone', MilestoneSchema)
