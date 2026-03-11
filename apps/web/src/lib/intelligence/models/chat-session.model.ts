import { mongoose } from '@yggdrasight/db'

// ── Chat session document interface ───────────────────────────────────────────
export interface IMessageAttachment {
  type: 'image' | 'file'
  name: string
  path: string
}

export interface IChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  attachments?: IMessageAttachment[]
  modelId?: string
  thinkingSteps?: Array<{ type: string; label: string }>
}

export interface IChatSession extends mongoose.Document {
  symbol: string
  modelId: string
  messages: IChatMessage[]
  title?: string
  status: 'active' | 'streaming' | 'archived'
  /** OpenCode's internal session ID (ses_xxx) for resuming conversations */
  opencodeSessionId?: string
  /** Docker container name for in-flight request cancellation */
  containerId?: string
  /** Worker process PID for cancel targeting */
  workerPid?: number
  logs: string[]
  createdAt: Date
  updatedAt: Date
}

// ── Message attachment subdocument schema ─────────────────────────────────────
const MessageAttachmentSchema = new mongoose.Schema<IMessageAttachment>(
  {
    type: { type: String, required: true, enum: ['image', 'file'] },
    name: { type: String, required: true },
    path: { type: String, required: true },
  },
  { _id: false }
)

// ── Message subdocument schema ────────────────────────────────────────────────
const MessageSchema = new mongoose.Schema<IChatMessage>(
  {
    role: { type: String, required: true, enum: ['user', 'assistant', 'system'] },
    content: { type: String, required: true },
    timestamp: { type: Date, required: true, default: Date.now },
    attachments: { type: [MessageAttachmentSchema], default: undefined },
    modelId: { type: String, default: undefined },
    thinkingSteps: { type: [{ type: { type: String }, label: { type: String } }], default: undefined },
  },
  { _id: false }
)

// ── Chat session schema ───────────────────────────────────────────────────────
export const ChatSessionSchema = new mongoose.Schema<IChatSession>(
  {
    symbol: { type: String, required: true, index: true },
    modelId: { type: String, required: true },
    messages: { type: [MessageSchema], default: [] },
    title: { type: String, default: null },
    status: {
      type: String,
      required: true,
      enum: ['active', 'streaming', 'archived'],
      default: 'active',
    },
    opencodeSessionId: { type: String, default: null },
    containerId: { type: String, default: null },
    workerPid: { type: Number, default: null },
    logs: { type: [String], default: [] },
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

// ── Indexes ───────────────────────────────────────────────────────────────────
ChatSessionSchema.index({ symbol: 1 })
ChatSessionSchema.index({ createdAt: -1 })
ChatSessionSchema.index({ symbol: 1, status: 1 })

// ── Model ─────────────────────────────────────────────────────────────────────
export const ChatSession: mongoose.Model<IChatSession> =
  mongoose.models.ChatSession ||
  mongoose.model<IChatSession>('ChatSession', ChatSessionSchema)
