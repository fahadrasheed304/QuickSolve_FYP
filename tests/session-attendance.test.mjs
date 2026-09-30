import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { PGlite } from '@electric-sql/pglite'
const api={}
new Function('exports',ts.transpileModule(readFileSync(new URL('../src/lib/session-attendance.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(api)
const event=(sid,kind,seconds,role='student',room='room1')=>({event_id:`${sid}${kind}${seconds}`,participant_sid:sid,room_sid:room,identity:`person@test:${role}`,kind,occurred_at:new Date(seconds*1000).toISOString()})
test('attendance handles reconnects, overlaps, out-of-order events, room closure and missing evidence',()=>{
  const rows=[event('a','participant_left',60),event('a','participant_joined',0),event('b','participant_joined',40),event('b','participant_left',80),event('c','participant_joined',100),event('c','participant_left',120),event('d','participant_joined',20,'tutor'),event(null,'room_finished',130),event('e','participant_joined',140,'tutor','room2')]
  const [student,tutor]=api.summarizeAttendance(rows)
  assert.equal(student.seconds,100);assert.equal(student.connections,3);assert.equal(student.incomplete,false)
  assert.equal(tutor.seconds,110);assert.equal(tutor.incomplete,true)
  assert.equal(api.summarizeAttendance([])[0].tracked,false)
  assert.equal(api.summarizeAttendance([event('x','participant_left',10)])[0].incomplete,true)
})
test('attendance SQL ignores outsiders and deduplicates webhook retries',async()=>{
  const db=new PGlite()
  try{
    await db.exec("create role anon;create role authenticated;create role service_role;create table problems(id uuid primary key,student_email text,accepted_bid_id uuid);create table bids(id uuid primary key,tutor_email text);")
    const sql=readFileSync(new URL('../supabase/migrations/202609300002_session_attendance.sql',import.meta.url),'utf8')
    await db.exec(sql);await db.exec(sql)
    const id='00000000-0000-0000-0000-000000000001'
    await db.query('insert into problems values($1,$2,$1)',[id,'student@test']);await db.query('insert into bids values($1,$2)',[id,'tutor@test'])
    const save=(key,identity)=>db.query("select record_session_attendance($1,$2,'room','participant',$3,'participant_joined',now())",[key,id,identity])
    await save('1','student@test:student');await save('1','student@test:student');await save('2','outsider@test:tutor');await save('3','tutor@test:student');await save('4','tutor@test:tutor')
    assert.equal((await db.query('select count(*) from session_attendance_events')).rows[0].count,2)
    assert.equal((await db.query("select has_table_privilege('anon','session_attendance_events','select') allowed")).rows[0].allowed,false)
  }finally{await db.close()}
})
