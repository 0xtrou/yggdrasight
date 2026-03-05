import type { Exchange } from '../enums'

export interface Tokenomics {
  totalSupply: number
  circulatingSupply: number
  maxSupply?: number
  inflationRate?: number
  vestingSchedule?: string
}

export interface TeamMember {
  name: string
  role: string
  linkedin?: string
}

export interface CryptoProject {
  id: string
  createdAt: Date
  updatedAt: Date

  // Identity
  name: string
  symbol: string
  description: string

  // Links
  website?: string
  whitepaper?: string
  github?: string

  // Market
  exchange: Exchange[]
  chain: string

  // Fundamentals (Buffett approach)
  tokenomics: Tokenomics
  team: TeamMember[]
  fundamentalScore: number

  // Classification
  categories: string[]
  tags: string[]
}
