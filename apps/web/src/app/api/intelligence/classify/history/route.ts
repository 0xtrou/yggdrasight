import { NextResponse } from 'next/server'
import { connectDB } from '@oculus/db'
import { ClassificationJob, ClassificationSnapshot } from '@/lib/intelligence/models/classification-job.model'
import { detectMigrationsInSeries } from '@/lib/intelligence/classification/migration'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const symbol = url.searchParams.get('symbol')?.toUpperCase()
    if (!symbol) {
      return NextResponse.json({ snapshots: [], migrations: [], latest: null })
    }

    const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 100)

    await connectDB()

    const snapshots = await ClassificationSnapshot.find(
      { symbol },
      { _id: 1, symbol: 1, modelId: 1, primaryCategory: 1, categoryWeights: 1, crackAlignment: 1, classification: 1, jobId: 1, classifiedAt: 1 },
      { sort: { classifiedAt: -1 }, limit },
    ).lean()

    const transformed = snapshots.map((s) => {
      const obj = s as unknown as Record<string, unknown>
      const { _id, __v, ...rest } = obj
      return { id: String(_id), ...rest }
    })

    const migrations = detectMigrationsInSeries(
      snapshots.map(s => ({
        symbol: s.symbol,
        primaryCategory: s.primaryCategory,
        categoryWeights: s.categoryWeights,
        classifiedAt: s.classifiedAt,
      }))
    )

    return NextResponse.json({
      snapshots: transformed,
      migrations,
      latest: transformed[0] ?? null,
    })
  } catch (err) {
    console.error('[GET /api/intelligence/classify/history]', err)
    return NextResponse.json({ snapshots: [], migrations: [], latest: null }, { status: 500 })
  }
}
