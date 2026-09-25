import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('wallet migration, retries, failures and session authorization', async (t) => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table users(email text primary key, sessions integer default 0);
      create table role_wallets(id uuid primary key default gen_random_uuid(), user_email text references users(email), role text, balance numeric default 0, updated_at timestamptz, unique(user_email, role));
      create table wallet_transactions(id uuid primary key default gen_random_uuid(), user_email text, user_role text, type text, amount numeric, description text, status text, created_at timestamptz default now());
      create table problems(id uuid primary key default gen_random_uuid(), student_email text references users(email), status text default 'open', created_at timestamptz default now());
      create table bids(id uuid primary key default gen_random_uuid(), problem_id uuid references problems(id), tutor_name text, price integer, status text default 'pending');
      create function get_or_create_wallet(text,text) returns void language sql as 'select';
      create function update_wallet_balance(text,text,numeric) returns void language sql as 'select';
      insert into users values ('student@example.test',0),('other@example.test',0);
      insert into role_wallets(user_email,role,balance) values ('student@example.test','student',1000),('other@example.test','student',0);
    `)
    const migration = await readFile(new URL('../supabase/migrations/202609210001_wallet_integrity.sql', import.meta.url), 'utf8')
    await db.exec(migration)
    await db.exec(migration) // Safe to reapply after an interrupted deployment.
    const balance = async () => Number((await db.query("select balance from role_wallets where user_email='student@example.test'")).rows[0].balance)
    const pay = (amount, type, reference, email = 'student@example.test', description = 'Test') => db.query(
      'select apply_wallet_transaction($1,$2,$3,$4,$5,$6,$7) result',
      [email, 'student', amount, type, 'stripe', description, reference])

    await t.test('credits and retries exactly once, including concurrent requests', async () => {
      await Promise.all([pay(100, 'credit', 'stripe:one'), pay(100, 'credit', 'stripe:one')])
      assert.equal(await balance(), 1100)
      await Promise.all([pay(100, 'credit', 'stripe:two'), pay(100, 'credit', 'stripe:three')])
      assert.equal(await balance(), 1300)
      assert.equal((await db.query('select count(*) from wallet_transactions')).rows[0].count, 3)
      assert.equal((await db.query('select method from wallet_transactions limit 1')).rows[0].method, 'stripe')
    })
    await t.test('rejects invalid amounts, overdrafts and reused references', async () => {
      for (const amount of [-1, 0, 100001, 1.001, null, 'NaN']) await assert.rejects(pay(amount, 'credit', 'bad'))
      await assert.rejects(pay(2000, 'debit', 'overdraft'), /Insufficient/)
      await assert.rejects(pay(100, 'credit', 'stripe:one', 'other@example.test'), /conflict/)
      await assert.rejects(pay(200, 'credit', 'stripe:one'), /conflict/)
      assert.equal(await balance(), 1300)
    })
    await t.test('rolls balance back if transaction insertion fails', async () => {
      await db.exec("alter table wallet_transactions add constraint test_failure check (description <> 'force-failure')")
      await assert.rejects(pay(100, 'credit', 'failed', 'student@example.test', 'force-failure'))
      assert.equal(await balance(), 1300)
      assert.equal((await db.query("select count(*) from wallet_transactions where payment_reference='failed'")).rows[0].count, 0)
    })
    await t.test('only the owner can settle an accepted bid; retries charge once', async () => {
      const problem = (await db.query("insert into problems(student_email) values ('student@example.test') returning id")).rows[0].id
      const bid = (await db.query("insert into bids(problem_id,tutor_name,price) values ($1,'Tutor',300) returning id", [problem])).rows[0].id
      await assert.rejects(db.query('select accept_student_bid($1,$2,$3)', [problem,'other@example.test',bid]))
      await db.query('select accept_student_bid($1,$2,$3)', [problem,'student@example.test',bid])
      await assert.rejects(db.query('select complete_student_session($1,$2)', [problem,'other@example.test']))
      await db.query('select complete_student_session($1,$2)', [problem,'student@example.test'])
      await db.query('select complete_student_session($1,$2)', [problem,'student@example.test'])
      assert.equal(await balance(), 1000)
      assert.equal((await db.query("select sessions from users where email='student@example.test'")).rows[0].sessions, 1)
    })
    await t.test('public API roles cannot directly change balances', async () => {
      const result = await db.query("select has_function_privilege('anon','apply_wallet_transaction(text,text,numeric,text,text,text,text)','execute') allowed")
      assert.equal(result.rows[0].allowed, false)
    })
    await t.test('review holds, delayed credits, duplicate retries and disputes are atomic', async () => {
      await db.exec("create table tutor_profiles(fullname text,user_email text,total_earnings numeric default 0,total_sessions integer default 0); insert into tutor_profiles(fullname,user_email) values ('Tutor','tutor@example.test'); insert into users values ('tutor@example.test',0); insert into role_wallets(user_email,role,balance) values ('tutor@example.test','tutor',0);")
      await db.exec(await readFile('supabase/migrations/202609220003_session_end.sql','utf8'))
      const sql = (await readFile('supabase/migrations/202609220004_session_payments.sql','utf8')).split('-- Supabase Cron')[0]
      await db.exec(sql)
      const make = async (rating, dispute = null) => {
        const id = (await db.query("insert into problems(student_email) values ('student@example.test') returning id")).rows[0].id
        const bid = (await db.query("insert into bids(problem_id,tutor_name,tutor_email,price) values ($1,'Tutor','tutor@example.test',200) returning id",[id])).rows[0].id
        await db.query('select accept_student_bid($1,$2,$3)',[id,'student@example.test',bid])
        await db.query('select submit_session_review($1,$2,$3,$4,$5)',[id,'student@example.test',rating,'Good',dispute])
        return id
      }
      const id = await make(5)
      await db.query("select submit_session_review($1,$2,5,'',null)",[id,'student@example.test'])
      assert.equal(await balance(),800)
      assert.equal((await db.query('select release_session_payments() n')).rows[0].n,0)
      const disputed = await make(5)
      await db.query("select submit_session_review($1,$2,5,'','Technical issues')",[disputed,'student@example.test'])
      await make(2)
      await db.exec("update session_payments set release_at=now()-interval '1 minute'")
      assert.equal((await db.query('select release_session_payments() n')).rows[0].n,1)
      assert.equal((await db.query('select release_session_payments() n')).rows[0].n,0)
      assert.equal(Number((await db.query("select balance from role_wallets where user_email='tutor@example.test'")).rows[0].balance),200)
      assert.equal((await db.query("select count(*) from session_payments where status='held'")).rows[0].count,2)
      await assert.rejects(db.query("select submit_session_review($1,$2,5,'','late')",[id,'student@example.test']),/already released/)
    })
  } finally {
    await db.close()
  }
})
