import 'react-native-url-polyfill/auto';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cffaswmpbllyqrnikelf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_P7zccZ0hlS7KfTvQLgcjYQ_uxQkF1hM';
const STABLE_ID = '67d21b8e-a592-479a-b7c6-2157055e6c03';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

const localDate = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const normalizePhone = value => {
  const raw = value.trim();
  if (!raw) return '';
  if (raw.startsWith('+')) return `+${raw.slice(1).replace(/\D/g, '')}`;
  if (raw.startsWith('00')) return `+${raw.slice(2).replace(/\D/g, '')}`;
  const digits = raw.replace(/\D/g, '');
  return digits.startsWith('47') ? `+${digits}` : `+47${digits}`;
};

const Btn = ({ title, onPress, secondary, danger, disabled }) => (
  <Pressable disabled={disabled} onPress={onPress} style={[styles.btn, secondary && styles.btnSecondary, danger && styles.btnDanger, disabled && styles.disabled]}>
    <Text style={[styles.btnText, secondary && styles.btnSecondaryText, danger && styles.btnDangerText]}>{title}</Text>
  </Pressable>
);

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [membership, setMembership] = useState(null);
  const [tab, setTab] = useState('today');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) { setMembership(null); return; }
    loadMembership();
  }, [session, refreshKey]);

  async function loadMembership() {
    const { data } = await supabase.from('memberships').select('*').eq('user_id', session.user.id).eq('stable_id', STABLE_ID).eq('active', true).maybeSingle();
    setMembership(data || null);
    if (!data) {
      await supabase.from('join_requests').upsert({ stable_id: STABLE_ID, user_id: session.user.id, status: 'pending' }, { onConflict: 'stable_id,user_id', ignoreDuplicates: true });
    }
  }

  if (loading) return <Center text="Starter Fôrrytter App …" />;
  if (!session) return <AuthScreen />;
  if (!membership) return <WaitingScreen identifier={session.user.email || session.user.phone || 'Ny bruker'} onRefresh={() => setRefreshKey(x => x + 1)} onLogout={() => supabase.auth.signOut()} />;

  const isAdmin = membership.role === 'owner' || membership.role === 'admin';
  const tabs = isAdmin ? ['today','feeding','messages','admin'] : ['today','feeding','messages'];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <View><Text style={styles.title}>Fôrrytter App</Text><Text style={styles.muted}>Stall Nordstjerna · {membership.role === 'owner' ? 'Eier' : membership.role === 'admin' ? 'Admin' : 'Fôrrytter'}</Text></View>
        <Btn title="Logg ut" secondary onPress={() => supabase.auth.signOut()} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {tab === 'today' && <TodayScreen userId={session.user.id} />}
        {tab === 'feeding' && <FeedingScreen userId={session.user.id} />}
        {tab === 'messages' && <MessagesScreen />}
        {tab === 'admin' && isAdmin && <AdminScreen currentUserId={session.user.id} role={membership.role} />}
      </ScrollView>
      <View style={styles.nav}>
        {tabs.map(t => <Pressable key={t} onPress={() => setTab(t)} style={[styles.navBtn, tab===t && styles.navActive]}><Text style={styles.navText}>{({today:'I dag',feeding:'Fôring',messages:'Beskjeder',admin:'Admin'})[t]}</Text></Pressable>)}
      </View>
    </SafeAreaView>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState('login');
  const [method, setMethod] = useState('email');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [smsSent, setSmsSent] = useState(false);
  const [smsPhone, setSmsPhone] = useState('');
  const [busy, setBusy] = useState(false);

  function changeMethod(next) {
    setMethod(next);
    setSmsSent(false);
    setCode('');
  }

  async function submitEmail() {
    if (!email.trim() || !password) return Alert.alert('Mangler informasjon', 'Fyll inn e-post og passord.');
    if (mode==='signup' && !name.trim()) return Alert.alert('Mangler navn', 'Skriv inn navnet ditt.');
    setBusy(true);
    const result = mode==='login'
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: name.trim() } } });
    setBusy(false);
    if (result.error) return Alert.alert('Kunne ikke fortsette', result.error.message);
    if (mode==='signup' && !result.data.session) Alert.alert('Sjekk e-posten din', 'Bekreft e-postadressen, og logg deretter inn.');
  }

  async function sendSms() {
    const normalized = normalizePhone(phone);
    if (normalized.length < 10) return Alert.alert('Ugyldig nummer', 'Skriv inn et gyldig telefonnummer.');
    if (mode==='signup' && !name.trim()) return Alert.alert('Mangler navn', 'Skriv inn navnet ditt.');
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      phone: normalized,
      options: { shouldCreateUser: mode==='signup', data: mode==='signup' ? { full_name: name.trim() } : undefined }
    });
    setBusy(false);
    if (error) return Alert.alert('Kunne ikke sende SMS', error.message);
    setSmsPhone(normalized);
    setSmsSent(true);
    Alert.alert('Kode sendt', `Vi har sendt en kode til ${normalized}.`);
  }

  async function verifySms() {
    if (!code.trim()) return Alert.alert('Mangler kode', 'Skriv inn koden du fikk på SMS.');
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ phone: smsPhone, token: code.trim(), type: 'sms' });
    setBusy(false);
    if (error) return Alert.alert('Feil kode', error.message);
  }

  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.authWrap}><Text style={styles.logo}>🐴</Text><Text style={styles.bigTitle}>Fôrrytter App</Text><Text style={styles.centerMuted}>Stall Nordstjerna</Text><View style={styles.card}>
    <View style={styles.segment}><Btn title="Logg inn" onPress={() => {setMode('login');setSmsSent(false);}} secondary={mode!=='login'} /><Btn title="Ny bruker" onPress={() => {setMode('signup');setSmsSent(false);}} secondary={mode!=='signup'} /></View>
    <Text style={styles.label}>Velg innlogging</Text>
    <View style={styles.segment}><Btn title="E-post" onPress={() => changeMethod('email')} secondary={method!=='email'} /><Btn title="Telefon" onPress={() => changeMethod('phone')} secondary={method!=='phone'} /></View>
    {mode==='signup' && <Field label="Fullt navn" value={name} onChangeText={setName} />}
    {method==='email' ? <>
      <Field label="E-post" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <Field label="Passord" value={password} onChangeText={setPassword} secureTextEntry />
      <Btn title={busy ? 'Vent …' : mode==='login' ? 'Logg inn' : 'Opprett bruker'} onPress={submitEmail} disabled={busy} />
    </> : <>
      <Field label="Telefonnummer" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="f.eks. 99 99 99 99" />
      {!smsSent ? <Btn title={busy ? 'Sender …' : 'Send kode på SMS'} onPress={sendSms} disabled={busy} /> : <>
        <Field label="Kode fra SMS" value={code} onChangeText={setCode} keyboardType="number-pad" />
        <Btn title={busy ? 'Sjekker …' : mode==='login' ? 'Logg inn med kode' : 'Bekreft og opprett bruker'} onPress={verifySms} disabled={busy} />
        <View style={{marginTop:8}}><Btn title="Send ny kode" secondary onPress={sendSms} disabled={busy} /></View>
      </>}
      <Text style={styles.help}>Norske nummer kan skrives uten +47. Appen legger til landskode automatisk.</Text>
    </>}
    {mode==='signup' && <Text style={styles.help}>Nye brukere får ikke admin-tilgang. De må godkjennes av eier/admin før de får tilgang til stallen.</Text>}
  </View></ScrollView></SafeAreaView>;
}

function WaitingScreen({ identifier, onRefresh, onLogout }) {
  return <SafeAreaView style={styles.safe}><View style={styles.centerBox}><Text style={styles.logo}>🐴</Text><Text style={styles.bigTitle}>Venter på godkjenning</Text><Text style={styles.centerMuted}>{identifier}</Text><Text style={styles.helpCenter}>Kontoen er opprettet, men har ikke tilgang til Stall Nordstjerna ennå. Eier eller admin må godkjenne den.</Text><Btn title="Sjekk på nytt" onPress={onRefresh} /><Btn title="Logg ut" secondary onPress={onLogout} /></View></SafeAreaView>;
}

function TodayScreen({ userId }) {
  const [tasks, setTasks] = useState([]); const [messages, setMessages] = useState([]); const [shifts, setShifts] = useState([]);
  useEffect(() => { load(); }, []);
  async function load(){
    const d=localDate();
    const [t,m,s]=await Promise.all([
      supabase.from('tasks').select('*').eq('task_date',d).eq('assigned_to',userId).order('created_at'),
      supabase.from('messages').select('*').eq('active',true).order('created_at',{ascending:false}),
      supabase.from('feeding_shifts').select('*').eq('shift_date',d).eq('assigned_to',userId).order('shift_time')
    ]);
    setTasks(t.data||[]); setMessages(m.data||[]); setShifts(s.data||[]);
  }
  async function toggle(task){ await supabase.from('tasks').update({completed:!task.completed,completed_at:!task.completed?new Date().toISOString():null}).eq('id',task.id); load(); }
  return <><Section title="Beskjeder">{messages.length?messages.map(x=><View key={x.id} style={styles.notice}><Text>{x.text}</Text></View>):<Empty text="Ingen nye beskjeder."/>}</Section><Section title="Mine oppgaver i dag">{tasks.length?tasks.map(x=><Pressable key={x.id} onPress={()=>toggle(x)} style={styles.item}><Text style={x.completed?styles.done:null}>{x.completed?'✓ ':'○ '}{x.title}</Text></Pressable>):<Empty text="Ingen oppgaver i dag."/>}</Section><Section title="Mine fôringer i dag">{shifts.length?shifts.map(x=><View key={x.id} style={styles.item}><Text style={styles.bold}>{String(x.shift_time).slice(0,5)} · {x.label}</Text></View>):<Empty text="Ingen fôringsvakter i dag."/>}</Section></>;
}

function FeedingScreen({ userId }) {
  const [shifts,setShifts]=useState([]); const [members,setMembers]=useState([]); const [swaps,setSwaps]=useState([]);
  useEffect(()=>{load();},[]);
  async function load(){
    const d=localDate();
    const [s,m,w]=await Promise.all([
      supabase.from('feeding_shifts').select('*').eq('shift_date',d).order('shift_time'),
      supabase.from('memberships').select('user_id,role,profiles(full_name)').eq('stable_id',STABLE_ID).eq('active',true),
      supabase.from('feeding_swap_requests').select('*').eq('stable_id',STABLE_ID).order('requested_at',{ascending:false})
    ]);
    setShifts(s.data||[]); setMembers(m.data||[]); setSwaps(w.data||[]);
  }
  const nameOf=id=>members.find(m=>m.user_id===id)?.profiles?.full_name||'Bruker';
  function askSwap(shift){
    const choices=members.filter(m=>m.user_id!==userId);
    if(!choices.length)return Alert.alert('Ingen å bytte med','Det finnes ingen andre aktive fôrryttere ennå.');
    Alert.alert('Bytt fôring','Velg hvem du vil spørre',choices.slice(0,8).map(m=>({text:nameOf(m.user_id),onPress:()=>createSwap(shift,m.user_id)})).concat({text:'Avbryt',style:'cancel'}));
  }
  async function createSwap(shift,to){const {error}=await supabase.from('feeding_swap_requests').insert({stable_id:STABLE_ID,shift_id:shift.id,from_user:userId,to_user:to,status:'pending'}); if(error)Alert.alert('Feil',error.message); else load();}
  async function respond(id,ok){const {error}=await supabase.from('feeding_swap_requests').update({status:ok?'awaiting_admin':'declined',responded_at:new Date().toISOString()}).eq('id',id); if(error)Alert.alert('Feil',error.message); else load();}
  return <><Section title="Fôring i dag">{shifts.length?shifts.map(s=><View key={s.id} style={styles.itemRow}><View><Text style={styles.bold}>{String(s.shift_time).slice(0,5)} · {s.label}</Text><Text style={styles.muted}>{nameOf(s.assigned_to)}</Text></View>{s.assigned_to===userId&&<Btn title="Bytt" secondary onPress={()=>askSwap(s)}/>}</View>):<Empty text="Ingen fôringer i dag."/>}</Section><Section title="Bytteforespørsler">{swaps.filter(x=>x.from_user===userId||x.to_user===userId).map(x=><View key={x.id} style={styles.item}><Text>{nameOf(x.from_user)} → {nameOf(x.to_user)}</Text><Text style={styles.muted}>{x.status==='pending'?'Venter på mottaker':x.status==='awaiting_admin'?'Venter på admin':x.status==='approved'?'Godkjent':'Avslått'}</Text>{x.to_user===userId&&x.status==='pending'&&<View style={styles.row}><Btn title="Godta" onPress={()=>respond(x.id,true)}/><Btn title="Avslå" danger onPress={()=>respond(x.id,false)}/></View>}</View>)}{!swaps.some(x=>x.from_user===userId||x.to_user===userId)&&<Empty text="Ingen forespørsler."/>}</Section></>;
}

function MessagesScreen(){const [items,setItems]=useState([]);useEffect(()=>{supabase.from('messages').select('*').eq('active',true).order('created_at',{ascending:false}).then(({data})=>setItems(data||[]));},[]);return <Section title="Beskjeder">{items.length?items.map(x=><View key={x.id} style={styles.item}><Text>{x.text}</Text></View>):<Empty text="Ingen aktive beskjeder."/>}</Section>}

function AdminScreen({ currentUserId, role }) {
  const [requests,setRequests]=useState([]); const [members,setMembers]=useState([]); const [swaps,setSwaps]=useState([]); const [horse,setHorse]=useState(''); const [message,setMessage]=useState(''); const [shiftLabel,setShiftLabel]=useState('Morgenfôring'); const [shiftTime,setShiftTime]=useState('08:00');
  useEffect(()=>{load();},[]);
  async function load(){const [r,m,s]=await Promise.all([supabase.from('join_requests').select('*').eq('stable_id',STABLE_ID).eq('status','pending').order('created_at'),supabase.from('memberships').select('user_id,role,profiles(full_name)').eq('stable_id',STABLE_ID).eq('active',true),supabase.from('feeding_swap_requests').select('*').eq('stable_id',STABLE_ID).eq('status','awaiting_admin').order('requested_at')]);setRequests(r.data||[]);setMembers(m.data||[]);setSwaps(s.data||[])}
  const nameOf=id=>members.find(m=>m.user_id===id)?.profiles?.full_name||id.slice(0,8);
  async function approveUser(req){const {error}=await supabase.from('memberships').insert({stable_id:STABLE_ID,user_id:req.user_id,role:'rider',active:true});if(error&&!error.message.includes('duplicate'))return Alert.alert('Feil',error.message);await supabase.from('join_requests').update({status:'approved'}).eq('id',req.id);load()}
  async function declineUser(req){await supabase.from('join_requests').update({status:'declined'}).eq('id',req.id);load()}
  async function makeAdmin(m){if(role!=='owner')return Alert.alert('Kun eier','Bare eier kan endre admin-tilgang.');const next=m.role==='admin'?'rider':'admin';await supabase.from('memberships').update({role:next}).eq('stable_id',STABLE_ID).eq('user_id',m.user_id);load()}
  async function addHorse(){if(!horse.trim())return;const {error}=await supabase.from('horses').insert({stable_id:STABLE_ID,name:horse.trim()});if(error)Alert.alert('Feil',error.message);else{setHorse('');Alert.alert('Lagt til','Hesten er lagt til.')}}
  async function addMessage(){if(!message.trim())return;const {error}=await supabase.from('messages').insert({stable_id:STABLE_ID,text:message.trim(),created_by:currentUserId});if(error)Alert.alert('Feil',error.message);else{setMessage('');Alert.alert('Publisert','Beskjeden er sendt til alle.')}}
  async function addShift(){const target=members.find(m=>m.role==='rider'||m.role==='admin'||m.role==='owner');if(!target)return Alert.alert('Ingen brukere');const {error}=await supabase.from('feeding_shifts').insert({stable_id:STABLE_ID,shift_date:localDate(),shift_time:shiftTime,label:shiftLabel,assigned_to:target.user_id,original_assigned_to:target.user_id,created_by:currentUserId});if(error)Alert.alert('Feil',error.message);else Alert.alert('Lagt til','Fôringen er opprettet.')}
  async function approveSwap(x){const {data:shift}=await supabase.from('feeding_shifts').select('*').eq('id',x.shift_id).single();if(!shift)return;const a=await supabase.from('feeding_shifts').update({assigned_to:x.to_user,original_assigned_to:shift.original_assigned_to||shift.assigned_to}).eq('id',x.shift_id);if(a.error)return Alert.alert('Feil',a.error.message);await supabase.from('feeding_swap_requests').update({status:'approved',admin_decided_at:new Date().toISOString(),admin_decided_by:currentUserId}).eq('id',x.id);load()}
  async function declineSwap(x){await supabase.from('feeding_swap_requests').update({status:'declined',admin_decided_at:new Date().toISOString(),admin_decided_by:currentUserId}).eq('id',x.id);load()}
  return <><Section title="Nye brukere">{requests.length?requests.map(r=><View key={r.id} style={styles.item}><Text style={styles.bold}>Ny konto · {r.user_id.slice(0,8)}</Text><Text style={styles.muted}>Venter på tilgang</Text><View style={styles.row}><Btn title="Godkjenn" onPress={()=>approveUser(r)}/><Btn title="Avslå" danger onPress={()=>declineUser(r)}/></View></View>):<Empty text="Ingen nye brukere venter."/>}</Section><Section title="Brukere og roller">{members.map(m=><View key={m.user_id} style={styles.itemRow}><View><Text style={styles.bold}>{m.profiles?.full_name||'Bruker'}</Text><Text style={styles.muted}>{m.role}</Text></View>{role==='owner'&&m.user_id!==currentUserId&&<Btn title={m.role==='admin'?'Fjern admin':'Gjør admin'} secondary onPress={()=>makeAdmin(m)}/>}</View>)}</Section><Section title="Bytter som venter på admin">{swaps.length?swaps.map(x=><View key={x.id} style={styles.item}><Text>{nameOf(x.from_user)} → {nameOf(x.to_user)}</Text><View style={styles.row}><Btn title="Godkjenn" onPress={()=>approveSwap(x)}/><Btn title="Avslå" danger onPress={()=>declineSwap(x)}/></View></View>):<Empty text="Ingen bytter venter."/>}</Section><Section title="Legg til hest"><Field label="Navn" value={horse} onChangeText={setHorse}/><Btn title="Legg til hest" onPress={addHorse}/></Section><Section title="Ny fôring i dag"><Field label="Type" value={shiftLabel} onChangeText={setShiftLabel}/><Field label="Klokkeslett (HH:MM)" value={shiftTime} onChangeText={setShiftTime}/><Btn title="Legg til fôring" onPress={addShift}/><Text style={styles.help}>Testversjonen legger vakten på første aktive bruker. Vi legger inn full bruker- og datovelger i neste runde.</Text></Section><Section title="Ny fellesbeskjed"><Field label="Beskjed" value={message} onChangeText={setMessage} multiline/><Btn title="Publiser" onPress={addMessage}/></Section></>;
}

const Field=({label,...props})=><View style={{marginBottom:12}}><Text style={styles.label}>{label}</Text><TextInput {...props} style={[styles.input,props.multiline&&{minHeight:80,textAlignVertical:'top'}]} /></View>;
const Section=({title,children})=><View style={styles.card}><Text style={styles.section}>{title}</Text>{children}</View>;
const Empty=({text})=><Text style={styles.muted}>{text}</Text>;
const Center=({text})=><SafeAreaView style={styles.safe}><View style={styles.centerBox}><Text style={styles.bigTitle}>{text}</Text></View></SafeAreaView>;

const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:'#f7f3ea'},header:{padding:14,borderBottomWidth:1,borderBottomColor:'#ded9cf',backgroundColor:'#fff',flexDirection:'row',alignItems:'center',justifyContent:'space-between'},title:{fontSize:21,fontWeight:'800',color:'#283126'},bigTitle:{fontSize:25,fontWeight:'800',color:'#283126',textAlign:'center'},logo:{fontSize:42,textAlign:'center',marginBottom:8},muted:{color:'#6b746a',fontSize:13},centerMuted:{color:'#6b746a',fontSize:14,textAlign:'center',marginBottom:18},content:{padding:10,paddingBottom:120},card:{backgroundColor:'#fff',borderWidth:1,borderColor:'#ded9cf',borderRadius:15,padding:12,marginBottom:10},section:{fontSize:17,fontWeight:'800',marginBottom:10,color:'#283126'},item:{borderWidth:1,borderColor:'#e4e0d7',borderRadius:11,padding:10,marginBottom:8},itemRow:{borderWidth:1,borderColor:'#e4e0d7',borderRadius:11,padding:10,marginBottom:8,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},notice:{backgroundColor:'#fff2c7',padding:10,borderRadius:10,marginBottom:8},bold:{fontWeight:'700',color:'#283126'},done:{textDecorationLine:'line-through',color:'#6b746a'},row:{flexDirection:'row',gap:8,marginTop:8,flexWrap:'wrap'},btn:{backgroundColor:'#5f7652',paddingHorizontal:13,paddingVertical:9,borderRadius:10,minHeight:38,justifyContent:'center'},btnText:{color:'#fff',fontWeight:'700',fontSize:13},btnSecondary:{backgroundColor:'#eef1ec'},btnSecondaryText:{color:'#283126'},btnDanger:{backgroundColor:'#f7e5e3'},btnDangerText:{color:'#9f3f37'},disabled:{opacity:.5},input:{borderWidth:1,borderColor:'#d8d4ca',backgroundColor:'#fff',borderRadius:10,padding:11,fontSize:16,color:'#283126',marginTop:4},label:{fontSize:12,color:'#6b746a'},help:{fontSize:12,color:'#6b746a',marginTop:10,lineHeight:18},helpCenter:{fontSize:14,color:'#6b746a',textAlign:'center',lineHeight:20,marginVertical:18},authWrap:{padding:22,justifyContent:'center',flexGrow:1},centerBox:{padding:24,justifyContent:'center',alignItems:'center',flex:1,gap:10},segment:{flexDirection:'row',gap:8,marginBottom:16},nav:{position:'absolute',left:0,right:0,bottom:24,backgroundColor:'#fff',borderTopWidth:1,borderTopColor:'#ded9cf',borderBottomWidth:1,borderBottomColor:'#ded9cf',flexDirection:'row',paddingBottom:10,paddingTop:8},navBtn:{flex:1,paddingVertical:12,paddingHorizontal:8,alignItems:'center',borderRadius:10,marginHorizontal:3,minHeight:44,justifyContent:'center'},navActive:{backgroundColor:'#e9efe5'},navText:{fontSize:12,fontWeight:'700',color:'#455443'}
});