// scripts/bootstrap.js — loaded via -r BEFORE TypeScript modules
// Reads MONGODB_URI from apps/web/.env.local and injects into process.env
const fs = require('fs')
const path = require('path')

const envPaths = [
  path.resolve(__dirname, '../apps/web/.env.local'),
  path.resolve(__dirname, '../.env.local'),
]

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n')
    for (const line of lines) {
      const match = line.match(/^(\w+)\s*=\s*(.+)$/)
      if (match) {
        const key = match[1].trim()
        const val = match[2].trim().replace(/^["']|["']$/g, '')
        if (!process.env[key]) {
          process.env[key] = val
        }
      }
    }
    break
  }
}
