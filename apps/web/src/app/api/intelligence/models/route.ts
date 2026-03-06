import { NextResponse } from 'next/server'
import { connectDB } from '@oculus/db'
import { listModels } from '@/lib/intelligence/engine/opencode'
import { LLM_ANALYST_DEFINITIONS } from '@/lib/intelligence/analysts/llm'
import { AgentModelConfig, getAgentModelMap } from '@/lib/intelligence/models/agent-model-config.model'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await connectDB()
    const [models, modelMap] = await Promise.all([
      listModels(),
      getAgentModelMap(),
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
}

export async function PUT(request: Request) {
  try {
    const body = await request.json() as { modelMap?: Record<string, string> }
    if (!body.modelMap || typeof body.modelMap !== 'object') {
      return NextResponse.json({ error: 'Missing modelMap' }, { status: 400 })
    }

    await connectDB()
    await AgentModelConfig.findByIdAndUpdate(
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
}
