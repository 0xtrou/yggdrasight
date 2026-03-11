// PM2 Ecosystem Config — Yggdrasight
// Usage: pm2 start ecosystem.config.js

module.exports = {
  apps: [
    {
      name: 'yggdrasight-web',
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
        PORT: 3000,
      },
      // Logs
      out_file: './logs/web-out.log',
      error_file: './logs/web-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // Log rotation (requires pm2-logrotate module)
      max_size: '50M',
      retain: 10,
    },
  ],
}
