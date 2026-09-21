import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { PGlite } from '@electric-sql/pglite'

const require = createRequire(import.meta.url)
test('OTP survives separate instances, resend replaces it, and private state is protected', async () => {
  const db = new PGlite()
  try {
    await db.exec('create role anon; create role authenticated; create role service_role;')
    const sql = readFileSync('supabase/migrations/202609220001_pending_signups.sql', 'utf8')
    await db.exec(sql)
    await db.exec(sql)
    const client = { from() {
      let filters = [], operation = 'select'
      const query = {
        select() { return query },
        eq(key, value) { filters.push([key, value]); return query },
        delete() { operation = 'delete'; return query },
        async upsert(row) {
          await db.query(`insert into pending_signups values ($1,$2,$3,$4)
            on conflict(email) do update set otp_hash=excluded.otp_hash,
            user_data=excluded.user_data, expires_at=excluded.expires_at`,
          [row.email, row.otp_hash, JSON.stringify(row.user_data), row.expires_at])
          return {}
        },
        async maybeSingle() {
          const result = await db.query('select * from pending_signups where email=$1', [filters[0][1]])
          const row = result.rows[0]
          return { data: row ? { ...row, expires_at: new Date(row.expires_at).toISOString() } : null }
        },
        async then(resolve, reject) {
          try {
            assert.equal(operation, 'delete')
            await db.query('delete from pending_signups where email=$1 and otp_hash=$2', filters.map(f => f[1]))
            resolve({})
          } catch (e) { reject(e) }
        },
      }
      return query
    } }
    const instance = () => {
      const js = ts.transpileModule(readFileSync('src/lib/pending-signups.ts', 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText
      const exports = {}
      new Function('require', 'exports', js)(name => name === '@/lib/supabase' ? { supabaseAdmin: client } : require(name), exports)
      return exports
    }
    const signup = instance(), verify = instance()
    const user = { email: 'otp@example.test', fullname: 'OTP Test', password: 'already-hashed', role: 'student' }
    const first = await signup.savePendingSignup(user.email, user, '123456')
    let pending = await verify.getPendingSignup(user.email)
    assert.equal(verify.matchesOtp('123456', pending.otpHash), true)
    assert.equal(verify.matchesOtp('000000', pending.otpHash), false)
    assert.ok(pending.expires > Date.now())
    assert.ok(!first.includes('123456'))
    await instance().savePendingSignup(user.email, user, '654321')
    await signup.removePendingSignup(user.email, first)
    pending = await verify.getPendingSignup(user.email)
    assert.equal(verify.matchesOtp('123456', pending.otpHash), false)
    assert.equal(verify.matchesOtp('654321', pending.otpHash), true)
    await db.exec('set role anon')
    await assert.rejects(db.query('select * from pending_signups'), /permission denied/)
    await db.exec('reset role')
    await verify.removePendingSignup(user.email, pending.otpHash)
    assert.equal(await instance().getPendingSignup(user.email), null)
  } finally { await db.close() }
})
