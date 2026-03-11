import { mongoose } from '@yggdrasight/db'

// ── Signal crawl result entry ─────────────────────────────────────────────────
export interface ICrawledSignal {
  symbol: string
  direction: 'long' | 'short'
  entryPrice: number
  stopLoss: number
  takeProfits: { level: number; price: number }[]
  timeframe: string
  confidence: number // 0–100
  rationale: string
  exchange: string
  indicators: Record<string, unknown>
}

// ── Signal crawl job document interface ──────────────────────────────────────
export interface ISignalCrawlJob extends mongoose.Document {
  screen: string
  agentSlug: string
  symbols: string[]
  modelId: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  signals: ICrawledSignal[]
  savedSignalIds: string[]
  rawOutput: string | null
  error: string | null
  pid: number | null
  logs: string[]
  startedAt: Date
  completedAt: Date | null
}

// ── Schema ────────────────────────────────────────────────────────────────────
const SignalCrawlJobSchema = new mongoose.Schema<ISignalCrawlJob>(
  {
    symbols: { type: [String], required: true },
    screen: { type: String, required: true, default: 'signals' },
    agentSlug: { type: String, required: true, default: 'signal_crawler' },
    modelId: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'running', 'completed', 'failed'],
      default: 'pending',
    },
    signals: { type: mongoose.Schema.Types.Mixed, default: [] },
    savedSignalIds: { type: [String], default: [] },
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
  },
)

SignalCrawlJobSchema.index({ status: 1 })
SignalCrawlJobSchema.index({ screen: 1, agentSlug: 1, startedAt: -1 })
SignalCrawlJobSchema.index({ symbols: 1, startedAt: -1 })

// Delete cached model so schema changes take effect during dev hot-reloads
if (mongoose.models.SignalCrawlJob) {
  delete (mongoose.models as Record<string, unknown>).SignalCrawlJob
}

export const SignalCrawlJob = mongoose.model<ISignalCrawlJob>('SignalCrawlJob', SignalCrawlJobSchema)
