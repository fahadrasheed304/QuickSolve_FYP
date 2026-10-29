import { spawn } from 'node:child_process'

const next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
})
const emailWorker = spawn(process.execPath, ['scripts/email-alerts-worker.mjs'], {
  stdio: 'inherit',
  env: process.env,
})

let stopping = false

function stop() {
  if (stopping) return
  stopping = true
  for (const child of [next, emailWorker]) {
    if (child.exitCode === null && !child.killed) child.kill('SIGTERM')
  }
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)
next.once('exit', (code) => {
  stop()
  process.exitCode = code ?? 0
})
