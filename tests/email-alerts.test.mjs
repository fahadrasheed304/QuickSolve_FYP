import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { PGlite } from '@electric-sql/pglite'

function moduleAt(file, deps) {
  const exports = {}
  const js = ts.transpileModule(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'exports', js)(name => deps[name], exports)
  return exports
}

test('email events are atomic, private, idempotent and recover crashed claims', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table account_moderation_events(id uuid default gen_random_uuid(), user_email text, action text, reason text,suspended_until timestamptz);
      create table tutor_conduct_events(id uuid default gen_random_uuid(),tutor_email text,action text,reason text);
      create table verification_notes(id uuid default gen_random_uuid(),tutor_email text,note_type text,message text);
      create table notifications(id uuid default gen_random_uuid(),recipient_email text,recipient_role text,kind text,message text);
      create table wallet_transactions(id uuid default gen_random_uuid(),user_email text,user_role text,type text,amount numeric,status text,payment_reference text,description text);
      create table session_payments(problem_id uuid default gen_random_uuid(),student_email text,tutor_email text,status text,amount numeric);
      create table tutor_teaching_demos(id uuid default gen_random_uuid(),tutor_email text,subject text,topic text,status text,feedback text,reviewed_at timestamptz);`)
    const migration = readFileSync(new URL('../supabase/migrations/202610120001_email_alerts.sql', import.meta.url), 'utf8')
    await db.exec(migration); await db.exec(migration)
    await db.exec(`insert into account_moderation_events(user_email,action,reason) values(' Tutor@Test ','ban','Policy violation');
      insert into verification_notes(tutor_email,note_type,message) values('tutor@test','admin_to_tutor','Test invitation'),('tutor@test','tutor_to_admin','Private reply');
      insert into tutor_conduct_events(tutor_email,action,reason) values('tutor@test','restricted','Repeated violations');
      insert into notifications(recipient_email,recipient_role,kind,message) values('tutor@test','tutor','new_request','Broadcast'),('student@test','student','new_bid','Offer');
      insert into wallet_transactions(user_email,user_role,type,amount,status,payment_reference) values('student@test','student','credit',500,'completed','stripe:1'),('tutor@test','tutor','credit',500,'completed','session-payout:1');
      insert into session_payments(student_email,tutor_email,status,amount) values('student@test','tutor@test','held',500);
      insert into tutor_teaching_demos(tutor_email,subject,topic,status,feedback) values('tutor@test','Physics','Motion','approved','Good work');`)
    assert.equal((await db.query('select count(*) from email_alerts')).rows[0].count, 8)
    const ban = (await db.query("select * from email_alerts where subject like '%banned%'")).rows[0]
    assert.equal(ban.recipient_email, 'tutor@test'); assert.match(ban.message, /Policy violation/)
    await db.exec("update session_payments set status='released'; update session_payments set status='released'")
    assert.equal((await db.query('select count(*) from email_alerts')).rows[0].count, 10)
    await db.exec("begin; insert into account_moderation_events(user_email,action,reason) values('student@test','restore','Restored'); rollback")
    assert.equal((await db.query('select count(*) from email_alerts')).rows[0].count, 10)
    const first = (await db.query('select * from claim_email_alerts(3)')).rows
    const second = (await db.query('select * from claim_email_alerts(10)')).rows
    assert.equal(first.length,3); assert.equal(second.length,7)
    assert.equal((await db.query('select * from claim_email_alerts(10)')).rows.length,0)
    await db.query("update email_alerts set claimed_at=now()-interval '6 minutes' where id=$1", [first[0].id])
    const recovered = (await db.query('select * from claim_email_alerts(10)')).rows[0]
    assert.equal(recovered.attempts,2); assert.notEqual(recovered.claim_token,first[0].claim_token)
    const privileges = (await db.query("select has_table_privilege('anon','email_alerts','select') a,has_function_privilege('authenticated','claim_email_alerts(integer)','execute') b,has_function_privilege('service_role','claim_email_alerts(integer)','execute') c")).rows[0]
    assert.deepEqual(privileges,{a:false,b:false,c:true})
  } finally { await db.close() }
})

test('emails escape admin text and reject links outside the site', () => {
  const { renderEmailAlert } = moduleAt('src/lib/email-alerts.ts', {})
  const alert = { subject: '<script>alert(1)</script>', message: '<img src=x> & reason', path: '/tutor/dashboard' }
  const rendered = renderEmailAlert(alert, 'https://quicksolve.test')
  assert.doesNotMatch(rendered.html, /<script>|<img/)
  assert.match(rendered.html, /&lt;img/)
  assert.match(rendered.text, /https:\/\/quicksolve.test\/tutor\/dashboard/)
  for (const path of ['//evil.test','https://evil.test','/\\evil.test']) assert.throws(() => renderEmailAlert({...alert,path}, 'https://quicksolve.test'))
})

test('cron rejects requests without the secret before delivering mail', async () => {
  const previous = process.env.CRON_SECRET
  process.env.CRON_SECRET = 'email-test-secret'
  let deliveries = 0
  const { timingSafeEqual } = await import('node:crypto')
  const api = moduleAt('src/app/api/cron/emails/route.ts', { crypto: { timingSafeEqual }, '@/lib/email-alerts': { deliverEmailAlerts: async () => { deliveries++; return {failed:0} } } })
  try {
    assert.equal((await api.GET(new Request('https://test/api/cron/emails'))).status,401)
    assert.equal(deliveries,0)
    assert.equal((await api.GET(new Request('https://test/api/cron/emails',{headers:{authorization:'Bearer email-test-secret'}}))).status,200)
    assert.equal(deliveries,1)
  } finally { if (previous === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previous }
})

test('delivery persists SMTP failures with backoff and fences stale workers by claim token', async () => {
  const original = { email: process.env.SMTP_EMAIL, password: process.env.SMTP_PASSWORD }
  process.env.SMTP_EMAIL = 'sender@test'; process.env.SMTP_PASSWORD = 'test'
  const updates = [], filters = [], mails = []
  const query = { then(resolve) { resolve({data:[],error:null}) } }
  for (const method of ['select','eq','or','order','limit']) query[method] = () => query
  const updateQuery = { then(resolve) { resolve({error:null}) }, eq(...args) { filters.push(args); return this } }
  const alerts = [
    {id:'1',recipient_email:'tutor@test',subject:'Banned',message:'Reason',path:'/login',attempts:1,claim_token:'claim-1'},
    {id:'2',recipient_email:'student@test',subject:'Refunded',message:'Refund',path:'/student/dashboard',attempts:2,claim_token:'claim-2'},
  ]
  const lib = moduleAt('src/lib/email-alerts.ts', {
    '@/lib/supabase': {supabaseAdmin: {rpc:async()=>({data:alerts,error:null}),from: table => table === 'tutor_teaching_demos' ? query : {update: values => {updates.push(values); return updateQuery}}}},
    '@/lib/mail': {sendMail:async(to)=>{mails.push(to); return to === 'student@test'}},
    '@/lib/app-url': {getAppUrl:()=> 'https://quicksolve.test'},
    '@/lib/demo-review-email': {sendDemoReviewEmail:async()=> 'unchanged'},
  })
  try {
    const started = Date.now()
    assert.deepEqual(await lib.deliverEmailAlerts(new Request('https://test')), {processed:2,sent:1,failed:1})
    assert.deepEqual(mails,['tutor@test','student@test'])
    assert.equal(updates[0].status,'failed'); assert.equal(updates[0].sent_at,null)
    assert.ok(Date.parse(updates[0].available_at) >= started + 60000)
    assert.equal(updates[1].status,'sent')
    assert.ok(filters.some(args=>args[0]==='claim_token'&&args[1]==='claim-1'))
    assert.ok(filters.some(args=>args[0]==='claim_token'&&args[1]==='claim-2'))
  } finally {
    for (const [key,value] of [['SMTP_EMAIL',original.email],['SMTP_PASSWORD',original.password]]) {if(value===undefined) delete process.env[key]; else process.env[key]=value}
  }
})
