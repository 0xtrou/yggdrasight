import { NextResponse } from 'next/server'
import { execSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import { withAuth } from '@/lib/auth/middleware'
import { getAgentModelMapFromConnection } from '@/lib/auth/intelligence-models'
import { getUserMongoUri } from '@/lib/auth/mongo-manager'
import { toContainerUri } from '@/lib/auth/container-utils'

export const dynamic = 'force-dynamic'

const DOCKER_BIN = process.env.DOCKER_BIN ?? 'docker'

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

// POST /api/chat/refresh-data/restart
// Restarts the container-internal data refresh loop with a new interval.
export async function POST(request: Request) {
  return withAuth(async (ctx) => {
    const containerName = `oculus-agent-${ctx.sessionId}`
    const body = await request.json().catch(() => ({})) as { interval?: number }

    let interval: number
    if (typeof body.interval === 'number') {
      interval = body.interval
    } else {
      const agentModelMap = await getAgentModelMapFromConnection(ctx.connection)
      interval = parseInt(agentModelMap.chatDataRefreshInterval || '10', 10)
    }

    // Kill existing data-refresh process
    try {
      execSync(`"${DOCKER_BIN}" exec "${containerName}" pkill -f "data-refresh.js"`, {
        timeout: 5000, stdio: 'ignore',
      })
    } catch { /* no existing process */ }

    if (interval <= 0) {
      return NextResponse.json({ ok: true, interval: 0, status: 'disabled' })
    }

    const mongoUri = getUserMongoUri(ctx.sessionId)
    if (!mongoUri) {
      return NextResponse.json({ error: 'User MongoDB not available' }, { status: 500 })
    }

    try {
      const projectRoot = findMonorepoRoot()
      const workspaceDir = path.join(projectRoot, 'data', 'chat-workspace', ctx.sessionId)

      // Copy latest data-refresh.js to workspace
      const dataRefreshSrc = path.join(projectRoot, 'scripts', 'data-refresh.js')
      if (fs.existsSync(dataRefreshSrc)) {
        fs.copyFileSync(dataRefreshSrc, path.join(workspaceDir, '.data-refresh.js'))
      }

      // Run boot script with new interval
      execSync(
        `"${DOCKER_BIN}" exec -d -e MONGODB_URI="${toContainerUri(mongoUri)}" -e REFRESH_INTERVAL="${interval}" "${containerName}" sh /workspace/.boot.sh`,
        { timeout: 10000, stdio: 'ignore' },
      )
      return NextResponse.json({ ok: true, interval, status: 'running' })
    } catch (err) {
      return NextResponse.json({ error: 'Failed to restart', detail: String(err) }, { status: 500 })
    }
  })
}
