import { NextResponse } from 'next/server'
import { execSync } from 'child_process'
import { withAuth } from '@/lib/auth/middleware'

export const dynamic = 'force-dynamic'

// GET /api/chat/[sessionId]
// Returns the full session document including all messages.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  return withAuth(async (ctx) => {
    const { sessionId } = await params

    const session = await ctx.intelligenceModels.ChatSession.findById(sessionId).lean()

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    return NextResponse.json(session)
  })
}

// DELETE /api/chat/[sessionId]
// Archives a chat session (soft delete).
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  return withAuth(async (ctx) => {
    const { sessionId } = await params

    const session = await ctx.intelligenceModels.ChatSession.findById(sessionId)

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    session.status = 'archived'
    await session.save()

    return NextResponse.json({ ok: true })
  })
}

// POST /api/chat/[sessionId]
// Cancel an in-flight chat response by killing the Docker container.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  return withAuth(async (ctx) => {
    const { sessionId } = await params
    const body = (await request.json().catch(() => ({}))) as { action?: string }

    if (body.action !== 'cancel') {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }

    const session = await ctx.intelligenceModels.ChatSession.findById(sessionId)
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const workerPid = session.workerPid as number | undefined
    const containerName = session.containerId

    if (!workerPid && !containerName) {
      return NextResponse.json({ error: 'No active process to cancel' }, { status: 409 })
    }

    // Kill the worker process (which kills its docker exec child).
    // With persistent containers, we kill the worker — NOT the container itself.
    if (workerPid) {
      try {
        process.kill(workerPid, 'SIGTERM')
      } catch {
        // Worker may already be dead
      }
    }

    // Fallback: if we still have a non-persistent container reference, kill it
    if (containerName && containerName.startsWith('oculus-chat-')) {
      const dockerBin = process.env.DOCKER_BIN ?? 'docker'
      try {
        execSync(`${dockerBin} kill ${containerName}`, { timeout: 5000, stdio: 'ignore' })
      } catch { /* ignore */ }
      try {
        execSync(`${dockerBin} rm -f ${containerName}`, { timeout: 5000, stdio: 'ignore' })
      } catch { /* ignore */ }
    }

    // Reset session status
    await ctx.intelligenceModels.ChatSession.updateOne(
      { _id: sessionId },
      { $set: { status: 'active', containerId: null, workerPid: null } },
    )

    return NextResponse.json({ ok: true, cancelled: true })
  })
}
