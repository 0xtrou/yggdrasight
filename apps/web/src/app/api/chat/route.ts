import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { withAuth } from '@/lib/auth/middleware'
import { getAgentModelMapFromConnection } from '@/lib/auth/intelligence-models'
import { getUserMongoUri } from '@/lib/auth/mongo-manager'

export const dynamic = 'force-dynamic'

const BUN_BIN = process.env.BUN_BIN ?? '/Users/mrk/.bun/bin/bun'

/**
 * Find the monorepo root by walking up from cwd until we find pnpm-workspace.yaml.
 * Next.js sets cwd to apps/web/ — the worker script lives at the monorepo root.
 */
function findMonorepoRoot(): string {
  let dir = process.cwd()
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  // Fallback: assume cwd is apps/web, go up 2 levels
  return path.resolve(process.cwd(), '..', '..')
}

interface AttachmentInput {
  name: string
  data: string
  type: string
}

interface ChatRequestBody {
  symbol: string
  message: string
  modelId?: string
  sessionId?: string
  attachments?: AttachmentInput[]
}

// POST /api/chat
// Creates (or continues) a ChatSession, spawns chat-worker.ts, streams response as SSE.
export async function POST(request: Request) {
  return withAuth(async (ctx) => {
    const body = (await request.json()) as ChatRequestBody
    const symbol = (body.symbol ?? 'BTC').toUpperCase()
    const userMessage = body.message

    // Resolve model
    const agentModelMap = await getAgentModelMapFromConnection(ctx.connection)
    const modelId =
      body.modelId ??
      agentModelMap['chat'] ??
      agentModelMap['*'] ??
      'opencode/big-pickle'

    // Handle attachments — decode base64, write to temp dir
    const attachmentRecords: Array<{ type: 'image' | 'file'; name: string; path: string }> = []
    if (body.attachments && body.attachments.length > 0) {
      const tmpDir = path.join(os.tmpdir(), 'oculus-chat')
      fs.mkdirSync(tmpDir, { recursive: true })
      for (const att of body.attachments) {
        const buffer = Buffer.from(att.data, 'base64')
        const filePath = path.join(tmpDir, `${Date.now()}-${att.name}`)
        fs.writeFileSync(filePath, buffer)
        attachmentRecords.push({
          type: att.type.startsWith('image/') ? 'image' : 'file',
          name: att.name,
          path: filePath,
        })
      }
    }

    const userMsgAttachments = attachmentRecords.length > 0 ? attachmentRecords : undefined

    // Load existing session or create new one
    let sessionId: string
    let sessionDoc: Awaited<ReturnType<typeof ctx.intelligenceModels.ChatSession.findById>>

    // Resolve existing OpenCode session ID for resume
    let opencodeSessionId: string | undefined

    if (body.sessionId) {
      const existing = await ctx.intelligenceModels.ChatSession.findById(body.sessionId)
      if (!existing) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 })
      }
      opencodeSessionId = existing.opencodeSessionId ?? undefined
      // Update model if user changed it in the dropdown
      if (modelId && existing.modelId !== modelId) {
        existing.modelId = modelId
      }
      existing.messages.push({
        role: 'user',
        content: userMessage,
        timestamp: new Date(),
        attachments: userMsgAttachments,
      })
      await existing.save()
      sessionDoc = existing
      sessionId = String(existing._id)
    } else {
      const created = await ctx.intelligenceModels.ChatSession.create({
        symbol,
        modelId,
        messages: [
          {
            role: 'user',
            content: userMessage,
            timestamp: new Date(),
            attachments: userMsgAttachments,
          },
        ],
        status: 'active',
      })
      sessionDoc = created
      sessionId = String(created._id)
    }

    // ── Prepare persistent OpenCode data directory per user ──
    const projectRoot = findMonorepoRoot()
    const opencodeDataDir = path.join(projectRoot, 'data', 'opencode-data', ctx.sessionId)
    fs.mkdirSync(opencodeDataDir, { recursive: true })

    // Container name for cancel targeting
    const containerName = `oculus-chat-${sessionId}`

    // Update session status to streaming + store container name
    await ctx.intelligenceModels.ChatSession.updateOne(
      { _id: sessionId },
      { $set: { status: 'streaming', containerId: containerName } },
    )

    // Spawn chat worker as detached child — keep stdout piped for SSE
    const workerScript = path.join(projectRoot, 'scripts', 'chat-worker.ts')
    const userMongoUri = getUserMongoUri(ctx.sessionId)

    const child = spawn(BUN_BIN, [workerScript, sessionId], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'], // stdout MUST be 'pipe' for SSE streaming
      cwd: projectRoot,
      env: {
        ...process.env,
        ...(userMongoUri ? { OCULUS_MONGODB_URI: userMongoUri } : {}),
        OCULUS_PASSWORD_HASH: ctx.passwordHash,
        OPENCODE_DATA_DIR: opencodeDataDir,
        CONTAINER_NAME: containerName,
        AUTH_SESSION_ID: ctx.sessionId,
        ...(opencodeSessionId ? { OPENCODE_SESSION_ID: opencodeSessionId } : {}),
        NODE_PATH: [
          path.join(projectRoot, 'packages/db/node_modules'),
          path.join(projectRoot, 'node_modules'),
        ].join(path.delimiter),
      },
    })

    // Store worker PID for cancel targeting
    if (child.pid) {
      await ctx.intelligenceModels.ChatSession.updateOne(
        { _id: sessionId },
        { $set: { workerPid: child.pid } },
      )
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        // Send session ID immediately so client can track the session
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'session', sessionId })}\n\n`),
        )

        child.stdout!.on('data', (chunk: Buffer) => {
          const lines = chunk.toString().split('\n').filter(Boolean)
          for (const line of lines) {
            try {
              const event = JSON.parse(line) as Record<string, unknown>
              // Forward relevant event types (including opencode_session for session ID capture)
              if (
                event.type === 'text' ||
                event.type === 'tool_use' ||
                event.type === 'error' ||
                event.type === 'step_start' ||
                event.type === 'opencode_session'
              ) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
              }
            } catch {
              // Not valid JSON — skip
            }
          }
        })

        child.stderr?.on('data', () => {
          /* ignore stderr */
        })

        child.on('close', (code) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'done', code })}\n\n`),
          )
          controller.close()
        })

        child.on('error', (err) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`),
          )
          controller.close()
        })
      },
      cancel() {
        child.kill('SIGTERM')
      },
    })

    // Suppress unused variable warning — sessionDoc used above, keep reference for clarity
    void sessionDoc

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Session-Id': sessionId,
      },
    })
  })
}

// GET /api/chat
// Returns the user's active chat sessions (most recent 50).
export async function GET(_request: Request) {
  return withAuth(async (ctx) => {
    const sessions = await ctx.intelligenceModels.ChatSession.find({ status: { $in: ['active', 'streaming'] } })
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean()

    return NextResponse.json(
      sessions.map((s) => ({
        id: String(s._id),
        symbol: s.symbol,
        title: s.title ?? null,
        modelId: s.modelId,
        messageCount: s.messages?.length ?? 0,
        updatedAt: s.updatedAt,
        createdAt: s.createdAt,
      })),
    )
  })
}
