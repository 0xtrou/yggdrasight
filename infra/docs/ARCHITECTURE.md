# Architecture: Yggdrasight on Cloudflare

```
visitors ──► yggdrasight-landing (Cloudflare Worker, OpenNext)
             │  apps/web built in landing mode (MODE=landing, LANDING_ONLY=1)
             ├─ static assets (apps/web/.open-next/assets): public/, _next/, and the
             │  prerendered page cache under cdn-cgi/_next_cache
             └─ worker: middleware (security headers, landing routing), dynamic routes
```

- **One worker, no data bindings.** Only `ASSETS`. The OpenNext incremental cache is the
  read-only static-assets cache (`apps/web/open-next.config.ts`), filled at build time by
  `opennextjs-cloudflare populateCache local`.
- **Routing** (`apps/web/src/middleware.ts`, landing branch): `/` is rewritten to `/landing`;
  any other page path 307-redirects to `/landing`; `/_next/*` and files in `public/` are served
  as assets; `/api/*` answers `404 {"error":"Not found"}` because `LANDING_ONLY=1` (the API needs
  the backend below, which this worker does not have).
- **Host:** `yggdrasight-landing.khangtd-09.workers.dev` only. No custom domain (the founder
  decides; see DEPLOYMENT.md).
- **Limits to watch:** worker bundle 2.86 MiB gzipped (2026-11-25; Free plan cap 3 MiB, Paid
  10 MiB). It is close to the Free cap because OpenNext bundles every App Router route,
  including the API routes and the terminal pages, even though this worker never serves them.

## What is NOT on Cloudflare (and why)

The terminal deployment (`MODE=terminal`, all `/api/*`, the `(terminal)` pages) stays on the VPS
(`DEPLOY.md`). It cannot run as a Worker:

| Needs | Why it does not fit Workers |
|---|---|
| MongoDB through `mongoose` | mongoose's driver needs raw Node TCP/TLS sockets with long-lived pools; no Workers support |
| Redis through `ioredis` | same (TCP client) |
| `child_process.spawn` of Bun workers that `docker run` AI containers | no processes or Docker in Workers |
| OpenCode auth files, model cache, OHLCV cache on local disk | no writable filesystem |
| mirofish Python backend (docker-compose) | a container, not a Worker |

Options for moving it later (each is a founder decision: cost, rework):
1. Cloudflare Containers (paid Workers plan) for the Next server + workers, with MongoDB Atlas and
   Upstash/Redis Cloud as managed data.
2. Keep the VPS for the terminal; front it with Cloudflare (proxied DNS / Tunnel) for TLS and caching.
3. Rewrite the data layer to D1/KV/Queues + Workers AI/external LLM APIs (largest effort).
