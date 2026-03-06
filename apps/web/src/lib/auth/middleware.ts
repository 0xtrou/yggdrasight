/**
 * Auth Middleware for API Routes
 *
 * Provides `withAuth` wrapper that:
 *   1. Reads session cookies
 *   2. Validates the session
 *   3. Ensures the user's MongoDB container is running
 *   4. Injects the user's Mongoose connection + scoped models into the handler
 *
 * Usage:
 *   export async function GET(req: NextRequest) {
 *     return withAuth(async (ctx) => {
 *       // ctx.models.Signal, ctx.models.TrackedAsset, etc.
 *       // ctx.intelligenceModels.ClassificationJob, etc.
 *       const signals = await ctx.models.Signal.find({})
 *       return NextResponse.json({ data: signals })
 *     })
 *   }
 */
import { NextResponse } from 'next/server'
import { getModelsForConnection } from '@oculus/db'
import { getCurrentSession } from './session'
import { getIntelligenceModelsForConnection } from './intelligence-models'

import type { AuthSession } from './session'

/**
 * Extended session with user-scoped Mongoose models.
 * Models are registered on the user's connection so they
 * read/write to the user's dedicated MongoDB.
 */
export interface AuthenticatedContext extends AuthSession {
  models: ReturnType<typeof getModelsForConnection>
  intelligenceModels: ReturnType<typeof getIntelligenceModelsForConnection>
}

export type AuthHandler = (ctx: AuthenticatedContext) => Promise<NextResponse>

/**
 * Wrap an API handler with authentication.
 *
 * If the user is not authenticated, returns 401.
 * Otherwise, calls the handler with the authenticated session + user-scoped models.
 */
export async function withAuth(handler: AuthHandler): Promise<NextResponse> {
  try {
    const session = await getCurrentSession()

    if (!session) {
      return NextResponse.json(
        { error: 'Not authenticated. Please login or register.' },
        { status: 401 },
      )
    }

    // Register @oculus/db models on the user's connection
    const models = getModelsForConnection(session.connection)
    // Register intelligence models on the user's connection
    const intelligenceModels = getIntelligenceModelsForConnection(session.connection)

    return await handler({ ...session, models, intelligenceModels })
  } catch (err) {
    console.error('[withAuth]', err)
    return NextResponse.json(
      { error: 'Authentication error' },
      { status: 401 },
    )
  }
}

/**
 * Get the authenticated session or return null.
 * Non-throwing version for routes that optionally use auth.
 */
export { getCurrentSession } from './session'
export type { AuthSession } from './session'
