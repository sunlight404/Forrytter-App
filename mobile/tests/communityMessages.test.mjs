import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { CHAT_TABLE, deleteCommunityMessage, loadCommunityMessages, messageBody, messageId, sendCommunityMessage } from '../communityMessages.js';
const stable='11111111-1111-4111-8111-111111111111', sender='22222222-2222-4222-8222-222222222222';
function client(handler) {
  return createClient('https://chat-test.supabase.co', 'public-fixture-key', { auth: { persistSession:false, autoRefreshToken:false }, global: { fetch:handler } });
}
function response(data, status=200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type':'application/json' } }); }
test('blank and oversized messages are rejected while line breaks and literal text are preserved',()=>{
  assert.throws(()=>messageBody(' \n ')); assert.throws(()=>messageBody('x'.repeat(2001)));
  assert.equal(messageBody('  Hei\n<text>  '),'Hei\n<text>');
  assert.equal(messageBody('🐴'.repeat(2000)).length,4000);
  assert.match(messageId(),/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});
test('sending uses only community_messages and never sends a TV field or admin message',async()=>{
  let calls=0;const draft={id:messageId(),stable_id:stable,sender_id:sender,body:' Hei alle! '};
  const db=client(async(url,options)=>{
    calls++;assert.equal(new URL(url).pathname,'/rest/v1/'+CHAT_TABLE);assert.equal(options.method,'POST');
    assert.deepEqual(JSON.parse(options.body),{...draft,body:'Hei alle!'});
    return response({...draft,body:'Hei alle!',created_at:'2026-10-14T12:00:00Z'},201);
  });
  const saved=await sendCommunityMessage(db,draft);assert.equal(saved.body,'Hei alle!');assert.equal(calls,1);
});
test('the conversation stays scoped to its stable and loads one extra row for pagination',async()=>{
  const db=client(async(url)=>{
    const u=new URL(url);
    if(u.pathname==='/rest/v1/community_reply_counts') { assert.equal(u.searchParams.get('stable_id'),'eq.'+stable); return response([]); }
    assert.equal(u.pathname,'/rest/v1/community_messages');assert.equal(u.searchParams.get('stable_id'),'eq.'+stable);assert.equal(u.searchParams.get('parent_id'),'is.null');
    assert.equal(u.searchParams.get('order'),'created_at.desc,id.desc');assert.equal(u.searchParams.get('limit'),'3');
    return response([{id:'new'},{id:'middle'},{id:'older'}]);
  });
  const page=await loadCommunityMessages(db,stable,2);assert.deepEqual(page.items,[{id:'new',reply_count:0},{id:'middle',reply_count:0}]);assert.equal(page.hasMore,true);
});
test('retry after a lost insert response confirms the existing message without a duplicate',async()=>{
  const draft={id:messageId(),stable_id:stable,sender_id:sender,body:'Test'};let calls=0;
  const db=client(async(url,options)=>{
    calls++;if(options.method==='POST')return response({code:'23505',message:'duplicate key'},409);
    const u=new URL(url);assert.equal(u.searchParams.get('id'),'eq.'+draft.id);assert.equal(u.searchParams.get('stable_id'),'eq.'+stable);return response(draft);
  });
  assert.deepEqual(await sendCommunityMessage(db,draft),draft);assert.equal(calls,2);
});
test('a duplicate ID belonging to another message is not reported as a successful send',async()=>{
  const draft={id:messageId(),stable_id:stable,sender_id:sender,body:'Test'};
  const db=client(async(url,options)=>options.method==='POST'?response({code:'23505',message:'duplicate'},409):response({...draft,body:'Other message'}));
  await assert.rejects(sendCommunityMessage(db,draft));
});
test('network failures are reported for retry instead of treating a send as successful',async()=>{
  const db=client(async()=>{throw Error('offline');});
  await assert.rejects(sendCommunityMessage(db,{id:messageId(),stable_id:stable,sender_id:sender,body:'Keep my draft'}));
});
test('deleting is scoped to one message in the stable and requires a confirmed deletion',async()=>{
  const id=messageId();let empty=false;
  const db=client(async(url,options)=>{
    const u=new URL(url);assert.equal(options.method,'DELETE');assert.equal(u.pathname,'/rest/v1/community_messages');assert.equal(u.searchParams.get('stable_id'),'eq.'+stable);assert.equal(u.searchParams.get('id'),'eq.'+id);
    return empty?response({code:'PGRST116',message:'No row'},406):response({id});
  });
  await deleteCommunityMessage(db,stable,id);empty=true;await assert.rejects(deleteCommunityMessage(db,stable,id));
});

test('an existing phone-only account can log in by SMS and send to the group chat without an email',async()=>{
  const phone='+4712345678';
  const payload=Buffer.from(JSON.stringify({sub:sender,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
  const token='eyJhbGciOiJIUzI1NiJ9.'+payload+'.test-signature';
  const phoneUser={id:sender,phone,aud:'authenticated',role:'authenticated',created_at:'2026-01-01T00:00:00Z',app_metadata:{provider:'phone'},user_metadata:{}};
  const requests=[];
  const db=client(async(url,options)=>{
    const path=new URL(url).pathname,body=JSON.parse(options.body||'{}');requests.push(path);
    assert.equal(Object.hasOwn(body,'email'),false);
    if(path==='/auth/v1/otp'){assert.equal(body.phone,phone);return response({message_id:'fixture-only'});}
    if(path==='/auth/v1/verify'){
      assert.equal(body.phone,phone);assert.equal(body.type,'sms');
      return response({access_token:token,refresh_token:'test-refresh-token',token_type:'bearer',expires_in:3600,user:phoneUser});
    }
    assert.equal(path,'/rest/v1/community_messages');
    assert.equal(new Headers(options.headers).get('authorization'),'Bearer '+token);
    assert.equal(body.sender_id,sender);return response({...body,created_at:'2026-10-15T08:00:00Z'},201);
  });
  assert.equal((await db.auth.signInWithOtp({phone,options:{shouldCreateUser:false}})).error,null);
  const verified=await db.auth.verifyOtp({phone,token:'123456',type:'sms'});
  assert.equal(verified.error,null);assert.equal(verified.data.user.email,undefined);
  const saved=await sendCommunityMessage(db,{id:messageId(),stable_id:stable,sender_id:sender,body:'Hei fra telefonkontoen'});
  assert.equal(saved.sender_id,sender);assert.deepEqual(requests,['/auth/v1/otp','/auth/v1/verify','/rest/v1/community_messages']);
  db.auth.stopAutoRefresh();
});

