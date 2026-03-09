import { NextResponse } from 'next/server'
import { listModels } from '@/lib/intelligence/engine/opencode'
import { LLM_ANALYST_DEFINITIONS } from '@/lib/intelligence/analysts/llm'
import { withAuth } from '@/lib/auth/middleware'
import { getAgentModelMapFromConnection } from '@/lib/auth/intelligence-models'

export const dynamic = 'force-dynamic'

export async function GET() {
  return withAuth(async (ctx) => {
    try {
      const [models, modelMap] = await Promise.all([
        listModels(false, ctx.sessionId),
        getAgentModelMapFromConnection(ctx.connection),
      ])
      const agents = LLM_ANALYST_DEFINITIONS.map((d) => ({
        id: d.meta.id,
        name: d.meta.name,
        description: d.meta.description,
        category: d.meta.category,
      }))

      return NextResponse.json({ models, agents, modelMap })
    } catch (err) {
      console.error('[GET /api/intelligence/models]', err)
      return NextResponse.json(
        { error: 'Failed to list models', models: [], agents: [], modelMap: {} },
        { status: 500 }
      )
    }
  })
}

export async function PUT(request: Request) {
  return withAuth(async (ctx) => {
    try {
      const body = await request.json() as { modelMap?: Record<string, string> }
      if (!body.modelMap || typeof body.modelMap !== 'object') {
        return NextResponse.json({ error: 'Missing modelMap' }, { status: 400 })
      }

      await ctx.intelligenceModels.AgentModelConfig.findByIdAndUpdate(
        'default',
        { $set: { modelMap: body.modelMap, updatedAt: new Date() } },
        { upsert: true, new: true }
      )

      return NextResponse.json({ ok: true })
    } catch (err) {
      console.error('[PUT /api/intelligence/models]', err)
      return NextResponse.json(
        { error: 'Failed to save model config' },
        { status: 500 }
      )
    }
  })
}

export async function PATCH(request: Request) {
  return withAuth(async (ctx) => {
    try {
      const body = await request.json() as { key: string; value: string }
      if (!body.key || typeof body.key !== 'string') {
        return NextResponse.json({ error: 'Missing key' }, { status: 400 })
      }
      await ctx.intelligenceModels.AgentModelConfig.findByIdAndUpdate(
        'default',
        { $set: { [`modelMap.${body.key}`]: body.value, updatedAt: new Date() } },
        { upsert: true }
      )
      return NextResponse.json({ ok: true })
    } catch (err) {
      console.error('[PATCH /api/intelligence/models]', err)
      return NextResponse.json({ error: 'Failed to update model config' }, { status: 500 })
    }
  })
}
