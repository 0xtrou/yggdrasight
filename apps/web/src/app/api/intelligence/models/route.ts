import { NextResponse } from 'next/server'
import { listModels } from '@/lib/intelligence/engine/opencode'
import { LLM_ANALYST_DEFINITIONS } from '@/lib/intelligence/analysts/llm'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const models = await listModels()
    const agents = LLM_ANALYST_DEFINITIONS.map((d) => ({
      id: d.meta.id,
      name: d.meta.name,
      description: d.meta.description,
      category: d.meta.category,
    }))

    return NextResponse.json({ models, agents })
  } catch (err) {
    console.error('[GET /api/intelligence/models]', err)
    return NextResponse.json(
      { error: 'Failed to list models', models: [], agents: [] },
      { status: 500 }
    )
  }
}
