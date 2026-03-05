import { NextRequest, NextResponse } from 'next/server'
import { connectDB, Signal } from '@oculus/db'
import { detectProvider } from '@/lib/ingest/detect'
import { normalize } from '@/lib/ingest/normalize'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    // Secret validation
    const secret = process.env.WEBHOOK_SECRET
    if (secret) {
      const provided = req.headers.get('x-webhook-secret')
      if (provided !== secret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const body = await req.json()

    const provider = detectProvider(body)
    const normalized = await normalize(provider, body)

    await connectDB()

    const signal = await Signal.create({
      symbol: normalized.symbol,
      direction: normalized.direction,
      source: normalized.source,
      exchange: normalized.exchange,
      timeframe: normalized.timeframe,
      entryPrice: normalized.entryPrice,
      stopLoss: normalized.stopLoss,
      takeProfits: normalized.takeProfits,
      confidence: (normalized.confidenceScore ?? 50) / 100,
      indicators: normalized.indicators,
      sourceRaw: normalized.sourceRaw,
      notes: normalized.notes,
    })

    const json = signal.toJSON()
    return NextResponse.json({ signal: json }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/webhooks/ingest]', err)
    if (err instanceof Error && (err.name === 'ZodError' || err.message.startsWith('TradingView:') || err.message.startsWith('Generic:'))) {
      return NextResponse.json({ error: 'Normalization failed', details: err.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
