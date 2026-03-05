import { NextResponse } from 'next/server'
import { connectDB } from '@oculus/db'
import { DiscoveryJob } from '@/lib/intelligence/models/discovery-job.model'

export const dynamic = 'force-dynamic'

// GET /api/feed/discover/[jobId]
// Poll endpoint — returns job status, result, and error.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params
    if (!jobId) {
      return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })
    }

    await connectDB()
    const job = await DiscoveryJob.findById(jobId).lean()

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    return NextResponse.json({
      status: job.status,
      data: job.result ?? null,
      rawOutput: job.rawOutput ?? null,
      error: job.error ?? null,
      logs: job.logs ?? [],
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    })
  } catch (err) {
    console.error('[GET /api/feed/discover/[jobId]]', err)
    return NextResponse.json(
      { status: 'failed', data: null, error: err instanceof Error ? err.message : 'Failed to fetch job status' },
      { status: 500 }
    )
  }
}
