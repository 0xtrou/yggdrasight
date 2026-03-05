import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import { connectDB } from '@oculus/db'
import { ClassificationJob } from '@/lib/intelligence/models/classification-job.model'

export const dynamic = 'force-dynamic'

const BUN_BIN = process.env.BUN_BIN ?? '/Users/mrk/.bun/bin/bun'

/**
 * Find the monorepo root by walking up from cwd until we find pnpm-workspace.yaml.
 * Next.js sets cwd to apps/web/ — the worker script lives at the monorepo root.
 */
function findMonorepoRoot(): string {
  let dir = process.cwd()
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  // Fallback: assume cwd is apps/web, go up 2 levels
  return path.resolve(process.cwd(), '..', '..')
}

// POST /api/intelligence/classify
// Creates a ClassificationJob in MongoDB, spawns a detached worker, returns jobId immediately.
export async function POST(request: Request) {
  try {
    const body = await request.json() as { symbol?: string; model?: string; agentModels?: Record<string, string> }
    const symbol = (body.symbol ?? 'BTC').toUpperCase()
    const model = body.model ?? 'github-copilot/gpt-4.1'
    const agentModels = (body.agentModels && typeof body.agentModels === 'object') ? body.agentModels : null

    console.log(`[classify] Creating job for ${symbol} with model ${model}`)

    // Connect to DB and create the job
    await connectDB()
    const job = await ClassificationJob.create({
      symbol,
      modelId: model,
      agentModels,
      status: 'pending',
      startedAt: new Date(),
    })

    const jobId = String(job._id)
    console.log(`[classify] Job created: ${jobId}`)

    // Spawn the worker as a detached child process
    const projectRoot = findMonorepoRoot()
    const workerScript = path.join(projectRoot, 'scripts', 'classify-worker.ts')
    const child = spawn(BUN_BIN, [workerScript, jobId], {
      detached: true,
      stdio: ['ignore', 'ignore', 'pipe'], // Capture stderr for debugging
      cwd: projectRoot, // Run worker from monorepo root
      env: {
        ...process.env,
        MONGODB_URI: process.env.MONGODB_URI || 'mongodb://oculus:oculus_dev_secret@localhost:27017/oculus-trading?authSource=admin',
        NODE_PATH: [
          path.join(projectRoot, 'packages/db/node_modules'),
          path.join(projectRoot, 'node_modules'),
        ].join(path.delimiter),
      },
    })

    // Log any stderr from the worker for debugging (non-blocking)
    if (child.stderr) {
      let stderrBuf = ''
      child.stderr.on('data', (chunk: Buffer) => { stderrBuf += chunk.toString() })
      child.on('close', (code) => {
        if (code !== 0 && stderrBuf.trim()) {
          console.error(`[classify] Worker exited with code ${code}. stderr: ${stderrBuf.substring(0, 500)}`)
        }
      })
    }

    // Unref so the parent (Next.js server) doesn't wait for the child
    child.unref()

    // Save the PID so we can kill it on cancel
    if (child.pid) {
      await ClassificationJob.updateOne({ _id: job._id }, { $set: { pid: child.pid } })
    }

    console.log(`[classify] Worker spawned (PID ${child.pid}) for job ${jobId}`)

    return NextResponse.json({ jobId })
  } catch (err) {
    console.error('[POST /api/intelligence/classify]', err)
    return NextResponse.json(
      { jobId: null, error: err instanceof Error ? err.message : 'Failed to start classification' },
      { status: 500 }
    )
  }
}

// GET /api/intelligence/classify?symbol=LINK
// Returns the most recent active (pending/running) job for a symbol, if any.
export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const symbol = url.searchParams.get('symbol')?.toUpperCase()
    if (!symbol) {
      return NextResponse.json({ job: null })
    }

    await connectDB()
    const job = await ClassificationJob.findOne(
      { symbol, status: { $in: ['pending', 'running'] } },
      { _id: 1, status: 1, startedAt: 1 },
      { sort: { startedAt: -1 } },
    ).lean()

    if (!job) {
      return NextResponse.json({ job: null })
    }

    return NextResponse.json({
      job: {
        id: String(job._id),
        status: job.status,
        startedAt: job.startedAt,
      },
    })
  } catch (err) {
    console.error('[GET /api/intelligence/classify]', err)
    return NextResponse.json({ job: null })
  }
}

// DELETE /api/intelligence/classify?jobId=xxx
// Cancels an active classification job — marks it as failed, kills the worker process.
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url)
    const jobId = url.searchParams.get('jobId')
    if (!jobId) {
      return NextResponse.json({ ok: false, error: 'Missing jobId' }, { status: 400 })
    }

    await connectDB()
    const job = await ClassificationJob.findById(jobId)

    if (!job) {
      return NextResponse.json({ ok: false, error: 'Job not found' }, { status: 404 })
    }

    if (job.status !== 'pending' && job.status !== 'running') {
      return NextResponse.json({ ok: true, message: 'Job already finished' })
    }

    // Try to kill the worker process if we have a PID
    if (job.pid) {
      try {
        process.kill(job.pid, 'SIGTERM')
        console.log(`[classify] Sent SIGTERM to worker PID ${job.pid}`)
      } catch {
        // Process may already be dead — that's fine
      }
    }

    // Mark job as failed/cancelled
    job.status = 'failed'
    job.error = 'Cancelled by user'
    job.completedAt = new Date()
    await job.save()

    console.log(`[classify] Job ${jobId} cancelled by user`)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/intelligence/classify]', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to cancel' },
      { status: 500 }
    )
  }
}
