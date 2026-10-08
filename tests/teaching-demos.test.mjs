import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { PGlite } from '@electric-sql/pglite'

const require = createRequire(import.meta.url)
function module(path, dependencies = {}) {
  const js = ts.transpileModule(readFileSync(new URL('../' + path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  new Function('require', 'exports', js)(name => dependencies[name] ?? require(name), exports)
  return exports
}

test('demo approval, replacement, limits and bid enforcement are atomic database rules', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table tutor_profiles(user_email text primary key,subjects text[]);
      create table problems(id uuid primary key default gen_random_uuid(),subject text);
      create table bids(id uuid primary key default gen_random_uuid(),problem_id uuid,tutor_email text,tutor_subject text,status text default 'pending');
      insert into tutor_profiles values ('tutor@test',array['Mathematics','Physics']);
      insert into problems(subject) values ('Mathematics'),('Physics');`)
    const sql = readFileSync(new URL('../supabase/migrations/202610080002_tutor_teaching_demos.sql', import.meta.url), 'utf8')
    await db.exec(sql); await db.exec(sql)
    const emailSql = readFileSync(new URL('../supabase/migrations/202610080003_demo_review_emails.sql', import.meta.url), 'utf8')
    await db.exec(emailSql); await db.exec(emailSql)
    const reserve = async (subject = 'Mathematics') => (await db.query("select * from reserve_tutor_demo('tutor@test',$1,'Quadratics','Class 10')", [subject])).rows[0]
    const complete = id => db.query("update tutor_teaching_demos set status='pending',duration_seconds=180,file_size=1000 where id=$1", [id])
    const scores = { accuracy: 4, clarity: 4, example: 4, communication: 4 }
    const review = (id, approve, marks = scores, feedback = '') => db.query("select review_tutor_demo($1,'admin@test',$2,$3::jsonb,$4)", [id, approve, JSON.stringify(marks), feedback])
    const math = (await db.query("select id from problems where subject='Mathematics'")).rows[0].id
    const bid = () => db.query("insert into bids(problem_id,tutor_email,tutor_subject) values ($1,'tutor@test','Mathematics')", [math])
    await assert.rejects(bid(), /approved teaching demo/)
    const first = await reserve()
    await assert.rejects(reserve(), /current submission/)
    await assert.rejects(db.query("update tutor_teaching_demos set status='pending' where id=$1", [first.id]), /check constraint/)
    await assert.rejects(db.query("update tutor_teaching_demos set duration_seconds=301 where id=$1", [first.id]), /check constraint/)
    await complete(first.id)
    await assert.rejects(review(first.id, true, { ...scores, accuracy: 3 }), /accuracy/)
    await assert.rejects(review(first.id, true, { ...scores, clarity: 0 }), /integer/)
    await assert.rejects(review(first.id, false), /feedback/)
    await review(first.id, true)
    await bid()
    const replacement = await reserve()
    await complete(replacement.id)
    await assert.rejects(review(first.id, false, scores, 'Please revise example'), /no longer/)
    assert.equal((await db.query("select id from tutor_teaching_demos where status='approved'")).rows[0].id, first.id)
    await review(replacement.id, false, scores, 'Please explain each calculation')
    assert.equal((await db.query('select review_email_status from tutor_teaching_demos where id=$1', [replacement.id])).rows[0].review_email_status, 'pending')
    await bid()
    const third = await reserve()
    await complete(third.id); await review(third.id, true)
    assert.equal((await db.query("select id from tutor_teaching_demos where status='approved'")).rows[0].id, third.id)
    assert.equal((await db.query('select status from tutor_teaching_demos where id=$1', [first.id])).rows[0].status, 'superseded')
    const physics = (await db.query("select id from problems where subject='Physics'")).rows[0].id
    await assert.rejects(db.query('update bids set problem_id=$1', [physics]), /approved teaching demo/)
    await db.exec("update bids set status='rejected'")
    await assert.rejects(db.exec("set role authenticated; select * from tutor_teaching_demos"), /permission denied/)
    await db.exec('reset role')
    await assert.rejects(db.exec("set role authenticated; select reserve_tutor_demo('tutor@test','Physics','Topic','10')"), /permission denied/)
    await db.exec('reset role')
    for (let i = 0; i < 7; i++) {
      const row = await reserve('Physics')
      await db.query("update tutor_teaching_demos set status='cancelled' where id=$1", [row.id])
    }
    await assert.rejects(reserve('Physics'), /Daily demo upload limit/)
    assert.equal((await db.query("select public from storage.buckets where id='tutor-demos'")).rows[0].public, false)
  } finally { await db.close() }
})

test('review emails use stored recipient and feedback, escape HTML, and persist retryable failures', async () => {
  const id = '00000000-0000-0000-0000-000000000001'
  let row = { id, tutor_email: 'owner@test', subject: 'Mathematics', topic: '<Topic>', feedback: '<script>bad</script> Explain each step.', status: 'rejected', review_email_status: 'pending' }
  let smtpSuccess = false
  const sent = []
  const deps = {
    '@/lib/teaching-demos': module('src/lib/teaching-demos.ts'),
    '@/lib/app-url': { getAppUrl: () => 'https://quicksolve.test' },
    '@/lib/mail': { sendMail: async (...args) => { sent.push(args); return smtpSuccess } },
    '@/lib/supabase': { supabaseAdmin: { from: () => {
      const filters = {}; let updates, claim = false
      const run = () => {
        if (!Object.entries(filters).every(([k, v]) => row[k] === v) || (claim && !['pending', 'failed'].includes(row.review_email_status))) return { data: null, error: null }
        Object.assign(row, updates); return { data: { ...row }, error: null }
      }
      const query = { update: values => { updates = values; return query }, eq: (k, v) => { filters[k] = v; return query },
        or: () => { claim = true; return query }, select: () => query, maybeSingle: async () => run(),
        then: resolve => Promise.resolve(run()).then(resolve) }
      return query
    } } },
  }
  const { sendDemoReviewEmail } = module('src/lib/demo-review-email.ts', deps)
  const request = new Request('https://quicksolve.test/api/admin/demos')
  assert.equal(await sendDemoReviewEmail(id, request), 'failed')
  assert.equal(row.review_email_status, 'failed')
  assert.equal(sent[0][0], 'owner@test')
  assert.ok(sent[0][2].includes(`/tutor/waiting-verification?demo=${id}#teaching-demos`))
  assert.ok(sent[0][2].includes(row.feedback))
  assert.ok(sent[0][3].includes('&lt;script&gt;'))
  assert.ok(!sent[0][3].includes('<script>'))
  smtpSuccess = true
  assert.equal(await sendDemoReviewEmail(id, request), 'sent')
  assert.equal(row.review_email_status, 'sent')
  assert.equal(await sendDemoReviewEmail(id, request), 'unchanged')
  assert.equal(sent.length, 2)
  row.review_email_status = 'pending'; row.status = 'approved'
  assert.equal(await sendDemoReviewEmail(id, request), 'unchanged')
  assert.equal(sent.length, 2)
})

test('demo email links preserve only a valid demo ID through sign-in', async () => {
  const constants = module('src/lib/teaching-demos.ts')
  const id = '00000000-0000-0000-0000-000000000001'
  for (const value of [null, '', 'https://evil.test', '//evil.test', '../admin', '<script>']) assert.equal(constants.demoReviewReturnPath(value), null)
  assert.equal(constants.demoReviewReturnPath(id), `/tutor/waiting-verification?demo=${id}#teaching-demos`)
  const { NextRequest } = require('next/server')
  let session = null
  const { proxy } = module('src/proxy.ts', { '@/lib/auth': { decrypt: async () => session }, '@/lib/teaching-demos': constants })
  let response = await proxy(new NextRequest(`https://quicksolve.test/tutor/waiting-verification?demo=${id}`))
  const location = new URL(response.headers.get('location'))
  assert.equal(location.pathname, '/signin-page'); assert.equal(location.searchParams.get('demo'), id)
  assert.equal(location.searchParams.get('role'), 'tutor')
  session = { role: 'tutor' }
  response = await proxy(new NextRequest(`https://quicksolve.test/signin-page?role=tutor&demo=${id}`))
  assert.equal(new URL(response.headers.get('location')).pathname, '/tutor/waiting-verification')
})

test('admin review emails send only after a saved rejection; retry never repeats review', async () => {
  let session = { role: 'student', email: 'student@test' }, reviews = 0, emails = 0, rpcError = null
  const api = module('src/app/api/admin/demos/route.ts', {
    '@/lib/teaching-demos-server': { demoSession: async () => session },
    '@/lib/teaching-demos': module('src/lib/teaching-demos.ts'),
    '@/lib/demo-review-email': { sendDemoReviewEmail: async () => { emails++; return 'failed' } },
    '@/lib/supabase': { supabaseAdmin: { rpc: async () => { reviews++; return { error: rpcError } } } },
  })
  const send = (action = 'reject') => api.POST(new Request('https://app.test/api/admin/demos', { method: 'POST', body: JSON.stringify({ id: 'demo', action, feedback: 'Explain the solution steps', scores: { accuracy: 4, clarity: 4, example: 4, communication: 4 } }) }))
  assert.equal((await send()).status, 403); assert.equal(emails, 0)
  session = { role: 'admin', email: 'admin@test' }; rpcError = { message: 'Stale review' }
  assert.equal((await send()).status, 409); assert.equal(emails, 0)
  rpcError = null
  assert.equal((await (await send()).json()).emailStatus, 'failed')
  assert.equal(emails, 1)
  const count = reviews
  assert.equal((await send('resend_email')).status, 200)
  assert.equal(reviews, count); assert.equal(emails, 2)
  assert.equal((await send('approve')).status, 200); assert.equal(emails, 2)
})

test('playback protects pending videos and checks student bid ownership', async () => {
  let session = null, signed = 0
  const demo = { id: 'demo', tutor_email: 'tutor@test', subject: 'Mathematics', status: 'approved', object_key: 'demo.mp4', topic: 'Quadratics', class_level: '10' }
  const api = module('src/app/api/demos/playback/route.ts', {
    '@/lib/teaching-demos-server': { demoSession: async () => session, demoPlayback: async () => { signed++; return 'https://storage.test/video' } },
    '@/lib/supabase': { supabaseAdmin: { from: table => {
      const filters = {}, lists = {}
      const query = { select: () => query, eq: (k, v) => { filters[k] = v; return query }, in: (k, v) => { lists[k] = v; return query },
        maybeSingle: async () => {
          const row = table === 'bids' ? { id: 'bid', tutor_email: 'tutor@test', problem_id: 'problem' }
            : table === 'problems' ? { id: 'problem', student_email: 'owner@test', subject: 'Mathematics' } : demo
          return { data: Object.entries(filters).every(([k, v]) => row[k] === v) && Object.entries(lists).every(([k, v]) => v.includes(row[k])) ? row : null, error: null }
        } }
      return query
    } } },
  })
  const get = () => api.GET(new Request('https://app.test/api/demos/playback?bidId=bid&id=demo'))
  assert.equal((await get()).status, 401)
  session = { email: 'outsider@test', role: 'student' }; assert.equal((await get()).status, 404)
  session = { email: 'owner@test', role: 'student' }; demo.status = 'pending'; assert.equal((await get()).status, 404)
  demo.status = 'rejected'; assert.equal((await get()).status, 404)
  demo.status = 'approved'; assert.equal((await get()).status, 200)
  assert.equal(signed, 1)
  session = { email: 'other@test', role: 'tutor' }; assert.equal((await get()).status, 404)
  session = { email: 'tutor@test', role: 'tutor' }; demo.status = 'pending'; assert.equal((await get()).status, 200)
  session = { email: 'admin@test', role: 'admin' }; assert.equal((await get()).status, 200)
})

test('video validation rejects non-media and enforces parsed duration and audio', () => {
  const constants = module('src/lib/teaching-demos.ts')
  const deps = { '@/lib/auth': {}, '@/lib/supabase': {}, '@/lib/teaching-demos': constants }
  const real = module('src/lib/teaching-demos-server.ts', deps)
  assert.throws(() => real.inspectDemo(new ArrayBuffer(16)), /MP4/)
  let info = { duration: 300, timescale: 1, videoTracks: [{}], audioTracks: [{}], tracks: [{ duration: 300, timescale: 1 }] }
  const mocked = module('src/lib/teaching-demos-server.ts', { ...deps, mp4box: { createFile: () => {
    const parser = { appendBuffer: () => parser.onReady(info), flush() {} }; return parser
  } } })
  assert.equal(mocked.inspectDemo(new ArrayBuffer(16)), 300)
  info.duration = 301; assert.throws(() => mocked.inspectDemo(new ArrayBuffer(16)), /5 minutes/)
  info.duration = 100; info.audioTracks = []; assert.throws(() => mocked.inspectDemo(new ArrayBuffer(16)), /audio/)
  assert.throws(() => mocked.inspectDemo(new ArrayBuffer(constants.DEMO_MAX_BYTES + 1)), /50 MB/)
})

test('upload completion uses owned storage bytes, not client duration or paths', async () => {
  let session = { role: 'tutor', email: 'owner@test' }
  let state = 'uploading', parsed = 0, downloads = 0
  const values = []
  const api = module('src/app/api/tutor/demos/route.ts', {
    '@/lib/teaching-demos': module('src/lib/teaching-demos.ts'),
    '@/lib/teaching-demos-server': {
      demoSession: async () => session,
      inspectDemo: buffer => { assert.equal(buffer.byteLength, 3); parsed++; return 180 },
    },
    '@/lib/supabase': { supabaseAdmin: {
      storage: { from: bucket => { assert.equal(bucket, 'tutor-demos'); return { download: async key => {
        downloads++; assert.equal(key, 'owned.mp4'); return { data: new Blob(['abc']), error: null }
      } } } },
      from: () => {
        const filters = {}
        let update
        const query = { select: () => query, eq: (key, value) => { filters[key] = value; return query },
          update: value => { update = value; return query },
          maybeSingle: async () => ({ data: filters.id === 'owned' && filters.tutor_email === 'owner@test' ? { id: 'owned', object_key: 'owned.mp4', status: state } : null, error: null }),
          then: resolve => { values.push(update); state = update.status; return Promise.resolve({ data: [{ id: 'owned' }], error: null }).then(resolve) },
        }; return query
      },
    } },
  })
  const send = (id = 'owned') => api.POST(new Request('https://app.test/api/tutor/demos', { method: 'POST', body: JSON.stringify({ action: 'complete', id, duration: 1, object_key: 'foreign.mp4' }) }))
  session = null; assert.equal((await send()).status, 403)
  session = { role: 'student', email: 'owner@test' }; assert.equal((await send()).status, 403)
  session = { role: 'tutor', email: 'other@test' }; assert.equal((await send()).status, 404)
  session.email = 'owner@test'; assert.equal((await send('foreign')).status, 404)
  assert.equal(downloads, 0)
  assert.equal((await send()).status, 200)
  assert.deepEqual(values[0], { status: 'pending', duration_seconds: 180, file_size: 3 })
  assert.equal(parsed, 1)
  assert.equal((await send()).status, 409)
  assert.equal(downloads, 1)
})
