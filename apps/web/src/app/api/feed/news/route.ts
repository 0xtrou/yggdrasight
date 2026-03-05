import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

interface CryptoCompareNewsItem {
  id: string
  published_on: number
  title: string
  body: string
  source: string
  source_info: { name: string }
  categories: string
  url: string
  tags: string
}

interface CoinGeckoStatusUpdate {
  description: string
  category: string
  created_at: string
  project: { name: string; symbol: string }
}

export interface FeedEntry {
  id: string
  time: string
  source: string
  headline: string
  url?: string
  sentiment?: 'up' | 'down' | 'neutral'
}

// GET /api/feed/news?symbol=BTC
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const symbol = (searchParams.get('symbol') ?? 'BTC').toUpperCase()

    // CryptoCompare news API — free, no key required for basic usage
    const ccUrl = `https://min-api.cryptocompare.com/data/v2/news/?categories=${symbol}&sortOrder=latest&limit=20`

    const ccRes = await fetch(ccUrl, {
      headers: { 'User-Agent': 'oculus-trading/1.0' },
      next: { revalidate: 120 },
    })

    const entries: FeedEntry[] = []

    if (ccRes.ok) {
      const ccData: { Data: CryptoCompareNewsItem[] } = await ccRes.json()
      if (ccData.Data) {
        for (const item of ccData.Data) {
          const date = new Date(item.published_on * 1000)
          const time = date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })

          // Simple sentiment heuristic based on title keywords
          let sentiment: 'up' | 'down' | 'neutral' = 'neutral'
          const lower = item.title.toLowerCase()
          if (/\b(surge|rally|bull|soar|pump|gain|high|record|inflow|adoption|approve|launch|breakout|ath)\b/.test(lower)) {
            sentiment = 'up'
          } else if (/\b(crash|dump|bear|drop|plunge|sell|hack|exploit|ban|reject|warning|risk|fear|fraud)\b/.test(lower)) {
            sentiment = 'down'
          }

          entries.push({
            id: item.id,
            time,
            source: item.source_info?.name?.substring(0, 6).toUpperCase() || item.source?.substring(0, 6).toUpperCase() || 'NEWS',
            headline: item.title,
            url: item.url,
            sentiment,
          })
        }
      }
    }

    // Fallback: CoinGecko status updates (broader market news)
    if (entries.length < 5) {
      try {
        const cgUrl = `https://api.coingecko.com/api/v3/status_updates?per_page=10`
        const cgRes = await fetch(cgUrl, {
          headers: { 'User-Agent': 'oculus-trading/1.0' },
          next: { revalidate: 300 },
        })
        if (cgRes.ok) {
          const cgData: { status_updates: CoinGeckoStatusUpdate[] } = await cgRes.json()
          if (cgData.status_updates) {
            for (const update of cgData.status_updates) {
              const date = new Date(update.created_at)
              const time = date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
              entries.push({
                id: `cg-${date.getTime()}`,
                time,
                source: 'CGKO',
                headline: `[${update.project?.symbol?.toUpperCase() || 'MARKET'}] ${update.description?.substring(0, 200)}`,
                sentiment: 'neutral',
              })
            }
          }
        }
      } catch {
        // CoinGecko status updates are optional
      }
    }

    return NextResponse.json({ entries })
  } catch (err) {
    console.error('[GET /api/feed/news]', err)
    return NextResponse.json({ entries: [] })
  }
}
