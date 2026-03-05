import { z } from 'zod'
import {
  AssetClass,
  Exchange,
  MarketRegime,
  ProviderType,
  SignalDirection,
  SignalStatus,
  Timeframe,
} from '../enums'

const TakeProfitSchema = z.object({
  level: z.number().int().min(1),
  price: z.number().positive(),
  hit: z.boolean().optional(),
  hitAt: z.coerce.date().optional(),
})

export const CreateSignalSchema = z.object({
  // Source
  source: z.nativeEnum(ProviderType),
  sourceProvider: z.string().min(1),
  sourceRaw: z.unknown().optional(),

  // Instrument
  symbol: z.string().min(1),
  exchange: z.nativeEnum(Exchange),
  assetClass: z.nativeEnum(AssetClass).default(AssetClass.CRYPTO),

  // Direction & levels
  direction: z.nativeEnum(SignalDirection),
  entryPrice: z.number().positive(),
  entryPriceHigh: z.number().positive().optional(),
  entryPriceLow: z.number().positive().optional(),
  takeProfits: z.array(TakeProfitSchema).min(1),
  stopLoss: z.number().positive(),
  timeframe: z.nativeEnum(Timeframe),

  // Analysis
  indicators: z.record(z.string(), z.unknown()).default({}),
  fundamentalScore: z.number().min(0).max(100).optional(),
  confidenceScore: z.number().min(0).max(100).optional(),
  marketRegime: z.nativeEnum(MarketRegime).optional(),
  projectId: z.string().optional(),

  // Meta
  notes: z.string().optional(),
  tags: z.array(z.string()).default([]),
})

export type CreateSignalInput = z.infer<typeof CreateSignalSchema>

export const UpdateSignalSchema = CreateSignalSchema.partial().extend({
  status: z.nativeEnum(SignalStatus).optional(),
  entryFilledAt: z.coerce.date().optional(),
  exitPrice: z.number().positive().optional(),
  exitedAt: z.coerce.date().optional(),
  pnlPercent: z.number().optional(),
  pnlAbsolute: z.number().optional(),
})

export type UpdateSignalInput = z.infer<typeof UpdateSignalSchema>

export const SignalFiltersSchema = z.object({
  status: z.array(z.nativeEnum(SignalStatus)).optional(),
  direction: z.array(z.nativeEnum(SignalDirection)).optional(),
  exchange: z.array(z.nativeEnum(Exchange)).optional(),
  symbol: z.string().optional(),
  dateRange: z
    .object({
      from: z.coerce.date(),
      to: z.coerce.date(),
    })
    .optional(),
})

export type SignalFilters = z.infer<typeof SignalFiltersSchema>
