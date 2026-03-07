# Oculus - VPS Deployment Guide

## Overview

```bash
# Quick sanity: print architecture and resources
echo "See below: Nginx -> Next.js (PM2) -> MongoDB + Redis + Docker workers"
```

ASCII architecture

```
Nginx (80/443)
  |
  V
Next.js (PM2) localhost:3000
  |
  +-- MongoDB (127.0.0.1:27017)
  +-- Redis (127.0.0.1:6379, password)
  +-- Docker containers for AI workers (docker run --network host)
```

Resource requirements

| Resource | Minimum | Recommended |
|---|---:|---:|
| RAM | 8 GB | 16 GB |
| vCPU | 4 | 8 |
| Disk | 50 GB SSD | 120 GB SSD |
| Swap | 4 GB | 8 GB if heavy AI usage |

## Prerequisites

```bash
# Verify OS
cat /etc/os-release
```

- VPS specs: 8GB RAM / 4 vCPU minimum, 16GB recommended
- Ubuntu 22.04 or 24.04 LTS
- Domain name (optional but recommended for SSL)
- API keys: OpenCode auth, optionally Binance/CoinGecko/OpenAI/Anthropic/Telegram

## Step 1 - Initial Server Setup

```bash
# Add swap (4GB recommended)
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Set timezone to UTC
sudo timedatectl set-timezone UTC

# Create non-root user
sudo adduser --disabled-password --gecos "" oculus
sudo usermod -aG sudo oculus

# Setup SSH keys for the new user (paste your public key into authorized_keys)
sudo mkdir -p /home/oculus/.ssh && sudo chmod 700 /home/oculus/.ssh
sudo touch /home/oculus/.ssh/authorized_keys && sudo chmod 600 /home/oculus/.ssh/authorized_keys
sudo chown -R oculus:oculus /home/oculus/.ssh

# Harden SSH: disable password auth and root login
sudo sed -i "s/^#PasswordAuthentication yes/PasswordAuthentication no/" /etc/ssh/sshd_config || true
sudo sed -i "s/^#PermitRootLogin prohibit-password/PermitRootLogin no/" /etc/ssh/sshd_config || true
sudo systemctl reload sshd

# Firewall: allow SSH, HTTP, HTTPS only
sudo apt update && sudo apt install -y ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

# Install fail2ban for SSH brute-force protection
sudo apt install -y fail2ban
sudo systemctl enable --now fail2ban
```

Notes
- Use the non-root user `oculus` for normal work. Keep SSH root login disabled.
- Swap helps with heavy AI tasks. Adjust swap if running many containers.

## Step 2 - Install Dependencies

```bash
# Core packages
sudo apt update && sudo apt install -y build-essential curl git nginx certbot python3-certbot-nginx ca-certificates gnupg lsb-release software-properties-common

# Install Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker oculus

# Install Docker Compose plugin
sudo apt install -y docker-compose-plugin

# Install nvm and Node 24 (as deploy user)
su - oculus -c "curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.6/install.sh | bash"
export NVM_DIR="/home/oculus/.nvm"
su - oculus -c ". $NVM_DIR/nvm.sh && nvm install 24 && nvm use 24"

# pnpm 9 (global)
su - oculus -c "npm install -g pnpm@9"

# Bun (workers run on Bun)
su - oculus -c "curl -fsSL https://bun.sh/install | bash"

# PM2 (global)
su - oculus -c "npm install -g pm2"

# Certbot available via python3-certbot-nginx
```

Notes
- Ensure Bun is on the PATH for the `oculus` user. Workers require Bun.

## Step 3 - Clone & Install

```bash
# Prepare directory and clone repository
sudo mkdir -p /srv/oculus-trading && sudo chown oculus:oculus /srv/oculus-trading
su - oculus -c "git clone <your-repo-url> /srv/oculus-trading"
cd /srv/oculus-trading

# Install workspace dependencies
su - oculus -c "cd /srv/oculus-trading && pnpm install --frozen-lockfile"

# Ensure ownership
sudo chown -R oculus:oculus /srv/oculus-trading
```

## Step 4 - Configure Environment

```bash
# Copy example env
cp .env.local.example apps/web/.env.local

# Generate strong passwords (example)
MONGO_PW=$(openssl rand -base64 18)
echo "Generated Mongo password (store this): $MONGO_PW"

# Edit env and docker-compose.yml to set passwords
${EDITOR:-vi} apps/web/.env.local docker-compose.yml
```

Required edits

```bash
# apps/web/.env.local
MONGODB_URI=mongodb://oculus:YOUR_MONGO_PASSWORD@127.0.0.1:27017/oculus-trading?authSource=admin

# REDIS (change for production)
REDIS_URL=redis://:oculus_redis_secret@127.0.0.1:6379
```

Guidance
- Update docker-compose.yml to set MongoDB and Redis passwords to match the env file.
- Explain each env var briefly in a header comment inside apps/web/.env.local.

OpenCode auth
- Place OpenCode auth files at ~/.local/share/opencode/auth.json and ~/.config/opencode for AI workers.

Security notes
- Default Redis password is `oculus_redis_secret`. Change it before production.
- Mongo Express is commented out by default. Keep it disabled in production.

## Step 5 - Start Infrastructure

```bash
# Start MongoDB and Redis via docker compose
docker compose up -d

# Verify services and health
docker compose ps
docker compose logs -f mongodb --tail 100
docker compose logs -f redis --tail 100
```

Notes
- Containers bind DB ports to 127.0.0.1 by default. Confirm with `ss -lntp`.

## Step 6 - Build & Start App

```bash
# Build the monorepo (Turborepo builds core -> db -> web)
su - oculus -c "cd /srv/oculus-trading && pnpm build"

# Create logs dir and set ownership
sudo mkdir -p /srv/oculus-trading/logs && sudo chown oculus:oculus /srv/oculus-trading/logs

# Start via PM2 (ecosystem.config.js expected in repo root)
su - oculus -c "cd /srv/oculus-trading && pm2 start ecosystem.config.js --env production"
su - oculus -c "pm2 save"

# Setup systemd startup for PM2 and run the printed command as root
su - oculus -c "pm2 startup systemd -u oculus --hp /home/oculus"

# Install pm2-logrotate and configure
su - oculus -c "pm2 install pm2-logrotate && pm2 set pm2-logrotate:max_size 50M && pm2 set pm2-logrotate:retain 10"

# Verify process and app health
su - oculus -c "pm2 status"
curl -sS http://127.0.0.1:3000/health || curl -I http://127.0.0.1:3000
```

PM2 notes
- ecosystem.config.js should include node args: --max-old-space-size=1024
- ecosystem.config.js is expected to configure pm2 log rotation (max_size: 50M, retain: 10)

## Step 7 — Nginx + SSL

```bash
# Write HTTP-only config first (certbot adds SSL automatically)
sudo tee /etc/nginx/sites-available/oculus > /dev/null <<'NG'
server {
    listen 80;
    server_name your-domain.com;

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
    }
}
NG

# Enable site, remove default, test, reload
sudo ln -sf /etc/nginx/sites-available/oculus /etc/nginx/sites-enabled/oculus
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# Obtain TLS cert — certbot modifies the nginx config to add SSL + redirect
sudo certbot --nginx -d your-domain.com --non-interactive --agree-tos -m admin@your-domain.com

# Verify auto-renewal timer
sudo systemctl list-timers | grep certbot

# Test
curl -I https://your-domain.com
```

Notes:
- Certbot automatically adds SSL directives and HTTP→HTTPS redirect to the nginx config.
- `proxy_read_timeout 300s` accommodates slow AI classification requests.
- WebSocket headers (`Upgrade`, `Connection`) support real-time log streaming.

## Step 8 - MongoDB Backups

```bash
# Prepare backup folder
sudo mkdir -p /srv/oculus-backups && sudo chown oculus:oculus /srv/oculus-backups

# Install mongodump (mongodb-database-tools)
sudo apt update && sudo apt install -y mongodb-database-tools

# Add cron job for daily backups at 03:00 and rotate older than 7 days
(crontab -l 2>/dev/null; echo "0 3 * * * /usr/bin/mongodump --uri=\"mongodb://oculus:YOUR_PASSWORD@localhost:27017/oculus-trading?authSource=admin\" --out=/srv/oculus-backups/\$(date +\%Y\%m\%d) && find /srv/oculus-backups -mtime +7 -delete") | crontab -
```

Notes
- Backups are removed after 7 days. Replace YOUR_PASSWORD with the MongoDB password.

## Deploying Updates

```bash
cd /srv/oculus-trading
git pull --ff-only
pnpm install --frozen-lockfile
pnpm build
pm2 reload oculus-web || pm2 restart oculus-web
pm2 status
```

## PM2 Cheatsheet

```bash
# Status and info
pm2 status
pm2 show oculus-web

# Logs
pm2 logs oculus-web --lines 100
pm2 flush

# Control
pm2 start ecosystem.config.js
pm2 stop oculus-web
pm2 restart oculus-web
pm2 reload oculus-web
pm2 delete oculus-web

# Monitor
pm2 monit
```

## Docker Infrastructure Cheatsheet

```bash
# Start infra
docker compose up -d

# Stop infra
docker compose down

# Destructive: wipe volumes
docker compose down -v

# View logs
docker compose logs -f mongodb
docker compose logs -f redis

# Restart single service
docker compose restart mongodb
```

## About the Workers

```bash
# Verify runtime pieces
bun --version || true
docker --version || true
ls ~/.local/share/opencode/auth.json ~/.config/opencode 2>/dev/null || true
```

- classify-worker and discover-worker are spawned as detached Bun processes by the Next.js API routes. They spawn Docker containers using `docker run --network host`.
- Workers need Bun, Docker, MongoDB, Redis, and OpenCode auth files at ~/.local/share/opencode/auth.json and ~/.config/opencode.

## Security Checklist

```bash
# Quick checks
ss -lntp | grep 27017 || true
ss -lntp | grep 6379 || true
ufw status verbose
systemctl status fail2ban --no-pager
```

- [ ] MongoDB password changed from default
- [ ] Redis password changed from default
- [ ] UFW firewall enabled (only SSH, HTTP, HTTPS)
- [ ] fail2ban running
- [ ] SSH password auth disabled
- [ ] Mongo Express disabled (commented out in docker-compose.yml)
- [ ] SSL certificate installed
- [ ] Swap space configured
- [ ] MongoDB backups configured

## Troubleshooting

```bash
# Redis connection refused: check container and password
docker compose ps
docker compose logs -f redis --tail 200

# SSL certificate renewal test
sudo certbot renew --dry-run

# Out of memory: check swap and processes
free -h
ps aux --sort=-%mem | head -n 20

# Docker permission denied: add user to docker group and re-login
sudo usermod -aG docker oculus
```

Common tips
- Redis connection refused: verify REDIS_URL in apps/web/.env.local matches the password in docker-compose.yml
- SSL renewal: use `certbot renew --dry-run` and inspect systemd timers
- Out of memory: add swap, reduce concurrent AI agents, or increase VPS RAM
- Docker permission denied: add the deploy user to the docker group and re-login
