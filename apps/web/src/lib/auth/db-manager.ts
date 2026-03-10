/**
 * Dynamic Per-User MongoDB Connection Manager
 *
 * Replaces the single shared `connectDB()` with a session-aware connection
 * that routes to each user's dedicated MongoDB container.
 *
 * For the "system" database (user registry on the main Mongo), use connectSystemDB().
 * For per-user databases, use connectUserDB(sessionId).
 */
import mongoose from 'mongoose'
import { getUserMongoUri, ensureUserMongo } from './mongo-manager'

// ── Connection Pools ────────────────────────────────────────────────────────

/** System DB connection (main shared MongoDB for user registry) */
let systemConnection: mongoose.Connection | null = null

/** Per-user connections: sessionId → mongoose.Connection */
const userConnections = new Map<string, mongoose.Connection>()

// ── System DB ───────────────────────────────────────────────────────────────

const SYSTEM_MONGODB_URI = process.env.MONGODB_URI || 'mongodb://oculus:oculus_dev_secret@localhost:27017/oculus-system?authSource=admin'

/**
 * Connect to the system MongoDB (the main shared instance).
 * Used for the user registry (session → encrypted config mapping).
 */
export async function connectSystemDB(): Promise<mongoose.Connection> {
  if (systemConnection && systemConnection.readyState === 1) {
    return systemConnection
  }

  systemConnection = mongoose.createConnection(SYSTEM_MONGODB_URI, {
    bufferCommands: false,
  })

  await systemConnection.asPromise()
  console.log('[db-manager] Connected to system MongoDB')
  return systemConnection
}

// ── User DB ─────────────────────────────────────────────────────────────────

/**
 * Connect to a user's dedicated MongoDB container.
 *
 * Ensures the container is running, then returns a mongoose.Connection
 * to that user's database.
 *
 * @param sessionId - The first 12 chars of the user's password hash
 */
export async function connectUserDB(sessionId: string, creds?: { user: string; pass: string }): Promise<mongoose.Connection> {
  // Check existing connection
  const existing = userConnections.get(sessionId)
  if (existing && existing.readyState === 1) {
    return existing
  }

  // Ensure the user's Mongo container is running (pass creds for correct URI)
  const container = await ensureUserMongo(sessionId, creds)

  // Create a new connection
  const conn = mongoose.createConnection(container.uri, {
    bufferCommands: false,
  })

  await conn.asPromise()
  userConnections.set(sessionId, conn)
  console.log(`[db-manager] Connected to user MongoDB: ${sessionId}`)
  return conn
}

/**
 * Close a user's database connection.
 */
export async function disconnectUserDB(sessionId: string): Promise<void> {
  const conn = userConnections.get(sessionId)
  if (conn) {
    await conn.close()
    userConnections.delete(sessionId)
    console.log(`[db-manager] Disconnected user MongoDB: ${sessionId}`)
  }
}

/**
 * Get an existing user connection (does not create one).
 * Returns null if no connection exists.
 */
export function getUserConnection(sessionId: string): mongoose.Connection | null {
  const conn = userConnections.get(sessionId)
  return conn && conn.readyState === 1 ? conn : null
}

/**
 * Close all connections (cleanup on shutdown).
 */
export async function closeAllConnections(): Promise<void> {
  for (const [sessionId, conn] of userConnections) {
    try {
      await conn.close()
    } catch {
      // Ignore close errors
    }
    userConnections.delete(sessionId)
  }

  if (systemConnection) {
    await systemConnection.close()
    systemConnection = null
  }
  console.log('[db-manager] All connections closed')
}
