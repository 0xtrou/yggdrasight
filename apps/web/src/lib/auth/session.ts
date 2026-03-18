/**
 * Auth Session Manager
 *
 * Manages user sessions using the password hash as both identifier and key.
 *
 * Session flow:
 *   1. Register: Upload configs → encrypt → create user Mongo container → store blob → return hash
 *   2. Login: Hash → extract sessionId → verify config exists → create session cookie
 *   3. Each request: Read session cookie → resolve user's Mongo connection
 *
 * Session ID = first 12 characters of the base64url password hash
 * This uniquely identifies the user and their MongoDB container.
 */
import mongoose from 'mongoose'
import { cookies } from 'next/headers'
import { connectSystemDB, connectUserDB } from './db-manager'
import { ensureUserMongo } from './mongo-manager'
import { processAndStoreUpload, hasStoredConfig, decryptConfigForMount, cleanupDecryptedConfig } from './vault'
import { generatePasswordHash } from './crypto'
import { revokeSession, isSessionRevoked } from './session-blacklist'

import type { DecryptedConfigPaths } from './vault'

// ── Constants ────────────────────────────────────────────────────────────────

const SESSION_COOKIE = 'yggdrasight-session'
const HASH_COOKIE = 'yggdrasight-hash'
const SESSION_ID_LENGTH = 12 // First 12 chars of password hash = session identifier

// ── Types ────────────────────────────────────────────────────────────────────

export interface AuthSession {
  /** Session ID (first 12 chars of password hash) */
  sessionId: string
  /** Full password hash (for decryption) — only available during login */
  passwordHash: string
  /** Mongoose connection to the user's dedicated MongoDB */
  connection: mongoose.Connection
}

export interface RegisterResult {
  /** The password hash to return to the user (their "key") */
  passwordHash: string
  /** Session ID derived from the hash */
  sessionId: string
  /** Whether the MongoDB container was newly created */
  isNew: boolean
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract session ID from a password hash.
 */
export function extractSessionId(passwordHash: string): string {
  return passwordHash.substring(0, SESSION_ID_LENGTH)
}

// ── System DB Models ─────────────────────────────────────────────────────────

/**
 * User Registry schema — stored in the system database.
 * Maps sessionId → metadata (container info, creation time, etc.)
 * The encrypted config blob itself lives in the user's own MongoDB.
 */
function getUserRegistryModel(connection: mongoose.Connection) {
  const schema = new mongoose.Schema({
    sessionId: { type: String, required: true, unique: true, index: true },
    createdAt: { type: Date, default: Date.now },
    lastLoginAt: { type: Date, default: Date.now },
    containerPort: { type: Number, required: true },
    /** Hash of the password hash for verification (not the actual key!) */
    verificationHash: { type: String, required: true },
    /** Per-user MongoDB credentials (unique per container) */
    mongoUser: { type: String, required: false },
    mongoPass: { type: String, required: false },
  })
  return connection.models.UserRegistry || connection.model('UserRegistry', schema)
}

/**
 * Create a verification hash from the password hash.
 * This is stored in the system DB so we can verify login attempts
 * without storing the actual decryption key.
 */
async function createVerificationHash(passwordHash: string): Promise<string> {
  const { createHash } = await import('crypto')
  return createHash('sha256').update(passwordHash).digest('hex')
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Register a new user with uploaded OpenCode config files.
 *
 * 1. Generates a new password hash (AES key)
 * 2. Creates a dedicated MongoDB container
 * 3. Encrypts and stores configs in the user's MongoDB via GridFS
 * 4. Registers the user in the system database
 * 5. Returns the password hash for the user to save
 */
export async function registerUser(
  files: Array<{ relativePath: string; data: Buffer }>,
): Promise<RegisterResult> {
  // Generate password hash
  const passwordHash = generatePasswordHash()
  const sessionId = extractSessionId(passwordHash)

  // Create user's MongoDB container with unique per-user credentials
  const container = await ensureUserMongo(sessionId)
  const mongoUser = container.mongoUser
  const mongoPass = container.mongoPass

  // Connect to user's MongoDB
  const userConn = await connectUserDB(sessionId)

  // Encrypt and store configs in user's MongoDB
  await processAndStoreUpload(userConn, files, passwordHash)

  // Register in system database
  const systemConn = await connectSystemDB()
  const UserRegistry = getUserRegistryModel(systemConn)
  const verificationHash = await createVerificationHash(passwordHash)

  await UserRegistry.findOneAndUpdate(
    { sessionId },
    {
      sessionId,
      containerPort: container.port,
      verificationHash,
      mongoUser,
      mongoPass,
      lastLoginAt: new Date(),
    },
    { upsert: true, new: true },
  )

  console.log(`[auth] Registered user: ${sessionId}`)

  return { passwordHash, sessionId, isNew: true }
}
/**
 * Login with a password hash.
 *
 * 1. Extracts session ID from hash
 * 2. Verifies the session exists in system DB
 * 3. Verifies the hash is correct
 * 4. Ensures user's MongoDB container is running
 * 5. Verifies encrypted config exists
 * 6. Returns session info
 */
export async function loginUser(passwordHash: string): Promise<AuthSession> {
  const sessionId = extractSessionId(passwordHash)

  // Check system registry
  const systemConn = await connectSystemDB()
  const UserRegistry = getUserRegistryModel(systemConn)
  const userRecord = await UserRegistry.findOne({ sessionId }).lean()

  if (!userRecord) {
    throw new Error('Invalid password hash — no session found')
  }

  // Verify hash
  const verificationHash = await createVerificationHash(passwordHash)
  const record = userRecord as { verificationHash: string; mongoUser?: string; mongoPass?: string }
  if (record.verificationHash !== verificationHash) {
    throw new Error('Invalid password hash — verification failed')
  }

  // Look up per-user credentials for correct URI construction
  const creds = record.mongoUser
    ? { user: record.mongoUser, pass: record.mongoPass! }
    : undefined

  // Ensure container is running with correct per-user credentials
  await ensureUserMongo(sessionId, creds)
  const connection = await connectUserDB(sessionId, creds)

  // Verify config exists in user's MongoDB
  const hasConfig = await hasStoredConfig(connection)
  if (!hasConfig) {
    throw new Error('Config not found in user database — may need to re-register')
  }

  // Update last login
  await UserRegistry.updateOne({ sessionId }, { lastLoginAt: new Date() })

  return { sessionId, passwordHash, connection }
}

/**
 * Get the current session from cookies.
 * Returns null if not authenticated.
 */
export async function getCurrentSession(): Promise<AuthSession | null> {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get(SESSION_COOKIE)
    const hashCookie = cookieStore.get(HASH_COOKIE)

    if (!sessionCookie?.value || !hashCookie?.value) return null

    const sessionId = sessionCookie.value
    const passwordHash = hashCookie.value

    // Verify session ID matches hash
    if (extractSessionId(passwordHash) !== sessionId) return null

    // Check if this session has been explicitly revoked (e.g. remote logout)
    if (await isSessionRevoked(sessionId)) return null

    // Look up per-user credentials to rebuild URI correctly after server restart
    const systemConn = await connectSystemDB()
    const UserRegistry = getUserRegistryModel(systemConn)
    const rec = await UserRegistry.findOne({ sessionId }, { mongoUser: 1, mongoPass: 1 }).lean() as { mongoUser?: string; mongoPass?: string } | null
    const creds = rec?.mongoUser
      ? { user: rec.mongoUser, pass: rec.mongoPass! }
      : undefined

    // Connect to user's MongoDB (uses per-user creds if available)
    const connection = await connectUserDB(sessionId, creds)

    return { sessionId, passwordHash, connection }
  } catch (err) {
    console.error('[session] getCurrentSession failed:', err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Set session cookies after login/register.
 */
export async function setSessionCookies(sessionId: string, passwordHash: string): Promise<void> {
  const cookieStore = await cookies()

  cookieStore.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days — shortened for security (was 30 days)
  })

  cookieStore.set(HASH_COOKIE, passwordHash, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days — shortened for security (was 30 days)
  })
}

/**
 * Clear session cookies (logout).
 */
export async function clearSessionCookies(sessionId?: string): Promise<void> {
  // Revoke in Redis blacklist so existing tokens cannot be replayed
  if (sessionId) {
    await revokeSession(sessionId)
  }
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
  cookieStore.delete(HASH_COOKIE)
}


/**
 * Decrypt configs for Docker mount, execute a callback, then cleanup.
 * Convenience wrapper for the decrypt → mount → cleanup lifecycle.
 */
export async function withDecryptedConfig<T>(
  session: AuthSession,
  fn: (configPaths: DecryptedConfigPaths) => Promise<T>,
): Promise<T> {
  const configPaths = await decryptConfigForMount(session.connection, session.passwordHash)
  if (!configPaths) {
    throw new Error('No encrypted config found for this session')
  }

  try {
    return await fn(configPaths)
  } finally {
    cleanupDecryptedConfig(configPaths)
  }
}
