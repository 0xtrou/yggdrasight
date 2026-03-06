# Oculus — Deployment Guide

Production deployment using PM2 for the Next.js app and Docker Compose for infrastructure (MongoDB + Redis).

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 24+ | Use `nvm install 24` |
| pnpm | 9+ | `npm install -g pnpm@9` |
| Bun | latest | Workers run on Bun |
| PM2 | latest | `npm install -g pm2` |
| Docker + Docker Compose | latest | Infrastructure services |

---

## Directory Structure (Production)

```
/srv/oculus-trading/        ← repo root
├── apps/web/.env.local     ← production env vars (never commit)
├── ecosystem.config.js     ← PM2 config (committed)
├── logs/                   ← PM2 log output (auto-created)
├── docker-compose.yml      ← MongoDB + Redis
└── docker/opencode/        ← OpenCode agent image
```

---

## First-Time Setup

### 1. Clone & Install

```bash
git clone <your-repo-url> /srv/oculus-trading
cd /srv/oculus-trading

# Install all workspace dependencies
pnpm install --frozen-lockfile
```

### 2. Start Infrastructure (Docker)

```bash
# Start MongoDB, Redis, and Mongo Express
docker compose up -d

# Verify all services are healthy
docker compose ps
```

Services started:
- **MongoDB** → `localhost:27017`
- **Redis** → `localhost:6379`
- **Mongo Express** (admin UI) → `localhost:8081` *(optional, can disable in production)*

### 3. Configure Environment

```bash
cp .env.local.example apps/web/.env.local
```

Edit `apps/web/.env.local` with production values:

```bash
# ── Required ──────────────────────────────────────────────────────────────────

# MongoDB — update host if MongoDB is not on localhost
MONGODB_URI=mongodb://oculus:CHANGE_THIS_PASSWORD@localhost:27017/oculus-trading?authSource=admin

# Redis — update host if Redis is not on localhost
REDIS_URL=redis://localhost:6379

# ── App ───────────────────────────────────────────────────────────────────────

NEXT_PUBLIC_APP_VERSION=0.1.0
NODE_ENV=production

# ── Market Data (optional) ────────────────────────────────────────────────────

# BINANCE_API_KEY=
# BINANCE_API_SECRET=
# COINGECKO_API_KEY=

# ── AI Providers (optional — OpenCode handles routing) ────────────────────────

# OPENAI_API_KEY=
# ANTHROPIC_API_KEY=

# ── Alerts (optional) ─────────────────────────────────────────────────────────

# TELEGRAM_BOT_TOKEN=
# TELEGRAM_CHANNEL_IDS=

# ── Security ──────────────────────────────────────────────────────────────────

# Required in production if using webhook ingestion
# WEBHOOK_SECRET=your_secret_here
```

> **Security note**: Change the MongoDB password from `oculus_dev_secret` to a strong password in both `docker-compose.yml` and `MONGODB_URI`.

### 4. Build the App

```bash
pnpm build
```

Turborepo builds `packages/core`, `packages/db`, then `apps/web` in the correct order.

### 5. Create Log Directory

```bash
mkdir -p logs
```

### 6. Start with PM2

```bash
pm2 start ecosystem.config.js

# Save PM2 process list (survives reboots)
pm2 save

# Enable PM2 startup on boot
pm2 startup
# → Run the printed command as root/sudo
```

### 7. Verify

```bash
pm2 status
pm2 logs oculus-web --lines 50
```

App should be running at **http://localhost:3000**.

---

## Reverse Proxy (Nginx)

To expose the app on port 80/443, configure Nginx as a reverse proxy:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Redirect to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## Deploying Updates

```bash
cd /srv/oculus-trading

# Pull latest code
git pull

# Install any new dependencies
pnpm install --frozen-lockfile

# Rebuild
pnpm build

# Reload PM2 without downtime
pm2 reload oculus-web

# Verify
pm2 status
pm2 logs oculus-web --lines 30
```

---

## PM2 Cheatsheet

```bash
# Status
pm2 status                     # All processes
pm2 show oculus-web            # Detailed info

# Logs
pm2 logs oculus-web            # Tail logs
pm2 logs oculus-web --lines 100
pm2 flush                      # Clear all logs

# Control
pm2 start ecosystem.config.js  # Start
pm2 stop oculus-web            # Stop
pm2 restart oculus-web         # Hard restart
pm2 reload oculus-web          # Zero-downtime reload
pm2 delete oculus-web          # Remove from PM2

# Monitoring
pm2 monit                      # Real-time dashboard
```

---

## Docker Infrastructure

```bash
# Start
docker compose up -d

# Stop
docker compose down

# Stop and wipe all data (destructive)
docker compose down -v

# View logs
docker compose logs -f mongodb
docker compose logs -f redis

# Restart a single service
docker compose restart mongodb
```

---

## About the Workers

`classify-worker.ts` and `discover-worker.ts` are **not** long-running services — they are spawned as detached Bun processes per AI job by the Next.js API routes. PM2 does not manage them.

They require:
- **Bun** installed on the server (`curl -fsSL https://bun.sh/install | bash`)
- **Docker** available (workers spawn OpenCode agent containers)
- The MongoDB and Redis services running

If a worker crashes mid-job, the job will remain in `running` state in the database. It can be retried from the UI.

---

## Troubleshooting

**App won't start**
```bash
pm2 logs oculus-web --err   # Check error logs
# Common cause: missing apps/web/.env.local or wrong MONGODB_URI/REDIS_URL
```

**MongoDB connection refused**
```bash
docker compose ps            # Check if mongodb container is running
docker compose logs mongodb  # Check for auth errors
```

**Build fails**
```bash
# Ensure Node 24+ is active
node --version
# Clean and rebuild
pnpm clean && pnpm build
```

**Workers not spawning OpenCode containers**
```bash
docker info                  # Verify Docker daemon is running
bun --version                # Verify Bun is installed
```

**Port 3000 already in use**
```bash
lsof -i :3000
# Update PORT in ecosystem.config.js if needed
```
