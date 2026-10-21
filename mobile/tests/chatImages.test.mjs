import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { chatImagePath, uploadChatImage, chatImageUrl, MAX_IMAGE_BYTES } from '../chatImages.js';
import { messageBody, sendCommunityMessage } from '../communityMessages.js';
import { sendDirectMessage } from '../directMessages.js';
const draft = { id:'11111111-1111-4111-8111-111111111111', stable_id:'22222222-2222-4222-8222-222222222222', sender_id:'33333333-3333-4333-8333-333333333333', recipient_id:'44444444-4444-4444-8444-444444444444', body:'' };
const path = chatImagePath(draft);
const response = (data, status = 200) => new Response(JSON.stringify(data), {status,headers:{'Content-Type':'application/json'}});
const client = handler => createClient('https://fixture.supabase.co','fixture-public-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:handler}});

test('image-only messages and captions are allowed; empty drafts and long captions are rejected', () => {
  assert.equal(messageBody('',path),''); assert.equal(messageBody(' Hei ',path),'Hei');
  assert.throws(() => messageBody('  ')); assert.throws(() => messageBody('a'.repeat(2001),path));
  assert.throws(() => chatImagePath({...draft,id:'../other'}));
});
test('image uploads use immutable private JPEG paths and ArrayBuffer on all platforms', async () => {
  const db = client(async (url,options) => {
    assert.equal(new URL(url).pathname,'/storage/v1/object/chat-images/'+path);
    assert.equal(options.method,'POST'); assert.ok(options.body instanceof ArrayBuffer);
    assert.equal(new Headers(options.headers).get('content-type'),'image/jpeg');
    assert.equal(new Headers(options.headers).get('x-upsert'),'false');
    return response({Key:'chat-images/'+path});
  });
  assert.equal(await uploadChatImage(db,draft,{base64:'/9j/2Q=='}),path);
});
test('lost upload replies can retry the same path; permissions and size failures stay failures', async () => {
  const duplicate = client(async () => response({statusCode:'409',error:'Duplicate',message:'exists'},409));
  assert.equal(await uploadChatImage(duplicate,draft,{base64:'/9j/2Q=='}),path);
  const denied = client(async () => response({statusCode:'403',error:'Forbidden',message:'denied'},403));
  await assert.rejects(uploadChatImage(denied,draft,{base64:'/9j/2Q=='}));
  await assert.rejects(uploadChatImage(denied,draft,{base64:''}));
  await assert.rejects(uploadChatImage(denied,draft,{base64:Buffer.alloc(MAX_IMAGE_BYTES+1).toString('base64')}));
});
test('viewing requests a short lived signed URL rather than a public URL', async () => {
  const db = client(async (url, options) => {
    assert.equal(new URL(url).pathname,'/storage/v1/object/sign/chat-images/'+path);
    assert.equal(JSON.parse(options.body).expiresIn,600);
    return response({signedURL:'/object/sign/chat-images/'+path+'?token=fixture'});
  });
  assert.match(await chatImageUrl(db,path),/token=fixture$/);
});
for (const [name,send,table] of [['group',sendCommunityMessage,'community_messages'],['private',sendDirectMessage,'direct_messages']]) {
  test(`${name} image-only send persists its path and duplicate checking includes the attachment`, async () => {
    const imageDraft = {...draft,image_path:path}; let retry=false;
    const db = client(async (url,options) => {
      assert.equal(new URL(url).pathname,'/rest/v1/'+table);
      if (options.method==='POST') {
        const body=JSON.parse(options.body); assert.equal(body.body,''); assert.equal(body.image_path,path);
        return retry ? response({code:'23505',message:'duplicate'},409) : response(body,201);
      }
      return response({...imageDraft,image_path:'another-image.jpg'});
    });
    assert.equal((await send(db,imageDraft)).image_path,path);
    retry=true; await assert.rejects(send(db,imageDraft));
  });
}
