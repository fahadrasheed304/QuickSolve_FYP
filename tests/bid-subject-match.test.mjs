import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { createRequire } from 'node:module'
import { PGlite } from '@electric-sql/pglite'
const require = createRequire(import.meta.url)

test('bid API uses stored problem subject and authenticated tutor subjects, including second subject', async () => {
  let subjects = ['Math'], problem = { subject: 'Physics' }, failed = false, session = { email: 'tutor@test', role: 'tutor' }
  const created = []
  const deps = {
    'next/headers': { cookies: async () => ({ get: () => ({ value: 'token' }) }) },
    '@/lib/auth': { decrypt: async () => session },
    '@/lib/db': { DB: { findUserByEmail: async () => ({ email: 'tutor@test' }),
      getTutorProfile: async () => ({ subjects, verification_status: 'verified' }),
      createBid: async bid => { created.push(bid); return bid } } },
    '@/lib/supabase': { supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: problem, error: failed ? {} : null }) }) }) }) } },
  }
  const source = readFileSync(new URL('../src/app/api/tutor/bids/route.ts', import.meta.url), 'utf8')
  const exports = {}
  new Function('require','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>deps[name]??require(name),exports)
  const send = () => exports.POST(new Request('https://test/api/tutor/bids',{method:'POST',body:JSON.stringify({problemId:'00000000-0000-0000-0000-000000000001',price:400,durationMin:30,subject:'Math',tutorEmail:'forged@test'})}))
  assert.equal((await send()).status,403)
  subjects=[]; assert.equal((await send()).status,403)
  subjects=null; assert.equal((await send()).status,403)
  subjects=['physics']; assert.equal((await send()).status,403)
  assert.equal(created.length,0)
  subjects=['Math','Physics']; assert.equal((await send()).status,200)
  assert.equal(created[0].tutorSubject,'Physics')
  assert.equal(created[0].tutorEmail,'tutor@test')
  failed=true; assert.equal((await send()).status,503)
  failed=false; problem=null; assert.equal((await send()).status,404)
  session=null; assert.equal((await send()).status,401)
})

test('database rejects subject mismatch even when API is bypassed and canonicalizes bid subject', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated;
      create table problems(id uuid primary key default gen_random_uuid(),subject text);
      create table tutor_profiles(user_email text primary key,subjects text[]);
      create table bids(id uuid primary key default gen_random_uuid(),problem_id uuid,tutor_email text,tutor_subject text,status text default 'pending');
      insert into tutor_profiles values ('tutor@test',array['Math','Physics']),('other@test',array['Math']),('empty@test',array[]::text[]);
      insert into problems(subject) values ('Physics');`)
    const sql = readFileSync(new URL('../supabase/migrations/202609260004_bid_subject_match.sql', import.meta.url),'utf8')
    await db.exec(sql); await db.exec(sql)
    const id=(await db.query('select id from problems')).rows[0].id
    const bid=email=>db.query("insert into bids(problem_id,tutor_email,tutor_subject) values ($1,$2,'Forged') returning *",[id,email])
    for(const email of ['other@test','empty@test','missing@test']) await assert.rejects(bid(email),/subject does not match/)
    const inserted=(await bid('tutor@test')).rows[0]
    assert.equal(inserted.tutor_subject,'Physics')
    await assert.rejects(db.query("update bids set tutor_email='other@test' where id=$1",[inserted.id]),/subject does not match/)
    await db.exec("update tutor_profiles set subjects=array['Math'] where user_email='tutor@test'")
    await assert.rejects(bid('tutor@test'),/subject does not match/)
    // Ordinary settlement/status updates preserve historical bid data.
    await db.query("update bids set status='rejected' where id=$1",[inserted.id])
    assert.equal((await db.query('select count(*) from bids')).rows[0].count,1)
  } finally { await db.close() }
})
