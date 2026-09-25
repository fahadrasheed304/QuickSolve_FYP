import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('bid selection rejects other bids atomically, notifies tutors and prevents late bids', async () => {
  const db = new PGlite()
  const migration = name => readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8')
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table problems(id uuid primary key default gen_random_uuid(),student_email text,subject text default 'Physics',duration_min integer default 30,offer_price numeric default 500,status text default 'open',accepted_bid_id uuid,settled_at timestamptz,created_at timestamptz default now());
      create table bids(id uuid primary key default gen_random_uuid(),problem_id uuid references problems(id),tutor_email text,tutor_name text default 'Tutor',price numeric default 400,status text default 'pending');
      create table role_wallets(user_email text,role text,balance numeric);
      create table tutor_profiles(user_email text,subjects text[],verification_status text,verification_stage text,is_available boolean);
      insert into role_wallets values ('student@test','student',1000),('poor@test','student',0);
      insert into tutor_profiles values ('winner@test',array['Physics'],'verified','verified',true),('loser@test',array['Physics'],'verified','verified',true),('observer@test',array['Physics'],'verified','verified',true);
    `)
    await db.exec(await migration('202609250003_realtime_notifications.sql'))
    const sql = await migration('202609250004_reject_unselected_bids.sql')
    await db.exec(sql)
    const problem = async (email = 'student@test') => (await db.query('insert into problems(student_email) values ($1) returning id', [email])).rows[0].id
    const bid = async (id, tutor) => (await db.query('insert into bids(problem_id,tutor_email) values ($1,$2) returning id', [id, tutor])).rows[0].id
    const accept = (id, selected, email = 'student@test') => db.query('select accept_student_bid($1,$2,$3)', [id, email, selected])
    const p = await problem()
    const winner = await bid(p, 'winner@test')
    const loser = await bid(p, 'loser@test')
    const other = await problem()
    await bid(other, 'loser@test')
    await assert.rejects(accept(p, winner, 'intruder@test'), /Problem not found/)
    assert.equal((await db.query('select status from bids where id=$1', [loser])).rows[0].status, 'pending')
    await accept(p, winner)
    const statuses = (await db.query('select id,status from bids where problem_id=$1', [p])).rows
    assert.equal(statuses.find(row => row.id === winner).status, 'accepted')
    assert.equal(statuses.find(row => row.id === loser).status, 'rejected')
    assert.equal((await db.query('select status from bids where problem_id=$1', [other])).rows[0].status, 'pending')
    const notices = (await db.query("select recipient_email,kind from notifications where problem_id=$1 and event_key like 'closed:%'", [p])).rows
    assert.equal(notices.find(row => row.recipient_email === 'winner@test').kind, 'bid_accepted')
    assert.equal(notices.find(row => row.recipient_email === 'loser@test').kind, 'bid_rejected')
    assert.equal(notices.find(row => row.recipient_email === 'observer@test').kind, 'request_closed')
    await accept(p, winner) // Retrying cannot duplicate alerts or change the winner.
    assert.equal((await db.query("select count(*) from notifications where problem_id=$1 and event_key like 'closed:%'", [p])).rows[0].count, 3)
    await assert.rejects(accept(p, loser), /no longer open/)
    await assert.rejects(bid(p, 'late@test'), /no longer accepting bids/)
    const poor = await problem('poor@test')
    const poorWinner = await bid(poor, 'winner@test')
    await bid(poor, 'loser@test')
    await assert.rejects(accept(poor, poorWinner, 'poor@test'), /Insufficient/)
    assert.equal((await db.query("select count(*) from bids where problem_id=$1 and status='pending'", [poor])).rows[0].count, 2)
    // A downstream notification failure rolls the winner and all rejections back.
    await db.exec("alter table notifications add constraint fail_rejection check (kind <> 'bid_rejected') not valid")
    const rollbackWinner = await bid(other, 'winner@test')
    await assert.rejects(accept(other, rollbackWinner), /fail_rejection/)
    assert.equal((await db.query("select count(*) from bids where problem_id=$1 and status='pending'", [other])).rows[0].count, 2)
    await db.exec('alter table notifications drop constraint fail_rejection')
    // Reapplying repairs historical pending losers, without duplicate messages.
    await db.query("update bids set status='pending' where id=$1", [loser])
    await db.exec(sql)
    assert.equal((await db.query('select status from bids where id=$1', [loser])).rows[0].status, 'rejected')
    assert.equal((await db.query("select count(*) from notifications where problem_id=$1 and kind='bid_rejected'", [p])).rows[0].count, 1)
    assert.equal((await db.query("select has_function_privilege('authenticated','accept_student_bid(uuid,text,uuid)','execute') allowed")).rows[0].allowed, false)
  } finally { await db.close() }
})
