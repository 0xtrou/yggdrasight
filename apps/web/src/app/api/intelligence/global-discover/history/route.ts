import { NextResponse } from 'next/server'
import { connectDB } from '@oculus/db'
import { GlobalDiscoveryReport } from '@/lib/intelligence/models/global-discovery-job.model'

export const dynamic = 'force-dynamic'

// GET /api/intelligence/global-discover/history?limit=10
// Returns the list of past global discovery reports, most recent first.
export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 100)
    const reportId = url.searchParams.get('reportId')

    await connectDB()

    // If a specific report is requested, return it in full
    if (reportId) {
      const report = await GlobalDiscoveryReport.findById(reportId).lean()
      if (!report) {
        return NextResponse.json({ report: null, error: 'Report not found' }, { status: 404 })
      }
      const { _id, __v, ...rest } = report as unknown as Record<string, unknown>
      return NextResponse.json({ report: { id: String(_id), ...rest } })
    }

    // Otherwise return the list of reports (without full project arrays for efficiency)
    const reports = await GlobalDiscoveryReport.find(
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
    const latest = await GlobalDiscoveryReport.findOne(
      {},
      {},
      { sort: { createdAt: -1 } },
    ).lean()

    let latestTransformed = null
    if (latest) {
      const { _id, __v, ...rest } = latest as unknown as Record<string, unknown>
      latestTransformed = { id: String(_id), ...rest }
    }

    return NextResponse.json({
      reports: transformed,
      latest: latestTransformed,
    })
  } catch (err) {
    console.error('[GET /api/intelligence/global-discover/history]', err)
    return NextResponse.json({ reports: [], latest: null }, { status: 500 })
  }
}
