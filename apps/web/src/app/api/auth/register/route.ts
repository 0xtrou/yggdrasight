import { NextRequest, NextResponse } from 'next/server'
import { registerUser, setSessionCookies } from '@/lib/auth/session'
import { logAuthEvent, extractClientIp } from '@/lib/auth/audit-log'

export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/register
 *
 * Register with OpenCode auth.json — the only file needed.
 *
 * Accepts either:
 *   1. multipart/form-data with a single file (auth.json)
 *   2. application/json with { authJson: string } (the raw JSON content)
 *
 * Returns the password hash (the user's "key") that they must save.
 */
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') ?? ''
    let authJsonData: Buffer

    if (contentType.includes('multipart/form-data')) {
      // File upload mode
      const formData = await req.formData()
      let file: File | null = null

      for (const [, value] of formData.entries()) {
        if (value instanceof File) {
          file = value
          break
        }
      }

      if (!file) {
        return NextResponse.json(
          { error: 'No file uploaded. Upload your auth.json file.' },
          { status: 400 },
        )
      }

      const arrayBuffer = await file.arrayBuffer()
      authJsonData = Buffer.from(arrayBuffer)
    } else {
      const body = await req.json() as { authJson?: string }

      if (!body.authJson || typeof body.authJson !== 'string') {
        return NextResponse.json(
          { error: 'Missing authJson field. Paste your auth.json content.' },
          { status: 400 },
        )
      }

      // Validate it's valid JSON
      try {
        JSON.parse(body.authJson)
      } catch {
        return NextResponse.json(
          { error: 'Invalid JSON. Paste the contents of your auth.json file.' },
          { status: 400 },
        )
      }
      authJsonData = Buffer.from(body.authJson, 'utf-8')
    }

    // Store as a single file with the expected path
    const files = [{
      relativePath: '.local/share/opencode/auth.json',
      data: authJsonData,
    }]

    const result = await registerUser(files)

    // Set session cookies
    await setSessionCookies(result.sessionId, result.passwordHash)

    // Audit log — fire and forget
    void logAuthEvent('register', {
      sessionId: result.sessionId,
      ip: extractClientIp(req.headers),
      userAgent: req.headers.get('user-agent') ?? undefined,
    })

    return NextResponse.json({
      success: true,
      passwordHash: result.passwordHash,
      sessionId: result.sessionId,
      message: 'SAVE THIS PASSWORD HASH — it is your login key and cannot be recovered.',
    })
  } catch (err) {
    console.error('[POST /api/auth/register]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Registration failed' },
      { status: 500 },
    )
  }
}
