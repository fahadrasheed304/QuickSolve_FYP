import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import ts from 'typescript'
import * as jose from 'jose'

test('moderation API requires real admin, explicit ban confirmation and trusted actor', async () => {
  let session = null
  const calls = []
  const deps = {
    'next/headers': { cookies: async () => ({ get: () => ({ value: 'token' }) }) },
    '@/lib/auth': { decrypt: async () => session },
    '@/lib/admin-auth': { isAdminEmail: email => email === 'quicksolve.officials@gmail.com' },
    '@/lib/supabase': { supabaseAdmin: { rpc: async (...args) => { calls.push(args); return {data:{status:'active'},error:null} } } },
    'livekit-server-sdk': {},
  }
  const api = {}
  const source = readFileSync(new URL('../src/app/api/admin/users/moderation/route.ts',import.meta.url),'utf8')
  new Function('require','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>deps[name],api)
  const body = {email:'dual@test',action:'restore',reason:'Reviewed case evidence',revision:0,requestId:'00000000-0000-0000-0000-000000000001'}
  const post = value => api.POST(new Request('https://test/api/admin/users/moderation',{method:'POST',body:JSON.stringify(value)}))
  assert.equal((await post(body)).status,403)
  session={email:'dual@test',role:'tutor'}; assert.equal((await post(body)).status,403)
  session={email:'fake@test',role:'admin'}; assert.equal((await post(body)).status,403)
  session={email:'quicksolve.officials@gmail.com',role:'admin'}
  assert.equal((await post({...body,action:'ban'})).status,400)
  assert.equal((await post({...body,action:'suspend',days:0})).status,400)
  assert.equal((await post({...body,email:session.email})).status,403)
  assert.equal(calls.length,0)
  assert.equal((await post({...body,actor:'fake@test'})).status,200)
  assert.equal(calls[0][1].p_actor,session.email)
})

test('moderation SQL protects admins, audits decisions, retries safely and detects stale reviews', async () => {
  const db = new PGlite()
  try {
    await db.exec("create role anon; create role authenticated; create role service_role; create table users(email text primary key,role text); insert into users values ('dual@test','tutor'),('admin@test','admin'),('quicksolve.officials@gmail.com','student');")
    const sql = readFileSync(new URL('../supabase/migrations/202609300001_account_moderation.sql',import.meta.url),'utf8')
    await db.exec(sql); await db.exec(sql)
    let id = 0
    const request = () => `00000000-0000-0000-0000-${String(++id).padStart(12,'0')}`
    const decide = (action, revision, token=request(), email='dual@test', days=7, actor='quicksolve.officials@gmail.com') => db.query('select admin_moderate_account($1,$2,$3,$4,$5,$6,$7) state',[email,action,'Evidence reviewed and documented',days,actor,revision,token])
    await assert.rejects(decide('ban',0,request(),'admin@test'),/Administrator/)
    await assert.rejects(decide('ban',0,request(),'quicksolve.officials@gmail.com'),/Administrator/)
    await assert.rejects(decide('ban',0,request(),'dual@test',7,'fake@test'),/Admin required/)
    await assert.rejects(decide('suspend',0,request(),'dual@test',0),/1 to 365/)
    const token = request()
    const suspended = (await decide('suspend',0,token)).rows[0].state
    assert.equal(suspended.status,'suspended')
    assert.ok(Date.parse(suspended.suspended_until) > Date.now())
    await decide('suspend',0,token)
    assert.equal((await db.query('select count(*) from account_moderation_events')).rows[0].count,1)
    await assert.rejects(decide('suspend',0,token,'dual@test',14),/conflict/)
    await assert.rejects(decide('ban',0),/changed/)
    const banned = (await decide('ban',1)).rows[0].state
    assert.equal(banned.status,'banned'); assert.equal(banned.suspended_until,null)
    await assert.rejects(decide('suspend',2),/Restore/)
    assert.equal((await decide('restore',2)).rows[0].state.status,'active')
    assert.equal((await db.query('select count(*) from account_moderation_events')).rows[0].count,3)
    const permissions = (await db.query("select has_table_privilege('anon','account_moderation','select') a, has_function_privilege('authenticated','admin_moderate_account(text,text,text,integer,text,integer,uuid)','execute') b")).rows[0]
    assert.deepEqual(permissions,{a:false,b:false})
  } finally { await db.close() }
})

test('access checks revoke existing tokens, block both roles and expire suspensions', async () => {
  let state = []
  let ok = true
  const access = {}
  const compile = file => ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  new Function('exports','process','fetch',compile('../src/lib/account-access.ts'))(access,{env:{NEXT_PUBLIC_SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'test'}},async()=>({ok,json:async()=>state}))
  const auth = {}
  new Function('require','exports','process',compile('../src/lib/auth.ts'))(name=>name==='jose'?jose:access,auth,{env:{JWT_SECRET:'moderation-session-test-secret'}})
  const student = (await auth.createSession('1','dual@test','student')).session
  const tutor = (await auth.createSession('1','dual@test','tutor')).session
  state=[{status:'banned',suspended_until:null}]
  assert.equal(await auth.decrypt(student),null); assert.equal(await auth.decrypt(tutor),null)
  await assert.rejects(auth.createSession('1','dual@test','student'),/permanently banned/)
  state=[{status:'suspended',suspended_until:new Date(Date.now()+86400000).toISOString()}]
  await assert.rejects(access.assertAccountAccess('dual@test'),/suspended/)
  state=[{status:'suspended',suspended_until:new Date(Date.now()-86400000).toISOString()}]
  assert.ok(await auth.decrypt(student))
  state=[{status:'active'}]; assert.ok(await auth.decrypt(tutor))
  ok=false; assert.equal(await auth.decrypt(student),null)
  await assert.rejects(auth.createSession('1','dual@test','student'),/unavailable/)
})
