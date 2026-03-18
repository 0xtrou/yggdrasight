import { mongoose } from '@yggdrasight/db'

export interface IMirofishPrediction extends mongoose.Document {
  symbol: string
  direction: 'long' | 'short' | 'neutral'
  confidence: number
  reason: string
  modelId: string
  indicators: {
    consensusBullPct?: number
    consensusBearPct?: number
    simulationRounds?: number
    agentsCount?: number
    durationMs?: number
  }
  createdAt: Date
  updatedAt: Date
}

export const MirofishPredictionSchema = new mongoose.Schema<IMirofishPrediction>(
  {
    symbol: { type: String, required: true, index: true },
    direction: { type: String, required: true, enum: ['long', 'short', 'neutral'] },
    confidence: { type: Number, required: true, min: 0, max: 1 },
    reason: { type: String, required: true },
    modelId: { type: String, default: '' },
    indicators: {
      consensusBullPct: { type: Number, default: null },
      consensusBearPct: { type: Number, default: null },
      simulationRounds: { type: Number, default: null },
      agentsCount: { type: Number, default: null },
      durationMs: { type: Number, default: null },
    },
  },
  {
    timestamps: true,
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

MirofishPredictionSchema.index({ symbol: 1, createdAt: -1 })

export const MirofishPrediction: mongoose.Model<IMirofishPrediction> =
  mongoose.models.MirofishPrediction ||
  mongoose.model<IMirofishPrediction>('MirofishPrediction', MirofishPredictionSchema)
