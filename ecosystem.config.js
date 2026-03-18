// PM2 Ecosystem Config — Yggdrasight
// Usage: pm2 start ecosystem.config.js

module.exports = {
  apps: [
    {
      name: 'yggdrasight-landing',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: './apps/web',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      node_args: '--max-old-space-size=1024',
      env: {
        NODE_ENV: 'production',
        MODE: 'landing',
        PORT: 3300,
      },
      out_file: './logs/landing-out.log',
      error_file: './logs/landing-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_size: '50M',
      retain: 10,
    },
    {
      name: 'yggdrasight-terminal',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: './apps/web',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      node_args: '--max-old-space-size=1024',
      env: {
        NODE_ENV: 'production',
        MODE: 'terminal',
        PORT: 3000,
      },
      out_file: './logs/terminal-out.log',
      error_file: './logs/terminal-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_size: '50M',
      retain: 10,
    },
  ],
}
