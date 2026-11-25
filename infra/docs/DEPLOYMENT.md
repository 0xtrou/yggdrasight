# Deployment runbook: Yggdrasight landing (Cloudflare)

Account **khangtd.09@gmail.com**. Plain `wrangler` from PATH, or token mode. Repo root only.

## Routine deploy

```bash
pnpm install
bun run test:infra
bun run infra/scripts/deploy.ts landing --dry-run
bun run deploy:landing                       # from clean, pushed main
```

`deploy.ts` does: branch/clean-tree check (real deploys) → `wrangler whoami` preflight →
clean `apps/web/.next` + `apps/web/.open-next` → `iac:gen` → (in `apps/web`, with the manifest's
`buildEnv`: `MODE=landing LANDING_ONLY=1`) `opennextjs-cloudflare build` → `populateCache local`
→ `wrangler deploy --config infra/wrangler/landing.jsonc`.

While the worker has no routes (workers.dev only), a reviewed branch can be deployed before merge:

```bash
bun run infra/scripts/deploy.ts landing --from-branch   # clean tree, pushed to origin/<branch>
```

## Deploy from a cloud session (token mode)

Same as gumpbox-landing: set `CLOUDFLARE_API_TOKEN` (a **User** API Token owned by
khangtd.09@gmail.com) and `CLOUDFLARE_ACCOUNT_ID`, then run the same commands. Account API
Tokens, the Global API Key and a token without the account ID are refused. Secrets come only
from the environment; nothing is stored in the repo.

Sandboxed builders whose egress goes through an HTTPS proxy with its own CA (claude.ai cloud
sessions) also need, for `next/font/google` to download fonts at build time:
`NODE_USE_ENV_PROXY=1 NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS=1`.

## Verify a deploy

Base `https://yggdrasight-landing.khangtd-09.workers.dev`:

| Path | Expect |
|---|---|
| `/` | 200 `text/html`, `<title>Yggdrasight \| AI-Native Trading Intelligence Terminal</title>` |
| `/landing` | 200 `text/html`, same page |
| `/signals`, `/intelligence`, any unknown path | 307 → `/landing` |
| `/api/auth/session`, `/api/signals` | 404 `application/json` `{"error":"Not found"}` |
| `/favicon.ico`, a `/_next/static/...` asset from the page | 200 |
| security headers on `/` | `x-frame-options: DENY`, `content-security-policy` present |

## Rollback

- Previous version: `wrangler rollback --config infra/wrangler/landing.jsonc` (run `bun run iac:gen`
  first; token mode works the same).
- Remove entirely (first deploy, nothing else depends on it):
  `wrangler delete --config infra/wrangler/landing.jsonc`. It owns no routes, DNS or data, so
  deleting it affects nothing else in the account. The VPS deployment (`DEPLOY.md`) is unaffected
  either way.

## Custom domain (not done; founder decision)

To serve a hostname: add it to `pendingRoutes` in `infra/workers.manifest.ts` for review, then move
it to `routes` (`{ pattern: '<host>', customDomain: true }`) and deploy from main. A non-interactive
`wrangler deploy` attaches custom domains with `override_existing_dns_record`, so it REPLACES any
existing DNS record for that host: record the current one here first, for rollback. Once routes
exist, workers.dev and preview URLs turn off (gen-wrangler.ts).
