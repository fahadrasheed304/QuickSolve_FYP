import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

test('only assigned tutor can review ended sessions, retries do not duplicate and averages are real',async()=>{
  const db=new PGlite()
  try{
    await db.exec("create role anon;create role authenticated;create role service_role;create table problems(id uuid primary key,student_email text,accepted_bid_id uuid,session_started_at timestamptz,session_ended_at timestamptz);create table bids(id uuid primary key,tutor_email text);")
    const sql=readFileSync(new URL('../supabase/migrations/202609300003_student_reviews.sql',import.meta.url),'utf8')
    await db.exec(sql);await db.exec(sql)
    const id='00000000-0000-0000-0000-000000000001'
    await db.query("insert into problems values($1,'student@test',$1,now(),null)",[id]);await db.query("insert into bids values($1,'tutor@test')",[id])
    const review=(rating=4,tutor='tutor@test')=>db.query("select submit_student_review($1,$2,$3,'Good participation')",[id,tutor,rating])
    await assert.rejects(review(),/started and ended/)
    await db.exec('update problems set session_ended_at=now()')
    await assert.rejects(review(4,'other@test'),/assigned tutor/)
    await assert.rejects(review(0),/1 to 5/)
    await review();await review()
    await assert.rejects(review(1),/already been rated/)
    const rows=(await db.query("select * from get_student_ratings(array['student@test','new@test'])")).rows
    assert.equal(rows.length,1);assert.equal(Number(rows[0].rating),4);assert.equal(Number(rows[0].review_count),1)
    const allowed=(await db.query("select has_function_privilege('authenticated','submit_student_review(uuid,text,integer,text)','execute') allowed")).rows[0].allowed
    assert.equal(allowed,false)
  }finally{await db.close()}
})
