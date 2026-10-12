import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

test('verification list resolves users explicitly when teaching demos also reference user_email', async () => {
  const profile = { user_email: 'tutor@test', users: { email: 'tutor@test', fullname: 'Tutor' } }
  const deps = {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    'next/headers': { cookies: async () => ({ get: () => ({ value: 'token' }) }) },
    '@/lib/auth': { decrypt: async () => ({ email: 'quicksolve.officials@gmail.com' }) },
    '@/lib/db': { DB: {} },
    '@/lib/teaching-demos-server': {},
    '@/lib/tutor-documents': { getCurrentTutorDocuments: documents => documents },
    '@/lib/supabase': { supabaseAdmin: { from(table) {
      let selection
      const query = {
        select(value) { selection = value; return query },
        order() { return query },
        eq() { return query },
        then(resolve) {
          if (table === 'tutor_profiles') {
            const explicitUsers = /users!tutor_profiles_user_email_fkey\s*\(/.test(selection)
            resolve(explicitUsers
              ? { data: [profile], error: null }
              : { data: null, error: { code: 'PGRST201', message: 'Ambiguous user_email relationship' } })
          } else if (table === 'tutor_degrees') {
            resolve({ count: 2, error: null })
          } else {
            resolve({ data: [{ id: 'document' }], error: null })
          }
        },
      }
      return query
    } } },
  }
  const source = readFileSync(new URL('../src/app/api/admin/verifications/route.ts', import.meta.url), 'utf8')
  const exports = {}
  new Function('require', 'exports', ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(name => deps[name], exports)
  const response = await exports.GET(new Request('https://test/api/admin/verifications'))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    tutors: [{ ...profile, _degreeCount: 2, _docCount: 1 }],
  })
})
