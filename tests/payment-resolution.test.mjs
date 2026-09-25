import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('review-independent payout and admin resolutions use one funded terminal outcome', async t => {
 const db = new PGlite()
 try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table users(email text primary key,sessions integer default 0);
      create table role_wallets(id uuid primary key default gen_random_uuid(),user_email text,role text,balance numeric default 0,updated_at timestamptz,unique(user_email,role));
      create table wallet_transactions(id uuid primary key default gen_random_uuid(),user_email text,user_role text,type text,amount numeric,description text,status text,created_at timestamptz default now());
      create table problems(id uuid primary key default gen_random_uuid(),student_email text,subject text default 'Physics',duration_min integer default 30,offer_price numeric default 500,status text default 'open',created_at timestamptz default now());
      create table bids(id uuid primary key default gen_random_uuid(),problem_id uuid references problems(id),tutor_name text,price integer,duration_min integer,status text default 'pending');
      create table tutor_profiles(fullname text,user_email text,subjects text[] default array['Physics'],verification_status text default 'verified',verification_stage text default 'verified',is_available boolean default true,total_earnings numeric default 0,total_sessions integer default 0);
      create function get_or_create_wallet(text,text) returns void language sql as 'select';
      create function update_wallet_balance(text,text,numeric) returns void language sql as 'select';
      insert into users(email) values ('student@test'),('tutor@test');
      insert into role_wallets(user_email,role,balance) values ('student@test','student',2000),('tutor@test','tutor',0);
      insert into tutor_profiles(fullname,user_email) values ('Tutor','tutor@test');
    `)
    for (const file of ['202609210001_wallet_integrity.sql','202609220002_session_clock.sql','202609220003_session_end.sql','202609220004_session_payments.sql','202609250001_session_extensions.sql','202609250002_tutor_ratings.sql','202609250003_realtime_notifications.sql','202609250004_reject_unselected_bids.sql','202609250005_session_escrow.sql','202609250006_payment_resolution.sql']) {
      await db.exec((await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8')).split('-- Supabase Cron')[0])
    }


    await db.exec("update role_wallets set balance=10000 where role='student'")
    const create = async (ended = true) => {
      const p = (await db.query("insert into problems(student_email) values ('student@test') returning id")).rows[0].id
      const b = (await db.query("insert into bids(problem_id,tutor_name,tutor_email,price,duration_min) values ($1,'Tutor','tutor@test',500,30) returning id",[p])).rows[0].id
      await db.query("select accept_student_bid($1,'student@test',$2)",[p,b])
      if (ended) await db.query("update problems set session_started_at=now()-interval '31 minutes' where id=$1",[p])
      return p
    }
    const prepare = () => db.query('select prepare_session_payments()')
    const cron = () => db.query('select release_session_payments() n')
    const due = p => db.query("update session_payments set release_at=now()-interval '1 minute' where problem_id=$1",[p])
    const payment = async p => (await db.query('select * from session_payments where problem_id=$1',[p])).rows[0]
    const balance = async role => Number((await db.query('select balance from role_wallets where role=$1',[role])).rows[0].balance)
    const review = (p,r=5,d=null) => db.query("select submit_session_review($1,'student@test',$2,'Useful session',$3)",[p,r,d])
    const resolve = (p,action,note='Reviewed the session evidence') => db.query("select resolve_session_payment($1,$2,'admin@test',$3)",[p,action,note])
    await t.test('clock expiry queues without browser or review and waits for dispute window',async()=>{
      const p=await create()
      const before=await balance('student')
      await cron()
      assert.equal((await payment(p)).rating,0)
      assert.equal((await payment(p)).review_submitted_at,null)
      assert.equal((await payment(p)).status,'pending')
      assert.equal(await balance('tutor'),0)
      await due(p)
      await cron(); await cron()
      assert.equal(await balance('tutor'),500)
      assert.equal(await balance('student'),before)
      assert.equal((await payment(p)).status,'released')
      await review(p,3)
      assert.equal((await payment(p)).rating,3)
      assert.equal((await payment(p)).status,'released')
      await assert.rejects(review(p,3,'Late dispute'),/window closed/)
    })
    await t.test('active sessions do not queue; early explicit endings do',async()=>{
      const p=await create(false)
      await db.query('update problems set session_started_at=now() where id=$1',[p])
      await prepare()
      assert.equal(await payment(p),undefined)
      await assert.rejects(review(p),/End the session/)
      await db.query('update problems set session_ended_at=now() where id=$1',[p])
      await prepare()
      assert.equal((await payment(p)).status,'pending')
    })
    await t.test('no-review dispute blocks cron and admin refund credits full reserve once',async()=>{
      const p=await create(); await prepare()
      const before=await balance('student')
      await review(p,0,'Tutor did not explain')
      await due(p); await cron()
      assert.equal((await payment(p)).status,'held')
      await resolve(p,'refund'); await resolve(p,'refund')
      assert.equal(await balance('student'),before+500)
      assert.equal((await payment(p)).status,'refunded')
      assert.equal((await payment(p)).resolved_by,'admin@test')
      assert.equal((await db.query('select status from session_escrows where problem_id=$1',[p])).rows[0].status,'refunded')
      await assert.rejects(resolve(p,'release'),/different outcome/)
    })
    await t.test('low review holds an automatic row, admin release pays once',async()=>{
      const p=await create(); await prepare(); await review(p,2)
      assert.equal((await payment(p)).status,'held')
      const before=await balance('tutor')
      await Promise.all([resolve(p,'release'),resolve(p,'release')])
      assert.equal(await balance('tutor'),before+500)
      assert.equal((await payment(p)).resolution_note,'Reviewed the session evidence')
      await assert.rejects(resolve(p,'refund'),/different outcome/)
    })
    await t.test('abandoned reservations are held for review instead of paying tutor',async()=>{
      const p=await create(false)
      await prepare(); assert.equal(await payment(p),undefined)
      await db.query("update session_escrows set reserved_at=now()-interval '31 minutes' where problem_id=$1",[p])
      await cron()
      assert.equal((await payment(p)).status,'held')
      assert.match((await payment(p)).hold_reason,/never started/)
      await review(p,5)
      assert.equal((await payment(p)).status,'held')
      await resolve(p,'refund')
    })
    await t.test('failed credit or inconsistent escrow leaves held payment untouched',async()=>{
      const p=await create(); await review(p,1)
      const before=await balance('student')
      await assert.rejects(resolve(p,'refund',''),/note/)
      await db.exec("alter table wallet_transactions add constraint fail_refund check(method <> 'Session refund') not valid")
      await assert.rejects(resolve(p,'refund'),/fail_refund/)
      assert.equal(await balance('student'),before)
      assert.equal((await payment(p)).status,'held')
      await db.exec('alter table wallet_transactions drop constraint fail_refund')
      await db.query('update session_payments set amount=amount+1 where problem_id=$1',[p])
      await assert.rejects(resolve(p,'refund'),/Escrow does not match/)
      assert.equal((await payment(p)).status,'held')
      const privileges=(await db.query("select has_function_privilege('authenticated','resolve_session_payment(uuid,text,text,text)','execute') allowed")).rows[0]
      assert.equal(privileges.allowed,false)
    })
    await t.test('admin refunds include prepaid extensions without paying the tutor',async()=>{
      const p=await create(false)
      await db.query("update problems set session_started_at=now()-interval '26 minutes' where id=$1",[p])
      await db.query("select extend_student_session($1,'student@test',5,'00000000-0000-0000-0000-000000000088',0)",[p])
      await db.query('update problems set session_ended_at=now() where id=$1',[p])
      await prepare(); await review(p,1,'Session not satisfactory')
      assert.equal(Number((await payment(p)).amount),583.33)
      const before=await balance('student'), tutorBefore=await balance('tutor')
      await resolve(p,'refund')
      assert.equal(await balance('student'),Math.round((before+583.33)*100)/100)
      assert.equal(await balance('tutor'),tutorBefore)
    })
 } finally { await db.close() }
})
