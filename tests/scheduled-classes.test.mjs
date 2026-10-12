import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID, createHash } from 'node:crypto'
import { AccessToken, WebhookReceiver } from 'livekit-server-sdk'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { PGlite } from '@electric-sql/pglite'

const sql=file=>readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8')
const require=createRequire(import.meta.url)
function moduleAt(file,deps){
  const exports={}
  const js=ts.transpileModule(readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  new Function('require','exports',js)(name=>Object.hasOwn(deps,name)?deps[name]:require(name),exports)
  return exports
}
async function fixture(){
  const db=new PGlite()
  await db.exec(`
    create role anon;create role authenticated;create role service_role;
    create table users(email text primary key,fullname text,sessions integer default 0);
    create table role_wallets(id uuid primary key default gen_random_uuid(),user_email text,role text,balance numeric default 0,updated_at timestamptz,unique(user_email,role));
    create table wallet_transactions(id uuid primary key default gen_random_uuid(),user_email text,user_role text,type text,amount numeric,description text,status text,created_at timestamptz default now());
    create table problems(id uuid primary key default gen_random_uuid(),student_email text,subject text default 'Physics',duration_min integer default 30,offer_price numeric default 500,status text default 'open',session_started_at timestamptz,session_ended_at timestamptz,extension_minutes integer default 0,created_at timestamptz default now());
    create table bids(id uuid primary key default gen_random_uuid(),problem_id uuid references problems(id),tutor_name text,tutor_email text,price integer,duration_min integer,status text default 'pending');
    create table tutor_profiles(fullname text,user_email text,subjects text[] default array['Physics'],verification_status text default 'verified',verification_stage text default 'verified',total_earnings numeric default 0,total_sessions integer default 0);
    create function get_or_create_wallet(text,text) returns void language sql as 'select';
    create function update_wallet_balance(text,text,numeric) returns void language sql as 'select';
    create table account_moderation(user_email text,status text,suspended_until timestamptz);
    create table tutor_conduct(tutor_email text,status text);
    create table email_alerts(id uuid primary key default gen_random_uuid(),event_key text unique,recipient_email text,subject text,message text,path text,
      status text not null default 'pending',attempts integer not null default 0,available_at timestamptz default now(),claimed_at timestamptz,claim_token uuid,created_at timestamptz default now());
    insert into users(email,fullname) values ('s1@test','Student One'),('s2@test','Student Two'),('s3@test','Student Three'),('poor@test','Student Poor'),('tutor@test','Tutor');
    insert into role_wallets(user_email,role,balance) values ('s1@test','student',10000),('s2@test','student',10000),('s3@test','student',10000),('poor@test','student',0),('tutor@test','tutor',0);
    insert into tutor_profiles(fullname,user_email) values ('Tutor','tutor@test');
  `)
  await db.exec(sql('202609210001_wallet_integrity.sql'))
  try { await db.exec(sql('202610120002_scheduled_classes.sql')) }
  catch(error){await db.close();delete error.query;throw error}
  return db
}
const create=async(db,hours=3,capacity=2)=>{
  const id=randomUUID()
  await db.query("select create_scheduled_class($1,'tutor@test','Physics','Newton laws','Grade 10','Worked examples',now()+$2*interval '1 hour',30,500,$3)",[id,hours,capacity])
  return id
}
const book=async(db,id,email='s1@test',request=randomUUID())=> (await db.query('select * from book_scheduled_class($1,$2,$3,true)',[id,email,request])).rows[0]
const balance=async(db,email='s1@test')=>Number((await db.query('select balance from role_wallets where user_email=$1',[email])).rows[0].balance)
async function backdate(db,id,minutes=31){
  await db.query("update scheduled_classes set starts_at=now()-$2*interval '1 minute',ends_at=now()-$2*interval '1 minute'+duration_min*interval '1 minute' where id=$1",[id,minutes])
}
async function tutorJoined(db,id,leave=false){
  const c=(await db.query('select * from scheduled_classes where id=$1',[id])).rows[0]
  await db.query("select record_scheduled_attendance($1,$2,$3,'tutor-sid','participant_joined',$4)",['join:'+id,id,id+':tutor',c.starts_at])
  if(leave)await db.query("select record_scheduled_attendance($1,$2,$3,'tutor-sid','participant_left',$4)",['leave:'+id,id,id+':tutor',new Date(Date.parse(c.starts_at)+1000).toISOString()])
}

test('scheduled class seats and wallet reservations are atomic, idempotent and enforce eligibility',async()=>{
  const db=await fixture()
  try{
    await db.exec(sql('202610120002_scheduled_classes.sql'))
    const id=await create(db)
    await assert.rejects(db.query("select create_scheduled_class($1,'tutor@test','Chemistry','Some topic','Grade 10','',now()+interval '6 hours',30,500,2)",[randomUUID()]),/verified subjects/)
    await assert.rejects(create(db),/overlaps/)
    const request=randomUUID()
    await assert.rejects(db.query('select book_scheduled_class($1,$2,$3,false)',[id,'s1@test',request]),/Accept the recording/)
    await assert.rejects(book(db,id,'poor@test'),/Insufficient/)
    assert.equal((await db.query('select count(*) from scheduled_class_bookings')).rows[0].count,0)
    const b=await book(db,id,'s1@test',request)
    await book(db,id,'s1@test',request);await book(db,id,'s1@test')
    assert.equal(await balance(db),9500)
    assert.equal((await db.query('select count(*) from scheduled_class_bookings')).rows[0].count,1)
    const attempts=await Promise.allSettled([book(db,id,'s2@test'),book(db,id,'s3@test')])
    assert.equal(attempts.filter(result=>result.status==='fulfilled').length,1)
    assert.equal((await db.query("select count(*) from scheduled_class_bookings where status='booked'")).rows[0].count,2)
    assert.equal((await db.query('select count(*) from wallet_transactions')).rows[0].count,2)
    await assert.rejects(db.query('select cancel_scheduled_booking($1,$2)',[b.id,'s2@test']),/Booking not found/)
    await assert.rejects(book(db,id,'tutor@test'),/own class/)
    const access=(await db.query("select has_function_privilege('authenticated','book_scheduled_class(uuid,text,uuid,boolean)','execute') a,has_table_privilege('anon','scheduled_class_bookings','select') b,has_function_privilege('service_role','book_scheduled_class(uuid,text,uuid,boolean)','execute') c")).rows[0]
    assert.deepEqual(access,{a:false,b:false,c:true})
  }finally{await db.close()}
})

test('early/late cancellation, tutor cancellation and no-show return the correct reserved money once',async()=>{
  const db=await fixture()
  try{
    const early=await create(db,3)
    const b=await book(db,early)
    await db.query("select cancel_scheduled_booking($1,'s1@test')",[b.id]);await db.query("select cancel_scheduled_booking($1,'s1@test')",[b.id])
    assert.equal(await balance(db),10000)
    assert.equal((await db.query('select payment_status from scheduled_class_bookings where id=$1',[b.id])).rows[0].payment_status,'refunded')
    const history=(await db.query("select scheduled_student_classes('s1@test','past',0) history")).rows[0].history
    assert.equal(history.count,1);assert.equal(history.classes[0].my_booking.status,'cancelled')
    assert.ok(!JSON.stringify(history).includes('tutor@test'));assert.ok(!JSON.stringify(history).includes('s1@test'))
    const replacement=await book(db,early)
    assert.notEqual(replacement.id,b.id)
    await db.query("select cancel_scheduled_class($1,'tutor@test','Tutor unavailable')",[early])
    assert.equal(await balance(db),10000)
    const late=await create(db,1)
    const lb=await book(db,late)
    await db.query("select cancel_scheduled_booking($1,'s1@test')",[lb.id])
    assert.equal(await balance(db),9500)
    assert.equal((await db.query('select payment_status from scheduled_class_bookings where id=$1',[lb.id])).rows[0].payment_status,'reserved')
    await backdate(db,late,11)
    await db.query('select scheduled_class_tick()');await db.query('select scheduled_class_tick()')
    assert.equal(await balance(db),10000)
    assert.equal((await db.query('select status from scheduled_classes where id=$1',[late])).rows[0].status,'cancelled')
    const restricted=await create(db,5)
    await book(db,restricted)
    await db.exec("insert into account_moderation values('tutor@test','banned',null)")
    await db.query('select scheduled_class_tick()')
    assert.equal(await balance(db),10000)
  }finally{await db.close()}
})

test('completed classes pay once after the dispute window; disputes and short attendance require admin review',async()=>{
  const db=await fixture()
  try{
    const id=await create(db)
    const b1=await book(db,id),b2=await book(db,id,'s2@test')
    await backdate(db,id);await tutorJoined(db,id)
    await db.query('select scheduled_class_tick()')
    const c=(await db.query('select * from scheduled_classes where id=$1',[id])).rows[0]
    assert.equal(c.status,'completed')
    assert.equal(await balance(db,'tutor@test'),0)
    await db.query("select dispute_scheduled_booking($1,'s2@test','The topic was not covered')",[b2.id])
    await db.exec("update scheduled_class_bookings set release_at=now()-interval '1 minute'")
    await db.query('select scheduled_class_tick()');await db.query('select scheduled_class_tick()')
    assert.equal(await balance(db,'tutor@test'),500)
    await assert.rejects(db.query("select resolve_scheduled_booking($1,'release','fake-admin@test','Evidence reviewed')",[b2.id]),/Administrator/)
    await db.query("select resolve_scheduled_booking($1,'refund','quicksolve.officials@gmail.com','Evidence confirms refund')",[b2.id])
    await db.query("select resolve_scheduled_booking($1,'refund','quicksolve.officials@gmail.com','Evidence confirms refund')",[b2.id])
    assert.equal(await balance(db,'s2@test'),10000)
    await assert.rejects(db.query("select resolve_scheduled_booking($1,'refund','quicksolve.officials@gmail.com','Conflict decision')",[b1.id]),/already resolved/)
    const short=await create(db,6)
    const shortBooking=await book(db,short)
    await backdate(db,short);await tutorJoined(db,short,true);await db.query('select scheduled_class_tick()')
    assert.equal((await db.query('select payment_status from scheduled_class_bookings where id=$1',[shortBooking.id])).rows[0].payment_status,'held')
    const summary=(await db.query("select scheduled_wallet_summary('tutor@test','tutor') summary")).rows[0].summary
    assert.equal(Number(summary.released),500);assert.equal(Number(summary.held),500)
    const studentSummary=(await db.query("select scheduled_wallet_summary('s2@test','student') summary")).rows[0].summary
    assert.equal(Number(studentSummary.refunded),500)
  }finally{await db.close()}
})

test('reminders deduplicate, private attendance identities work and recording windows start when available',async()=>{
  const db=await fixture()
  try{
    const id=await create(db,30),b=await book(db,id)
    await db.query("update scheduled_classes set starts_at=now()+interval '14 minutes',ends_at=now()+interval '44 minutes' where id=$1",[id])
    await db.query('select scheduled_class_tick()');await db.query('select scheduled_class_tick()')
    assert.equal((await db.query("select count(*) from email_alerts where event_key like '%reminder%' and recipient_email='s1@test'")).rows[0].count,1)
    await backdate(db,id)
    await tutorJoined(db,id)
    const cls=(await db.query('select starts_at from scheduled_classes where id=$1',[id])).rows[0]
    const eventId=randomUUID()
    await db.query("select record_scheduled_attendance($1,$2,$3,'student-sid','participant_joined',$4)",[eventId,id,b.id+':student',cls.starts_at])
    await db.query("select record_scheduled_attendance($1,$2,$3,'student-sid','participant_joined',$4)",[eventId,id,b.id+':student',cls.starts_at])
    assert.equal((await db.query('select count(*) from scheduled_class_attendance')).rows[0].count,2)
    assert.ok((await db.query('select joined_at from scheduled_class_bookings where id=$1',[b.id])).rows[0].joined_at)
    const key=`classes/${id}/${randomUUID()}.mp4`
    // Egress can finish before the scheduled clock; no ready-email until class completes.
    await db.query("select save_scheduled_recording('egress1',$1,$2,'ready',10)",[id,key])
    assert.equal((await db.query("select count(*) from email_alerts where event_key like '%recording:%'")).rows[0].count,0)
    await db.query('select scheduled_class_tick()')
    assert.equal((await db.query("select count(*) from email_alerts where event_key like '%recording:%'")).rows[0].count,1)
    const initial=(await db.query("select * from scheduled_class_recordings where egress_id='egress1'")).rows[0]
    await db.query("select save_scheduled_recording('egress1',$1,$2,'processing',11)",[id,key])
    await db.query("select save_scheduled_recording('egress1',$1,$2,'ready',12)",[id,key])
    const after=(await db.query("select * from scheduled_class_recordings where egress_id='egress1'")).rows[0]
    assert.equal(after.state,'ready');assert.equal(String(after.download_until),String(initial.download_until))
    assert.equal((await db.query("select claim_scheduled_recording_deletion('egress1') key")).rows[0].key,null)
    await db.query("select dispute_scheduled_booking($1,'s1@test','Review this class please')",[b.id])
    await db.exec("update scheduled_class_recordings set download_until=now()-interval '1 minute';update scheduled_classes set ended_at=now()-interval '21 minutes'")
    assert.equal((await db.query("select claim_scheduled_recording_deletion('egress1') key")).rows[0].key,null)
    await db.query("select resolve_scheduled_booking($1,'refund','quicksolve.officials@gmail.com','Refund after review')",[b.id])
    assert.equal((await db.query("select claim_scheduled_recording_deletion('egress1') key")).rows[0].key,key)
    await db.exec("select finish_scheduled_recording_deletion('egress1')")
    await db.query("select save_scheduled_recording('egress1',$1,$2,'ready',99)",[id,key])
    assert.equal((await db.query("select state from scheduled_class_recordings where egress_id='egress1'")).rows[0].state,'deleted')
    await assert.rejects(db.query("select save_scheduled_recording('egress2',$1,'other/file.mp4','ready',1)",[id]),/Invalid recording/)
  }finally{await db.close()}
})

test('join tokens require consent, an active paid booking and the actual tutor, using opaque identities',async()=>{
  const id=randomUUID(),bookingId=randomUUID()
  let account={email:'s1@test',role:'student'},booking={id:bookingId,status:'booked',payment_status:'reserved',student_name:'Student'}
  let c={id,tutor_name:'Tutor',capacity:2,status:'scheduled',starts_at:new Date(Date.now()+5*60000).toISOString(),ends_at:new Date(Date.now()+35*60000).toISOString()}
  const tokens=[],grants=[]
  let preparations=0
  const api=moduleAt('src/app/api/scheduled-classes/[id]/token/route.ts',{
    '@/lib/supabase':{supabaseAdmin:{rpc:async()=>({error:null})}},
    'livekit-server-sdk':{AccessToken:class{constructor(_key,_secret,options){tokens.push(options)}addGrant(grant){grants.push(grant)}async toJwt(){return'token'}}},
    '@/lib/scheduled-classes-server':{classAccount:async()=>account,classAccess:async()=>({c,booking}),classHeaders:{}},
    '@/lib/scheduled-classes':moduleAt('src/lib/scheduled-classes.ts',{}),
    '@/lib/scheduled-class-recordings':{prepareScheduledRoom:async()=>{preparations++}},
  })
  const post=consent=>api.POST(new Request('https://test/token',{method:'POST',body:JSON.stringify({consent})}),{params:Promise.resolve({id})})
  assert.equal((await post(false)).status,400)
  booking=null;assert.equal((await post(true)).status,403)
  booking={id:bookingId,status:'cancelled',payment_status:'refunded'};assert.equal((await post(true)).status,403)
  booking={id:bookingId,status:'booked',payment_status:'reserved',student_name:'Student'}
  assert.equal((await post(true)).status,200)
  assert.equal(tokens[0].identity,bookingId+':student');assert.equal(tokens[0].ttl,300);assert.equal(preparations,1)
  assert.equal(grants[0].room,'class-'+id)
  c={...c,status:'completed'};assert.equal((await post(true)).status,409)
  account=null;assert.equal((await post(true)).status,401)
})

test('student recording downloads enforce class/booking ownership and a bounded 15-minute signed URL',async()=>{
  const id=randomUUID()
  let account={email:'student@test',role:'student'},access={c:{status:'completed'},booking:{status:'booked'}}
  let recording={object_key:`classes/${id}/${randomUUID()}.mp4`,state:'ready',download_until:new Date(Date.now()+900000).toISOString()}
  const calls=[]
  const query={then(resolve){resolve({data:recording,error:null})}}
  for(const method of ['select','eq','maybeSingle'])query[method]=(...args)=>{calls.push([method,...args]);return query}
  const signed=[]
  const api=moduleAt('src/app/api/scheduled-classes/[id]/recordings/route.ts',{
    '@/lib/supabase':{supabaseAdmin:{from:()=>query}},
    '@/lib/scheduled-classes-server':{classAccount:async()=>account,classAccess:async()=>access,classHeaders:{}},
    '@/lib/scheduled-class-recordings':{classRecordingUrl:async(...args)=>{signed.push(args);return'https://signed.test'}},
  })
  const get=()=>api.GET(new Request('https://test/recordings?egressId=egress1'),{params:Promise.resolve({id})})
  assert.equal((await get()).status,200);assert.ok(signed[0][2]<=900);assert.equal(signed[0][3],true)
  assert.ok(calls.some(call=>call[0]==='eq'&&call[1]==='class_id'&&call[2]===id))
  recording={...recording,download_until:new Date(Date.now()-1000).toISOString()};assert.equal((await get()).status,410)
  access={...access,booking:{status:'cancelled'}};assert.equal((await get()).status,403)
  account={email:'tutor@test',role:'tutor'};assert.equal((await get()).status,403)
  account={email:'quicksolve.officials@gmail.com',role:'admin'};assert.equal((await get()).status,200)
  assert.equal(signed.at(-1)[3],false)
})

test('time-sensitive emails have priority and expired notices are never claimed',async()=>{
  const db=await fixture()
  try{
    const id=await create(db)
    await db.query("select scheduled_email('ordinary','s1@test','Update','Routine','student',$1)",[id])
    await db.query("select scheduled_email('urgent','s1@test','Recording','Ready','student',$1,now()+interval '15 minutes',100)",[id])
    await db.query("select scheduled_email('expired','s1@test','Reminder','Old','student',$1,now()-interval '1 minute',200)",[id])
    const claimed=(await db.query('select * from claim_email_alerts(1)')).rows
    assert.equal(claimed[0].subject,'Recording')
    assert.equal((await db.query("select status from email_alerts where subject='Reminder'")).rows[0].status,'expired')
    assert.equal((await db.query('select * from claim_email_alerts(10)')).rows.length,1)
  }finally{await db.close()}
})

test('scheduled classes prevent overlapping instant sessions and booking rolls back if its email cannot queue',async()=>{
  const db=await fixture()
  try{
    const id=await create(db,1)
    const p=(await db.query("insert into problems(student_email) values('s1@test') returning id")).rows[0].id
    await assert.rejects(db.query("insert into bids(problem_id,tutor_email,duration_min,status,price) values($1,'tutor@test',90,'pending',500)",[p]),/overlaps your scheduled/)
    const bid=(await db.query("insert into bids(problem_id,tutor_email,duration_min,status,price) values($1,'tutor@test',30,'pending',500) returning id",[p])).rows[0].id
    await db.query('update problems set accepted_bid_id=$2,status=\'accepted\',session_started_at=now() where id=$1',[p,bid])
    await assert.rejects(db.query("update problems set extension_minutes=40 where id=$1",[p]),/overlaps the tutor/)
    await db.exec(`create function fail_booking_mail() returns trigger language plpgsql as $$begin
      if new.subject='Class booking confirmed' then raise exception 'Email queue unavailable'; end if;return new;end$$;
      create trigger fail_booking_mail before insert on email_alerts for each row execute function fail_booking_mail();`)
    await assert.rejects(book(db,id),/Email queue unavailable/)
    assert.equal(await balance(db),10000)
    assert.equal((await db.query('select count(*) from scheduled_class_bookings')).rows[0].count,0)
    assert.equal((await db.query('select count(*) from wallet_transactions')).rows[0].count,0)
  }finally{await db.close()}
})

test('class API takes booking identity from the authenticated student and forbids tutor actions',async()=>{
  const id=randomUUID(),bookingId=randomUUID()
  let account={email:'owner@test',role:'student'}
  const calls=[]
  const server={classAccount:async()=>account,classAccess:async()=>({c:{id},booking:{id:bookingId}}),classHeaders:{},classRpcError:()=>Response.json({error:'failed'},{status:409})}
  const api=moduleAt('src/app/api/scheduled-classes/[id]/route.ts',{
    '@/lib/supabase':{supabaseAdmin:{rpc:async(name,args)=>{calls.push([name,args]);return{data:{},error:null}}}},
    '@/lib/scheduled-classes-server':server,
    '@/lib/scheduled-classes':moduleAt('src/lib/scheduled-classes.ts',{}),
    '@/lib/scheduled-class-recordings':{closeScheduledRoom:async()=>{}},
  })
  const post=body=>api.POST(new Request('https://test/class',{method:'POST',body:JSON.stringify(body)}),{params:Promise.resolve({id})})
  assert.equal((await post({action:'book',consent:true,requestId:bookingId,studentEmail:'victim@test',fee:0})).status,200)
  assert.deepEqual(calls[0],['book_scheduled_class',{p_class:id,p_student:'owner@test',p_request:bookingId,p_consent:true}])
  assert.equal((await post({action:'finish'})).status,403)
  assert.equal((await post({action:'cancel_booking',bookingId:randomUUID()})).status,404)
  account={email:'tutor@test',role:'tutor'}
  assert.equal((await post({action:'book',requestId:bookingId,consent:true})).status,403)
  account=null;assert.equal((await post({action:'book'})).status,401)
})

test('student details omit other students and financial totals; tutor sees a paginated private roster',async()=>{
  const id=randomUUID()
  let account={email:'student@test',role:'student'}
  const classRecord={id,tutor_email:'tutor@test',topic:'Physics',status:'scheduled'}
  const roster=[{id:randomUUID(),student_name:'Another Student',payment_status:'reserved',amount:500}]
  const calls=[]
  const queryFor=table=>{
    const query={then(resolve){resolve({data:table==='scheduled_class_bookings'?roster:[],count:roster.length,error:null})}}
    for(const method of ['select','eq','order','range','limit'])query[method]=(...args)=>{calls.push([table,method,...args]);return query}
    return query
  }
  const api=moduleAt('src/app/api/scheduled-classes/[id]/route.ts',{
    '@/lib/supabase':{supabaseAdmin:{from:queryFor,rpc:async()=>({data:{booked_count:1,reserved:500,released:0},error:null})}},
    '@/lib/scheduled-classes-server':{classAccount:async()=>account,classAccess:async()=>({c:classRecord,booking:{id:'mine',student_email:'student@test',student_name:'Me'}}),classHeaders:{}},
    '@/lib/scheduled-classes':moduleAt('src/lib/scheduled-classes.ts',{}),
    '@/lib/scheduled-class-recordings':{},
  })
  const get=()=>api.GET(new Request('https://test/class?rosterPage=1'),{params:Promise.resolve({id})})
  const student=await(await get()).json()
  assert.equal(student.roster,undefined);assert.equal(student.summary,undefined);assert.equal(student.class.tutor_email,undefined);assert.equal(student.booking.student_email,undefined)
  assert.ok(!calls.some(call=>call[0]==='scheduled_class_bookings'))
  account={email:'tutor@test',role:'tutor'}
  const tutor=await(await get()).json()
  assert.equal(tutor.roster[0].student_name,'Another Student');assert.equal(tutor.summary.reserved,500)
  assert.ok(calls.some(call=>call[0]==='scheduled_class_bookings'&&call[1]==='range'&&call[2]===25&&call[3]===49))
})

test('signed group webhooks record only authorized attendees and route group egress separately',async()=>{
  const before={key:process.env.LIVEKIT_API_KEY,secret:process.env.LIVEKIT_API_SECRET,url:process.env.NEXT_PUBLIC_LIVEKIT_URL}
  process.env.LIVEKIT_API_KEY='test-key';process.env.LIVEKIT_API_SECRET='testing-only-secret-for-group-webhooks';process.env.NEXT_PUBLIC_LIVEKIT_URL='wss://livekit.test'
  const id=randomUUID(),bookingId=randomUUID(),calls=[],removed=[]
  let restricted=false,saves=0
  class RestrictedError extends Error{}
  const query={then(resolve){resolve({data:{student_email:'s1@test',status:'booked',payment_status:'reserved'},error:null})}}
  for(const method of ['select','eq','maybeSingle'])query[method]=()=>query
  const api=moduleAt('src/app/api/livekit/webhook/route.ts',{
    'livekit-server-sdk':{WebhookReceiver,RoomServiceClient:class{async removeParticipant(...args){removed.push(args)}}},
    '@/lib/supabase':{supabaseAdmin:{from:()=>query,rpc:async(...args)=>{calls.push(args);return{error:null}}}},
    '@/lib/account-access':{assertAccountAccess:async email=>{assert.equal(email,'s1@test');if(restricted)throw new RestrictedError()},AccountRestrictedError:RestrictedError},
    '@/lib/recordings':{saveEgress:async()=>assert.fail('Group egress must not use one-to-one recording state')},
    '@/lib/scheduled-class-recordings':{classIdFromRoom:room=>room.slice(6),saveScheduledEgress:async()=>{saves++}},
  })
  async function request(event,invalid=false){
    const text=JSON.stringify(event)
    const at=new AccessToken(process.env.LIVEKIT_API_KEY,process.env.LIVEKIT_API_SECRET)
    at.sha256=createHash('sha256').update(text).digest('base64')
    return new Request('https://test/webhook',{method:'POST',body:text,headers:{authorization:invalid?'invalid':await at.toJwt()}})
  }
  try{
    const event={event:'participant_joined',id:'event-1',createdAt:String(Math.floor(Date.now()/1000)),room:{name:'class-'+id,sid:'RM_test'},participant:{identity:bookingId+':student',sid:'PA_student'}}
    assert.equal((await api.POST(await request(event,true))).status,401);assert.equal(calls.length,0)
    assert.equal((await api.POST(await request(event))).status,204)
    assert.equal(calls[0][0],'record_scheduled_attendance');assert.equal(calls[0][1].p_identity,bookingId+':student');assert.equal(calls[0][1].p_class,id)
    restricted=true
    assert.equal((await api.POST(await request({...event,id:'event-2'}))).status,204)
    assert.equal(calls.length,1);assert.deepEqual(removed[0],['class-'+id,bookingId+':student'])
    assert.equal((await api.POST(await request({event:'egress_ended',egressInfo:{egressId:'EG_group',roomName:'class-'+id,status:'EGRESS_COMPLETE'}}))).status,204)
    assert.equal(saves,1)
  }finally{
    for(const[key,value]of[['LIVEKIT_API_KEY',before.key],['LIVEKIT_API_SECRET',before.secret],['NEXT_PUBLIC_LIVEKIT_URL',before.url]]){if(value===undefined)delete process.env[key];else process.env[key]=value}
  }
})

test('class maintenance still queues reminders and settles payments when LiveKit is unavailable',async()=>{
  const calls=[]
  const lib=moduleAt('src/lib/scheduled-class-recordings.ts',{
    '@/lib/supabase':{supabaseAdmin:{rpc:async(name)=>{calls.push(name);return{data:[],error:null}}}},
    '@/lib/recordings':{egressClient:()=>{throw new Error('Offline')}},
    '@/lib/scheduled-classes':moduleAt('src/lib/scheduled-classes.ts',{}),
  })
  const before={key:process.env.LIVEKIT_API_KEY,secret:process.env.LIVEKIT_API_SECRET,url:process.env.NEXT_PUBLIC_LIVEKIT_URL}
  delete process.env.LIVEKIT_API_KEY;delete process.env.LIVEKIT_API_SECRET;delete process.env.NEXT_PUBLIC_LIVEKIT_URL
  try{
    const result=await lib.maintainScheduledClasses()
    assert.ok(calls.includes('scheduled_class_tick'))
    assert.ok(calls.includes('scheduled_recording_cleanup_candidates'))
    assert.ok(result.failures.includes('livekit-config'))
  }finally{
    for(const[key,value]of[['LIVEKIT_API_KEY',before.key],['LIVEKIT_API_SECRET',before.secret],['NEXT_PUBLIC_LIVEKIT_URL',before.url]]){if(value===undefined)delete process.env[key];else process.env[key]=value}
  }
})

test('missed departures are reconciled and later signed timestamps correct tutor attendance',async()=>{
  const db=await fixture()
  try{
    const id=await create(db);await book(db,id);await backdate(db,id);await tutorJoined(db,id)
    const c=(await db.query('select starts_at from scheduled_classes where id=$1',[id])).rows[0]
    const startedAt=new Date(c.starts_at).getTime()
    await db.query('select reconcile_scheduled_absence($1,array[]::text[],$2)',[id,new Date(startedAt+120000).toISOString()])
    assert.equal(Math.round(Number((await db.query('select scheduled_tutor_attendance_seconds($1) seconds',[id])).rows[0].seconds)),120)
    await db.query("select record_scheduled_attendance('late-left',$1,$2,'tutor-sid','participant_left',$3)",[id,id+':tutor',new Date(startedAt+60000).toISOString()])
    assert.equal(Math.round(Number((await db.query('select scheduled_tutor_attendance_seconds($1) seconds',[id])).rows[0].seconds)),60)
    await db.query('select scheduled_class_tick()')
    assert.equal((await db.query('select payment_status from scheduled_class_bookings where class_id=$1',[id])).rows[0].payment_status,'held')
  }finally{await db.close()}
})
