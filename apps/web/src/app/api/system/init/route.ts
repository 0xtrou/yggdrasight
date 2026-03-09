import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { withDecryptedConfig } from '@/lib/auth/session'
import { execSync } from 'child_process'
import path from 'path'
import fs from 'fs'

export const dynamic = 'force-dynamic'

const DOCKER_BIN = process.env.DOCKER_BIN ?? 'docker'
const OPENCODE_IMAGE = process.env.OPENCODE_IMAGE ?? 'ghcr.io/anomalyco/opencode'

/**
 * Find the monorepo root by walking up from cwd until we find pnpm-workspace.yaml.
 * Next.js sets cwd to apps/web/ — the monorepo root is 2 levels up.
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

interface InitStep {
  name: string
  status: 'created' | 'already_running' | 'error'
  message: string
}

interface InitResponse {
  steps: InitStep[]
  ready: boolean
}

// POST /api/system/init
// Ensures the persistent Docker agent container is running for the authenticated user.
// Returns an array of init step results for the splash screen to display.
export async function POST(_request: Request) {
  return withAuth(async (ctx) => {
    const steps: InitStep[] = []

    const projectRoot = findMonorepoRoot()
    const containerName = `oculus-agent-${ctx.sessionId}`
    const opencodeDataDir = path.join(projectRoot, 'data', 'opencode-data', ctx.sessionId)
    const workspaceDir = path.join(projectRoot, 'data', 'chat-workspace', ctx.sessionId)
    const configDir = `${process.env.HOME ?? '/root'}/.config/opencode`

    // Ensure persistent data directories exist
    fs.mkdirSync(opencodeDataDir, { recursive: true })
    fs.mkdirSync(workspaceDir, { recursive: true })

    try {
      // Check if container is already running
      let alreadyRunning = false
      try {
        const inspectOut = execSync(
          `"${DOCKER_BIN}" inspect --format "{{.State.Running}}" "${containerName}"`,
          { timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] },
        )
        alreadyRunning = inspectOut.toString().trim() === 'true'
      } catch {
        // Container does not exist — will create below
      }

      if (alreadyRunning) {
        steps.push({
          name: 'docker',
          status: 'already_running',
          message: `Container ${containerName} is already running`,
        })
      } else {
        // Decrypt user config, copy auth.json into the persistent data dir, then create container
        await withDecryptedConfig(ctx, async (configPaths) => {
          // Remove any stopped container so we can recreate it cleanly
          try {
            execSync(`"${DOCKER_BIN}" rm -f "${containerName}"`, {
              timeout: 5000,
              stdio: 'ignore',
            })
          } catch {
            // Ignore — container may not exist at all
          }

          // Copy auth.json into the persistent data dir.
          // The container volume-mounts the whole opencodeDataDir, so auth.json
          // must live inside it (temp-file bind mounts break when the file is cleaned up).
          const persistentAuthJson = path.join(opencodeDataDir, 'auth.json')
          if (configPaths.authJsonPath && fs.existsSync(configPaths.authJsonPath)) {
            fs.copyFileSync(configPaths.authJsonPath, persistentAuthJson)
          }

          // Create and start the persistent agent container (sleeps forever; we exec into it)
          const dockerRunCmd = [
            `"${DOCKER_BIN}"`,
            'run', '-d',
            '--name', `"${containerName}"`,
            '--network', 'host',
            '-v', `"${opencodeDataDir}:/root/.local/share/opencode"`,
            '-v', `"${configDir}:/root/.config/opencode:ro"`,
            '-v', `"${workspaceDir}:/workspace:rw"`,
            '-e', 'HOME=/root',
            '--entrypoint', '/bin/sleep',
            OPENCODE_IMAGE,
            'infinity',
          ].join(' ')

          execSync(dockerRunCmd, { timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] })
        })

        steps.push({
          name: 'docker',
          status: 'created',
          message: `Container ${containerName} created and started`,
        })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      steps.push({ name: 'docker', status: 'error', message })
    }

    const ready = steps.every((s) => s.status !== 'error')
    const body: InitResponse = { steps, ready }
    return NextResponse.json(body)
  })
}
