# Infrastructure

The repo root is the Cloudflare IaC control plane, ported from gumpbox-landing (itself ported
from th.legal) on 2026-11-25. Same tools, same rules; resource prefix `yggdrasight-`.

- `workers.manifest.ts`: **single source of truth** for workers, build env, vars, secret names,
  D1/R2/KV, routes. This is the only infra file you edit.
- `scripts/gen-wrangler.ts`: derives `wrangler/*.jsonc` (gitignored) via `bun run iac:gen`.
- `scripts/deploy.ts`: builds (OpenNext, in `apps/web`) and deploys any worker from the repo
  root: `bun run deploy:landing` / `bun run deploy`.
- `scripts/wrangler-guard.ts`: account preflight used by every deploy (verbatim from
  gumpbox-landing: same account).
- `wrangler/`: generated configs (gitignored).

Tooling: pnpm for the workspace (`pnpm install`), bun for the infra scripts (`bun run …`,
`bun test`). Versions pinned: `@opennextjs/cloudflare@1.20.18`, `wrangler@4.157.0`,
`next@16.4.6` (OpenNext 1.20.x needs next >= 16.4.5).

## Rules

1. NEVER hand-edit `infra/wrangler/*.jsonc`: edit the manifest and regenerate.
2. NEVER deploy from inside a sub-directory, never with `npx wrangler` / `bunx wrangler`:
   plain `wrangler` from PATH (`~/.local/bin/wrangler` shim) only, or token mode (below).
3. `--dry-run` first. Real deploys run only from a clean, pushed `main` (deploy.ts refuses
   otherwise). Exception: `--from-branch` deploys a clean, pushed branch, and only for workers
   with no routes (workers.dev only). Save the deploy output as evidence.
4. Account: `khangtd.09@gmail.com`. API-token env vars are refused unless they are a User API
   Token of that account plus `CLOUDFLARE_ACCOUNT_ID` (token mode).
5. Every Cloudflare resource is named `yggdrasight-<role>` (workers, KV, R2, D1, queues).
6. No custom domain / DNS change without the founder's go (`pendingRoutes` → `routes`).

See `docs/ARCHITECTURE.md` (topology) and `docs/DEPLOYMENT.md` (runbooks).
