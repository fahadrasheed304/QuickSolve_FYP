import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('escrow reserves at acceptance and settles base plus extensions without charging twice', async t => {
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
    for (const file of ['202609210001_wallet_integrity.sql','202609220002_session_clock.sql','202609220003_session_end.sql','202609220004_session_payments.sql','202609250001_session_extensions.sql','202609250002_tutor_ratings.sql','202609250003_realtime_notifications.sql','202609250004_reject_unselected_bids.sql']) {
      await db.exec((await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8')).split('-- Supabase Cron')[0])
    }

    const create = async (price = 500) => {
      const p = (await db.query("insert into problems(student_email) values ('student@test') returning id")).rows[0].id
      const b = (await db.query("insert into bids(problem_id,tutor_name,tutor_email,price,duration_min) values ($1,'Tutor','tutor@test',$2,30) returning id", [p,price])).rows[0].id
      return { p,b }
    }
    const accept = ({p,b}, email = 'student@test') => db.query('select accept_student_bid($1,$2,$3)',[p,email,b])
    const balance = async (email='student@test') => Number((await db.query('select balance from role_wallets where user_email=$1',[email])).rows[0].balance)
    const escrow = async p => (await db.query('select * from session_escrows where problem_id=$1',[p])).rows[0]
    const review = (p, rating=5, dispute=null) => db.query("select submit_session_review($1,'student@test',$2,'Feedback',$3)",[p,rating,dispute])
    const legacy = await create(200)
    await accept(legacy)
    const migration = await readFile(new URL('../supabase/migrations/202609250005_session_escrow.sql',import.meta.url),'utf8')
    await db.exec(migration)
    await db.exec(migration)
    const first = await create()
    await t.test('reserve and retry are atomic; unrelated bids cannot be accepted by another user', async () => {
      await assert.rejects(accept(first,'intruder@test'), /Problem not found/)
      assert.equal(await balance(),2000)
      await accept(first)
      await accept(first)
      assert.equal(await balance(),1500)
      assert.equal(Number((await escrow(first.p)).amount),500)
      assert.equal((await db.query("select count(*) from wallet_transactions where method='Session escrow'")).rows[0].count,1)
    })
    await t.test('another session cannot reuse reserved funds', async () => {
      const expensive = await create(1600)
      await assert.rejects(accept(expensive), /Insufficient/)
      assert.equal((await db.query('select status from problems where id=$1',[expensive.p])).rows[0].status,'open')
      assert.equal(await escrow(expensive.p),undefined)
      const spend = await create(1400)
      await accept(spend)
      assert.equal(await balance(),100)
    })
    await t.test('extension only needs its own cost, expands escrow once, and rolls back on failure', async () => {
      await db.query("update problems set session_started_at=now()-interval '26 minutes' where id=$1",[first.p])
      const extend = () => db.query("select extend_student_session($1,'student@test',5,'00000000-0000-0000-0000-000000000055',0)",[first.p])
      await db.exec("alter table session_extensions add constraint force_extension_failure check(minutes <> 5)")
      await assert.rejects(extend(), /force_extension_failure/)
      assert.equal(await balance(),100)
      assert.equal(Number((await escrow(first.p)).amount),500)
      await db.exec('alter table session_extensions drop constraint force_extension_failure')
      await Promise.all([extend(),extend()])
      assert.equal(await balance(),16.67)
      assert.equal(Number((await escrow(first.p)).amount),583.33)
    })
    await t.test('review charges nothing extra; payout consumes the reserved amount exactly once', async () => {
      await review(first.p)
      await review(first.p)
      assert.equal(await balance(),16.67)
      assert.equal(await balance('tutor@test'),0)
      assert.equal((await db.query('select release_session_payments() n')).rows[0].n,0)
      await db.query("update session_payments set release_at=now()-interval '1 minute' where problem_id=$1",[first.p])
      assert.equal((await db.query('select release_session_payments() n')).rows[0].n,1)
      assert.equal((await db.query('select release_session_payments() n')).rows[0].n,0)
      assert.equal(await balance('tutor@test'),583.33)
      assert.equal((await escrow(first.p)).status,'released')
      assert.equal(await balance(),16.67)
    })
    await t.test('legacy accepted sessions settle once without fabricated or retroactive reserves', async () => {
      assert.equal(await escrow(legacy.p),undefined)
      await db.query("select apply_wallet_transaction('student@test','student',1000,'credit','stripe','Test topup','test:escrow-topup')")
      await review(legacy.p)
      await review(legacy.p)
      assert.equal(await balance(),816.67)
    })
    await t.test('disputed sessions stay reserved and cannot be released by the scheduled payout', async () => {
      const held=await create(200)
      await accept(held)
      await review(held.p,2,'Session issue')
      await db.query("update session_payments set release_at=now()-interval '1 minute' where problem_id=$1",[held.p])
      await db.exec('select release_session_payments()')
      assert.equal((await escrow(held.p)).status,'reserved')
      assert.equal(await balance(),616.67)
    })
    await t.test('downstream failure rolls back reserved funds, selected bid and rejection updates', async () => {
      const fail=await create(200)
      await db.exec("alter table notifications add constraint force_accept_failure check(kind <> 'bid_accepted') not valid")
      await assert.rejects(accept(fail), /force_accept_failure/)
      assert.equal(await balance(),616.67)
      assert.equal(await escrow(fail.p),undefined)
      assert.equal((await db.query('select status from bids where id=$1',[fail.b])).rows[0].status,'pending')
      await db.exec('alter table notifications drop constraint force_accept_failure')
      assert.equal((await db.query("select has_table_privilege('authenticated','session_escrows','update') allowed")).rows[0].allowed,false)
    })
  } finally { await db.close() }
})
