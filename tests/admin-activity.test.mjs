import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

test('admin activity enforces access, scopes owners and pages/filter records without leaking fields', async () => {
  let session = null
  let fail = false
  let exists = true
  const calls = []
  const rows = Array.from({length:45},(_,i)=>({id:String(i),user_email:'person@test',user_role:i%2?'tutor':'student',status:'completed',type:'credit',amount:100}))
  const deps = {
    'next/headers': { cookies: async()=>({get:()=>({value:'token'})}) },
    '@/lib/auth': { decrypt: async()=>session },
    '@/lib/admin-auth': { isAdminEmail: email=>email==='admin@test' },
    '@/lib/supabase': { supabaseAdmin:{from(table){
      const filters=[]; let start=0,end=19
      const query={
        select(...args){calls.push([table,'select',...args]); return query},
        eq(key,value){filters.push([key,value]);calls.push([table,'eq',key,value]);return query},
        order(...args){calls.push([table,'order',...args]);return query},
        range(a,b){start=a;end=b;return query},
        maybeSingle(){return query},
        then(resolve){
          const filtered=rows.filter(row=>filters.every(([key,value])=>row[key]===value))
          resolve(table==='users'?{data:exists?{id:'user'}:null,error:null}:{data:filtered.slice(start,end+1),count:filtered.length,error:fail?{message:'private database error'}:null})
        },
      };return query
    }}},
  }
  const api={}
  const source=readFileSync(new URL('../src/app/api/admin/users/activity/route.ts',import.meta.url),'utf8')
  new Function('require','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>deps[name],api)
  const get=params=>api.GET(new Request('https://test/api/admin/users/activity?email=person@test&'+params))
  assert.equal((await get('')).status,401)
  for(const user of [{email:'person@test',role:'student'},{email:'admin@test',role:'tutor'},{email:'fake@test',role:'admin'}]){
    session=user;assert.equal((await get('')).status,403)
  }
  assert.equal(calls.length,0)
  session={email:'admin@test',role:'admin'}
  for(const params of ['page=-1','page=1.5','kind=users','status=unknown','role=admin']) assert.equal((await get(params)).status,400)
  let response=await get('kind=transactions&page=1')
  assert.equal(response.headers.get('cache-control'),'no-store')
  let body=await response.json();assert.equal(body.count,45);assert.equal(body.records.length,20);assert.equal(body.records[0].id,'20')
  body=await (await get('kind=transactions&page=2')).json();assert.equal(body.records.length,5)
  body=await (await get('kind=transactions&role=tutor&status=completed')).json();assert.equal(body.count,22);assert.ok(body.records.every(row=>row.user_role==='tutor'))
  await get('kind=requests'); await get('kind=bids')
  assert.ok(calls.some(call=>call[0]==='problems'&&call[1]==='eq'&&call[2]==='student_email'&&call[3]==='person@test'))
  assert.ok(calls.some(call=>call[0]==='bids'&&call[1]==='eq'&&call[2]==='tutor_email'&&call[3]==='person@test'))
  assert.ok(calls.filter(call=>call[1]==='select').every(call=>!call[2].includes('*')&&!call[2].includes('password')))
  exists=false;assert.equal((await get('')).status,404)
  exists=true;fail=true;response=await get('');assert.equal(response.status,503);assert.ok(!(await response.text()).includes('private database'))
})
