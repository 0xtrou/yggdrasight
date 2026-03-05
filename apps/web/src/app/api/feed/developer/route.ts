import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export interface DeveloperEntry {
  // Identity
  name: string                    // Coin name (e.g. "Bitcoin")
  twitterHandle: string | null    // Twitter/X screen name
  // GitHub metrics
  stars: number
  forks: number
  subscribers: number
  totalIssues: number
  closedIssues: number
  pullRequestsMerged: number
  pullRequestContributors: number
  commitCount4Weeks: number
  codeAdditions4Weeks: number
  codeDeletions4Weeks: number
  commitActivitySeries: number[] // 28-day array
  // Project metadata
  categories: string[] // e.g. ["AI", "DePIN", "L1"]
  description: string // project description text
  genesisDate: string | null
  githubRepos: string[] // GitHub repo URLs
  homepage: string | null
  // Community quick stats
  telegramUsers: number | null
  redditSubscribers: number | null
  twitterFollowers: number | null
  sentimentUp: number // percentage
  sentimentDown: number // percentage
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

interface CoinGeckoCoinResponse {
  name: string
  symbol: string
  categories: string[]
  description: { en: string }
  genesis_date: string | null
  links: {
    homepage: string[]
    twitter_screen_name: string | null
    repos_url: {
      github: string[]
    }
  }
  sentiment_votes_up_percentage: number | null
  sentiment_votes_down_percentage: number | null
  community_data: {
    telegram_channel_user_count: number | null
    reddit_subscribers: number | null
    twitter_followers: number | null
  } | null
  developer_data: {
    stars: number | null
    forks: number | null
    subscribers: number | null
    total_issues: number | null
    closed_issues: number | null
    pull_requests_merged: number | null
    pull_request_contributors: number | null
    commit_count_4_weeks: number | null
    code_additions_deletions_4_weeks: {
      additions: number | null
      deletions: number | null
    } | null
    last_4_weeks_commit_activity_series: number[] | null
  } | null
}

// GET /api/feed/developer?symbol=BTC
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const symbol = (searchParams.get('symbol') ?? 'BTC').toUpperCase()
    const coinId = SYMBOL_TO_COINGECKO[symbol] || symbol.toLowerCase()

    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&market_data=false&community_data=true&developer_data=true&sparkline=false`,
      {
        headers: { 'User-Agent': 'oculus-trading/1.0' },
        next: { revalidate: 120 },
      }
    )

    if (!res.ok) {
      return NextResponse.json(
        { data: null, error: `CoinGecko API returned ${res.status}` },
        { status: res.status }
      )
    }

    const coin: CoinGeckoCoinResponse = await res.json()

    const dev = coin.developer_data
    const community = coin.community_data
    const codeChanges = dev?.code_additions_deletions_4_weeks

    const data: DeveloperEntry = {
      // Identity
      name: coin.name ?? symbol,
      twitterHandle: coin.links?.twitter_screen_name || null,
      // GitHub metrics
      stars: dev?.stars ?? 0,
      forks: dev?.forks ?? 0,
      subscribers: dev?.subscribers ?? 0,
      totalIssues: dev?.total_issues ?? 0,
      closedIssues: dev?.closed_issues ?? 0,
      pullRequestsMerged: dev?.pull_requests_merged ?? 0,
      pullRequestContributors: dev?.pull_request_contributors ?? 0,
      commitCount4Weeks: dev?.commit_count_4_weeks ?? 0,
      codeAdditions4Weeks: codeChanges?.additions ?? 0,
      codeDeletions4Weeks: codeChanges?.deletions ?? 0,
      commitActivitySeries: dev?.last_4_weeks_commit_activity_series ?? [],
      // Project metadata
      categories: (coin.categories ?? []).filter((c): c is string => typeof c === 'string'),
      description: coin.description?.en ?? '',
      genesisDate: coin.genesis_date ?? null,
      githubRepos: (coin.links?.repos_url?.github ?? []).filter((url) => url !== ''),
      homepage: coin.links?.homepage?.[0] || null,
      // Community quick stats
      telegramUsers: community?.telegram_channel_user_count ?? null,
      redditSubscribers: community?.reddit_subscribers ?? null,
      twitterFollowers: community?.twitter_followers ?? null,
      sentimentUp: coin.sentiment_votes_up_percentage ?? 0,
      sentimentDown: coin.sentiment_votes_down_percentage ?? 0,
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('[GET /api/feed/developer]', err)
    return NextResponse.json({ data: null, error: 'Failed to fetch developer data' })
  }
}
