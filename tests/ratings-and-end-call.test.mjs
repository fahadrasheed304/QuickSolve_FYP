import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import ts from 'typescript'

test('video footer end button uses server action without triggering local disconnect', async () => {
  const source = readFileSync(new URL('../src/components/livekit/video-room.tsx',import.meta.url),'utf8')
  const js = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText
  const makeNode = (type,props) => ({type,props})
  let index=0, ends=0
  const dependencies = {
    'react/jsx-runtime': {jsx:makeNode,jsxs:makeNode},
    react: {useEffect:()=>{},useState:()=>[['token',null,'wss://test',0,true][index++],()=>{}]},
    '@/stores/session-store': {}, '@livekit/components-styles': {},
    '@livekit/components-react': {LiveKitRoom:'room',VideoConference:'conference'},
  }
  const api={}
  new Function('require','exports',js)(name=>dependencies[name],api)
  const previousElement = globalThis.Element
  class Target { constructor(matches){this.matches=matches} closest(selector){ assert.equal(selector,'.lk-disconnect-button'); return this.matches } }
  globalThis.Element=Target
  try {
    for (const isEnding of [false,true]) {
      index=0
      const tree=api.default({roomName:'session-test',isEnding,onEndSession:async()=>{ends++}})
      const conference=tree.props.children.props.children.find(child=>child.type==='conference')
      let prevented=0, stopped=0
      const event=matches=>({target:new Target(matches),preventDefault:()=>prevented++,stopPropagation:()=>stopped++})
      conference.props.onClickCapture(event(false))
      assert.equal(prevented,0)
      conference.props.onClickCapture(event(true))
      assert.equal(prevented,1)
      assert.equal(stopped,1)
    }
    assert.equal(ends,1)
  } finally {
    if(previousElement===undefined) delete globalThis.Element
    else globalThis.Element=previousElement
  }
})

test('ratings include low/held reviews, exclude unrated disputes, isolate tutor and preserve records', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table session_payments(problem_id integer primary key,tutor_email text,rating integer,status text);
      insert into session_payments values (1,'tutor@test',5,'released'),(2,'tutor@test',1,'held'),(3,'tutor@test',0,'held'),(4,'other@test',4,'pending');`)
    const sql = readFileSync(new URL('../supabase/migrations/202609250002_tutor_ratings.sql',import.meta.url),'utf8')
    await db.exec(sql)
    await db.exec(sql)
    const rating = async email => (await db.query('select get_tutor_rating($1) result',[email])).rows[0].result
    assert.deepEqual(await rating(' Tutor@Test '), { rating:3, review_count:2 })
    assert.deepEqual(await rating('new@test'), { rating:null, review_count:0 })
    assert.deepEqual(await rating('other@test'), { rating:4, review_count:1 })
    assert.equal((await db.query('select count(*) n from session_payments')).rows[0].n,4)
    assert.equal((await db.query("select has_function_privilege('anon','get_tutor_rating(text)','execute') allowed")).rows[0].allowed,false)
  } finally { await db.close() }
})

test('shared end action prevents duplicate requests and keeps call open after failure for retry', async () => {
  const source = readFileSync(new URL('../src/hooks/use-end-session.ts',import.meta.url),'utf8')
  const js = ts.transpileModule(source,{ compilerOptions:{module:ts.ModuleKind.CommonJS} }).outputText
  const api = {}, errors = [], busy = []
  const dependencies = {
    react: { useRef: value => ({current:value}), useState: () => [false, value => busy.push(value)], useCallback: fn => fn },
    '@/lib/toast': { notifyError: message => errors.push(message) },
  }
  const originalFetch = globalThis.fetch
  let resolve, calls=0, closed=0
  try {
    globalThis.fetch = async (url,options) => {
      calls++
      assert.equal(url,'/api/sessions/state?problemId=abc')
      assert.equal(options.method,'POST')
      return new Promise(done => { resolve=done })
    }
    new Function('require','exports',js)(name => dependencies[name],api)
    const {endCall} = api.useEndSession('session-abc', () => closed++)
    const first = endCall()
    await endCall()
    assert.equal(calls,1)
    resolve({ok:false}); await first
    assert.equal(closed,0)
    assert.equal(errors.length,1)
    const retry = endCall()
    resolve({ok:true}); await retry
    assert.equal(closed,1)
    assert.equal(calls,2)
    assert.deepEqual(busy,[true,false,true,false])
  } finally { globalThis.fetch=originalFetch }
})
