/**
 * Per-User MongoDB Container Manager
 *
 * Manages dedicated Docker MongoDB containers for each user session.
 * Each user gets their own isolated MongoDB instance with a host volume
 * for persistence.
 *
 * Container naming: oculus-mongo-<sessionId>
 * Volume path: data/volumes/<sessionId>/mongo
 * Port: dynamically assigned, finds available port starting from 27100
 */
import { execFile } from 'child_process'
import { mkdirSync, existsSync } from 'fs'
import path from 'path'
import net from 'net'

// ── Constants ────────────────────────────────────────────────────────────────

const DOCKER_BIN = process.env.DOCKER_BIN ?? 'docker'
const MONGO_IMAGE = 'mongo:7'
const CONTAINER_PREFIX = 'oculus-mongo-'
const BASE_PORT = 27100 // User containers start scanning from this port
const MONGO_ADMIN_USER = 'oculus'
const MONGO_ADMIN_PASS = 'oculus_user_secret' // Internal auth for user containers

// ── Types ────────────────────────────────────────────────────────────────────

export interface UserMongoContainer {
  /** Docker container name */
  containerName: string
  /** Host port mapped to container's 27017 */
  port: number
  /** MongoDB connection URI for this user */
  uri: string
  /** Host volume path for persistence */
  volumePath: string
  /** Whether the container is currently running */
  running: boolean
}

// ── In-memory registry ───────────────────────────────────────────────────────

/** Maps sessionId → container info */
const containerRegistry = new Map<string, UserMongoContainer>()


// ── Helpers ──────────────────────────────────────────────────────────────────

function findMonorepoRoot(): string {
  let dir = process.cwd()
  for (let i = 0; i < 10; i++) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return path.resolve(process.cwd(), '..', '..')
}

function exec(bin: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: 30_000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(err)
      else resolve({ stdout: stdout ?? '', stderr: stderr ?? '' })
    })
  })
}

/**
 * Find an available port by attempting to bind to it.
 * Scans from BASE_PORT upward, skipping ports already in use.
 */
async function findAvailablePort(): Promise<number> {
  const MAX_ATTEMPTS = 100
  for (let offset = 0; offset < MAX_ATTEMPTS; offset++) {
    const port = BASE_PORT + offset
    const available = await new Promise<boolean>((resolve) => {
      const server = net.createServer()
      server.once('error', () => resolve(false))
      server.once('listening', () => {
        server.close(() => resolve(true))
      })
      server.listen(port, '0.0.0.0')
    })
    if (available) return port
  }
  throw new Error(`No available port found in range ${BASE_PORT}-${BASE_PORT + MAX_ATTEMPTS - 1}`)
}

/**
 * Check if a Docker container exists (running or stopped).
 */
async function containerExists(containerName: string): Promise<boolean> {
  try {
    const { stdout } = await exec(DOCKER_BIN, ['ps', '-a', '--filter', `name=^${containerName}$`, '--format', '{{.Names}}'])
    return stdout.trim() === containerName
  } catch {
    return false
  }
}

/**
 * Check if a Docker container is running.
 */
async function isContainerRunning(containerName: string): Promise<boolean> {
  try {
    const { stdout } = await exec(DOCKER_BIN, ['ps', '--filter', `name=^${containerName}$`, '--format', '{{.Names}}'])
    return stdout.trim() === containerName
  } catch {
    return false
  }
}

/**
 * Get the host port of a running container.
 */
async function getContainerPort(containerName: string): Promise<number | null> {
  try {
    const { stdout } = await exec(DOCKER_BIN, ['port', containerName, '27017'])
    // Output: "0.0.0.0:27100" or ":::27100"
    const match = stdout.match(/:(\d+)/)
    return match ? parseInt(match[1], 10) : null
  } catch {
    return null
  }
}

/**
 * Wait for MongoDB to be ready inside the container.
 */
async function waitForMongo(containerName: string, timeoutMs = 30_000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const { stdout } = await exec(DOCKER_BIN, [
        'exec', containerName,
        'mongosh', '--quiet', '--eval', 'db.runCommand({ ping: 1 }).ok',
        '-u', MONGO_ADMIN_USER, '-p', MONGO_ADMIN_PASS, '--authenticationDatabase', 'admin',
      ])
      if (stdout.trim() === '1') return
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`MongoDB in ${containerName} not ready after ${timeoutMs}ms`)
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Get or create a MongoDB container for a user session.
 *
 * If the container already exists (stopped), it starts it.
 * If it doesn't exist, it creates a new one with a host volume.
 *
 * @param sessionId - The first 12 chars of the user's password hash (session identifier)
 * @returns UserMongoContainer with connection details
 */
export async function ensureUserMongo(sessionId: string): Promise<UserMongoContainer> {
  const cached = containerRegistry.get(sessionId)
  if (cached) {
    const running = await isContainerRunning(cached.containerName)
    if (running) {
      return { ...cached, running: true }
    }
    // Container exists but stopped — try to start it
    const exists = await containerExists(cached.containerName)
    if (exists) {
      await exec(DOCKER_BIN, ['start', cached.containerName])
      await waitForMongo(cached.containerName)
      const updated = { ...cached, running: true }
      containerRegistry.set(sessionId, updated)
      return updated
    }
    // Container was removed (e.g. by logout) — clear stale cache and fall through to recreation
    containerRegistry.delete(sessionId)
  }

  const containerName = `${CONTAINER_PREFIX}${sessionId}`
  const projectRoot = findMonorepoRoot()
  const volumePath = path.join(projectRoot, 'data', 'volumes', sessionId, 'mongo')

  // Check if container already exists on disk (from previous server run)
  const exists = await containerExists(containerName)
  if (exists) {
    const running = await isContainerRunning(containerName)
    if (!running) {
      await exec(DOCKER_BIN, ['start', containerName])
    }
    await waitForMongo(containerName)

    const port = await getContainerPort(containerName)
    if (!port) throw new Error(`Cannot determine port for container ${containerName}`)

    const info: UserMongoContainer = {
      containerName,
      port,
      uri: `mongodb://${MONGO_ADMIN_USER}:${MONGO_ADMIN_PASS}@localhost:${port}/oculus?authSource=admin`,
      volumePath,
      running: true,
    }
    containerRegistry.set(sessionId, info)
    return info
  }

  // Create new container — find an available port dynamically
  mkdirSync(volumePath, { recursive: true })
  const port = await findAvailablePort()

  const dockerArgs = [
    'run', '-d',
    '--name', containerName,
    '--restart', 'unless-stopped',
    '-p', `${port}:27017`,
    '-v', `${volumePath}:/data/db`,
    '-e', `MONGO_INITDB_ROOT_USERNAME=${MONGO_ADMIN_USER}`,
    '-e', `MONGO_INITDB_ROOT_PASSWORD=${MONGO_ADMIN_PASS}`,
    '-e', 'MONGO_INITDB_DATABASE=oculus',
    MONGO_IMAGE,
  ]

  await exec(DOCKER_BIN, dockerArgs)
  await waitForMongo(containerName)

  const info: UserMongoContainer = {
    containerName,
    port,
    uri: `mongodb://${MONGO_ADMIN_USER}:${MONGO_ADMIN_PASS}@localhost:${port}/oculus?authSource=admin`,
    volumePath,
    running: true,
  }

  containerRegistry.set(sessionId, info)
  console.log(`[mongo-manager] Created container ${containerName} on port ${port}`)

  return info
}

/**
 * Stop a user's MongoDB container (e.g., on logout or idle timeout).
 */
export async function stopUserMongo(sessionId: string): Promise<void> {
  const cached = containerRegistry.get(sessionId)
  const containerName = cached?.containerName ?? `${CONTAINER_PREFIX}${sessionId}`

  try {
    await exec(DOCKER_BIN, ['stop', containerName])
    if (cached) {
      containerRegistry.set(sessionId, { ...cached, running: false })
    }
    console.log(`[mongo-manager] Stopped container ${containerName}`)
  } catch (err) {
    console.warn(`[mongo-manager] Failed to stop ${containerName}:`, err)
  }
}

/**
 * Remove a user's MongoDB container and optionally its volume data.
 */
export async function removeUserMongo(sessionId: string, removeData = false): Promise<void> {
  const cached = containerRegistry.get(sessionId)
  const containerName = cached?.containerName ?? `${CONTAINER_PREFIX}${sessionId}`

  try {
    await exec(DOCKER_BIN, ['rm', '-f', containerName])
    containerRegistry.delete(sessionId)
    console.log(`[mongo-manager] Removed container ${containerName}`)
  } catch (err) {
    console.warn(`[mongo-manager] Failed to remove ${containerName}:`, err)
  }

  if (removeData && cached?.volumePath) {
    const { rmSync } = await import('fs')
    try {
      rmSync(cached.volumePath, { recursive: true, force: true })
      console.log(`[mongo-manager] Removed volume data at ${cached.volumePath}`)
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * List all active user MongoDB containers.
 */
export async function listUserMongoContainers(): Promise<UserMongoContainer[]> {
  try {
    const { stdout } = await exec(DOCKER_BIN, [
      'ps', '--filter', `name=${CONTAINER_PREFIX}`, '--format', '{{.Names}}\t{{.Ports}}',
    ])

    const containers: UserMongoContainer[] = []
    for (const line of stdout.trim().split('\n').filter(Boolean)) {
      const [name, ports] = line.split('\t')
      if (!name) continue
      const sessionId = name.replace(CONTAINER_PREFIX, '')
      const portMatch = ports?.match(/:(\d+)->27017/)
      const port = portMatch ? parseInt(portMatch[1], 10) : 0

      containers.push({
        containerName: name,
        port,
        uri: `mongodb://${MONGO_ADMIN_USER}:${MONGO_ADMIN_PASS}@localhost:${port}/oculus?authSource=admin`,
        volumePath: path.join(findMonorepoRoot(), 'data', 'volumes', sessionId, 'mongo'),
        running: true,
      })
    }

    return containers
  } catch {
    return []
  }
}

/**
 * Get the MongoDB URI for a user session.
 * Returns null if the container doesn't exist or isn't running.
 */
export function getUserMongoUri(sessionId: string): string | null {
  const cached = containerRegistry.get(sessionId)
  return cached?.running ? cached.uri : null
}

/**
 * Initialize the container registry from existing Docker containers on startup.
 * Call this once when the server starts.
 */
export async function initContainerRegistry(): Promise<void> {
  try {
    const containers = await listUserMongoContainers()
    for (const c of containers) {
      const sessionId = c.containerName.replace(CONTAINER_PREFIX, '')
      containerRegistry.set(sessionId, c)
    }
    console.log(`[mongo-manager] Registry initialized: ${containers.length} user container(s)`)
  } catch (err) {
    console.warn('[mongo-manager] Failed to initialize registry:', err)
  }
}
