import { NextRequest, NextResponse } from 'next/server'
import { loginUser, setSessionCookies } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/login
 *
 * Login with a password hash.
 *
 * Body: { passwordHash: string }
 *
 * Verifies the hash, ensures the user's MongoDB container is running,
 * sets session cookies, and returns session info.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { passwordHash?: string }
    const { passwordHash } = body

    if (!passwordHash || typeof passwordHash !== 'string') {
      return NextResponse.json(
        { error: 'Password hash is required' },
        { status: 400 },
      )
    }

    if (passwordHash.length < 20) {
      return NextResponse.json(
        { error: 'Invalid password hash format' },
        { status: 400 },
      )
    }

    // Login
    const session = await loginUser(passwordHash)

    // Set session cookies
    await setSessionCookies(session.sessionId, session.passwordHash)

    return NextResponse.json({
      success: true,
      sessionId: session.sessionId,
      message: 'Logged in successfully. Your MongoDB container is running.',
    })
  } catch (err) {
    console.error('[POST /api/auth/login]', err)

    const message = err instanceof Error ? err.message : 'Login failed'
    const status = message.includes('Invalid password') ? 401 : 500

    return NextResponse.json({ error: message }, { status })
  }
}
