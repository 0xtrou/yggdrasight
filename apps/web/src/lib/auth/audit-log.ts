/**
 * Auth Audit Logger
 *
 * Records authentication events (login, logout, register, failures) to the
 * system MongoDB. Stored in a dedicated `AuthAuditLog` collection for
 * security review and incident response.
 */
import mongoose from 'mongoose'
import { connectSystemDB } from './db-manager'

// ── Types ────────────────────────────────────────────────────────────────────

export type AuthEventType =
  | 'login'
  | 'login_failed'
  | 'register'
  | 'logout'
  | 'session_revoked'

export interface AuditLogEntry {
  event: AuthEventType
  sessionId: string
  ip?: string
  userAgent?: string
  timestamp: Date
  metadata?: Record<string, unknown>
}

export interface LogAuthEventDetails {
  sessionId: string
  ip?: string
  userAgent?: string
  metadata?: Record<string, unknown>
}

// ── Schema ───────────────────────────────────────────────────────────────────

const auditLogSchema = new mongoose.Schema<AuditLogEntry>(
  {
    event: { type: String, required: true, index: true },
    sessionId: { type: String, required: true, index: true },
    ip: { type: String },
    userAgent: { type: String },
    timestamp: { type: Date, required: true, default: Date.now, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  {
    // Use system DB — no per-user sharding needed
    collection: 'auth_audit_logs',
  },
)

function getAuditLogModel(connection: mongoose.Connection) {
  return (
    connection.models.AuthAuditLog ||
    connection.model<AuditLogEntry>('AuthAuditLog', auditLogSchema)
  )
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Log an auth event to the system MongoDB.
 *
 * Fails silently — audit logging must never break auth flows.
 *
 * @param event - The event type (login, logout, register, etc.)
 * @param details - Session ID, IP, user agent, and optional metadata
 */
export async function logAuthEvent(
  event: AuthEventType,
  details: LogAuthEventDetails,
): Promise<void> {
  try {
    const systemConn = await connectSystemDB()
    const AuditLog = getAuditLogModel(systemConn)

    await AuditLog.create({
      event,
      sessionId: details.sessionId,
      ip: details.ip,
      userAgent: details.userAgent,
      timestamp: new Date(),
      metadata: details.metadata,
    })
  } catch (err) {
    // Audit log failures must never break auth flows
    console.error('[audit-log] Failed to write audit log:', err)
  }
}

/**
 * Extract client IP from Next.js request headers.
 * Checks x-forwarded-for (proxy), x-real-ip (nginx), then falls back to 'unknown'.
 */
export function extractClientIp(
  headers: Headers | { get(name: string): string | null },
): string {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    // x-forwarded-for can be a comma-separated list; first IP is the client
    return forwarded.split(',')[0].trim()
  }

  const realIp = headers.get('x-real-ip')
  if (realIp) return realIp.trim()

  return 'unknown'
}
