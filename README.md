<div align="center">
  <img src="./apps/web/public/icon-512x512.png" alt="Yggdrasight" width="100" />
  <h1>YGGDRASIGHT</h1>
  <p><strong>AI-native trading intelligence terminal.</strong><br/>Real-time market data. Multi-agent philosophical analysis. Bloomberg vibes.</p>
  <p>
    <img src="https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js" />
    <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black" />
    <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white" />
    <img src="https://img.shields.io/badge/Tailwind-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" />
    <img src="https://img.shields.io/badge/Bun-1-F472B6?style=flat-square&logo=bun&logoColor=white" />
    <img src="https://img.shields.io/badge/MongoDB-7-47A248?style=flat-square&logo=mongodb&logoColor=white" />
    <img src="https://img.shields.io/badge/Redis-7-DC382D?style=flat-square&logo=redis&logoColor=white" />
    <img src="https://img.shields.io/badge/Docker-required-2496ED?style=flat-square&logo=docker&logoColor=white" />
    <img src="https://img.shields.io/badge/pnpm-9-F69220?style=flat-square&logo=pnpm&logoColor=white" />
    <img src="https://img.shields.io/badge/license-private-red?style=flat-square" />
  </p>
</div>

---

```
┌─────────────────────────────────────────────────────────┐
│  YGGDRASIGHT  │  BTC  ETH  SOL  TAO  PENDLE           ◉ LIVE │
├─────────────────────────────────────────────────────────┤
│  CHART ▸ 4H         │  INTELLIGENCE                     │
│                     │  ├─ Crack Mapping       COMPLETE  │
│  ╱╲  ╱╲╱╲          │  ├─ Visibility          COMPLETE  │
│ ╱  ╲╱    ╲╱╲       │  ├─ Narrative Separator COMPLETE  │
│              ╲╱     │  ├─ Power Vector        COMPLETE  │
│                     │  ├─ Problem Recognition COMPLETE  │
│  $98,420.00  +2.4%  │  └─ Synthesizer     ▸ RUNNING    │
├─────────────────────┴──────────────────────────────────┤
│  ANALYSIS  │  Wyckoff  │  Elliott  │  Soros  │  On-chain │
└─────────────────────────────────────────────────────────┘
```

---

## What is this

Yggdrasight is a research trading terminal that runs a swarm of AI agents against crypto assets to produce philosophical market intelligence — not price predictions, but a structured understanding of *why* a market is moving and *who* is moving it.

It combines live market data with a multi-layer intelligence engine: a discovery phase that researches the underlying project, a classification phase that runs 6 parallel analytical agents through Docker containers, and a synthesis phase that unifies everything into a structured verdict.

The UI is built to feel like a Bloomberg terminal. Dark. Dense. Fast.

---

## Intelligence Engine

The core of Yggdrasight is a 3-layer AI pipeline:

### Layer 1 — Discovery
The discovery worker runs an [OpenCode](https://opencode.ai) agent in a Docker container with no time limit. It researches the underlying project — whitepapers, GitHub, socials, tokenomics — and returns structured context that feeds everything downstream.

### Layer 2 — Classification (6 agents in parallel)
Six specialized philosophical agents run simultaneously, each inside its own Docker container:

| Agent | What it does |
|---|---|
| **Crack Mapping** | Identifies structural fractures — where narrative breaks down, trust erodes, or the thesis has contradictions |
| **Visibility** | Measures how much of the real picture is publicly knowable vs obscured |
| **Narrative Separator** | Strips marketing from signal — what story is being told vs what's actually happening |
| **Power Vector** | Maps who holds leverage: teams, VCs, exchanges, whales, protocols |
| **Problem Recognition** | Evaluates whether the project is solving a real, durable problem |
| **Identity Polarity** | Measures community coherence vs fragmentation — how unified is the belief system |

Each agent gets the full discovery context plus its own specialized prompt. Each uses its own independently-configured model.

### Layer 3 — Synthesis
A 7th agent reads all 6 results and produces a unified `ClassificationResult`: a structured verdict with category, conviction, risk factors, and a plain-language thesis.

### Layer 4 — Analysis (6 LLM analysts)
Separate from classification, a set of named analysts run against live market data:

- **Wyckoff** — accumulation/distribution phase analysis
- **Elliott Wave** — wave structure and positioning
- **Soros Reflexivity** — feedback loops between price and fundamentals
- **On-Chain Analysis** — wallet flows, exchange deposits, miner behavior
- **Warren Buffett** — fundamental value and moat assessment
- **Long-Term Conviction** — multi-year thesis evaluation

---

## Stack

```
Frontend        Next.js 16 (App Router) + React 19
Styling         Tailwind CSS 4 — Bloomberg terminal color scheme
Charts          klinecharts 9 + lightweight-charts 5
Fonts           SF Mono (Apple) → JetBrains Mono → system monospace
Backend         Next.js API routes
Database        MongoDB 7 (Docker)
Cache           Redis 7 (Docker)
AI Runtime      OpenCode CLI in Docker containers (ghcr.io/anomalyco/opencode)
Workers         Bun — classify-worker.ts, discover-worker.ts
Monorepo        Turborepo + pnpm workspaces
Runtime         Node 24+ / Bun
```

---

## Project Structure

```
yggdrasight/
├── apps/
│   └── web/                          Next.js application
│       └── src/
│           ├── app/
│           │   ├── (terminal)/       Main terminal routes
│           │   │   ├── page.tsx      Dashboard (asset selector + panels)
│           │   │   ├── intelligence/ Classification runner
│           │   │   ├── discovery/    Asset discovery
│           │   │   ├── signals/      Trading signals
│           │   │   ├── feeds/        Market feeds
│           │   │   └── ai-config/    Per-agent model configuration
│           │   └── api/
│           │       ├── intelligence/ classify, analyze, verdicts, models
│           │       ├── feed/         discover, defi, social, onchain, news
│           │       ├── prices/       stream, klines, ohlcv
│           │       ├── signals/      CRUD
│           │       └── webhooks/     ingest
│           ├── components/terminal/  All UI components
│           ├── hooks/                Data hooks (streams, market data, signals)
│           └── lib/
│               ├── intelligence/
│               │   ├── analysts/     LLM analysts + algorithmic analysts
│               │   ├── classification/ Types, prompts, parsers
│               │   ├── engine/       Runner, consensus, OpenCode adapter
│               │   └── models/       Mongoose models (jobs, verdicts)
│               └── ingest/           Webhook parsing + normalization
├── scripts/
│   ├── classify-worker.ts            6-agent parallel classification orchestrator
│   └── discover-worker.ts            OpenCode discovery runner (detached process)
└── docker/
    └── opencode/                     Custom OpenCode container config
```

---

## Per-Agent Model Configuration

Every agent in the system can run a different model. Configuration lives in `/ai-config` and persists to `localStorage('yggdrasight:agentModelMap')`.

```
Discovery       → one model
Intelligence    → 7 individual models (one per sub-agent + synthesizer)
Analysis        → 6 individual models (one per LLM analyst)
```

The per-agent map flows all the way through: UI → API → worker → each Docker container. No single model lock-in.

---

## Setup

### 1. Clone & install

```bash
git clone https://github.com/anomalyco/yggdrasight
cd yggdrasight
pnpm install
```

### 2. Start infrastructure

```bash
docker compose up -d
# MongoDB :27017, Mongo Express :8081, Redis :6379
```

### 3. Configure environment

```bash
cp .env.local.example apps/web/.env.local
# Edit apps/web/.env.local — defaults work out of the box for local Docker
```

### 4. Run

```bash
pnpm dev
# → http://localhost:3000
```

---

## Environment Variables

```bash
# Required
MONGODB_URI=mongodb://yggdrasight:yggdrasight_dev_secret@localhost:27017/yggdrasight?authSource=admin
REDIS_URL=redis://localhost:6379

# Optional — market data
BINANCE_API_KEY=
BINANCE_API_SECRET=
COINGECKO_API_KEY=

# Optional — AI providers (OpenCode handles model routing)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

# Optional — alerts
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHANNEL_IDS=

# Optional — webhook ingestion security
WEBHOOK_SECRET=
```

---

## How a Classification Run Works

```
User triggers classify on BTC
        │
        ▼
POST /api/intelligence/classify
  Creates ClassificationJob in MongoDB
  Spawns classify-worker.ts as detached Bun process
  Returns jobId immediately
        │
        ▼
classify-worker.ts
  Loads job + latest DiscoveryJob for BTC
  Spawns 6 Docker containers in parallel:
    docker run opencode [crack_mapping prompt + context]
    docker run opencode [visibility prompt + context]
    docker run opencode [narrative_separator prompt + context]
    docker run opencode [power_vector prompt + context]
    docker run opencode [problem_recognition prompt + context]
    docker run opencode [identity_polarity prompt + context]
  Waits for all 6 (Promise.all)
  Spawns synthesizer container with all 6 results
  Parses structured output
  Saves ClassificationResult to MongoDB
  Creates ClassificationSnapshot for time-series
        │
        ▼
UI polls /api/intelligence/classify/:jobId
  Streams logs in real-time
  Renders results as they arrive
```

---

## Signals

Yggdrasight supports manual and automated trading signals. Each signal carries:
- Asset, direction (long/short), entry/target/stop
- Confidence level
- AI-generated rationale (linked to classification verdict)
- Webhook ingestion for external signal sources (TradingView, custom bots)

---

## Requirements

- **Node 24+** or **Bun** (workers run on Bun)
- **Docker** (required for OpenCode agent containers)
- **pnpm 9+**
- **MongoDB 7** and **Redis 7** (provided via Docker Compose)

---

## License

Private research project. Not financial advice.
