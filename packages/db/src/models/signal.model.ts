import mongoose, { Schema, Model, Document } from 'mongoose'
import {
  SignalStatus,
  SignalDirection,
  Timeframe,
  Exchange,
} from '@oculus/core'

// ── Take-profit subdocument ────────────────────────────────────────────
const TakeProfitSchema = new Schema(
  {
    level: { type: Number, required: true },
    price: { type: Number, required: true },
    hit: { type: Boolean, default: false },
    hitAt: { type: Date, default: null },
  },
  { _id: false },
)

// ── Signal document interface ──────────────────────────────────────────
export interface ISignalDocument extends Document {
  symbol: string
  direction: SignalDirection
  status: SignalStatus
  source: string
  exchange: Exchange
  timeframe: Timeframe
  entryPrice: number
  currentPrice?: number
  stopLoss: number
  takeProfits: {
    level: number
    price: number
    hit: boolean
    hitAt?: Date | null
  }[]
  leverage?: number
  confidence: number
  indicators: Record<string, unknown>
  sourceRaw: unknown
  notes?: string
  expiresAt?: Date
  createdAt: Date
  updatedAt: Date
}

// ── Signal schema ──────────────────────────────────────────────────────
export const SignalSchema = new Schema<ISignalDocument>(
  {
    symbol: { type: String, required: true },
    direction: {
      type: String,
      enum: Object.values(SignalDirection),
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(SignalStatus),
      default: SignalStatus.PENDING,
    },
    source: { type: String, required: true },
    exchange: {
      type: String,
      enum: Object.values(Exchange),
      required: true,
    },
    timeframe: {
      type: String,
      enum: Object.values(Timeframe),
      required: true,
    },
    entryPrice: { type: Number, required: true },
    currentPrice: { type: Number },
    stopLoss: { type: Number, required: true },
    takeProfits: { type: [TakeProfitSchema], default: [] },
    leverage: { type: Number, default: 1 },
    confidence: { type: Number, required: true, min: 0, max: 1 },
    indicators: { type: Schema.Types.Mixed, default: {} },
    sourceRaw: { type: Schema.Types.Mixed },
    notes: { type: String },
    expiresAt: { type: Date },
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
SignalSchema.index({ symbol: 1 })
SignalSchema.index({ status: 1 })
SignalSchema.index({ source: 1 })
SignalSchema.index({ exchange: 1 })
SignalSchema.index({ createdAt: -1 })

// ── Model ──────────────────────────────────────────────────────────────
export const Signal: Model<ISignalDocument> =
  mongoose.models.Signal || mongoose.model<ISignalDocument>('Signal', SignalSchema)
