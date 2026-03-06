import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'

export const dynamic = 'force-dynamic'

// GET /api/signals/crawl/[jobId] — poll job status
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params
  return withAuth(async (ctx) => {
    try {
      if (!jobId) {
        return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })
      }

      const job = await ctx.intelligenceModels.SignalCrawlJob.findById(jobId).lean()

      if (!job) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 })
      }

      const obj = job as unknown as Record<string, unknown>
      const { _id, __v, ...rest } = obj
      return NextResponse.json({ id: String(_id), ...rest })
    } catch (err) {
      console.error('[GET /api/signals/crawl/[jobId]]', err)
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Failed to fetch job' },
        { status: 500 },
      )
    }
  })
}

// DELETE /api/signals/crawl/[jobId] — cancel a pending/running job
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params
  return withAuth(async (ctx) => {
    try {
      if (!jobId) {
        return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })
      }

      const job = await ctx.intelligenceModels.SignalCrawlJob.findById(jobId).lean()

      if (!job) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 })
      }

      const obj = job as unknown as Record<string, unknown>
      if (obj.status !== 'pending' && obj.status !== 'running') {
        return NextResponse.json({ error: 'Job is not cancellable' }, { status: 400 })
      }

      // Kill worker process if PID is known
      const pid = obj.pid as number | undefined
      if (pid) {
        try { process.kill(pid, 'SIGTERM') } catch { /* already dead */ }
      }

      await ctx.intelligenceModels.SignalCrawlJob.updateOne(
        { _id: jobId },
        { $set: { status: 'failed', error: 'Cancelled by user', completedAt: new Date() } },
      )
      return NextResponse.json({ ok: true })
    } catch (err) {
      console.error('[DELETE /api/signals/crawl/[jobId]]', err)
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Failed to cancel job' },
        { status: 500 },
      )
    }
  })
}
