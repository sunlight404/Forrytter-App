import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { heartSummary, heartTargets, loadMessageHearts, setMessageHeart } from '../messageHearts.js';
const id='11111111-1111-4111-8111-111111111111', user='22222222-2222-4222-8222-222222222222', board='33333333-3333-4333-8333-333333333333', other='44444444-4444-4444-8444-444444444444';
const response=(data,status=200)=>new Response(data===null?null:JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const client=handler=>createClient('https://chat-test.supabase.co','public-fixture-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:handler}});

test('imported board posts share one heart target across the group chat and board',()=>{
  const copy=heartTargets('community',[{id,board_message_id:board}])[0];
  const original=heartTargets('board',[{id:board}])[0];
  assert.equal(copy.key,original.key);assert.equal(copy.id,board);assert.equal(copy.messageId,id);
  assert.equal(heartTargets('community',[{id}])[0].column,'community_message_id');
  assert.equal(heartTargets('direct',[{id,board_message_id:board}])[0].column,'direct_message_id');
  assert.throws(()=>heartTargets('unknown',[{id}]));assert.throws(()=>heartTargets('direct',[{id:'bad,id.eq.all'}]));
});

test('loading batches hearts by target, returns names and makes no requests for an empty list',async()=>{
  const calls=[];
  const db=client(async(url)=>{
    const u=new URL(url);calls.push(u);assert.equal(u.pathname,'/rest/v1/message_reactions');
    assert(u.searchParams.get('select').includes('reactor:profiles!message_reactions_user_id_fkey(full_name)'));
    const isBoard=u.searchParams.has('board_message_id');
    return response([{id:'reaction',user_id:user,[isBoard?'board_message_id':'community_message_id']:isBoard?board:id,reactor:{full_name:'Rytter'}}]);
  });
  assert.deepEqual(await loadMessageHearts(db,[]),{});assert.equal(calls.length,0);
  const result=await loadMessageHearts(db,heartTargets('community',[{id},{id:other,board_message_id:board}]));
  assert.equal(calls.length,2);assert.equal(result['board:'+board][0].reactor.full_name,'Rytter');assert.equal(result['community:'+id].length,1);
});

test('large history pages are split into bounded requests instead of an oversized URL',async()=>{
  let calls=0;
  const db=client(async(url)=>{calls++;const u=new URL(url);assert(u.searchParams.get('community_message_id').split(',').length<=50);return response([]);});
  const messages=Array.from({length:51},(_,i)=>({id:`11111111-1111-4111-8111-${String(i).padStart(12,'0')}`}));
  await loadMessageHearts(db,heartTargets('community',messages));assert.equal(calls,2);
});

test('giving and removing a heart write only the selected target and the current user',async()=>{
  const target=heartTargets('direct',[{id}])[0];let stored=false;
  const db=client(async(url,options)=>{
    const u=new URL(url);assert.equal(u.pathname,'/rest/v1/message_reactions');
    if(options.method==='POST'){assert.deepEqual(JSON.parse(options.body),{direct_message_id:id,user_id:user});stored=true;return response(null,201);}
    assert.equal(options.method,'DELETE');assert.equal(u.searchParams.get('direct_message_id'),'eq.'+id);assert.equal(u.searchParams.get('user_id'),'eq.'+user);stored=false;return response(null,204);
  });
  await setMessageHeart(db,target,user,true);assert.equal(stored,true);
  await setMessageHeart(db,target,user,false);assert.equal(stored,false);
  await setMessageHeart(db,target,user,false);assert.equal(stored,false);
});

test('a duplicate insert is confirmed as the same user heart and does not add a second heart',async()=>{
  const target=heartTargets('community',[{id}])[0];let calls=0,missing=false;
  const db=client(async(url,options)=>{
    calls++;if(options.method==='POST')return response({code:'23505'},409);
    const u=new URL(url);assert.equal(u.searchParams.get('community_message_id'),'eq.'+id);assert.equal(u.searchParams.get('user_id'),'eq.'+user);
    return response(missing?null:{id:'existing-heart'});
  });
  await setMessageHeart(db,target,user,true);assert.equal(calls,2);
  missing=true;await assert.rejects(setMessageHeart(db,target,user,true));
});

test('denied reads and failed writes remain errors instead of showing a successful acknowledgement',async()=>{
  const denied=client(async()=>response({code:'42501'},403));
  await assert.rejects(loadMessageHearts(denied,heartTargets('direct',[{id}])));
  await assert.rejects(setMessageHeart(denied,heartTargets('direct',[{id}])[0],user,true));
  await assert.rejects(setMessageHeart(denied,heartTargets('direct',[{id}])[0],user,false));
  const offline=client(async()=>{throw Error('offline');});
  await assert.rejects(setMessageHeart(offline,heartTargets('board',[{id}])[0],user,true));
});

test('counts and own-heart state use distinct people and duplicate names are distinguishable',()=>{
  const summary=heartSummary([{user_id:user,reactor:{full_name:'Meg'}},{user_id:user,reactor:{full_name:'Meg'}},{user_id:id,reactor:{full_name:'Ada'}},{user_id:other,reactor:{full_name:'Ada'}}],user);
  assert.equal(summary.count,3);assert.equal(summary.own,true);assert(summary.names.includes('Deg'));
  assert.equal(new Set(summary.names).size,3);assert(summary.names.some(name=>name.includes('profil ')));
  assert.deepEqual(heartSummary([],user),{count:0,own:false,names:[]});
});
