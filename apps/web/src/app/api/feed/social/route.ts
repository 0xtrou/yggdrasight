import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export interface SocialEntry {
  id: string
  time: string
  source: string
  headline: string
  url?: string
  sentiment?: 'up' | 'down' | 'neutral'
  value?: number
}

interface CoinGeckoTrendingCoin {
  item: {
    id: string
    coin_id: number
    name: string
    symbol: string
    market_cap_rank: number
    thumb: string
    score: number
    data?: {
      price_change_percentage_24h?: { usd?: number }
    }
  }
}

interface CoinGeckoCoinData {
  sentiment_votes_up_percentage: number
  sentiment_votes_down_percentage: number
  community_data: {
    twitter_followers: number
    reddit_subscribers: number
    reddit_accounts_active_48h: number
    reddit_average_posts_48h: number
    reddit_average_comments_48h: number
  }
  developer_data: {
    stars: number
    forks: number
    subscribers: number
    total_issues: number
    closed_issues: number
    pull_requests_merged: number
    commit_count_4_weeks: number
  }
  tickers: {
    base: string
    target: string
    market: { name: string }
    last: number
    volume: number
    trust_score: string
  }[]
}

// Symbol to CoinGecko ID mapping (reuse from coins route)
const SYMBOL_TO_COINGECKO: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  BNB: 'binancecoin',
  TAO: 'bittensor',
  PENDLE: 'pendle',
  DOGE: 'dogecoin',
  ADA: 'cardano',
  XRP: 'ripple',
  AVAX: 'avalanche-2',
  DOT: 'polkadot',
  LINK: 'chainlink',
  UNI: 'uniswap',
  ATOM: 'cosmos',
  ARB: 'arbitrum',
  OP: 'optimism',
  APT: 'aptos',
  SUI: 'sui',
  NEAR: 'near',
  FIL: 'filecoin',
  AAVE: 'aave',
  INJ: 'injective-protocol',
  RENDER: 'render-token',
  FET: 'fetch-ai',
}

function formatTime(ts: number | string): string {
  const d = typeof ts === 'string' ? new Date(ts) : new Date(ts)
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// GET /api/feed/social?symbol=BTC
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const symbol = (searchParams.get('symbol') ?? 'BTC').toUpperCase()
    const coinId = SYMBOL_TO_COINGECKO[symbol] || symbol.toLowerCase()

    const entries: SocialEntry[] = []

    // Fetch CoinGecko community/social data + trending in parallel
    const [coinRes, trendingRes] = await Promise.all([
      fetch(`https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=true&market_data=false&community_data=true&developer_data=true&sparkline=false`, {
        headers: { 'User-Agent': 'oculus-trading/1.0' },
        next: { revalidate: 120 },
      }).catch(() => null),
      fetch(`https://api.coingecko.com/api/v3/search/trending`, {
        headers: { 'User-Agent': 'oculus-trading/1.0' },
        next: { revalidate: 300 },
      }).catch(() => null),
    ])

    const now = formatTime(Date.now())

    // Process coin community data
    if (coinRes?.ok) {
      const data: CoinGeckoCoinData = await coinRes.json()

      // Sentiment votes
      if (data.sentiment_votes_up_percentage != null) {
        const upPct = data.sentiment_votes_up_percentage.toFixed(1)
        const downPct = data.sentiment_votes_down_percentage.toFixed(1)
        entries.push({
          id: `sentiment-${coinId}`,
          time: now,
          source: 'CGKO',
          headline: `${symbol} community sentiment: ${upPct}% bullish / ${downPct}% bearish`,
          sentiment: data.sentiment_votes_up_percentage > 60 ? 'up' : data.sentiment_votes_up_percentage < 40 ? 'down' : 'neutral',
          value: data.sentiment_votes_up_percentage,
        })
      }

      // Twitter/X followers
      if (data.community_data?.twitter_followers) {
        entries.push({
          id: `twitter-${coinId}`,
          time: now,
          source: 'X/TW',
          headline: `${symbol} Twitter/X followers: ${data.community_data.twitter_followers.toLocaleString()}`,
          sentiment: 'neutral',
          value: data.community_data.twitter_followers,
        })
      }

      // Reddit activity
      if (data.community_data?.reddit_subscribers) {
        const active = data.community_data.reddit_accounts_active_48h || 0
        const avgPosts = data.community_data.reddit_average_posts_48h || 0
        const avgComments = data.community_data.reddit_average_comments_48h || 0
        entries.push({
          id: `reddit-subs-${coinId}`,
          time: now,
          source: 'RDDT',
          headline: `${symbol} Reddit: ${data.community_data.reddit_subscribers.toLocaleString()} subs, ${active.toLocaleString()} active (48h)`,
          sentiment: 'neutral',
          value: data.community_data.reddit_subscribers,
        })
        if (avgPosts > 0 || avgComments > 0) {
          entries.push({
            id: `reddit-activity-${coinId}`,
            time: now,
            source: 'RDDT',
            headline: `${symbol} Reddit activity (48h avg): ${avgPosts.toFixed(0)} posts, ${avgComments.toFixed(0)} comments`,
            sentiment: avgComments > 100 ? 'up' : 'neutral',
            value: avgComments,
          })
        }
      }

      // Developer activity
      if (data.developer_data?.commit_count_4_weeks) {
        const commits = data.developer_data.commit_count_4_weeks
        const stars = data.developer_data.stars || 0
        entries.push({
          id: `dev-${coinId}`,
          time: now,
          source: 'GH',
          headline: `${symbol} developer activity: ${commits} commits (4wk), ${stars.toLocaleString()} stars, ${data.developer_data.pull_requests_merged || 0} PRs merged`,
          sentiment: commits > 50 ? 'up' : 'neutral',
          value: commits,
        })
      }

      // Top exchange tickers (volume)
      if (data.tickers?.length > 0) {
        const topTickers = data.tickers
          .filter((t) => t.trust_score === 'green')
          .sort((a, b) => b.volume - a.volume)
          .slice(0, 3)

        for (const t of topTickers) {
          entries.push({
            id: `ticker-${t.market.name}-${t.base}-${t.target}`,
            time: now,
            source: t.market.name.substring(0, 5).toUpperCase(),
            headline: `${t.base}/${t.target} on ${t.market.name}: $${t.last.toLocaleString()} — vol ${t.volume.toLocaleString()}`,
            sentiment: 'neutral',
            value: t.volume,
          })
        }
      }
    }

    // Process trending coins
    if (trendingRes?.ok) {
      const data: { coins: CoinGeckoTrendingCoin[] } = await trendingRes.json()
      if (data.coins) {
        // Check if our symbol is trending
        const ourRank = data.coins.findIndex(
          (c) => c.item.symbol.toUpperCase() === symbol
        )
        if (ourRank >= 0) {
          entries.push({
            id: `trending-${symbol}`,
            time: now,
            source: 'TREND',
            headline: `${symbol} is TRENDING #${ourRank + 1} on CoinGecko — high market interest`,
            sentiment: 'up',
          })
        }

        // Show top trending as market context
        const topTrending = data.coins.slice(0, 5)
        const trendList = topTrending
          .map((c, i) => `#${i + 1} ${c.item.symbol.toUpperCase()}`)
          .join(', ')
        entries.push({
          id: 'trending-list',
          time: now,
          source: 'TREND',
          headline: `CoinGecko trending: ${trendList}`,
          sentiment: 'neutral',
        })
      }
    }

    return NextResponse.json({ entries })
  } catch (err) {
    console.error('[GET /api/feed/social]', err)
    return NextResponse.json({ entries: [] })
  }
}
