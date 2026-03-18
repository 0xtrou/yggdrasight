import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const MIROFISH_BACKEND_URL = process.env.MIROFISH_BACKEND_URL ?? 'http://mirofish-backend:5001'

export async function GET() {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)

    const res = await fetch(`${MIROFISH_BACKEND_URL}/health`, {
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout))

    if (res.ok) {
      return NextResponse.json({ running: true })
    }
    return NextResponse.json({ running: false, error: `HTTP ${res.status}` })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ running: false, error: msg })
  }
}
