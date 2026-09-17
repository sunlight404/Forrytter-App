import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {authOptions} from '../authOptions.js';
const URL='https://session-test.supabase.co';
const key='public-test-key';
const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'test@example.invalid',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
const session=(expiresIn=3600)=>({access_token:'header.payload.signature',refresh_token:'fixture-refresh-token',token_type:'bearer',expires_in:expiresIn,expires_at:Math.floor(Date.now()/1000)+expiresIn,user});
function memory(){const rows=new Map();return {rows,getItem:async k=>rows.get(k)||null,setItem:async(k,v)=>{rows.set(k,v);},removeItem:async k=>{rows.delete(k);}};}
test('saved login is restored by a new client using the same storage',async()=>{
 const storage=memory();storage.rows.set('sb-session-test-auth-token',JSON.stringify(session()));
 const first=createClient(URL,key,{auth:authOptions(storage,false),global:{fetch:()=>{throw Error('No network needed');}}});
 assert.equal((await first.auth.getSession()).data.session.user.id,user.id);first.auth.stopAutoRefresh();
 const reopened=createClient(URL,key,{auth:authOptions(storage,false),global:{fetch:()=>{throw Error('No network needed');}}});
 assert.equal((await reopened.auth.getSession()).data.session.user.id,user.id);reopened.auth.stopAutoRefresh();
});
test('an expired saved session is refreshed and the replacement is persisted',async()=>{
 const storage=memory();storage.rows.set('sb-session-test-auth-token',JSON.stringify(session(-1)));let refreshed=false;
 const client=createClient(URL,key,{auth:authOptions(storage,false),global:{fetch:async(url,options)=>{assert.match(String(url),/grant_type=refresh_token/);assert.equal(JSON.parse(options.body).refresh_token,'fixture-refresh-token');refreshed=true;return new Response(JSON.stringify({...session(),refresh_token:'rotated-fixture'}),{status:200,headers:{'Content-Type':'application/json'}});}}});
 assert.equal((await client.auth.getSession()).data.session.user.id,user.id);assert.equal(refreshed,true);assert.equal(JSON.parse(storage.rows.get('sb-session-test-auth-token')).refresh_token,'rotated-fixture');client.auth.stopAutoRefresh();
});
test('password recovery requests target the published app without sending an email in this test',async()=>{
 const storage=memory();let destination;
 const client=createClient(URL,key,{auth:authOptions(storage,false),global:{fetch:async(url)=>{destination=new globalThis.URL(url);return new Response('{}',{status:200,headers:{'Content-Type':'application/json'}});}}});
 const {error}=await client.auth.resetPasswordForEmail('test@example.invalid',{redirectTo:'https://forrytter-stall-nordstjerna.expo.app/'});
 assert.equal(error,null);assert.equal(destination.pathname,'/auth/v1/recover');assert.equal(destination.searchParams.get('redirect_to'),'https://forrytter-stall-nordstjerna.expo.app/');client.auth.stopAutoRefresh();
});
