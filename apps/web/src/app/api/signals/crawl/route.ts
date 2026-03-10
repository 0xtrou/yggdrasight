import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import { withAuth } from '@/lib/auth/middleware'
import { getAgentModelMapFromConnection } from '@/lib/auth/intelligence-models'
import { getUserMongoUri } from '@/lib/auth/mongo-manager'

export const dynamic = 'force-dynamic'

const BUN_BIN = process.env.BUN_BIN ?? '/Users/mrk/.bun/bin/bun'

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

// POST /api/signals/crawl — start a new AI signal crawl job
export async function POST(req: NextRequest) {
  return withAuth(async (ctx) => {
    const body = await req.json() as { symbols?: string[]; screen?: string; agentSlug?: string }
    const raw = body.symbols ?? []
    const screen = typeof body.screen === 'string' && body.screen.trim() ? body.screen.trim() : 'signals'
    const agentSlug = typeof body.agentSlug === 'string' && body.agentSlug.trim() ? body.agentSlug.trim() : 'signal_crawler'
    const symbols = raw
      .map((s) => String(s).toUpperCase().trim())
      .filter((s) => s.length > 0 && s.length <= 20)
      .slice(0, 10) // cap at 10 symbols per job

    if (symbols.length === 0) {
      return NextResponse.json({ error: 'No valid symbols provided' }, { status: 400 })
    }

    // Resolve model — dedicated signal_crawler key, fall back to opencode/big-pickle
    const agentModelMap = await getAgentModelMapFromConnection(ctx.connection)
    const model =
      agentModelMap['signal_crawler'] ??
      agentModelMap['*'] ??
      'opencode/big-pickle'

    const job = await ctx.intelligenceModels.SignalCrawlJob.create({
      screen,
      agentSlug,
      symbols,
      modelId: model,
      status: 'pending',
      startedAt: new Date(),
    })

    const jobId = String(job._id)

    // Spawn detached worker
    const projectRoot = findMonorepoRoot()
    const workerScript = path.join(projectRoot, 'scripts', 'signal-crawl-worker.ts')
    const userMongoUri = getUserMongoUri(ctx.sessionId)

    // Write password hash to a temp secret file so it's not leaked via env
    const secretsDir = path.join(projectRoot, 'tmp', 'secrets')
    fs.mkdirSync(secretsDir, { recursive: true })
    const secretFilePath = path.join(secretsDir, `${jobId}.key`)
    fs.writeFileSync(secretFilePath, ctx.passwordHash ?? '', { mode: 0o600 })

    const child = spawn(BUN_BIN, [workerScript, jobId], {
      detached: true,
      stdio: ['ignore', 'ignore', 'pipe'],
      cwd: projectRoot,
      env: {
        NODE_ENV: process.env.NODE_ENV,
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        DOCKER_HOST: process.env.DOCKER_HOST,
        DOCKER_BIN: process.env.DOCKER_BIN,
        BUN_BIN: process.env.BUN_BIN,
        OPENCODE_IMAGE: process.env.OPENCODE_IMAGE,
        ...(userMongoUri ? { OCULUS_MONGODB_URI: userMongoUri } : {}),
        OCULUS_SECRET_FILE: secretFilePath,
      },
    })

    // Clean up secret file after worker exits
    child.on('close', () => { try { fs.unlinkSync(secretFilePath) } catch { /* already gone */ } })

    child.stderr?.on('data', (data: Buffer) => {
      console.error(`[signal-crawl-worker stderr] ${data.toString().trim()}`)
    })

    child.unref()

    return NextResponse.json({ jobId, symbols, model }, { status: 201 })
  })
}

// GET /api/signals/crawl — list recent crawl jobs
export async function GET(req: NextRequest) {
  return withAuth(async (ctx) => {
    const filter: Record<string, unknown> = {}
    const screenParam = req.nextUrl.searchParams.get('screen')
    const agentParam = req.nextUrl.searchParams.get('agent')
    if (screenParam) filter.screen = screenParam
    if (agentParam) filter.agentSlug = agentParam

    const jobs = await ctx.intelligenceModels.SignalCrawlJob.find(filter)
      .sort({ startedAt: -1 })
      .limit(50)
      .lean()

    const transformed = jobs.map((j) => {
      const obj = j as unknown as Record<string, unknown>
      const { _id, __v, ...rest } = obj
      return { id: String(_id), ...rest }
    })

    return NextResponse.json({ jobs: transformed })
  })
}
