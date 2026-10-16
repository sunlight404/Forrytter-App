import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { deleteDirectMessage, directContacts, loadDirectInbox, loadDirectMessages, sendDirectMessage } from '../directMessages.js';
const stable='11111111-1111-4111-8111-111111111111', sender='22222222-2222-4222-8222-222222222222', peer='33333333-3333-4333-8333-333333333333', other='44444444-4444-4444-8444-444444444444', id='55555555-5555-4555-8555-555555555555';
const client = handler => createClient('https://chat-test.supabase.co','public-fixture-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:handler}});
const response = (data,status=200) => new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});

test('private sends target only the selected participant and never the group or board',async()=>{
  let calls=0;
  const draft={id,stable_id:stable,sender_id:sender,recipient_id:peer,body:' Hei privat! ',email:'ignored',created_at:'ignored'};
  const db=client(async(url,options)=>{
    calls++;assert.equal(new URL(url).pathname,'/rest/v1/direct_messages');assert.equal(options.method,'POST');
    const body=JSON.parse(options.body);assert.deepEqual(body,{id,stable_id:stable,sender_id:sender,recipient_id:peer,body:'Hei privat!'});
    return response({...body,created_at:'2026-10-16T10:00:00Z'},201);
  });
  assert.equal((await sendDirectMessage(db,draft)).recipient_id,peer);assert.equal(calls,1);
});

test('threads include both directions, stay in one stable, and paginate',async()=>{
  const db=client(async(url)=>{
    const u=new URL(url);assert.equal(u.searchParams.get('stable_id'),'eq.'+stable);
    assert.equal(u.searchParams.get('or'),`(and(sender_id.eq.${sender},recipient_id.eq.${peer}),and(sender_id.eq.${peer},recipient_id.eq.${sender}))`);
    assert.equal(u.searchParams.get('order'),'created_at.desc,id.desc');assert.equal(u.searchParams.get('limit'),'3');
    return response([{id:'new'},{id:'middle'},{id:'older'}]);
  });
  assert.deepEqual(await loadDirectMessages(db,stable,sender,peer,2),{items:[{id:'new'},{id:'middle'}],hasMore:true});
});

test('inbox loads named active members without contact details and limits history to the logged-in participant',async()=>{
  const paths=[];
  const db=client(async(url)=>{
    const u=new URL(url);paths.push(u.pathname);assert.equal(u.searchParams.get('stable_id'),'eq.'+stable);
    if(u.pathname==='/rest/v1/memberships'){
      assert.equal(u.searchParams.get('active'),'eq.true');assert.equal(u.searchParams.get('archived'),'eq.false');
      assert.equal(u.searchParams.get('select'),'user_id,profiles(full_name)');return response([{user_id:peer,profiles:{full_name:'Rytter'}}]);
    }
    assert.equal(u.searchParams.get('or'),`(sender_id.eq.${sender},recipient_id.eq.${sender})`);
    return response([{id,sender_id:peer,recipient_id:sender,body:'Hei',created_at:'2026-10-16T10:00:00Z'}]);
  });
  const contacts=await loadDirectInbox(db,stable,sender);assert.equal(contacts[0].name,'Rytter');assert.equal(contacts[0].latest.body,'Hei');assert.equal(contacts[0].active,true);assert.equal(paths.length,2);
});

test('contacts show incoming conversations first, include new members and preserve former conversations',()=>{
  const contacts=directContacts([{user_id:sender},{user_id:peer,profiles:{full_name:'Ada'}},{user_id:other,profiles:{full_name:'Bea'}}],[
    {id:'old',sender_id:sender,recipient_id:peer,body:'Eldre',created_at:'2026-10-15'},
    {id:'new',sender_id:peer,recipient_id:sender,body:'Ny',created_at:'2026-10-16'},
    {id:'former',sender_id:id,recipient_id:sender,body:'Historikk',created_at:'2026-10-14'},
    {id:'unrelated',sender_id:other,recipient_id:id,body:'Must not appear',created_at:'2026-10-17'},
  ],sender);
  assert.equal(contacts[0].id,peer);assert.equal(contacts[0].latest.body,'Ny');
  assert.equal(contacts.find(c=>c.id===other).latest,null);assert.equal(contacts.find(c=>c.id===id).active,false);assert.equal(contacts.length,3);
});

test('a lost send response can be retried without duplication, but another recipient is not accepted',async()=>{
  const draft={id,stable_id:stable,sender_id:sender,recipient_id:peer,body:'Hei'};let wrong=false;
  const db=client(async(url,options)=>options.method==='POST'?response({code:'23505'},409):response({...draft,recipient_id:wrong?other:peer}));
  assert.deepEqual(await sendDirectMessage(db,draft),draft);wrong=true;await assert.rejects(sendDirectMessage(db,draft));
});

test('members with identical names remain distinguishable without revealing contact details',()=>{
  const contacts=directContacts([{user_id:sender,profiles:{full_name:'Samme Navn'}},{user_id:peer,profiles:{full_name:'Samme Navn'}},{user_id:other,profiles:{full_name:'Samme Navn'}}],[],sender);
  assert.equal(new Set(contacts.map(contact=>contact.name)).size,2);
  assert(contacts.every(contact=>contact.duplicateName));
  assert(contacts[0].name.includes('profil '));
});

test('empty, oversized, self-addressed and injected recipient values never trigger a request',async()=>{
  let calls=0;const db=client(async()=>{calls++;throw Error('Unexpected request');});
  for(const changed of [{body:' \n '},{body:'x'.repeat(2001)},{recipient_id:sender},{recipient_id:peer+',sender_id.neq.x'}]) await assert.rejects(sendDirectMessage(db,{id,stable_id:stable,sender_id:sender,recipient_id:peer,body:'Hei',...changed}));
  await assert.rejects(loadDirectMessages(db,stable,sender,'not-a-uuid'));assert.equal(calls,0);
});

test('offline sends and denied deletions report failure for retry',async()=>{
  const offline=client(async()=>{throw Error('offline');});
  await assert.rejects(sendDirectMessage(offline,{id,stable_id:stable,sender_id:sender,recipient_id:peer,body:'Behold utkast'}));
  const db=client(async(url,options)=>{
    const u=new URL(url);assert.equal(u.pathname,'/rest/v1/direct_messages');assert.equal(options.method,'DELETE');assert.equal(u.searchParams.get('id'),'eq.'+id);assert.equal(u.searchParams.get('stable_id'),'eq.'+stable);
    return response({code:'PGRST116'},406);
  });
  await assert.rejects(deleteDirectMessage(db,stable,id));
});
