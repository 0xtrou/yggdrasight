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

The core of Yggdrasight is a multi-layer AI pipeline. All judgment layers run on
[TypeSafe](https://docs.typesafe.ai) — its System One models (Jev) turn natural
language and application state into **typed judgments with calibrated
probabilities** (Noul = P(yes), Choice = pick from options with a distribution,
Score = position on described levels) that code composes. No prompt-and-parse:
every question returns structured, probability-weighted answers.

### Layer 1 — Discovery
The discovery worker runs an [OpenCode](https://opencode.ai) agent in a Docker container with no time limit. It researches the underlying project — whitepapers, GitHub, socials, tokenomics — and returns structured context that feeds every judgment downstream.

### Layer 2 — Classification (1 batched TypeSafe request)
The six philosophical dimensions — previously six separate agents — are now six
families of typed questions over the same discovery state, all in **one batched
request**:

| Dimension | TypeSafe questions |
|---|---|
| **Crack Mapping** | 9 Nouls — one per crack, probability = resonance strength |
| **Visibility** | Choice (direction) + 2 Scores (abstraction depth, crypto language) |
| **Narrative Separator** | 2 Scores (narrative dependency, substitutability) + Noul (core function survives) + Choice (narrative label) |
| **Power Vector** | Choice (direction) + 2 Scores (team dependency, token concentration) |
| **Problem Recognition** | 2 Scores (recognition level, categorization coherence) |
| **Identity Polarity** | Choice (polarity) + Noul (transcends its mirror) |

### Layer 3 — Synthesis (second batched request)
A second request — justified because it needs the round-1 answers as state —
judges per-category membership (6 Nouls), the primary category, the categorical
migration trajectory and the Inner Council archetype (Choices). Code then
assembles the final `ClassificationResult`; narrative text is deterministically
templated from the judgments, never generated.

### Layer 4 — Analysis (6 TypeSafe analysts + Mirofish)
Six named analysts — Wyckoff, Elliott Wave, Soros Reflexivity, On-Chain, Warren
Buffett and Long-Term Conviction — each become a single Choice judgment
(long/short/neutral) whose instructions carry the analyst's philosophy and
whose state is the serialized market snapshot. The answer's probability
distribution IS the confidence; code policy neutralizes near-coin-flip calls
(|P(long) − P(short)| < 0.10 → NEUTRAL).

**Mirofish is NOT TypeSafe.** It stays a distinct prediction mechanism: an
independent swarm-simulation backend (ontology → knowledge graph → multi-round
AI-persona social simulation → crowd consensus extraction) that needs the
`mirofish-backend` service running. Its bull/bear consensus is a separate
evidence source weighted alongside the TypeSafe judgments, not one of them.

A full classification now completes in seconds (2 API requests, ~30 judgments)
instead of 7 Docker agents doing minutes of web research each.

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
AI Runtime      TypeSafe System One (judgment layers) + OpenCode CLI in Docker (research/discovery)
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
│               │   ├── classification/ Types + TypeSafe classifier
│               │   ├── engine/       Runner, consensus, TypeSafe client, OpenCode adapter
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

Every OpenCode-driven agent (discovery, chat, signal crawling) can run a
different model. Configuration lives in `/ai-config` and persists to
`localStorage('yggdrasight:agentModelMap')`.

```
Discovery       → one model
Chat            → one model
Signal Crawl    → one model
```

The TypeSafe judgment layers (classification + analysis) run on
`jev-latest` (override with `TYPESAFE_MODEL`) — per-agent model maps are
accepted but ignored there.

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

> **Local mode:** in development the terminal runs without the password-hash
> authentication gate — everything uses the default MongoDB and the host's
> OpenCode config, and the TypeSafe judgment layers need only
> `TYPESAFE_API_KEY`. Set `AUTH_DISABLED=0` to re-enable the gate even in dev,
> or `AUTH_DISABLED=1` to keep it off in production-style deployments.

```bash
cp apps/web/.env.local.example apps/web/.env.local
# Edit apps/web/.env.local — add your TYPESAFE_API_KEY (required)
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

# Required — TypeSafe intelligence (classification + analysis)
# Get a key at https://console.typesafe.ai/settings/keys
TYPESAFE_API_KEY=
# Optional — overrides
# TYPESAFE_MODEL=jev-latest
# TYPESAFE_API_URL=https://api.typesafe.ai/v1/systemone

# Optional — market data
BINANCE_API_KEY=
BINANCE_API_SECRET=
COINGECKO_API_KEY=

# Optional — AI providers (OpenCode handles model routing for discovery/chat)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

# Auth — development skips the password-hash gate by default (see below).
# Force it on/off in any environment:
# AUTH_DISABLED=1
# AUTH_DISABLED=0

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
  Loads job + latest DiscoveryJob for BTC (judgment state)
  Round 1 — one batched TypeSafe request:
    9 crack Nouls + visibility/narrative/power/recognition/polarity
    questions over the same state (run in parallel)
  Round 2 — synthesis request (needs round-1 answers as state):
    6 category Nouls + primary category, migration, archetype Choices
  Code assembles legacy SubAgentResult shapes + ClassificationResult
  Saves to MongoDB
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
