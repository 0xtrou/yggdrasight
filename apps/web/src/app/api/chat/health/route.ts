import { NextResponse } from 'next/server'
import { execSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import { withAuth } from '@/lib/auth/middleware'

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

// GET /api/chat/health
// Returns the health status of the user's chat agent container.
export async function GET() {
  return withAuth(async (ctx) => {
    const containerName = `oculus-agent-${ctx.sessionId}`
    const projectRoot = findMonorepoRoot()
    const workspaceDir = path.join(projectRoot, 'data', 'chat-workspace', ctx.sessionId)

    const health: {
      container: { running: boolean; name: string; uptime?: string; image?: string }
      refreshLoop: { running: boolean }
      workspace: { exists: boolean; lastUpdated?: string; assetCount?: number }
    } = {
      container: { running: false, name: containerName },
      refreshLoop: { running: false },
      workspace: { exists: false },
    }

    // Check container status
    try {
      const inspectOut = execSync(
        `"${DOCKER_BIN}" inspect --format "{{.State.Running}}|{{.State.StartedAt}}|{{.Config.Image}}" "${containerName}"`,
        { timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] },
      ).toString().trim()

      const [running, startedAt, image] = inspectOut.split('|')
      health.container.running = running === 'true'
      if (startedAt) health.container.uptime = startedAt
      if (image) health.container.image = image
    } catch {
      // Container doesn't exist or inspect failed
    }

    // Check refresh loop (look for the data-refresh.js script running in the container)
    if (health.container.running) {
      try {
        const psOut = execSync(
          `"${DOCKER_BIN}" exec "${containerName}" ps aux`,
          { timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] },
        ).toString()
        health.refreshLoop.running = psOut.includes('data-refresh.js')
      } catch { /* ignore */ }
    }

    // Check workspace data freshness
    const indexPath = path.join(workspaceDir, 'index.json')
    if (fs.existsSync(indexPath)) {
      health.workspace.exists = true
      try {
        const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as {
          lastUpdated?: string
          assets?: unknown[]
        }
        health.workspace.lastUpdated = indexData.lastUpdated
        health.workspace.assetCount = indexData.assets?.length || 0
      } catch { /* ignore */ }
    }

    return NextResponse.json(health)
  })
}
