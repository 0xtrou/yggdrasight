import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params
  return withAuth(async (ctx) => {
    try {
      if (!jobId) {
        return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })
      }

      const job = await ctx.intelligenceModels.ClassificationJob.findById(jobId).lean()

      if (!job) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 })
      }

      return NextResponse.json({
        status: job.status,
        data: job.result ?? null,
        subAgentResults: job.subAgentResults ?? null,
        rawOutput: job.rawOutput ?? null,
        error: job.error ?? null,
        logs: job.logs ?? [],
        startedAt: job.startedAt,
        completedAt: job.completedAt,
      })
    } catch (err) {
      console.error('[GET /api/intelligence/classify/[jobId]]', err)
      return NextResponse.json(
        { status: 'failed', data: null, error: err instanceof Error ? err.message : 'Failed to fetch job status' },
        { status: 500 }
      )
    }
  })
}
