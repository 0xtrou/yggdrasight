import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params
  return withAuth(async (ctx) => {
    if (!jobId) {
      return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })
    }

    const job = await ctx.intelligenceModels.AnalysisJob.findById(jobId).lean()

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    return NextResponse.json({
      id: String(job._id),
      agentId: job.agentId,
      status: job.status,
      error: job.error ?? null,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    })
  })
}
