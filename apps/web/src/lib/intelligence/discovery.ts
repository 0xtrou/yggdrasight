/**
 * Shared discovery prompt builder and response parser.
 * Used by both the API route and the off-thread worker script.
 */
import type { DiscoveredProjectInfo } from './types'

// Known symbol → full name mappings for better search prompts
const SYMBOL_NAMES: Record<string, string> = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  SOL: 'Solana',
  BNB: 'BNB Chain (Binance)',
  TAO: 'Bittensor',
  PENDLE: 'Pendle Finance',
  DOGE: 'Dogecoin',
  ADA: 'Cardano',
  XRP: 'Ripple XRP',
  AVAX: 'Avalanche',
  DOT: 'Polkadot',
  LINK: 'Chainlink',
  UNI: 'Uniswap',
  ATOM: 'Cosmos',
  ARB: 'Arbitrum',
  OP: 'Optimism',
  APT: 'Aptos',
  SUI: 'Sui',
  NEAR: 'NEAR Protocol',
  FIL: 'Filecoin',
  AAVE: 'Aave',
  INJ: 'Injective',
  RENDER: 'Render Network',
  FET: 'Fetch.ai',
  ICP: 'Internet Computer',
  TIA: 'Celestia',
  JUP: 'Jupiter (Solana)',
  ONDO: 'Ondo Finance',
  SEI: 'Sei Network',
  SENT: 'Sentient',
}

export function buildDiscoveryPrompt(symbol: string): string {
  const fullName = SYMBOL_NAMES[symbol] || symbol
  const slug = (SYMBOL_NAMES[symbol] || symbol).toLowerCase().replace(/[^a-z0-9]/g, '-')

  const jsonSchema = JSON.stringify({
    projectName: 'string or null',
    description: 'string or null - 2-3 sentence description',
    website: 'string or null',
    twitter: 'string or null - handle without @',
    github: 'string or null',
    discord: 'string or null',
    telegram: 'string or null',
    founders: ['name1', 'name2'],
    teamSize: 'string or null',
    teamBackground: 'string or null',
    fundingRounds: ['Series A: $10M (a16z, 2023)'],
    totalFunding: 'string or null - e.g. $85M',
    investors: ['VC1', 'VC2'],
    treasury: 'string or null - estimated runway',
    teamActivity: 'string or null - recent hiring/shipping signals',
    genesisDate: 'string or null',
    categories: ['cat1'],
    ecosystem: 'string or null',
    narrativeStrength: 'string or null - how well it fits current narratives',
    uniqueSellingPoint: 'string or null',
    competitors: ['comp1'],
    partnerships: ['partner1'],
    adoptionSignals: 'string or null - user metrics, dApp usage',
    tokenType: 'string or null',
    totalSupply: 'string or null',
    circulatingSupply: 'string or null',
    maxSupply: 'string or null',
    tvl: 'string or null',
    marketCap: 'string or null',
    fdv: 'string or null',
    revenueModel: 'string or null - how protocol earns',
    moatDescription: 'string or null - what makes it defensible',
    mainnetLaunched: 'true/false/null',
    audited: 'true/false/null',
    auditDetails: 'string or null - which firms, when',
    currentPrice: 'string or null',
    allTimeHigh: 'string or null',
    allTimeLow: 'string or null',
    priceFromATH: 'string or null - e.g. -56%',
    vestingSchedule: 'string or null',
    inflationRate: 'string or null',
    stakingYield: 'string or null',
    valuationNotes: 'string or null - your valuation assessment',
    contractAddress: 'string or null',
    chain: 'string or null',
    holderCount: 'string or null',
    activeAddresses24h: 'string or null',
    largeTransactions: 'string or null',
    topHolders: ['holder1 - X%'],
    onChainSummary: 'string or null',
    risks: ['risk1'],
    recentNews: ['news1'],
    pillar1Score: 'STRONG or MODERATE or WEAK',
    pillar2Score: 'STRONG or MODERATE or WEAK',
    pillar3Score: 'STRONG or MODERATE or WEAK',
    pillar4Score: 'STRONG or MODERATE or WEAK',
    aiSummary: 'string - 3-5 sentence overall assessment',
  }, null, 2)

  return [
    `You are a crypto research analyst. Your task is to deeply research the cryptocurrency project "${fullName}" (ticker: ${symbol}).`,
    '',
    '## RESEARCH INSTRUCTIONS',
    '',
    'Use your websearch and webfetch tools extensively. Do NOT rely on training data — search the web for CURRENT information.',
    '',
    '### Step 1: General Project Research',
    `Search for "${fullName} crypto" and "${symbol} cryptocurrency" to find:`,
    '- Official website, social links (Twitter/X, Discord, Telegram, GitHub)',
    '- Team/founders — who built this? What is their background?',
    '- Funding rounds, investors, total funding raised, treasury/runway',
    '- Token type and chain (ERC-20, native L1, SPL, etc.)',
    '- Tokenomics (total supply, circulating supply, max supply, vesting)',
    '- Project description, categories, ecosystem',
    '- Competitors, unique selling points, partnerships',
    '- Revenue model — how does the protocol earn?',
    '- Adoption signals — dApp usage, active users, growth',
    '- Recent news and developments',
    '- Known risks or controversies',
    '',
    '### Step 2: Valuation & Market Data',
    'Search for current pricing and valuation data:',
    '- Current price, all-time high, all-time low, % from ATH',
    '- Staking yield / APR if applicable',
    '- Token inflation / emission rate',
    '- Vesting schedule and upcoming unlocks',
    '',
    '### Step 3: On-Chain Activity Research',
    `Research on-chain activity using blockchain explorers. Search for "${symbol} contract address" or "${fullName} token address" first, then visit the relevant explorer:`,
    '',
    '**Explorer URL patterns to try (use webfetch):**',
    '- Ethereum/ERC-20: https://etherscan.io/token/<contract_address> — check holders, transfers, top holders',
    '- Solana/SPL: https://solscan.io/token/<token_address> — check holders, activity',
    '- BSC/BEP-20: https://bscscan.com/token/<contract_address>',
    '- Arbitrum: https://arbiscan.io/token/<contract_address>',
    '- Base: https://basescan.org/token/<contract_address>',
    '- Optimism: https://optimistic.etherscan.io/token/<contract_address>',
    '- Avalanche: https://snowtrace.io/token/<contract_address>',
    '- Polygon: https://polygonscan.com/token/<contract_address>',
    '',
    'Also try:',
    `- CoinGecko page: https://www.coingecko.com/en/coins/${slug}`,
    `- DeFiLlama: https://defillama.com/protocol/${slug}`,
    `- CoinMarketCap: https://coinmarketcap.com/currencies/${slug}/`,
    '',
    'Look for:',
    '- Number of token holders',
    '- Recent large transactions (whale activity)',
    '- Top holder distribution (concentration risk)',
    '- Daily active addresses if available',
    '- Any notable on-chain patterns',
    '',
    '### Step 4: Compile Results',
    '',
    'Rate each of the 4 core investment pillars as STRONG, MODERATE, or WEAK:',
    '1. **Team Survival Fitness** — Is the team credible, funded, actively building?',
    '2. **Narrative Alignment** — Does the project fit current macro narratives (AI, DePIN, RWA)?',
    '3. **Economic Moat** — Does the protocol have defensibility, real TVL, revenue?',
    '4. **Valuation & Accumulation Zone** — Is the current price attractive vs fundamentals?',
    '',
    'Return your findings as a SINGLE JSON object with this EXACT structure (use null for anything you could not find):',
    '',
    '```json',
    jsonSchema,
    '```',
    '',
    'IMPORTANT:',
    '- Return ONLY the JSON object, no other text',
    '- Use null for any field you could not find reliable data for',
    '- For on-chain data, note if the data is from a specific date',
    '- Be factual — cite what you found, do not speculate',
    '- Rate each pillar honestly based on evidence found',
  ].join('\n')
}

export function parseDiscoveredInfo(text: string): Partial<DiscoveredProjectInfo> | null {
  // Try direct JSON parse
  try {
    return JSON.parse(text)
  } catch {
    // Not direct JSON
  }

  // Try extracting JSON from markdown code blocks
  const jsonBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (jsonBlockMatch) {
    try {
      return JSON.parse(jsonBlockMatch[1])
    } catch {
      // Invalid JSON in code block
    }
  }

  // Try finding JSON object in the text
  const jsonMatch = text.match(/\{[\s\S]*"projectName"[\s\S]*\}/)
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0])
    } catch {
      // Try to find the largest valid JSON substring
      const str = jsonMatch[0]
      for (let end = str.length; end > 50; end--) {
        const attempt = str.substring(0, end) + '}'
        try {
          return JSON.parse(attempt)
        } catch {
          continue
        }
      }
    }
  }

  return null
}

/**
 * Convert raw parsed partial data into a fully-structured DiscoveredProjectInfo.
 */
export function toDiscoveredProjectInfo(
  parsed: Partial<DiscoveredProjectInfo>,
  sourcesUsed: string[] = [],
): DiscoveredProjectInfo {
  return {
    // Identity
    projectName: parsed.projectName ?? null,
    description: parsed.description ?? null,
    website: parsed.website ?? null,
    twitter: parsed.twitter ?? null,
    github: parsed.github ?? null,
    discord: parsed.discord ?? null,
    telegram: parsed.telegram ?? null,
    // Pillar 1: Team Survival Fitness
    founders: parsed.founders ?? null,
    teamSize: parsed.teamSize ?? null,
    teamBackground: parsed.teamBackground ?? null,
    fundingRounds: parsed.fundingRounds ?? null,
    totalFunding: parsed.totalFunding ?? null,
    investors: parsed.investors ?? null,
    treasury: parsed.treasury ?? null,
    teamActivity: parsed.teamActivity ?? null,
    genesisDate: parsed.genesisDate ?? null,
    // Pillar 2: Narrative Alignment
    categories: parsed.categories ?? null,
    ecosystem: parsed.ecosystem ?? null,
    narrativeStrength: parsed.narrativeStrength ?? null,
    uniqueSellingPoint: parsed.uniqueSellingPoint ?? null,
    competitors: parsed.competitors ?? null,
    partnerships: parsed.partnerships ?? null,
    adoptionSignals: parsed.adoptionSignals ?? null,
    // Pillar 3: Economic Moat
    tokenType: parsed.tokenType ?? null,
    totalSupply: parsed.totalSupply ?? null,
    circulatingSupply: parsed.circulatingSupply ?? null,
    maxSupply: parsed.maxSupply ?? null,
    tvl: parsed.tvl ?? null,
    marketCap: parsed.marketCap ?? null,
    fdv: parsed.fdv ?? null,
    revenueModel: parsed.revenueModel ?? null,
    moatDescription: parsed.moatDescription ?? null,
    mainnetLaunched: typeof parsed.mainnetLaunched === 'boolean' ? parsed.mainnetLaunched : null,
    audited: typeof parsed.audited === 'boolean' ? parsed.audited : null,
    auditDetails: parsed.auditDetails ?? null,
    // Pillar 4: Valuation & Accumulation Zone
    currentPrice: parsed.currentPrice ?? null,
    allTimeHigh: parsed.allTimeHigh ?? null,
    allTimeLow: parsed.allTimeLow ?? null,
    priceFromATH: parsed.priceFromATH ?? null,
    vestingSchedule: parsed.vestingSchedule ?? null,
    inflationRate: parsed.inflationRate ?? null,
    stakingYield: parsed.stakingYield ?? null,
    valuationNotes: parsed.valuationNotes ?? null,
    // On-chain Activity
    contractAddress: parsed.contractAddress ?? null,
    chain: parsed.chain ?? null,
    holderCount: parsed.holderCount ?? null,
    activeAddresses24h: parsed.activeAddresses24h ?? null,
    largeTransactions: parsed.largeTransactions ?? null,
    topHolders: parsed.topHolders ?? null,
    onChainSummary: parsed.onChainSummary ?? null,
    // Risks & News
    risks: parsed.risks ?? null,
    recentNews: parsed.recentNews ?? null,
    // AI Assessment
    aiSummary: parsed.aiSummary ?? null,
    pillar1Score: parsed.pillar1Score ?? null,
    pillar2Score: parsed.pillar2Score ?? null,
    pillar3Score: parsed.pillar3Score ?? null,
    pillar4Score: parsed.pillar4Score ?? null,
    // Metadata
    discoveredAt: new Date().toISOString(),
    sourcesUsed: parsed.sourcesUsed ?? sourcesUsed ?? [],
  }
}
