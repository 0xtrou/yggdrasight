export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { withAuth } from '@/lib/auth/middleware'
import { NextResponse } from 'next/server'

const RECONNECT_DELAY = 3000

function buildStreamUrl(symbol: string, interval: string): string {
  return `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${interval}`
}

export async function GET(request: Request) {
  return withAuth(async (_ctx) => {
    const { searchParams } = new URL(request.url)
    const symbol = searchParams.get('symbol') ?? 'BTCUSDT'
    const interval = searchParams.get('interval') ?? '1m'

    const wsUrl = buildStreamUrl(symbol, interval)
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
              // Binance kline format: { "e": "kline", "s": "BTCUSDT", "k": { "t": 1638747660000, "o": "9638.9", ... } }
              if (msg.e === 'kline') {
                const k = msg.k
                const symbol = String(msg.s).toUpperCase()
                send(
                  JSON.stringify({
                    type: 'kline',
                    timestamp: k.t,
                    open: parseFloat(k.o),
                    high: parseFloat(k.h),
                    low: parseFloat(k.l),
                    close: parseFloat(k.c),
                    volume: parseFloat(k.v),
                    closed: k.x,
                    symbol,
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
  }) as unknown as NextResponse
}
