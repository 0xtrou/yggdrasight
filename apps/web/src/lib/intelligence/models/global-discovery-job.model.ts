import { mongoose } from '@oculus/db'

// ── Discovered project (found by agents during global scan) ──────────────────

export interface IGlobalDiscoveredProject {
  /** Project/token name */
  name: string
  /** Ticker symbol (if known) */
  symbol: string | null
  /** Short description of what it does */
  description: string
  /** Which of the 6 pillars it maps to (1-6) */
  primaryCategory: number | null
  /** Category weights if assessed */
  categoryWeights: Array<{ category: number; weight: number }> | null
  /** Which cracks it resonates with (1-9) */
  crackAlignment: number[]
  /** Why this project was flagged as notable */
  discoveryReason: string
  /** Sector/narrative label (e.g. "AI + crypto", "DePIN", "RWA") */
  sector: string | null
  /** Launch date or approximate period */
  launchDate: string | null
  /** URLs/sources the agent used */
  sources: string[]
  /** Signal strength: how interesting is this discovery (0-1) */
  signalStrength: number
  /** Project logo URL (scraped by agents) */
  logoUrl: string | null
  /** Market cap in USD (fetched post-synthesis from CoinGecko, null if unavailable) */
  marketCap: number | null
  /** 24h trading volume in USD (fetched post-synthesis from CoinGecko, null if unavailable) */
  volume24h: number | null
  /** Official project website URL (scraped by agents) */
  websiteUrl: string | null
}

// ── Global Discovery Report (the compounding knowledge artifact) ─────────────

export interface IGlobalDiscoveryReport {
  /** Unique report ID */
  _id: mongoose.Types.ObjectId
  /** Report generation number (increments each run) */
  generation: number
  /** Reference to the job that produced this report */
  jobId: mongoose.Types.ObjectId
  /** The previous report ID this one inherited from (null for first report) */
  parentReportId: mongoose.Types.ObjectId | null
  /** All discovered projects (cumulative — includes inherited + new) */
  projects: IGlobalDiscoveredProject[]
  /** Projects discovered in THIS run (subset of projects) */
  newProjects: IGlobalDiscoveredProject[]
  /** Global market direction assessment */
  marketDirection: string | null
  /** Cross-pillar analysis: how projects relate across categories */
  crossPillarInsights: string | null
  /** Emerging trends detected */
  emergingTrends: string[]
  /** Master agent's executive summary */
  executiveSummary: string
  /** Depth parameter used for this run */
  depth: number
  /** Number of agents used */
  agentCount: number
  /** Total projects tracked (cumulative) */
  totalProjects: number
  /** New projects found this run */
  newProjectCount: number
  createdAt: Date
}

// ── Global Discovery Job (tracks the execution) ─────────────────────────────

export interface IGlobalDiscoveryJob extends mongoose.Document {
  /** Depth parameter — how many projects each agent should discover */
  depth: number
  /** Number of discovery agents to spawn */
  agentCount: number
  /** Model to use for agents */
  modelId: string
  /** Per-agent model overrides */
  agentModels: Record<string, string> | null
  /** Job status */
  status: 'pending' | 'running' | 'completed' | 'failed'
  /** Reference to the previous report (for context inheritance) */
  previousReportId: mongoose.Types.ObjectId | null
  /** The report produced by this job (set on completion) */
  reportId: mongoose.Types.ObjectId | null
  /** Individual agent results for auditability */
  agentResults: Record<string, {
    agentId: string
    status: 'completed' | 'failed'
    projectsFound: number
    rawOutput: string | null
    error: string | null
    durationMs: number
  }> | null
  /** Error message if job failed */
  error: string | null
  /** Worker process ID */
  pid: number | null
  /** Execution logs (timestamped) */
  logs: string[]
  startedAt: Date
  completedAt: Date | null
}

// ── Schemas ──────────────────────────────────────────────────────────────────

const GlobalDiscoveredProjectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  symbol: { type: String, default: null },
  description: { type: String, required: true },
  primaryCategory: { type: Number, default: null, min: 1, max: 6 },
  categoryWeights: {
    type: [{
      category: { type: Number, required: true, min: 1, max: 6 },
      weight: { type: Number, required: true, min: 0, max: 1 },
    }],
    default: null,
  },
  crackAlignment: { type: [Number], default: [] },
  discoveryReason: { type: String, required: true },
  sector: { type: String, default: null },
  launchDate: { type: String, default: null },
  sources: { type: [String], default: [] },
  signalStrength: { type: Number, default: 0.5, min: 0, max: 1 },
  logoUrl: { type: String, default: null },
  marketCap: { type: Number, default: null },
  volume24h: { type: Number, default: null },
  websiteUrl: { type: String, default: null },
}, { _id: false })

export const GlobalDiscoveryReportSchema = new mongoose.Schema<IGlobalDiscoveryReport>(
  {
    generation: { type: Number, required: true, default: 1 },
    jobId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'GlobalDiscoveryJob' },
    parentReportId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: 'GlobalDiscoveryReport' },
    projects: { type: [GlobalDiscoveredProjectSchema], default: [] },
    newProjects: { type: [GlobalDiscoveredProjectSchema], default: [] },
    marketDirection: { type: String, default: null },
    crossPillarInsights: { type: String, default: null },
    emergingTrends: { type: [String], default: [] },
    executiveSummary: { type: String, required: true },
    depth: { type: Number, required: true },
    agentCount: { type: Number, required: true },
    totalProjects: { type: Number, required: true, default: 0 },
    newProjectCount: { type: Number, required: true, default: 0 },
    createdAt: { type: Date, default: Date.now },
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

// Indexes for reports
GlobalDiscoveryReportSchema.index({ createdAt: -1 })
GlobalDiscoveryReportSchema.index({ generation: -1 })
GlobalDiscoveryReportSchema.index({ jobId: 1 })

export const GlobalDiscoveryJobSchema = new mongoose.Schema<IGlobalDiscoveryJob>(
  {
    depth: { type: Number, required: true, default: 20 },
    agentCount: { type: Number, required: true, default: 5 },
    modelId: { type: String, required: true },
    agentModels: { type: mongoose.Schema.Types.Mixed, default: null },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'running', 'completed', 'failed'],
      default: 'pending',
    },
    previousReportId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: 'GlobalDiscoveryReport' },
    reportId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: 'GlobalDiscoveryReport' },
    agentResults: { type: mongoose.Schema.Types.Mixed, default: null },
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

// Indexes for jobs
GlobalDiscoveryJobSchema.index({ status: 1 })
GlobalDiscoveryJobSchema.index({ startedAt: -1 })
GlobalDiscoveryJobSchema.index({ completedAt: -1 })

// ── Models ───────────────────────────────────────────────────────────────────

export const GlobalDiscoveryReport: mongoose.Model<IGlobalDiscoveryReport> =
  mongoose.models.GlobalDiscoveryReport ||
  mongoose.model<IGlobalDiscoveryReport>('GlobalDiscoveryReport', GlobalDiscoveryReportSchema)

export const GlobalDiscoveryJob: mongoose.Model<IGlobalDiscoveryJob> =
  mongoose.models.GlobalDiscoveryJob ||
  mongoose.model<IGlobalDiscoveryJob>('GlobalDiscoveryJob', GlobalDiscoveryJobSchema)
