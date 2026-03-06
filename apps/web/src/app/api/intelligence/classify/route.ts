import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import { withAuth } from '@/lib/auth/middleware'
import { getAgentModelMapFromConnection } from '@/lib/auth/intelligence-models'
import { getUserMongoUri } from '@/lib/auth/mongo-manager'

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
  return withAuth(async (ctx) => {
    const body = await request.json() as { symbol?: string }
    const symbol = (body.symbol ?? 'BTC').toUpperCase()

    // Fetch model config from user's MongoDB
    const agentModelMap = await getAgentModelMapFromConnection(ctx.connection)
    const model = agentModelMap['*'] ?? Object.values(agentModelMap)[0] ?? 'github-copilot/gpt-4.1'

    console.log(`[classify] Creating job for ${symbol} with model ${model}`)

    const job = await ctx.intelligenceModels.ClassificationJob.create({
      symbol,
      modelId: model,
      agentModels: Object.keys(agentModelMap).length > 0 ? agentModelMap : null,
      status: 'pending',
      startedAt: new Date(),
    })

    const jobId = String(job._id)
    console.log(`[classify] Job created: ${jobId}`)

    // Spawn the worker as a detached child process
    const projectRoot = findMonorepoRoot()
    const workerScript = path.join(projectRoot, 'scripts', 'classify-worker.ts')
    const userMongoUri = getUserMongoUri(ctx.sessionId)

    const child = spawn(BUN_BIN, [workerScript, jobId], {
      detached: true,
      stdio: ['ignore', 'ignore', 'pipe'], // Capture stderr for debugging
      cwd: projectRoot, // Run worker from monorepo root
      env: {
        ...process.env,
        ...(userMongoUri ? { OCULUS_MONGODB_URI: userMongoUri } : {}),
        OCULUS_PASSWORD_HASH: ctx.passwordHash,
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
      await ctx.intelligenceModels.ClassificationJob.updateOne({ _id: job._id }, { $set: { pid: child.pid } })
    }

    console.log(`[classify] Worker spawned (PID ${child.pid}) for job ${jobId}`)

    return NextResponse.json({ jobId })
  })
}

// GET /api/intelligence/classify?symbol=LINK
// Returns the most recent active (pending/running) job for a symbol, if any.
export async function GET(request: Request) {
  return withAuth(async (ctx) => {
    const url = new URL(request.url)
    const symbol = url.searchParams.get('symbol')?.toUpperCase()
    if (!symbol) {
      return NextResponse.json({ job: null })
    }

    const job = await ctx.intelligenceModels.ClassificationJob.findOne(
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
  })
}

// DELETE /api/intelligence/classify?jobId=xxx
// Cancels an active classification job — marks it as failed, kills the worker process.
export async function DELETE(request: Request) {
  return withAuth(async (ctx) => {
    const url = new URL(request.url)
    const jobId = url.searchParams.get('jobId')
    if (!jobId) {
      return NextResponse.json({ ok: false, error: 'Missing jobId' }, { status: 400 })
    }

    const job = await ctx.intelligenceModels.ClassificationJob.findById(jobId)

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
  })
}
