import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export interface DefiEntry {
  protocolName: string | null
  protocolSlug: string | null
  tvl: number | null
  tvlChange24h: number | null
  tvlChange7d: number | null
  mcapToTvl: number | null
  category: string | null
  chains: string[]
  chainTvl: number | null
  fees24h: number | null
  fees7d: number | null
  fees30d: number | null
  revenue24h: number | null
  revenue7d: number | null
  revenue30d: number | null
}

const SYMBOL_TO_DEFILLAMA: Record<string, { protocol?: string; chain?: string }> = {
  ETH: { chain: 'Ethereum' },
  SOL: { chain: 'Solana' },
  BNB: { chain: 'BSC' },
  AVAX: { chain: 'Avalanche' },
  ARB: { chain: 'Arbitrum' },
  OP: { chain: 'Optimism' },
  SUI: { chain: 'Sui' },
  NEAR: { chain: 'Near' },
  APT: { chain: 'Aptos' },
  DOT: { chain: 'Polkadot' },
  ATOM: { chain: 'Cosmos' },
  FIL: { chain: 'Filecoin' },
  ADA: { chain: 'Cardano' },
  AAVE: { protocol: 'aave', chain: 'Ethereum' },
  UNI: { protocol: 'uniswap', chain: 'Ethereum' },
  PENDLE: { protocol: 'pendle', chain: 'Ethereum' },
  INJ: { protocol: 'injective', chain: 'Injective' },
  LINK: { protocol: 'chainlink' },
}

interface DefiLlamaChain {
  name: string
  tvl: number
  tokenSymbol: string
  gecko_id: string
}

interface DefiLlamaProtocol {
  name: string
  slug: string
  tvl: number | null
  tvlPrevDay: number | null
  tvlPrevWeek: number | null
  mcap: number | null
  category: string
  chains: string[]
}

interface DefiLlamaFeeRevenue {
  total24h: number | null
  total7d: number | null
  total30d: number | null
}

const FETCH_OPTIONS = { next: { revalidate: 300 } } as RequestInit

async function fetchProtocol(slug: string): Promise<DefiLlamaProtocol | null> {
  try {
    const res = await fetch(`https://api.llama.fi/protocol/${slug}`, FETCH_OPTIONS)
    if (!res.ok) return null
    const data: Record<string, unknown> = await res.json()
    return {
      name: data.name as string,
      slug: data.slug as string,
      tvl: typeof data.tvl === 'number' ? data.tvl : null,
      tvlPrevDay: typeof data.tvlPrevDay === 'number' ? data.tvlPrevDay : null,
      tvlPrevWeek: typeof data.tvlPrevWeek === 'number' ? data.tvlPrevWeek : null,
      mcap: typeof data.mcap === 'number' ? data.mcap : null,
      category: data.category as string,
      chains: data.chains as string[],
    }
  } catch {
    return null
  }
}

async function fetchChainTvl(chainName: string): Promise<number | null> {
  try {
    const res = await fetch('https://api.llama.fi/v2/chains', FETCH_OPTIONS)
    if (!res.ok) return null
    const chains: DefiLlamaChain[] = await res.json()
    const found = chains.find(
      (c) => c.name.toLowerCase() === chainName.toLowerCase()
    )
    return found?.tvl ?? null
  } catch {
    return null
  }
}

async function fetchFees(slug: string): Promise<DefiLlamaFeeRevenue> {
  const empty: DefiLlamaFeeRevenue = { total24h: null, total7d: null, total30d: null }
  try {
    const res = await fetch(
      `https://api.llama.fi/summary/fees/${slug}?dataType=dailyFees`,
      FETCH_OPTIONS
    )
    if (!res.ok) return empty
    const data: Record<string, unknown> = await res.json()
    return {
      total24h: (data.total24h as number) ?? null,
      total7d: (data.total7d as number) ?? null,
      total30d: (data.total30d as number) ?? null,
    }
  } catch {
    return empty
  }
}

async function fetchRevenue(slug: string): Promise<DefiLlamaFeeRevenue> {
  const empty: DefiLlamaFeeRevenue = { total24h: null, total7d: null, total30d: null }
  try {
    const res = await fetch(
      `https://api.llama.fi/summary/revenue/${slug}?dataType=dailyRevenue`,
      FETCH_OPTIONS
    )
    if (!res.ok) return empty
    const data: Record<string, unknown> = await res.json()
    return {
      total24h: (data.total24h as number) ?? null,
      total7d: (data.total7d as number) ?? null,
      total30d: (data.total30d as number) ?? null,
    }
  } catch {
    return empty
  }
}

function computeTvlChange(current: number, previous: number): number | null {
  if (!previous || previous === 0) return null
  return ((current - previous) / previous) * 100
}

// GET /api/feed/defi?symbol=BTC
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const symbol = (searchParams.get('symbol') ?? 'BTC').toUpperCase()

    const mapping = SYMBOL_TO_DEFILLAMA[symbol]
    if (!mapping) {
      return NextResponse.json({ data: null })
    }

    const { protocol: slug, chain: chainName } = mapping

    // Fire all requests in parallel
    const [protocolData, chainTvl, fees, revenue] = await Promise.all([
      slug ? fetchProtocol(slug) : Promise.resolve(null),
      chainName ? fetchChainTvl(chainName) : Promise.resolve(null),
      slug ? fetchFees(slug) : Promise.resolve({ total24h: null, total7d: null, total30d: null }),
      slug ? fetchRevenue(slug) : Promise.resolve({ total24h: null, total7d: null, total30d: null }),
    ])

    // If we got nothing useful, return null
    if (!protocolData && chainTvl === null) {
      return NextResponse.json({ data: null })
    }

    const entry: DefiEntry = {
      protocolName: protocolData?.name ?? null,
      protocolSlug: protocolData?.slug ?? slug ?? null,
      tvl: protocolData?.tvl ?? null,
      tvlChange24h:
        protocolData && protocolData.tvl != null && protocolData.tvlPrevDay != null
          ? computeTvlChange(protocolData.tvl, protocolData.tvlPrevDay)
          : null,
      tvlChange7d:
        protocolData && protocolData.tvl != null && protocolData.tvlPrevWeek != null
          ? computeTvlChange(protocolData.tvl, protocolData.tvlPrevWeek)
          : null,
      mcapToTvl:
        protocolData?.mcap && protocolData.tvl
          ? protocolData.mcap / protocolData.tvl
          : null,
      category: protocolData?.category ?? null,
      chains: protocolData?.chains ?? [],
      chainTvl,
      fees24h: fees.total24h,
      fees7d: fees.total7d,
      fees30d: fees.total30d,
      revenue24h: revenue.total24h,
      revenue7d: revenue.total7d,
      revenue30d: revenue.total30d,
    }

    return NextResponse.json({ data: entry })
  } catch (err) {
    console.error('[GET /api/feed/defi]', err)
    return NextResponse.json({ data: null })
  }
}
