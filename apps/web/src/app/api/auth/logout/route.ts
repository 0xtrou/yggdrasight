import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSession, clearSessionCookies } from '@/lib/auth/session'
import { removeUserMongo } from '@/lib/auth/mongo-manager'
import { disconnectUserDB } from '@/lib/auth/db-manager'
import { logAuthEvent, extractClientIp } from '@/lib/auth/audit-log'

export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/logout
 *
 * Clear session cookies, disconnect user DB, and remove the MongoDB container.
 * The volume data on disk is preserved so the user can re-login without data loss.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getCurrentSession()

    if (session) {
      // Disconnect from user's MongoDB
      await disconnectUserDB(session.sessionId)

      // Remove the container (volume data on disk is preserved)
      try {
        await removeUserMongo(session.sessionId, false)
      } catch (err) {
        console.warn('[POST /api/auth/logout] Failed to remove container:', err)
      }
    }

    // Clear cookies and revoke session in Redis blacklist
    await clearSessionCookies(session?.sessionId)

    if (session) {
      void logAuthEvent('logout', {
        sessionId: session.sessionId,
        ip: extractClientIp(req.headers),
        userAgent: req.headers.get('user-agent') ?? undefined,
      })
    }

    return NextResponse.json({ success: true, message: 'Logged out' })
  } catch (err) {
    console.error('[POST /api/auth/logout]', err)
    // Even on error, try to clear cookies
    try {
      await clearSessionCookies()
    } catch {
      // Ignore
    }
    return NextResponse.json({ success: true, message: 'Logged out' })
  }
}
