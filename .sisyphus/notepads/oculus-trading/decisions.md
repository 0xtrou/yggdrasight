# Decisions

## 2026-03-04 Project Bootstrap

### Database: MongoDB (not PostgreSQL)
- Signal data is schema-flexible — different providers send different fields
- MongoDB document model handles variable `indicators` and `metadata` fields naturally
- Use Mongoose for ODM (type-safe models, validation, virtuals)

### Dev Environment: Host Dev Server + Containerized Infrastructure
- `next dev` (via pnpm) runs directly on HOST machine
- Infrastructure services ONLY run in Docker: MongoDB, Redis, etc.
- `docker compose up` starts services only — NO app container
- `.env.local` points app to `localhost` ports exposed by Docker services
- `pnpm install` runs on host; node_modules lives on host

### Monorepo: Turborepo + pnpm workspaces
- packages/core — shared types, Zod schemas, enums (no runtime deps except zod)
- packages/db — Mongoose models and connection (depends on core)
- apps/web — Next.js 15 App Router (depends on core + db)

### Tech Stack Confirmed
- Next.js 15 (App Router) — full-stack, API routes for webhooks
- Tailwind CSS v4 — CSS-based config (no tailwind.config.js)
- shadcn/ui — component library, dark Bloomberg theme
- Mongoose v9 + MongoDB — document DB
- Zod v3 — schema validation everywhere
- Turbo v2 — turbo.json uses `tasks` not `pipeline`
- TypeScript 5 — strict mode
- Node 24 (LTS) on host for dev server

### UI: Bloomberg Terminal Aesthetic
- Background: #0a0a0a / #111111 panels
- Text: #e5e5e5 primary, #888 secondary, #00ff88 accent green (up), #ff3b3b accent red (down)
- Font: JetBrains Mono (monospace), Inter for labels
- Dense grid layouts, no padding waste, tabbed panels
- Color system: terminal-amber for warnings, terminal-blue for info
