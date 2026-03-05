import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

interface CoinGeckoMarket {
  id: string
  symbol: string
  name: string
  current_price: number
  market_cap: number
  total_volume: number
  price_change_percentage_24h: number
  market_cap_rank: number
}

// Comprehensive symbol → CoinGecko ID mapping
// Add new symbols here when needed
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
  MATIC: 'matic-network',
  UNI: 'uniswap',
  ATOM: 'cosmos',
  ARB: 'arbitrum',
  OP: 'optimism',
  APT: 'aptos',
  SUI: 'sui',
  SEI: 'sei-network',
  INJ: 'injective-protocol',
  TIA: 'celestia',
  JUP: 'jupiter-exchange-solana',
  ONDO: 'ondo-finance',
  RENDER: 'render-token',
  FET: 'fetch-ai',
  NEAR: 'near',
  FIL: 'filecoin',
  ICP: 'internet-computer',
  LTC: 'litecoin',
  BCH: 'bitcoin-cash',
  AAVE: 'aave',
  MKR: 'maker',
  CRV: 'curve-dao-token',
  LDO: 'lido-dao',
  PEPE: 'pepe',
  WIF: 'dogwifcoin',
  BONK: 'bonk',
  SHIB: 'shiba-inu',
  MEME: 'memecoin-2',
  FTM: 'fantom',
  ALGO: 'algorand',
  HBAR: 'hedera-hashgraph',
  VET: 'vechain',
  SAND: 'the-sandbox',
  MANA: 'decentraland',
  AXS: 'axie-infinity',
  GRT: 'the-graph',
  RUNE: 'thorchain',
  STX: 'blockstack',
  IMX: 'immutable-x',
  WLD: 'worldcoin-wld',
  TRX: 'tron',
}

function resolveSymbolsToIds(symbols: string[]): string {
  return symbols
    .map((s) => {
      const upper = s.toUpperCase().replace(/USDT$/i, '')
      return SYMBOL_TO_COINGECKO[upper] || upper.toLowerCase()
    })
    .filter(Boolean)
    .join(',')
}

// GET /api/market/coins?symbols=BTC,ETH,TAO,PENDLE
// Also still supports ?ids=bitcoin,ethereum for backwards compat
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const symbolsParam = searchParams.get('symbols')
    const idsParam = searchParams.get('ids')

    let ids: string
    if (symbolsParam) {
      // New path: accept trading symbols (BTC, TAO, PENDLE) and resolve to CoinGecko IDs
      ids = resolveSymbolsToIds(symbolsParam.split(','))
    } else if (idsParam) {
      // Legacy/direct: accept CoinGecko IDs directly
      ids = idsParam
    } else {
      ids = 'bitcoin,ethereum,solana,binancecoin'
    }

    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=100&page=1&sparkline=false`,
      {
        headers: { 'User-Agent': 'oculus-trading/1.0' },
        next: { revalidate: 60 },
      },
    )

    if (!res.ok) {
      console.error('[GET /api/market/coins] CoinGecko error', res.status)
      return NextResponse.json({ error: 'upstream unavailable' }, { status: 503 })
    }

    const raw: CoinGeckoMarket[] = await res.json()

    const coins = raw.map((c) => ({
      id: c.id,
      symbol: c.symbol,
      name: c.name,
      currentPrice: c.current_price,
      marketCap: c.market_cap,
      volume24h: c.total_volume,
      priceChange24h: c.price_change_percentage_24h,
      rank: c.market_cap_rank,
    }))

    return NextResponse.json(coins)
  } catch (err) {
    console.error('[GET /api/market/coins]', err)
    return NextResponse.json({ error: 'upstream unavailable' }, { status: 503 })
  }
}
