import { NextRequest, NextResponse } from 'next/server'
import { connectDB, TrackedAsset } from '@oculus/db'

export const dynamic = 'force-dynamic'

// GET /api/tracked-assets — list all tracked asset symbols
export async function GET() {
  try {
    await connectDB()
    const assets = await TrackedAsset.find({}).sort({ addedAt: 1 }).lean()
    return NextResponse.json(
      assets.map((a) => ({
        symbol: a.symbol,
        name: a.name ?? null,
        addedAt: a.addedAt,
      })),
    )
  } catch (err) {
    console.error('[GET /api/tracked-assets]', err)
    return NextResponse.json({ error: 'Failed to fetch tracked assets' }, { status: 500 })
  }
}

// POST /api/tracked-assets — add a symbol to tracking
// Body: { symbol: string, name?: string }
export async function POST(req: NextRequest) {
  try {
    await connectDB()
    const body = await req.json()
    const symbol = (body.symbol as string)?.trim().toUpperCase().replace(/USDT$/i, '')

    if (!symbol || symbol.length === 0 || symbol.length > 20) {
      return NextResponse.json({ error: 'Invalid symbol' }, { status: 400 })
    }

    // Upsert — idempotent add
    const doc = await TrackedAsset.findOneAndUpdate(
      { symbol },
      { $setOnInsert: { symbol, name: body.name ?? null, addedAt: new Date() } },
      { upsert: true, new: true, lean: true },
    )

    if (!doc) {
      return NextResponse.json({ error: 'Failed to upsert asset' }, { status: 500 })
    }

    return NextResponse.json({
      symbol: doc.symbol,
      name: doc.name ?? null,
      addedAt: doc.addedAt,
      created: true,
    })
  } catch (err) {
    console.error('[POST /api/tracked-assets]', err)
    return NextResponse.json({ error: 'Failed to add asset' }, { status: 500 })
  }
}

// DELETE /api/tracked-assets?symbol=X — remove a symbol from tracking
export async function DELETE(req: NextRequest) {
  try {
    await connectDB()
    const symbol = req.nextUrl.searchParams.get('symbol')?.trim().toUpperCase().replace(/USDT$/i, '')

    if (!symbol) {
      return NextResponse.json({ error: 'Missing symbol parameter' }, { status: 400 })
    }

    const result = await TrackedAsset.deleteOne({ symbol })

    return NextResponse.json({
      symbol,
      deleted: result.deletedCount > 0,
    })
  } catch (err) {
    console.error('[DELETE /api/tracked-assets]', err)
    return NextResponse.json({ error: 'Failed to remove asset' }, { status: 500 })
  }
}
