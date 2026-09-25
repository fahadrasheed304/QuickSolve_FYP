import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('real wallet and review migrations pay the tutor base plus prepaid extension exactly once', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table users(email text primary key,sessions integer default 0);
      create table role_wallets(id uuid primary key default gen_random_uuid(),user_email text,role text,balance numeric default 0,updated_at timestamptz,unique(user_email,role));
      create table wallet_transactions(id uuid primary key default gen_random_uuid(),user_email text,user_role text,type text,amount numeric,description text,status text,created_at timestamptz default now());
      create table problems(id uuid primary key default gen_random_uuid(),student_email text,status text default 'open',created_at timestamptz default now());
      create table bids(id uuid primary key default gen_random_uuid(),problem_id uuid references problems(id),tutor_name text,price integer,duration_min integer,status text default 'pending');
      create table tutor_profiles(fullname text,user_email text,total_earnings numeric default 0,total_sessions integer default 0);
      create function get_or_create_wallet(text,text) returns void language sql as 'select';
      create function update_wallet_balance(text,text,numeric) returns void language sql as 'select';
      insert into users(email) values ('student@test'),('tutor@test');
      insert into role_wallets(user_email,role,balance) values ('student@test','student',2000),('tutor@test','tutor',0);
      insert into tutor_profiles(fullname,user_email) values ('Tutor','tutor@test');
    `)
    for (const file of ['202609210001_wallet_integrity.sql','202609220002_session_clock.sql','202609220003_session_end.sql','202609220004_session_payments.sql','202609250001_session_extensions.sql','202609250002_tutor_ratings.sql']) {
      await db.exec((await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8')).split('-- Supabase Cron')[0])
    }
    const problem = (await db.query("insert into problems(student_email) values ('student@test') returning id")).rows[0].id
    const bid = (await db.query("insert into bids(problem_id,tutor_name,tutor_email,price,duration_min) values ($1,'Tutor','tutor@test',500,30) returning id",[problem])).rows[0].id
    await db.query("select accept_student_bid($1,'student@test',$2)",[problem,bid])
    await db.query("update problems set session_started_at=now()-interval '26 minutes' where id=$1",[problem])
    await db.query("select extend_student_session($1,'student@test',10,'00000000-0000-0000-0000-000000000010',0)",[problem])
    const balance = async email => Number((await db.query('select balance from role_wallets where user_email=$1',[email])).rows[0].balance)
    assert.equal(await balance('student@test'),1833.33)
    await db.query("select submit_session_review($1,'student@test',5,'Good',null)",[problem])
    await db.query("select submit_session_review($1,'student@test',5,'Good',null)",[problem])
    assert.deepEqual((await db.query("select get_tutor_rating('tutor@test') result")).rows[0].result, { rating: 5, review_count: 1 })
    assert.equal(await balance('student@test'),1333.33)
    assert.equal(await balance('tutor@test'),0)
    assert.equal((await db.query('select release_session_payments() n')).rows[0].n,0)
    await db.exec("update session_payments set release_at=now()-interval '1 minute'")
    assert.equal((await db.query('select release_session_payments() n')).rows[0].n,1)
    assert.equal((await db.query('select release_session_payments() n')).rows[0].n,0)
    assert.equal(await balance('tutor@test'),666.67)
    assert.equal(Number((await db.query('select total_earnings from tutor_profiles')).rows[0].total_earnings),666.67)
  } finally { await db.close() }
})

test('session extension SQL enforces billing, authorization, retries and payout totals', async t => {
  const db = new PGlite()
  try {
    // Minimal existing schema and wallet dependency; execute the real extension migration.
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table problems(id uuid primary key, student_email text, accepted_bid_id uuid, status text default 'accepted', settled_at timestamptz, session_started_at timestamptz, session_ended_at timestamptz);
      create table bids(id uuid primary key, problem_id uuid, price integer, duration_min integer, tutor_name text);
      create table role_wallets(user_email text, role text, balance numeric);
      create table wallet_transactions(reference text unique, amount numeric);
      create table session_payments(problem_id uuid primary key, amount numeric, status text default 'held');
      create function apply_wallet_transaction(text,text,numeric,text,text,text,text) returns jsonb language plpgsql as $$
      declare remaining numeric; begin
        update role_wallets set balance=balance-$3 where user_email=$1 and role=$2 returning balance into remaining;
        insert into wallet_transactions values($7,$3);
        return jsonb_build_object('balance',remaining,'duplicate',false);
      end; $$;
      insert into role_wallets values ('student@test','student',2000);
      insert into problems values ('00000000-0000-0000-0000-000000000001','student@test','00000000-0000-0000-0000-000000000002','accepted',null,now()-interval '26 minutes',null);
      insert into bids values ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001',500,30,'Tutor');
    `)
    const sql = await readFile(new URL('../supabase/migrations/202609250001_session_extensions.sql', import.meta.url),'utf8')
    await db.exec(sql)
    await db.exec(sql)
    const extend = (id, minutes=10, expected=0, email='student@test') => db.query('select extend_student_session($1,$2,$3,$4,$5) result',[
      '00000000-0000-0000-0000-000000000001',email,minutes,`00000000-0000-0000-0000-${String(id).padStart(12,'0')}`,expected,
    ])
    const balance = async () => Number((await db.query('select balance from role_wallets')).rows[0].balance)

    await t.test('unauthorized, invalid and insufficient funds leave wallet and time unchanged', async () => {
      await assert.rejects(extend(10,10,0,'other@test'), /Session not found/)
      await assert.rejects(extend(10,7), /Invalid extension/)
      await db.exec('update role_wallets set balance=600')
      await assert.rejects(extend(10), /Insufficient wallet balance/)
      assert.equal(await balance(),600)
      assert.equal((await db.query('select extension_minutes from problems')).rows[0].extension_minutes,0)
      await db.exec('update role_wallets set balance=2000')
    })
    await t.test('accepted bid determines rounded charge; concurrent retries debit once', async () => {
      const results = await Promise.all([extend(10),extend(10)])
      assert.equal(Number(results[0].rows[0].result.amount),166.67)
      assert.equal(results[1].rows[0].result.duplicate,true)
      assert.equal(await balance(),1833.33)
      assert.equal((await db.query('select extension_minutes from problems')).rows[0].extension_minutes,10)
      assert.equal((await db.query('select count(*) n from wallet_transactions')).rows[0].n,1)
      await assert.rejects(extend(10,15), /conflict/)
      await assert.rejects(extend(11,10,0), /already extended/)
      await assert.rejects(extend(11,10,10), /last 5 minutes/)
    })
    await t.test('payment includes prepaid extensions once and does not debit again', async () => {
      await db.exec("insert into session_payments(problem_id,amount) select id,500 from problems")
      await db.exec("insert into session_payments(problem_id,amount) select id,500 from problems on conflict do nothing")
      assert.equal(Number((await db.query('select amount from session_payments')).rows[0].amount),666.67)
      assert.equal(await balance(),1833.33)
    })
    await t.test('failed extension insertion rolls wallet debit back', async () => {
      await db.exec("update problems set session_started_at=now()-interval '36 minutes'; alter table session_extensions add constraint forced_failure check(minutes<>15)")
      await assert.rejects(extend(12,15,10), /forced_failure/)
      assert.equal(await balance(),1833.33)
      assert.equal((await db.query('select extension_minutes from problems')).rows[0].extension_minutes,10)
    })
    await t.test('ended and expired sessions cannot be extended', async () => {
      await db.exec('update problems set session_ended_at=now()')
      await assert.rejects(extend(13,10,10), /not active/)
      await db.exec("update problems set session_ended_at=null,session_started_at=now()-interval '41 minutes'")
      await assert.rejects(extend(13,10,10), /not active/)
      const { rows } = await db.query("select has_function_privilege('authenticated','extend_student_session(uuid,text,integer,uuid,integer)','execute') allowed")
      assert.equal(rows[0].allowed,false)
    })
  } finally { await db.close() }
})
