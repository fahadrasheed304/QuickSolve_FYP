import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { createServer } from 'node:net'

const require = createRequire(import.meta.url)
require('@next/env').loadEnvConfig(process.cwd())
const key = process.env.STRIPE_SECRET_KEY
if (!key?.startsWith('sk_test_')) throw new Error('Set STRIPE_SECRET_KEY in .env.local to a Stripe test key.')
const port = new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').port || '3000'
// Check before starting another listener or replacing the running app's secret.
const available = await new Promise((resolve) => {
  const probe = createServer()
  probe.once('error', () => resolve(false))
  probe.listen(Number(port), () => probe.close(() => resolve(true)))
})
if (!available) {
  console.error(`Port ${port} is already in use. Stop the existing app with Ctrl+C in its terminal, then run npm run dev:stripe again.`)
  process.exit(1)
}
let app
let stopping = false
const listener = spawn(process.execPath, [require.resolve('@stripe/cli/bin/shim.js'), 'listen',
  '--events', 'checkout.session.completed,checkout.session.async_payment_succeeded',
  '--forward-to', `http://localhost:${port}/api/stripe/webhook`], {
  env: { ...process.env, STRIPE_API_KEY: key }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
})

function handleLine(line) {
  const secret = line.match(/whsec_[A-Za-z0-9]+/)?.[0]
  if (secret && !app && !stopping) {
    const path = '.env.local'
    let contents = readFileSync(path, 'utf8')
    const setting = `STRIPE_WEBHOOK_SECRET=${secret}`
    contents = /^STRIPE_WEBHOOK_SECRET=.*$/m.test(contents)
      ? contents.replace(/^STRIPE_WEBHOOK_SECRET=.*$/m, setting)
      : `${contents.trimEnd()}\n${setting}\n`
    writeFileSync(path, contents)
    console.log('Webhook connected; signing secret saved locally. Starting QuickSolve...')
    app = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '--port', port], {
      env: { ...process.env, STRIPE_WEBHOOK_SECRET: secret }, windowsHide: true, stdio: 'inherit',
    })
    app.on('error', () => { console.error('Could not start Next.js.'); stop(1) })
    app.on('exit', code => stop(code || 0))
  }
  console.log(line.replace(/whsec_[A-Za-z0-9]+/g, '[hidden]').replaceAll(key, '[hidden]'))
}
for (const stream of [listener.stdout, listener.stderr]) {
  createInterface({ input: stream }).on('line', handleLine)
}
function stop(code = 0) {
  if (stopping) return
  stopping = true
  listener.kill()
  app?.kill()
  process.exitCode = code
}
listener.on('error', () => { console.error('Could not start Stripe CLI.'); stop(1) })
listener.on('exit', code => stop(code || 0))
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
