// Run alongside the app locally or as a persistent worker on your server.
import { loadEnvConfig } from '@next/env'
loadEnvConfig(process.cwd())

const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const secret = process.env.CRON_SECRET
if (!secret) throw new Error('Set CRON_SECRET in .env.local before running recording maintenance')
const endpoint = new URL('/api/cron/recordings', base)
if (endpoint.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)) {
  throw new Error('Remote maintenance requires HTTPS')
}

let running = true
process.on('SIGINT', () => { running = false })
process.on('SIGTERM', () => { running = false })
do {
  try {
    const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(60000) })
    const result = await response.json()
    console.log(new Date().toISOString(), response.status, result)
    if (!response.ok && process.argv.includes('--once')) process.exitCode = 1
  } catch {
    console.error(new Date().toISOString(), 'Recording maintenance could not reach the app; will retry.')
    if (process.argv.includes('--once')) process.exitCode = 1
  }
  if (process.argv.includes('--once')) break
  // Short waits let Ctrl+C stop the worker promptly, without overlapping jobs.
  for (let second = 0; running && second < 60; second++) await new Promise(resolve => setTimeout(resolve, 1000))
} while (running)
