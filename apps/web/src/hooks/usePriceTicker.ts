'use client'

import { useState, useEffect, useRef } from 'react'

export interface TickerData {
  price: number
  change24h: number
  volume?: number
  high24h?: number
  low24h?: number
}

export type PriceTickers = Record<string, TickerData>

export function usePriceTicker(symbols?: string[]): { tickers: PriceTickers; connected: boolean } {
  const [tickers, setTickers] = useState<PriceTickers>({})
  const [connected, setConnected] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Stable key for symbols array
  const symbolsKey = symbols ? symbols.sort().join(',') : ''

  useEffect(() => {
    let mounted = true

    function connect() {
      if (!mounted) return
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }

      let url = '/api/prices/stream'
      if (symbolsKey) {
        url += `?symbols=${encodeURIComponent(symbolsKey)}`
      }

      const es = new EventSource(url)
      eventSourceRef.current = es

      es.onmessage = (event) => {
        if (!mounted) return
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'connected') {
            setConnected(true)
          } else if (msg.type === 'ticker') {
            setTickers((prev) => ({
              ...prev,
              [msg.symbol]: {
                price: msg.price,
                change24h: msg.change24h,
                volume: msg.volume,
                high24h: msg.high24h,
                low24h: msg.low24h,
              },
            }))
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
  }, [symbolsKey])

  return { tickers, connected }
}
