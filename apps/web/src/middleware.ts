import { NextRequest, NextResponse } from 'next/server'

// Security headers applied to all responses
const SECURITY_HEADERS: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' wss: ws: https:; font-src 'self' data:; frame-ancestors 'none'",
}

// Rate limit configuration per endpoint
const RATE_LIMITS: Record<string, { max: number; windowMs: number }> = {
  '/api/auth/login': { max: 5, windowMs: 60_000 },
  '/api/auth/register': { max: 3, windowMs: 60_000 },
}

interface RateLimitEntry {
  count: number
  resetTime: number
}

// In-memory store: key = `${pathname}:${ip}`
const rateLimitStore = new Map<string, RateLimitEntry>()

// Periodically clean up expired entries (every 60s)
let cleanupScheduled = false
function scheduleCleanup(): void {
  if (cleanupScheduled) return
  cleanupScheduled = true
  const interval = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of rateLimitStore) {
      if (now >= entry.resetTime) {
        rateLimitStore.delete(key)
      }
    }
  }, 60_000)
  // Allow the process to exit even if the interval is still active
  if (typeof interval === 'object' && interval !== null && 'unref' in interval) {
    ;(interval as NodeJS.Timeout).unref()
  }
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

function applySecurityHeaders(response: NextResponse): void {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value)
  }
}

export function middleware(req: NextRequest): NextResponse {
  scheduleCleanup()

  const { pathname } = req.nextUrl
  const host = req.headers.get('host') || ''
  const hostname = host.split(':')[0]
  const isTerminal = hostname.includes('terminal.');

  // ── MODE=terminal: pure terminal deployment, no landing page ────────────────
  if (isTerminal) {
    const response = NextResponse.next()
    applySecurityHeaders(response)
    return response
  }

  // ── MODE=landing: pure landing deployment, block all terminal routes ────────
  if (!isTerminal) {
    if (pathname === '/landing' || pathname.startsWith('/api') || pathname.startsWith('/_next') || pathname.startsWith('/public')) {
      const response = NextResponse.next()
      applySecurityHeaders(response)
      return response
    }
    const url = req.nextUrl.clone()
    url.pathname = '/landing'
    const response = pathname === '/' ? NextResponse.rewrite(url) : NextResponse.redirect(url)
    applySecurityHeaders(response)
    return response
  }

  const limitConfig = RATE_LIMITS[pathname]

  // Rate limiting for auth endpoints
  if (limitConfig) {
    const ip = getClientIp(req)
    const storeKey = `${pathname}:${ip}`
    const now = Date.now()
    const entry = rateLimitStore.get(storeKey)

    if (!entry || now >= entry.resetTime) {
      rateLimitStore.set(storeKey, { count: 1, resetTime: now + limitConfig.windowMs })
    } else if (entry.count >= limitConfig.max) {
      const response = NextResponse.json(
        { error: 'Too many requests. Try again later.' },
        { status: 429 },
      )
      applySecurityHeaders(response)
      return response
    } else {
      entry.count += 1
    }
  }

  const requestHeaders = new Headers(req.headers)
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  applySecurityHeaders(response)
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\.ico|.*\.png|.*\.jpg|.*\.svg|.*\.ico|.*\.json|.*\.xml|.*\.webmanifest).*)'],
}
