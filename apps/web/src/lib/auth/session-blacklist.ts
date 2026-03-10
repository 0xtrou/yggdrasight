/**
 * Session Blacklist via Redis
 *
 * Revoked sessions are stored as individual keys `oculus:revoked-sessions:<id>`.
 * Each key has a TTL matching the cookie maxAge (7 days).
 * `getCurrentSession()` checks this on every request — O(1) Redis GET.
 *
 * If Redis is unavailable or misconfigured, the blacklist degrades gracefully
 * (fail-open: all sessions considered valid). This avoids locking out users
 * when Redis is down.
 */
import Redis from 'ioredis'

// ── Constants ────────────────────────────────────────────────────────────────

/** Must match the cookie maxAge in setSessionCookies() */
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60 // 7 days

const REDIS_KEY_PREFIX = 'oculus:revoked-sessions'

// ── Redis Connection ─────────────────────────────────────────────────────────

let redisClient: Redis | null = null
let redisAvailable = true
let redisErrorLogged = false

function getRedisClient(): Redis | null {
  if (!redisAvailable) return null
  if (redisClient) return redisClient

  // Support both REDIS_URL formats:
  //   redis://localhost:6379          (no auth)
  //   redis://:password@localhost:6379 (with auth)
  // Also check REDIS_PASSWORD as a fallback for password-only setups
  let url = process.env.REDIS_URL ?? 'redis://localhost:6379'
  const password = process.env.REDIS_PASSWORD

  // If URL has no auth but REDIS_PASSWORD is set, inject it
  if (password && !url.includes('@')) {
    url = url.replace('redis://', `redis://:${password}@`)
  }

  try {
    redisClient = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy(times) {
        // Only retry once, then give up
        if (times > 1) {
          redisAvailable = false
          if (!redisErrorLogged) {
            console.warn('[session-blacklist] Redis unavailable — blacklist disabled (fail-open)')
            redisErrorLogged = true
          }
          return null // stop retrying
        }
        return 200 // retry after 200ms
      },
      lazyConnect: true,
    })

    redisClient.on('error', (err) => {
      if (!redisErrorLogged) {
        console.warn('[session-blacklist] Redis connection error — blacklist disabled (fail-open):', err.message)
        redisErrorLogged = true
      }
      redisAvailable = false
    })

    return redisClient
  } catch {
    redisAvailable = false
    return null
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Revoke a session by adding its ID to the Redis blacklist.
 * The entry expires after SESSION_TTL_SECONDS (matching cookie lifetime).
 */
export async function revokeSession(sessionId: string): Promise<void> {
  try {
    const client = getRedisClient()
    if (!client) return // Redis unavailable — silently skip
    await client.set(`${REDIS_KEY_PREFIX}:${sessionId}`, '1', 'EX', SESSION_TTL_SECONDS)
    console.log(`[session-blacklist] Revoked session: ${sessionId}`)
  } catch {
    // Blacklist failure should not break logout
  }
}

/**
 * Check if a session has been revoked.
 * Returns true if the session is blacklisted (O(1) Redis GET).
 * Returns false on any Redis error (fail-open — don't lock out users).
 */
export async function isSessionRevoked(sessionId: string): Promise<boolean> {
  try {
    const client = getRedisClient()
    if (!client) return false // Redis unavailable — fail open
    const result = await client.exists(`${REDIS_KEY_PREFIX}:${sessionId}`)
    return result === 1
  } catch {
    // On Redis failure, fail open (allow session)
    return false
  }
}
