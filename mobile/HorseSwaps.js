import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Dropdown from './Dropdown';
import { Alert } from './dialogs';
import { dateKey, weekLabel } from './overview';
const dateLabel=value=>value?value.split('-').reverse().join('.'):'';
const stateLabel={pending:'Venter på mottaker',awaiting_admin:'Venter på admin',approved:'Godkjent',declined:'Avslått',cancelled:'Trukket tilbake'};
const assignmentLabel=a=>`${dateLabel(a.assignment_date)} · ${a.horses?.name||'Hest'}`;
function Button({title,onPress,disabled,danger}){return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button,danger&&styles.danger,disabled&&{opacity:.5}]}><Text style={styles.buttonText}>{title}</Text></Pressable>;}
function Card({title,children}){return <View style={styles.card}><Text style={styles.title}>{title}</Text>{children}</View>;}
export default function HorseSwaps({supabase,stableId,userId,isAdmin}) {
 const [members,setMembers]=useState([]),[ownDays,setOwnDays]=useState([]),[otherDays,setOtherDays]=useState([]);
 const [mine,setMine]=useState([]),[adminRequests,setAdminRequests]=useState([]);
 const [fromId,setFromId]=useState(null),[toUser,setToUser]=useState(null),[toId,setToId]=useState(null);
 const [loading,setLoading]=useState(false),[working,setWorking]=useState(false),[error,setError]=useState(''),[otherError,setOtherError]=useState('');
 const [revision,setRevision]=useState(0);const request=useRef(0),saving=useRef(false);
 useEffect(()=>{load();const timer=setInterval(load,45000);return()=>{clearInterval(timer);request.current++;};},[userId,isAdmin]);
 useEffect(()=>{
  let live=true;setOtherDays([]);setOtherError('');if(!toUser)return;
  supabase.from('horse_assignments').select('*,horses(name)').eq('stable_id',stableId).eq('user_id',toUser).eq('is_cancelled',false).gte('assignment_date',dateKey()).order('assignment_date').then(({data,error})=>{if(!live)return;if(error)setOtherError('Kunne ikke hente den andres hestedager. Trykk Oppdater.');else{setOtherDays(data||[]);setToId(value=>(data||[]).some(a=>a.id===value)?value:null);}}).catch(()=>{if(live)setOtherError('Kunne ikke hente hestedager. Trykk Oppdater.');});
  return()=>{live=false;};
 },[toUser,revision]);
 async function load(){
  const id=++request.current;setLoading(true);setError('');
  try{
   const [m,a,r,p]=await Promise.all([
    supabase.from('memberships').select('user_id,profiles(full_name)').eq('stable_id',stableId).eq('active',true),
    supabase.from('horse_assignments').select('*,horses(name)').eq('stable_id',stableId).eq('user_id',userId).eq('is_cancelled',false).gte('assignment_date',dateKey()).order('assignment_date'),
    supabase.from('horse_swap_requests').select('*').eq('stable_id',stableId).or(`from_user.eq.${userId},to_user.eq.${userId}`).order('created_at',{ascending:false}).limit(100),
    isAdmin?supabase.from('horse_swap_requests').select('*').eq('stable_id',stableId).eq('status','awaiting_admin').order('created_at'):Promise.resolve({data:[]})
   ]);
   const failed=[m,a,r,p].find(x=>x.error);if(failed)throw failed.error;if(id!==request.current)return;
   setMembers(m.data||[]);setOwnDays(a.data||[]);setMine(r.data||[]);setAdminRequests(p.data||[]);
   setFromId(value=>(a.data||[]).some(day=>day.id===value)?value:null);
   setToUser(value=>(m.data||[]).some(person=>person.user_id===value)?value:null);setRevision(x=>x+1);
  }catch(e){if(id===request.current)setError('Kunne ikke oppdatere hestebytter. Prøv igjen.');}finally{if(id===request.current)setLoading(false);}
 }
 const from=ownDays.find(a=>a.id===fromId),to=otherDays.find(a=>a.id===toId);
 async function send(){
  if(!from||!to||!toUser||saving.current)return;saving.current=true;setWorking(true);
  try{const {error}=await supabase.from('horse_swap_requests').insert({stable_id:stableId,from_user:userId,to_user:toUser,from_assignment_id:from.id,to_assignment_id:to.id}).select('id').single();if(error)throw error;
   setFromId(null);setToUser(null);setToId(null);await load();Alert.alert('Forespørsel sendt','Den andre rytteren må godta. Deretter må admin godkjenne før hestedagene endres.');
  }catch(e){Alert.alert('Kunne ikke sende',e.code==='23505'?'Det finnes allerede en åpen forespørsel om disse hestedagene.':e.message);}finally{saving.current=false;setWorking(false);}
 }
 async function change(item,status){
  if(saving.current)return;saving.current=true;setWorking(true);
  try{const {error}=await supabase.from('horse_swap_requests').update({status}).eq('stable_id',stableId).eq('id',item.id).eq('status',item.status).select('id').single();if(error)throw error;await load();
   if(status==='approved')Alert.alert('Hestebyttet er gjennomført','Begge hestedager er oppdatert. Trening og oppgaver følger hesten og datoen.');
   else if(status==='awaiting_admin')Alert.alert('Godtatt','Byttet venter nå på admin. Hestedagene er uendret frem til godkjenning.');
  }catch(e){Alert.alert('Byttet ble ikke endret',e.message);await load();}finally{saving.current=false;setWorking(false);}
 }
 function confirmApprove(item){Alert.alert('Godkjenn hestebytte',`${item.from_name} overtar ${item.to_horse_name} ${dateLabel(item.to_snapshot.assignment_date)}. ${item.to_name} overtar ${item.from_horse_name} ${dateLabel(item.from_snapshot.assignment_date)}. Gjelder bare disse datoene.`,[{text:'Avbryt',style:'cancel'},{text:'Godkjenn byttet',onPress:()=>change(item,'approved')}]);}
 function summary(item,admin=false){return <View key={item.id} style={styles.item}>
  <Text style={styles.bold}>{item.from_name} ↔ {item.to_name}</Text>
  <Text style={styles.text}>{item.from_name} gir fra seg {item.from_horse_name} · {dateLabel(item.from_snapshot.assignment_date)}</Text>
  <Text style={styles.text}>{item.to_name} gir fra seg {item.to_horse_name} · {dateLabel(item.to_snapshot.assignment_date)}</Text>
  <Text style={styles.help}>Trening for {item.from_horse_name}: {item.from_snapshot.training_text||'Ikke beskrevet'}</Text>
  <Text style={styles.help}>Trening for {item.to_horse_name}: {item.to_snapshot.training_text||'Ikke beskrevet'}</Text>
  <Text style={styles.bold}>{stateLabel[item.status]}</Text>
  <View style={styles.row}>
   {admin?<><Button title="Godkjenn hestebytte" disabled={working} onPress={()=>confirmApprove(item)}/><Button title="Avslå" danger disabled={working} onPress={()=>change(item,'declined')}/></>:<>
    {item.to_user===userId&&item.status==='pending'&&<><Button title="Godta byttet" disabled={working} onPress={()=>change(item,'awaiting_admin')}/><Button title="Avslå" danger disabled={working} onPress={()=>change(item,'declined')}/></>}
    {item.to_user===userId&&item.status==='awaiting_admin'&&<Button title="Trekk tilbake godkjenning" danger disabled={working} onPress={()=>change(item,'declined')}/>}
    {item.from_user===userId&&['pending','awaiting_admin'].includes(item.status)&&<Button title="Trekk forespørselen tilbake" danger disabled={working} onPress={()=>change(item,'cancelled')}/>}
   </>}
  </View>
 </View>;}
 return <>
  <Card title="Bytt hest eller hestedag"><Text style={styles.text}>Velg din hestedag, hvem du vil spørre og den andres hestedag. Det kan være samme dato eller en annen dato. Begge må godta, og admin må godkjenne til slutt.</Text><Button title={loading?'Oppdaterer …':'Oppdater'} onPress={load} disabled={loading||working}/>{!!error&&<Text accessibilityRole="alert" style={styles.help}>{error}</Text>}</Card>
  {isAdmin&&<Card title="Hestebytter som venter på admin">{adminRequests.length?adminRequests.map(r=>summary(r,true)):<Text style={styles.help}>Ingen hestebytter venter på godkjenning.</Text>}</Card>}
  <Card title="Be om hestebytte">
   <Dropdown label="Hestedagen min" value={fromId} onChange={setFromId} options={ownDays.map(a=>({value:a.id,label:assignmentLabel(a)}))} placeholder="Velg dato og hest" disabled={working}/>
   {!ownDays.length&&<Text style={styles.help}>Du har ingen kommende hestedager å bytte bort. Be admin registrere en avtale først.</Text>}
   <Dropdown label="Hvem vil du bytte med?" value={toUser} onChange={value=>{setToId(null);setToUser(value);}} options={members.filter(m=>m.user_id!==userId).map(m=>({value:m.user_id,label:m.profiles?.full_name||'Fôrrytter'})).sort((a,b)=>a.label.localeCompare(b.label,'nb'))} disabled={working}/>
   {toUser&&<><Dropdown label="Hestedagen jeg ønsker i stedet" value={toId} onChange={setToId} options={otherDays.map(a=>({value:a.id,label:assignmentLabel(a)}))} placeholder="Velg den andres dato og hest" disabled={working}/>{!!otherError&&<Text style={styles.help}>{otherError}</Text>}{!otherDays.length&&!otherError&&<Text style={styles.help}>Ingen hestedager tilgjengelig i listen ennå.</Text>}</>}
   {from&&to&&<View style={styles.item}><Text style={styles.bold}>Dette ber du om</Text><Text style={styles.text}>Du gir fra deg {assignmentLabel(from)} ({weekLabel(from.assignment_date)}).</Text><Text style={styles.text}>Du overtar {assignmentLabel(to)} ({weekLabel(to.assignment_date)}).</Text></View>}
   <Text style={styles.help}>Byttet gjelder bare valgte datoer. Trening og ekstraoppgaver følger hesten/datoen, og fem standardoppgaver opprettes for hver rytter. Den faste helgeavtalen fortsetter som før. Dager med utførte oppgaver kan ikke byttes.</Text>
   <Button title={working?'Lagrer …':'Send bytteforespørsel'} disabled={working||!from||!to||!!error} onPress={send}/>
  </Card>
  <Card title="Mine hestebytter">{mine.length?mine.map(r=>summary(r)):<Text style={styles.help}>Ingen hestebytter sendt eller mottatt.</Text>}<Text style={styles.help}>Her vises de siste 100 forespørslene dine. Hestedagene endres først når status er Godkjent.</Text></Card>
 </>;
}
const styles=StyleSheet.create({card:{backgroundColor:'#fff',borderWidth:1,borderColor:'#ded9cf',borderRadius:15,padding:12,marginBottom:10},title:{fontSize:18,fontWeight:'800',color:'#283126',marginBottom:10},text:{fontSize:14,lineHeight:21,color:'#455443',marginBottom:8},help:{fontSize:12,lineHeight:18,color:'#6b746a',marginBottom:10},bold:{fontWeight:'700',color:'#283126',marginBottom:8},item:{padding:12,borderWidth:1,borderColor:'#e4e0d7',borderRadius:10,marginBottom:10},row:{flexDirection:'row',flexWrap:'wrap',gap:8},button:{backgroundColor:'#5f7652',padding:12,borderRadius:10,marginBottom:8},danger:{backgroundColor:'#9f3f37'},buttonText:{color:'#fff',fontWeight:'700'}});
