import React,{useEffect,useState} from 'react';
import {View,Text,Pressable} from 'react-native';
const invoke=async(db,body)=>{const {data,error}=await db.functions.invoke('push-notifications',{body});if(error||data?.error)throw Error(data?.error||'Kunne ikke kontakte varseltjenesten. Prøv igjen.');return data;};
export async function disableDeviceNotifications(db){
 if(typeof navigator==='undefined'||!('serviceWorker' in navigator))return;
 const registration=await navigator.serviceWorker.getRegistration();
 const subscription=await registration?.pushManager?.getSubscription();
 if(subscription){await invoke(db,{action:'unsubscribe',endpoint:subscription.endpoint});await subscription.unsubscribe();}
}
export default function Notifications({supabase,stableId,userId}){
 const [enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[supported,setSupported]=useState(false);
 useEffect(()=>{let mounted=true;const ready=typeof window!=='undefined'&&'Notification' in window&&'serviceWorker' in navigator&&'PushManager' in window;setSupported(ready);
 if(ready)(async()=>{try{const r=await navigator.serviceWorker.getRegistration();const s=await r?.pushManager.getSubscription();if(!s)return;const {data,error}=await supabase.from('push_subscriptions').select('id').eq('endpoint',s.endpoint).eq('stable_id',stableId).eq('user_id',userId).maybeSingle();if(error)throw error;if(mounted)setEnabled(!!data&&Notification.permission==='granted');}catch{if(mounted)setMessage('Kunne ikke sjekke varselstatus. Prøv å aktivere varsler igjen.');}})();
 return()=>{mounted=false;};},[supabase,stableId,userId]);
 async function enable(){setBusy(true);setMessage('');try{
  const permission=await Notification.requestPermission();
  if(permission!=='granted')throw Error('Varsler er ikke tillatt. Tillat varsler for appen i telefonens eller nettleserens innstillinger.');
  const {publicKey}=await invoke(supabase,{action:'publicKey',stableId});
  const registration=await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('Lukk og åpne appen, og prøv igjen.')),15000))]);
  const bytes=Uint8Array.from(atob(publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
  const s=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
  await invoke(supabase,{action:'subscribe',stableId,subscription:s.toJSON()});setEnabled(true);setMessage('Varsler er aktivert på denne enheten. Send gjerne et testvarsel.');
 }catch(e){setMessage(e.message);}finally{setBusy(false);}}
 async function disable(){setBusy(true);try{await disableDeviceNotifications(supabase);setEnabled(false);setMessage('Varsler er slått av på denne enheten.');}catch(e){setMessage(e.message);}finally{setBusy(false);}}
 async function test(){setBusy(true);try{await invoke(supabase,{action:'test',stableId});setMessage('Testvarselet er bestilt. Det kan ta omtrent ett minutt.');}catch(e){setMessage(e.message);}finally{setBusy(false);}}
 const button=(title,action)=><Pressable accessibilityRole="button" disabled={busy} onPress={action} style={{backgroundColor:'#244b3a',padding:12,borderRadius:8,marginTop:10,opacity:busy?.5:1}}><Text style={{color:'white',fontWeight:'600'}}>{title}</Text></Pressable>;
 return <View style={{backgroundColor:'white',padding:16,borderRadius:14,marginBottom:14,gap:7}}><Text style={{fontSize:19,fontWeight:'700'}}>Varsler på denne enheten</Text><Text>Få varsel om hestedager, fôringer, bytteforespørsler og fellesbeskjeder.</Text>{supported?<><Text>{enabled?'Varsler er aktivert.':'Aktiver varsler på hver telefon og PC du bruker.'}</Text>{enabled?<>{button('Send testvarsel',test)}{button('Slå av varsler',disable)}</>:button(busy?'Aktiverer …':'Aktiver varsler',enable)}</>:<Text>På iPhone: åpne appen fra Hjem-skjerm (krever iOS 16.4 eller nyere). Legg den til via Del → Legg til på Hjem-skjerm i Safari. På PC: bruk en nettleser som støtter varsler, for eksempel Edge eller Chrome.</Text>}{!!message&&<Text accessibilityRole="alert">{message}</Text>}</View>;
}
