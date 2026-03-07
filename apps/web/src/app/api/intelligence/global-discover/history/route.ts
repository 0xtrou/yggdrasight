import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'

export const dynamic = 'force-dynamic'

// GET /api/intelligence/global-discover/history?limit=10
// Returns the list of past global discovery reports, most recent first.
export async function GET(request: Request) {
  return withAuth(async (ctx) => {
    try {
      const url = new URL(request.url)
      const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 100)
      const reportId = url.searchParams.get('reportId')

      // If a specific report is requested, return it in full
      if (reportId) {
        const report = await ctx.intelligenceModels.GlobalDiscoveryReport.findById(reportId).lean()
        if (!report) {
          return NextResponse.json({ report: null, error: 'Report not found' }, { status: 404 })
        }
        const { _id, __v, ...rest } = report as unknown as Record<string, unknown>
        const r = { id: String(_id), ...rest } as typeof rest & {
          projects?: Array<{ marketCap: number | null }>
          newProjects?: Array<{ marketCap: number | null }>
        }
        const sortByMcap = (arr: Array<{ marketCap: number | null }>) =>
          arr.sort((a, b) => {
            if (a.marketCap === null && b.marketCap === null) return 0
            if (a.marketCap === null) return 1
            if (b.marketCap === null) return -1
            return b.marketCap - a.marketCap
          })
        if (Array.isArray(r.projects)) sortByMcap(r.projects)
        if (Array.isArray(r.newProjects)) sortByMcap(r.newProjects)
        return NextResponse.json({ report: r })
      }

      // Otherwise return the list of reports (without full project arrays for efficiency)
      const reports = await ctx.intelligenceModels.GlobalDiscoveryReport.find(
        {},
        {
          _id: 1,
          generation: 1,
          jobId: 1,
          parentReportId: 1,
          marketDirection: 1,
          executiveSummary: 1,
          emergingTrends: 1,
          depth: 1,
          agentCount: 1,
          totalProjects: 1,
          newProjectCount: 1,
          createdAt: 1,
        },
        { sort: { createdAt: -1 }, limit },
      ).lean()

      const transformed = reports.map((r) => {
        const obj = r as unknown as Record<string, unknown>
        const { _id, __v, ...rest } = obj
        return { id: String(_id), ...rest }
      })

      // Also get the latest full report
      const latest = await ctx.intelligenceModels.GlobalDiscoveryReport.findOne(
        {},
        {},
        { sort: { createdAt: -1 } },
      ).lean()

      let latestTransformed = null
      if (latest) {
        const { _id, __v, ...rest } = latest as unknown as Record<string, unknown>
        const r = { id: String(_id), ...rest } as typeof rest & {
          projects?: Array<{ marketCap: number | null }>
          newProjects?: Array<{ marketCap: number | null }>
        }
        const sortByMcap = (arr: Array<{ marketCap: number | null }>) =>
          arr.sort((a, b) => {
            if (a.marketCap === null && b.marketCap === null) return 0
            if (a.marketCap === null) return 1
            if (b.marketCap === null) return -1
            return b.marketCap - a.marketCap
          })
        if (Array.isArray(r.projects)) sortByMcap(r.projects)
        if (Array.isArray(r.newProjects)) sortByMcap(r.newProjects)
        latestTransformed = r
      }

      return NextResponse.json({
        reports: transformed,
        latest: latestTransformed,
      })
    } catch (err) {
      console.error('[GET /api/intelligence/global-discover/history]', err)
      return NextResponse.json({ reports: [], latest: null }, { status: 500 })
    }
  })
}
