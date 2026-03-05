import { NextRequest, NextResponse } from 'next/server'
import { connectDB, Signal } from '@oculus/db'
import { UpdateSignalSchema } from '@oculus/core'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

// GET /api/signals/:id
export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    await connectDB()
    const { id } = await context.params
    const signal = await Signal.findById(id)
    if (!signal) {
      return NextResponse.json({ error: 'Signal not found' }, { status: 404 })
    }
    return NextResponse.json({ signal: signal.toJSON() })
  } catch (err) {
    console.error('[GET /api/signals/:id]', err)
    return NextResponse.json({ error: 'Failed to fetch signal' }, { status: 500 })
  }
}

// PATCH /api/signals/:id
export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    await connectDB()
    const { id } = await context.params
    const body = await req.json()

    const parsed = UpdateSignalSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    // Map Zod schema fields to Mongoose model fields
    const update: Record<string, unknown> = {}
    const data = parsed.data
    if (data.status !== undefined) update.status = data.status
    if (data.direction !== undefined) update.direction = data.direction
    if (data.entryPrice !== undefined) update.entryPrice = data.entryPrice
    if (data.stopLoss !== undefined) update.stopLoss = data.stopLoss
    if (data.takeProfits !== undefined) update.takeProfits = data.takeProfits
    if (data.notes !== undefined) update.notes = data.notes
    if (data.exitPrice !== undefined) update.exitPrice = data.exitPrice
    if (data.pnlPercent !== undefined) update.pnlPercent = data.pnlPercent

    const signal = await Signal.findByIdAndUpdate(id, update, { new: true })
    if (!signal) {
      return NextResponse.json({ error: 'Signal not found' }, { status: 404 })
    }

    return NextResponse.json({ signal: signal.toJSON() })
  } catch (err) {
    console.error('[PATCH /api/signals/:id]', err)
    return NextResponse.json({ error: 'Failed to update signal' }, { status: 500 })
  }
}

// DELETE /api/signals/:id
export async function DELETE(_req: NextRequest, context: RouteContext) {
  try {
    await connectDB()
    const { id } = await context.params
    const signal = await Signal.findByIdAndDelete(id)
    if (!signal) {
      return NextResponse.json({ error: 'Signal not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/signals/:id]', err)
    return NextResponse.json({ error: 'Failed to delete signal' }, { status: 500 })
  }
}
