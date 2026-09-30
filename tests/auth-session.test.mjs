import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import * as jose from 'jose'

const secret = 'test-only-session-expiration-secret'
const source = readFileSync(new URL('../src/lib/auth.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const auth = {}
new Function('require', 'exports', 'process', js)(name => name === 'jose' ? jose : { assertAccountAccess: async () => {} }, auth, { env: { JWT_SECRET: secret } })
const key = new TextEncoder().encode(secret)

test('new sessions expire after eight hours and retain the authenticated identity', async () => {
  const { session, expiresAt } = await auth.createSession('user-id', 'tutor@test', 'tutor')
  const payload = await auth.decrypt(session)
  assert.equal(payload.email, 'tutor@test')
  assert.equal(payload.role, 'tutor')
  assert.equal(payload.exp - payload.iat, 8 * 60 * 60)
  assert.ok(Math.abs(expiresAt.getTime() - payload.exp * 1000) < 1000)
})

test('legacy seven-day tokens older than eight hours are rejected on the server', async () => {
  const now = Math.floor(Date.now() / 1000)
  const oldToken = await new jose.SignJWT({ email: 'tutor@test', role: 'tutor' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt(now - 2 * 86400)
    .setExpirationTime(now + 5 * 86400).sign(key)
  assert.equal(await auth.decrypt(oldToken), null)
  const noIssueTime = await new jose.SignJWT({ email: 'tutor@test' })
    .setProtectedHeader({ alg: 'HS256' }).setExpirationTime('7d').sign(key)
  assert.equal(await auth.decrypt(noIssueTime), null)
  assert.equal(await auth.decrypt('invalid-token'), null)
})

test('password reset tokens still have their separate fifteen-minute lifetime', async () => {
  const token = await auth.createResetToken('tutor@test')
  const payload = jose.decodeJwt(token)
  assert.equal(payload.exp - payload.iat, 15 * 60)
  assert.equal(await auth.verifyResetToken(token), 'tutor@test')
})
