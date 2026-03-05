import { z } from 'zod'
import { Exchange } from '../enums'

const TokenomicsSchema = z.object({
  totalSupply: z.number().nonnegative(),
  circulatingSupply: z.number().nonnegative(),
  maxSupply: z.number().nonnegative().optional(),
  inflationRate: z.number().optional(),
  vestingSchedule: z.string().optional(),
})

const TeamMemberSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  linkedin: z.string().url().optional(),
})

export const CreateProjectSchema = z.object({
  name: z.string().min(1),
  symbol: z.string().min(1),
  description: z.string().min(1),

  // Links
  website: z.string().url().optional(),
  whitepaper: z.string().url().optional(),
  github: z.string().url().optional(),

  // Market
  exchange: z.array(z.nativeEnum(Exchange)).min(1),
  chain: z.string().min(1),

  // Fundamentals
  tokenomics: TokenomicsSchema,
  team: z.array(TeamMemberSchema).default([]),
  fundamentalScore: z.number().min(0).max(100),

  // Classification
  categories: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
})

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>

export const UpdateProjectSchema = CreateProjectSchema.partial()

export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>
