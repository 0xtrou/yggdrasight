'use client'

import { useState, useEffect, useRef } from 'react'

export interface KlineUpdate {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  closed: boolean
}

export function useKlineStream(
  symbol: string,
  interval: string
): { latestCandle: KlineUpdate | null; connected: boolean } {
  const [latestCandle, setLatestCandle] = useState<KlineUpdate | null>(null)
  const [connected, setConnected] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let mounted = true

    function connect() {
      if (!mounted) return
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }

      const url = `/api/prices/klines/stream?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}`

      const es = new EventSource(url)
      eventSourceRef.current = es

      es.onmessage = (event) => {
        if (!mounted) return
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'connected') {
            setConnected(true)
          } else if (msg.type === 'kline') {
            setLatestCandle({
              timestamp: msg.timestamp,
              open: msg.open,
              high: msg.high,
              low: msg.low,
              close: msg.close,
              volume: msg.volume,
              closed: msg.closed,
            })
          } else if (msg.type === 'reconnecting') {
            setConnected(false)
          }
        } catch {
          // Ignore parse errors
        }
      }

      es.onerror = () => {
        if (!mounted) return
        setConnected(false)
        es.close()
        eventSourceRef.current = null
        // Reconnect after delay
        reconnectTimerRef.current = setTimeout(connect, 5000)
      }
    }

    connect()

    return () => {
      mounted = false
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
      }
    }
  }, [symbol, interval])

  return { latestCandle, connected }
}
