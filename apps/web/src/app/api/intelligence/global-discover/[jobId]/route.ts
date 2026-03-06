import { NextResponse } from 'next/server'
import { connectDB } from '@oculus/db'
import { GlobalDiscoveryJob } from '@/lib/intelligence/models/global-discovery-job.model'

export const dynamic = 'force-dynamic'

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
    const job = await GlobalDiscoveryJob.findById(jobId).lean()

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    return NextResponse.json({
      status: job.status,
      depth: job.depth,
      agentCount: job.agentCount,
      agentResults: job.agentResults ?? null,
      reportId: job.reportId ? String(job.reportId) : null,
      error: job.error ?? null,
      logs: job.logs ?? [],
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    })
  } catch (err) {
    console.error('[GET /api/intelligence/global-discover/[jobId]]', err)
    return NextResponse.json(
      { status: 'failed', error: err instanceof Error ? err.message : 'Failed to fetch job status' },
      { status: 500 }
    )
  }
}
