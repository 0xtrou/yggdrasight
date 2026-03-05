import mongoose, { Schema, Model, Document } from 'mongoose'

// ── Subdocument schemas ────────────────────────────────────────────────
const TokenomicsSchema = new Schema(
  {
    totalSupply: { type: Number },
    circulatingSupply: { type: Number },
    maxSupply: { type: Number },
    marketCap: { type: Number },
    fullyDilutedValuation: { type: Number },
    inflationRate: { type: Number },
    vestingSchedule: { type: String },
  },
  { _id: false },
)

const TeamMemberSchema = new Schema(
  {
    name: { type: String, required: true },
    role: { type: String, required: true },
    linkedIn: { type: String },
    twitter: { type: String },
    background: { type: String },
  },
  { _id: false },
)

// ── Document interface ─────────────────────────────────────────────────
export interface ICryptoProjectDocument extends Document {
  name: string
  symbol: string
  description?: string
  website?: string
  whitepaper?: string
  category?: string
  chain?: string
  tokenomics?: {
    totalSupply?: number
    circulatingSupply?: number
    maxSupply?: number
    marketCap?: number
    fullyDilutedValuation?: number
    inflationRate?: number
    vestingSchedule?: string
  }
  team?: {
    name: string
    role: string
    linkedIn?: string
    twitter?: string
    background?: string
  }[]
  fundamentalScore?: number
  socialLinks?: {
    twitter?: string
    discord?: string
    telegram?: string
    github?: string
  }
  createdAt: Date
  updatedAt: Date
}

// ── Schema ─────────────────────────────────────────────────────────────
export const CryptoProjectSchema = new Schema<ICryptoProjectDocument>(
  {
    name: { type: String, required: true },
    symbol: { type: String, required: true },
    description: { type: String },
    website: { type: String },
    whitepaper: { type: String },
    category: { type: String },
    chain: { type: String },
    tokenomics: { type: TokenomicsSchema, default: null },
    team: { type: [TeamMemberSchema], default: [] },
    fundamentalScore: { type: Number, min: 0, max: 100 },
    socialLinks: {
      twitter: { type: String },
      discord: { type: String },
      telegram: { type: String },
      github: { type: String },
    },
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
CryptoProjectSchema.index({ symbol: 1 })
CryptoProjectSchema.index({ fundamentalScore: -1 })

// ── Model ──────────────────────────────────────────────────────────────
export const CryptoProject: Model<ICryptoProjectDocument> =
  mongoose.models.CryptoProject ||
  mongoose.model<ICryptoProjectDocument>('CryptoProject', CryptoProjectSchema)
