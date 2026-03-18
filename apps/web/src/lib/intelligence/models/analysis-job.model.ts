import { mongoose } from '@yggdrasight/db'

export interface IAnalysisJob extends mongoose.Document {
  symbol: string
  agentId: string
  modelId: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  error: string | null
  startedAt: Date
  completedAt: Date | null
}

export const AnalysisJobSchema = new mongoose.Schema<IAnalysisJob>(
  {
    symbol: { type: String, required: true, index: true },
    agentId: { type: String, required: true, index: true },
    modelId: { type: String, default: '' },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'running', 'completed', 'failed'],
      default: 'pending',
    },
    error: { type: String, default: null },
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

AnalysisJobSchema.index({ symbol: 1, agentId: 1, status: 1 })
AnalysisJobSchema.index({ status: 1, startedAt: -1 })

export const AnalysisJob: mongoose.Model<IAnalysisJob> =
  mongoose.models.AnalysisJob ||
  mongoose.model<IAnalysisJob>('AnalysisJob', AnalysisJobSchema)
