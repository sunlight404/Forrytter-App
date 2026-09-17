import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import webpush from 'npm:web-push@3.6.7';
const SITE='https://forrytter-stall-nordstjerna.expo.app';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const checked=async(p:any)=>{const {data,error}=await p;if(error)throw Error('Database request failed');return data;};
function equal(a:string,b:string){let v=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)v|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return v===0;}
function subscriptionValid(s:any){
 try{const u=new URL(s.endpoint);const h=u.hostname;
 const allowed=['fcm.googleapis.com','updates.push.services.mozilla.com','push.apple.com','notify.windows.com'].some(d=>h===d||h.endsWith('.'+d));
 const length=(v:string)=>/^[A-Za-z0-9_-]+={0,2}$/.test(v)?atob(v.replace(/-/g,'+').replace(/_/g,'/')).length:0;
 return allowed&&u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&s.endpoint.length<=2048&&length(s.keys.p256dh)===65&&length(s.keys.auth)===16;
 }catch{return false;}
}
Deno.serve(async req=>{
 const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':SITE,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
 const reply=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(req.method==='OPTIONS')return new Response(null,{headers});
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 try{
 const raw=await req.text();if(raw.length>8192)return reply({error:'Request too large'},413);
 let input;try{input=JSON.parse(raw);}catch{return reply({error:'Invalid JSON'},400);}
 let runtime=await checked(db.rpc('push_runtime_get'));
 if(input.action==='dispatch'){
  if(!equal(req.headers.get('x-push-worker')||'',runtime.workerToken))return reply({error:'Unauthorized'},401);
 }else{
  const token=(req.headers.get('Authorization')||'').replace(/^Bearer /i,'');
  const {data,error}=await db.auth.getUser(token);if(error||!data.user)return reply({error:'Unauthorized'},401);
  input.userId=data.user.id;
  if(input.action!=='unsubscribe'){
   const membership=await checked(db.from('memberships').select('user_id').eq('user_id',input.userId).eq('stable_id',input.stableId).eq('active',true).maybeSingle());
   if(!membership)return reply({error:'Ingen tilgang til stallen'},403);
  }
 }
 if(!runtime.publicKey){const keys=webpush.generateVAPIDKeys();await checked(db.rpc('push_runtime_init',{p_public:keys.publicKey,p_private:keys.privateKey}));runtime=await checked(db.rpc('push_runtime_get'));}
 if(input.action==='publicKey')return reply({publicKey:runtime.publicKey});
 if(input.action==='subscribe'){
  if(!subscriptionValid(input.subscription))return reply({error:'Ugyldig varselabonnement'},400);
  const s=input.subscription;
  await checked(db.from('push_subscriptions').upsert({user_id:input.userId,stable_id:input.stableId,endpoint:s.endpoint,subscription:{endpoint:s.endpoint,keys:{p256dh:s.keys.p256dh,auth:s.keys.auth}}},{onConflict:'endpoint'}));
  return reply({ok:true});
 }
 if(input.action==='unsubscribe'){
  if(typeof input.endpoint!=='string')return reply({error:'Missing endpoint'},400);
  await checked(db.from('push_subscriptions').delete().eq('endpoint',input.endpoint).eq('user_id',input.userId));return reply({ok:true});
 }
 if(input.action==='test'){await checked(db.rpc('push_test',{p_stable:input.stableId,p_user:input.userId}));return reply({ok:true});}
 if(input.action!=='dispatch')return reply({error:'Unknown action'},400);
 const jobs=await checked(db.rpc('push_claim',{p_limit:10}));
 await Promise.all(jobs.map(async(job:any)=>{
  let ok=true;
  try{
   const member=await checked(db.from('memberships').select('user_id').eq('user_id',job.user_id).eq('stable_id',job.stable_id).eq('active',true).maybeSingle());
   const subscriptions=member?await checked(db.from('push_subscriptions').select('id,subscription').eq('user_id',job.user_id).eq('stable_id',job.stable_id)):[];
   await Promise.all(subscriptions.map(async(row:any)=>{
    if(!subscriptionValid(row.subscription)){await checked(db.from('push_subscriptions').delete().eq('id',row.id));return;}
    const tab=['today','feeding','horseSwaps','messages'].includes(job.tab)?job.tab:'today';
    const details=webpush.generateRequestDetails(row.subscription,JSON.stringify({id:job.id,title:job.title,body:'Åpne Fôrrytter App for å se oppdateringen.',url:SITE+'/?tab='+tab}),{TTL:3600,vapidDetails:{subject:SITE,publicKey:runtime.publicKey,privateKey:runtime.privateKey}});
    const res=await fetch(details.endpoint,{method:details.method,headers:details.headers,body:details.body,signal:AbortSignal.timeout(10000),redirect:'error'});
    await res.body?.cancel();
    if(res.status===404||res.status===410)await checked(db.from('push_subscriptions').delete().eq('id',row.id));else if(!res.ok)ok=false;
   }));
  }catch{ok=false;}
  await checked(db.rpc('push_finish',{p_id:job.id,p_ok:ok,p_error:ok?null:'Push delivery failed'}));
 }));
 return reply({processed:jobs.length});
 }catch{return reply({error:'Kunne ikke fullføre varselhandlingen. Prøv igjen.'},500);}
});
