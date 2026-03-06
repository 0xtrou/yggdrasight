import { withAuth } from '@/lib/auth/middleware'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const FALLBACK_SYMBOLS = ['btcusdt', 'ethusdt', 'solusdt', 'bnbusdt']
const RECONNECT_DELAY = 3000

function buildStreamUrl(symbols: string[]): string {
  const streams = symbols.map((s) => `${s.toLowerCase()}@ticker`).join('/')
  return `wss://stream.binance.com:9443/stream?streams=${streams}`
}

export async function GET(request: Request) {
  return withAuth(async (ctx) => {
    const { searchParams } = new URL(request.url)
    const symbolsParam = searchParams.get('symbols')

    let symbols: string[]
    if (symbolsParam) {
      // Accept symbols like BTC,ETH,TAO,PENDLE — append 'usdt' if needed
      symbols = symbolsParam
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
        .map((s) => (s.endsWith('usdt') ? s : `${s}usdt`))
      if (symbols.length === 0) symbols = FALLBACK_SYMBOLS
    } else {
      // Default: use tracked assets from DB
      try {
        const tracked = await ctx.models.TrackedAsset.find({}).lean()
        if (tracked.length > 0) {
          symbols = tracked.map(a => `${a.symbol.toLowerCase()}usdt`)
        } else {
          symbols = FALLBACK_SYMBOLS
        }
      } catch (err) {
        console.error('[GET /api/prices/stream] DB fallback:', err)
        symbols = FALLBACK_SYMBOLS
      }
    }

    const wsUrl = buildStreamUrl(symbols)
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      start(controller) {
        let ws: WebSocket | null = null
        let closed = false

        function send(data: string) {
          if (closed) return
          try {
            controller.enqueue(encoder.encode(`data: ${data}\n\n`))
          } catch {
            // Stream closed
            cleanup()
          }
        }

        function connect() {
          if (closed) return

          ws = new WebSocket(wsUrl)

          ws.onopen = () => {
            send(JSON.stringify({ type: 'connected' }))
          }

          ws.onmessage = (event) => {
            try {
              const msg = JSON.parse(String(event.data))
              // Binance combined stream format: { stream: "btcusdt@ticker", data: {...} }
              if (msg.data) {
                const d = msg.data
                const symbol = String(d.s).toUpperCase() // e.g. BTCUSDT
                const price = parseFloat(d.c) // Current price
                const change24h = parseFloat(d.P) // 24h percent change
                const volume = parseFloat(d.q) // Quote volume 24h
                const high24h = parseFloat(d.h)
                const low24h = parseFloat(d.l)

                send(
                  JSON.stringify({
                    type: 'ticker',
                    symbol,
                    price,
                    change24h,
                    volume,
                    high24h,
                    low24h,
                  }),
                )
              }
            } catch {
              // Skip malformed messages
            }
          }

          ws.onerror = () => {
            // Will trigger onclose
          }

          ws.onclose = () => {
            if (!closed) {
              send(JSON.stringify({ type: 'reconnecting' }))
              setTimeout(connect, RECONNECT_DELAY)
            }
          }
        }

        function cleanup() {
          closed = true
          if (ws) {
            ws.onclose = null
            ws.onerror = null
            ws.onmessage = null
            try {
              ws.close()
            } catch {
              // ignore
            }
            ws = null
          }
        }

        connect()

        // Send heartbeat every 30s to keep SSE alive
        const heartbeat = setInterval(() => {
          if (closed) {
            clearInterval(heartbeat)
            return
          }
          send(JSON.stringify({ type: 'heartbeat' }))
        }, 30000)
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    }) as unknown as NextResponse
  })
}
