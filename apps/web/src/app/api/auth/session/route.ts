import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

/**
 * GET /api/auth/session
 *
 * Check if the current user is authenticated.
 * Returns session info if valid cookies exist, 401 otherwise.
 */
export async function GET() {
  try {
    const session = await getCurrentSession()

    if (!session) {
      return NextResponse.json({ authenticated: false }, { status: 401 })
    }

    return NextResponse.json({
      authenticated: true,
      sessionId: session.sessionId,
    })
  } catch (err) {
    console.error('[GET /api/auth/session]', err)
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }
}
