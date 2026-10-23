import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { loadCommunityMessages, loadCommunityReplies, sendCommunityMessage } from '../communityMessages.js';
const stable='11111111-1111-4111-8111-111111111111', parent='22222222-2222-4222-8222-222222222222',sender='33333333-3333-4333-8333-333333333333';
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const client=fetch=>createClient('https://fixture.supabase.co','public-fixture-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch}});
test('root feed excludes comments and batches counts only for the visible page in its stable',async()=>{
  const db=client(async url=>{
    const u=new URL(url);assert.equal(u.searchParams.get('stable_id'),'eq.'+stable);
    if(u.pathname.endsWith('/community_reply_counts')){assert.equal(u.searchParams.get('parent_id'),'in.('+parent+')');return response([{parent_id:parent,reply_count:3}]);}
    assert.equal(u.searchParams.get('parent_id'),'is.null');return response([{id:parent},{id:'older'}]);
  });
  const page=await loadCommunityMessages(db,stable,1);assert.equal(page.hasMore,true);assert.equal(page.items[0].reply_count,3);
});
test('thread loader checks its parent and shows latest page in chronological order',async()=>{
  const db=client(async url=>{
    const u=new URL(url);assert.equal(u.searchParams.get('stable_id'),'eq.'+stable);
    if(u.searchParams.has('id')){assert.equal(u.searchParams.get('id'),'eq.'+parent);assert.equal(u.searchParams.get('parent_id'),'is.null');return response({id:parent,body:'Original'});}
    assert.equal(u.searchParams.get('parent_id'),'eq.'+parent);assert.equal(u.searchParams.get('limit'),'3');
    assert.equal(u.searchParams.get('order'),'created_at.desc,id.desc');return response([{id:'new'},{id:'middle'},{id:'old'}]);
  });
  const page=await loadCommunityReplies(db,stable,parent,2);assert.equal(page.parent.body,'Original');assert.deepEqual(page.items.map(x=>x.id),['middle','new']);assert.equal(page.hasMore,true);
});
test('deleted or unavailable roots stop the thread load instead of exposing orphan replies',async()=>{
  let calls=0;const db=client(async()=>{calls++;return response(null);});
  await assert.rejects(loadCommunityReplies(db,stable,parent),{code:'THREAD_DELETED'});assert.equal(calls,1);
});
test('comment sends preserve parent, caption and image, and retries cannot confirm another thread',async()=>{
  const draft={id:'44444444-4444-4444-8444-444444444444',stable_id:stable,sender_id:sender,parent_id:parent,body:'Svar',image_path:'fixture.jpg'};
  let retry=false;
  const db=client(async(url,options)=>{
    if(options.method==='POST') {assert.deepEqual(JSON.parse(options.body),draft);return retry?response({code:'23505'},409):response(draft,201);}
    return response({...draft,parent_id:'other-parent'});
  });
  assert.equal((await sendCommunityMessage(db,draft)).parent_id,parent);retry=true;await assert.rejects(sendCommunityMessage(db,draft));
});
