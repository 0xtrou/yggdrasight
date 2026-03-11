import { NextRequest, NextResponse } from 'next/server'
import { CreateSignalSchema, SignalFiltersSchema, ProviderType, AssetClass } from '@yggdrasight/core'
import { withAuth } from '@/lib/auth/middleware'

export const dynamic = 'force-dynamic'

// GET /api/signals — list signals with optional filters
export async function GET(req: NextRequest) {
  return withAuth(async (ctx) => {
    try {
      const url = req.nextUrl
      const rawFilters: Record<string, unknown> = {}

      const status = url.searchParams.getAll('status')
      if (status.length) rawFilters.status = status

      const direction = url.searchParams.getAll('direction')
      if (direction.length) rawFilters.direction = direction

      const exchange = url.searchParams.getAll('exchange')
      if (exchange.length) rawFilters.exchange = exchange

      const symbol = url.searchParams.get('symbol')
      if (symbol) rawFilters.symbol = symbol

      const from = url.searchParams.get('from')
      const to = url.searchParams.get('to')
      if (from && to) rawFilters.dateRange = { from, to }

      const parsed = SignalFiltersSchema.safeParse(rawFilters)
      const filters = parsed.success ? parsed.data : {}

      // Build Mongoose query
      const query: Record<string, unknown> = {}
      if (filters.status?.length) query.status = { $in: filters.status }
      if (filters.direction?.length) query.direction = { $in: filters.direction }
      if (filters.exchange?.length) query.exchange = { $in: filters.exchange }
      if (filters.symbol) query.symbol = { $regex: filters.symbol, $options: 'i' }
      if (filters.dateRange) {
        query.createdAt = { $gte: filters.dateRange.from, $lte: filters.dateRange.to }
      }

      const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 500)
      const signals = await ctx.models.Signal.find(query).sort({ createdAt: -1 }).limit(limit).lean()

      // Transform _id → id
      const transformed = signals.map((s) => {
        const obj = s as unknown as Record<string, unknown>
        const { _id, __v, ...rest } = obj
        return { id: String(_id), ...rest }
      })

      return NextResponse.json({ signals: transformed })
    } catch (err) {
      console.error('[GET /api/signals]', err)
      return NextResponse.json({ error: 'Failed to fetch signals' }, { status: 500 })
    }
  })
}

// POST /api/signals — create a new signal
export async function POST(req: NextRequest) {
  return withAuth(async (ctx) => {
    try {
      const body = await req.json()

      // Default source to MANUAL for manual entries
      if (!body.source) body.source = ProviderType.MANUAL
      if (!body.sourceProvider) body.sourceProvider = 'manual'
      if (!body.assetClass) body.assetClass = AssetClass.CRYPTO

      const parsed = CreateSignalSchema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Validation failed', details: parsed.error.flatten() },
          { status: 400 },
        )
      }

      const data = parsed.data

      const signal = await ctx.models.Signal.create({
        symbol: data.symbol,
        direction: data.direction,
        source: data.source,
        exchange: data.exchange,
        timeframe: data.timeframe,
        entryPrice: data.entryPrice,
        stopLoss: data.stopLoss,
        takeProfits: data.takeProfits,
        confidence: (data.confidenceScore ?? 50) / 100,
        indicators: data.indicators,
        sourceRaw: data.sourceRaw,
        notes: data.notes,
      })

      const json = signal.toJSON()
      return NextResponse.json({ signal: json }, { status: 201 })
    } catch (err) {
      console.error('[POST /api/signals]', err)
      return NextResponse.json({ error: 'Failed to create signal' }, { status: 500 })
    }
  })
}

// DELETE /api/signals — bulk delete by ids
export async function DELETE(req: NextRequest) {
  return withAuth(async (ctx) => {
    try {
      const body = await req.json()
      const ids: unknown = body.ids

      if (!Array.isArray(ids) || ids.length === 0) {
        return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 })
      }

      const result = await ctx.models.Signal.deleteMany({ _id: { $in: ids } })

      return NextResponse.json({ deleted: result.deletedCount })
    } catch (err) {
      console.error('[DELETE /api/signals]', err)
      return NextResponse.json({ error: 'Failed to delete signals' }, { status: 500 })
    }
  })
}
