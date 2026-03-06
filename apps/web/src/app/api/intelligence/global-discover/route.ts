import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import { connectDB } from '@oculus/db'
import { GlobalDiscoveryJob, GlobalDiscoveryReport } from '@/lib/intelligence/models/global-discovery-job.model'
import { getAgentModelMap } from '@/lib/intelligence/models/agent-model-config.model'

export const dynamic = 'force-dynamic'

const BUN_BIN = process.env.BUN_BIN ?? '/Users/mrk/.bun/bin/bun'

/**
 * Find the monorepo root by walking up from cwd until we find pnpm-workspace.yaml.
 */
function findMonorepoRoot(): string {
  let dir = process.cwd()
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return path.resolve(process.cwd(), '..', '..')
}

// POST /api/intelligence/global-discover
// Creates a GlobalDiscoveryJob, spawns a detached worker, returns jobId immediately.
export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      depth?: number
      agentCount?: number
    }

    const depth = Math.min(Math.max(Number(body.depth) || 20, 1), 100)
    const agentCount = Math.min(Math.max(Number(body.agentCount) || 5, 1), 20)

    await connectDB()
    const agentModelMap = await getAgentModelMap()
    const model = agentModelMap['*'] ?? Object.values(agentModelMap)[0] ?? 'github-copilot/gpt-4.1'

    // Find the latest report for context inheritance
    const latestReport = await GlobalDiscoveryReport.findOne(
      {},
      { _id: 1 },
      { sort: { createdAt: -1 } },
    ).lean()

    console.log(`[global-discover] Creating job: depth=${depth}, agents=${agentCount}, model=${model}`)

    const job = await GlobalDiscoveryJob.create({
      depth,
      agentCount,
      modelId: model,
      agentModels: Object.keys(agentModelMap).length > 0 ? agentModelMap : null,
      status: 'pending',
      previousReportId: latestReport?._id ?? null,
      startedAt: new Date(),
    })

    const jobId = String(job._id)
    console.log(`[global-discover] Job created: ${jobId}`)

    // Spawn the worker as a detached child process
    const projectRoot = findMonorepoRoot()
    const workerScript = path.join(projectRoot, 'scripts', 'global-discovery-worker.ts')
    const child = spawn(BUN_BIN, [workerScript, jobId], {
      detached: true,
      stdio: ['ignore', 'ignore', 'pipe'],
      cwd: projectRoot,
      env: {
        ...process.env,
        MONGODB_URI: process.env.MONGODB_URI || 'mongodb://oculus:oculus_dev_secret@localhost:27017/oculus-trading?authSource=admin',
        NODE_PATH: [
          path.join(projectRoot, 'packages/db/node_modules'),
          path.join(projectRoot, 'node_modules'),
        ].join(path.delimiter),
      },
    })

    if (child.stderr) {
      let stderrBuf = ''
      child.stderr.on('data', (chunk: Buffer) => { stderrBuf += chunk.toString() })
      child.on('close', (code) => {
        if (code !== 0 && stderrBuf.trim()) {
          console.error(`[global-discover] Worker exited with code ${code}. stderr: ${stderrBuf.substring(0, 500)}`)
        }
      })
    }

    child.unref()

    if (child.pid) {
      await GlobalDiscoveryJob.updateOne({ _id: job._id }, { $set: { pid: child.pid } })
    }

    console.log(`[global-discover] Worker spawned (PID ${child.pid}) for job ${jobId}`)

    return NextResponse.json({ jobId })
  } catch (err) {
    console.error('[POST /api/intelligence/global-discover]', err)
    return NextResponse.json(
      { jobId: null, error: err instanceof Error ? err.message : 'Failed to start global discovery' },
      { status: 500 }
    )
  }
}

// GET /api/intelligence/global-discover
// Returns the most recent active (pending/running) job, if any.
export async function GET() {
  try {
    await connectDB()
    const job = await GlobalDiscoveryJob.findOne(
      { status: { $in: ['pending', 'running'] } },
      { _id: 1, status: 1, depth: 1, agentCount: 1, startedAt: 1 },
      { sort: { startedAt: -1 } },
    ).lean()

    if (!job) {
      return NextResponse.json({ job: null })
    }

    return NextResponse.json({
      job: {
        id: String(job._id),
        status: job.status,
        depth: job.depth,
        agentCount: job.agentCount,
        startedAt: job.startedAt,
      },
    })
  } catch (err) {
    console.error('[GET /api/intelligence/global-discover]', err)
    return NextResponse.json({ job: null })
  }
}

// DELETE /api/intelligence/global-discover?jobId=xxx
// Cancels an active global discovery job.
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url)
    const jobId = url.searchParams.get('jobId')
    if (!jobId) {
      return NextResponse.json({ ok: false, error: 'Missing jobId' }, { status: 400 })
    }

    await connectDB()
    const job = await GlobalDiscoveryJob.findById(jobId)

    if (!job) {
      return NextResponse.json({ ok: false, error: 'Job not found' }, { status: 404 })
    }

    if (job.status !== 'pending' && job.status !== 'running') {
      return NextResponse.json({ ok: true, message: 'Job already finished' })
    }

    if (job.pid) {
      try {
        process.kill(job.pid, 'SIGTERM')
        console.log(`[global-discover] Sent SIGTERM to worker PID ${job.pid}`)
      } catch {
        // Process may already be dead
      }
    }

    job.status = 'failed'
    job.error = 'Cancelled by user'
    job.completedAt = new Date()
    await job.save()

    console.log(`[global-discover] Job ${jobId} cancelled by user`)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/intelligence/global-discover]', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to cancel' },
      { status: 500 }
    )
  }
}
