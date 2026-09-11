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
const toIsoDate = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const parseIsoDate = value => {
  const [y,m,d] = String(value || localDate()).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const formatDate = value => {
  const d = parseIsoDate(value);
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
};
const formatDateLong = value => {
  const d = parseIsoDate(value);
  const days = ['søndag','mandag','tirsdag','onsdag','torsdag','fredag','lørdag'];
  return `${days[d.getDay()]} ${formatDate(value)}`;
};
const monthTitle = d => `${['Januar','Februar','Mars','April','Mai','Juni','Juli','August','September','Oktober','November','Desember'][d.getMonth()]} ${d.getFullYear()}`;
const messageCutoff = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
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

const Choice = ({ label, selected, onPress }) => (
  <Pressable onPress={onPress} style={[styles.choice, selected && styles.choiceSelected]}>
    <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
  </Pressable>
);

function CalendarPicker({ value, onChange, weekendOnly=false, markedDates=[] }) {
  const selected = parseIsoDate(value);
  const [shown,setShown] = useState(new Date(selected.getFullYear(), selected.getMonth(), 1));
  useEffect(()=>{const d=parseIsoDate(value);setShown(new Date(d.getFullYear(),d.getMonth(),1));},[value]);
  const first = new Date(shown.getFullYear(), shown.getMonth(), 1);
  const daysInMonth = new Date(shown.getFullYear(), shown.getMonth()+1, 0).getDate();
  const mondayOffset = (first.getDay()+6)%7;
  const cells = Array.from({length:42},(_,i)=>{
    const day=i-mondayOffset+1;
    return day>=1&&day<=daysInMonth ? new Date(shown.getFullYear(),shown.getMonth(),day) : null;
  });
  const move = delta => setShown(new Date(shown.getFullYear(),shown.getMonth()+delta,1));
  return <View style={styles.calendar}>
    <View style={styles.calendarHeader}><Btn title="‹" secondary onPress={()=>move(-1)}/><Text style={styles.calendarTitle}>{monthTitle(shown)}</Text><Btn title="›" secondary onPress={()=>move(1)}/></View>
    <View style={styles.weekRow}>{['Man','Tir','Ons','Tor','Fre','Lør','Søn'].map(x=><Text key={x} style={styles.weekLabel}>{x}</Text>)}</View>
    <View style={styles.calendarGrid}>{cells.map((d,i)=>{
      if(!d) return <View key={i} style={styles.dayCell}/>;
      const iso=toIsoDate(d); const isWeekend=d.getDay()===0||d.getDay()===6; const disabled=weekendOnly&&!isWeekend;
      const active=iso===value; const marked=markedDates.includes(iso);
      return <Pressable key={iso} disabled={disabled} onPress={()=>onChange(iso)} style={[styles.dayCell,active&&styles.dayActive,disabled&&styles.dayDisabled]}>
        <Text style={[styles.dayText,active&&styles.dayTextActive,disabled&&styles.dayTextDisabled]}>{d.getDate()}</Text>{marked&&<View style={[styles.dot,active&&styles.dotActive]}/>} 
      </Pressable>;
    })}</View>
    <Text style={styles.selectedDate}>Valgt: {formatDateLong(value)}</Text>
  </View>;
}

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
        {tab === 'messages' && <MessagesScreen isAdmin={isAdmin} />}
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

  function changeMethod(next) { setMethod(next); setSmsSent(false); setCode(''); }

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
    const { error } = await supabase.auth.signInWithOtp({ phone: normalized, options: { shouldCreateUser: mode==='signup', data: mode==='signup' ? { full_name: name.trim() } : undefined } });
    setBusy(false);
    if (error) return Alert.alert('Kunne ikke sende SMS', error.message);
    setSmsPhone(normalized); setSmsSent(true); Alert.alert('Kode sendt', `Vi har sendt en kode til ${normalized}.`);
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
    {mode==='signup' && <Text style={styles.help}>Nye brukere må godkjennes av eier/admin før de får tilgang til stallen.</Text>}
  </View></ScrollView></SafeAreaView>;
}

function WaitingScreen({ identifier, onRefresh, onLogout }) {
  return <SafeAreaView style={styles.safe}><View style={styles.centerBox}><Text style={styles.logo}>🐴</Text><Text style={styles.bigTitle}>Venter på godkjenning</Text><Text style={styles.centerMuted}>{identifier}</Text><Text style={styles.helpCenter}>Kontoen er opprettet, men har ikke tilgang til Stall Nordstjerna ennå. Eier eller admin må godkjenne den.</Text><Btn title="Sjekk på nytt" onPress={onRefresh} /><Btn title="Logg ut" secondary onPress={onLogout} /></View></SafeAreaView>;
}

function TodayScreen({ userId }) {
  const [tasks, setTasks] = useState([]);
  const [messages, setMessages] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [assignment, setAssignment] = useState(null);
  useEffect(() => { load(); }, []);

  async function load(){
    const d=localDate();
    const [t,m,s,a]=await Promise.all([
      supabase.from('tasks').select('*,horses(name)').eq('task_date',d).eq('assigned_to',userId).order('created_at'),
      supabase.from('messages').select('*').eq('active',true).gte('created_at',messageCutoff()).order('created_at',{ascending:false}),
      supabase.from('feeding_shifts').select('*').eq('shift_date',d).eq('assigned_to',userId).order('shift_time'),
      supabase.from('horse_assignments').select('*,horses(name)').eq('assignment_date',d).eq('user_id',userId).maybeSingle()
    ]);
    setTasks(t.data||[]); setMessages(m.data||[]); setShifts(s.data||[]); setAssignment(a.data||null);
  }
  async function toggle(task){ await supabase.from('tasks').update({completed:!task.completed,completed_at:!task.completed?new Date().toISOString():null}).eq('id',task.id); load(); }

  return <>
    <Section title="Min hest i dag">{assignment ? <View style={styles.horseCard}><Text style={styles.horseName}>🐴 {assignment.horses?.name || 'Hest'}</Text></View> : <Empty text="Ingen hest er fordelt til deg i dag."/>}</Section>
    <Section title="Mine oppgaver">{tasks.length?tasks.map(x=><Pressable key={x.id} onPress={()=>toggle(x)} style={styles.item}><Text style={x.completed?styles.done:null}>{x.completed?'✓ ':'○ '}{x.title}</Text>{x.horses?.name&&<Text style={styles.muted}>Hest: {x.horses.name}</Text>}</Pressable>):<Empty text="Ingen oppgaver i dag."/>}</Section>
    <Section title="Beskjeder">{messages.length?messages.map(x=><View key={x.id} style={styles.notice}><Text>{x.text}</Text></View>):<Empty text="Ingen nye beskjeder."/>}</Section>
    <Section title="Mine fôringer i dag">{shifts.length?shifts.map(x=><View key={x.id} style={styles.item}><Text style={styles.bold}>{x.label}</Text></View>):<Empty text="Ingen fôringsvakter i dag."/>}</Section>
  </>;
}

function FeedingScreen({ userId }) {
  const [shifts,setShifts]=useState([]); const [members,setMembers]=useState([]); const [swaps,setSwaps]=useState([]); const [selectedDate,setSelectedDate]=useState(localDate());
  useEffect(()=>{load();},[selectedDate]);
  async function load(){
    const selected=parseIsoDate(selectedDate); const from=toIsoDate(new Date(selected.getFullYear(),selected.getMonth(),1)); const to=toIsoDate(new Date(selected.getFullYear(),selected.getMonth()+1,0));
    const [s,m,w]=await Promise.all([
      supabase.from('feeding_shifts').select('*').gte('shift_date',from).lte('shift_date',to).order('shift_date').order('shift_time'),
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
  const dayShifts=shifts.filter(s=>s.shift_date===selectedDate); const marked=[...new Set(shifts.map(s=>s.shift_date))];
  return <>
    <Section title="Fôringskalender"><CalendarPicker value={selectedDate} onChange={setSelectedDate} markedDates={marked}/><Text style={styles.sectionSmall}>{formatDateLong(selectedDate)}</Text>{dayShifts.length?dayShifts.map(s=><View key={s.id} style={styles.itemRow}><View><Text style={styles.bold}>{s.label}</Text><Text style={styles.muted}>{nameOf(s.assigned_to)}</Text></View>{s.assigned_to===userId&&<Btn title="Bytt" secondary onPress={()=>askSwap(s)}/>}</View>):<Empty text="Ingen morgen- eller kveldsfôring registrert denne dagen."/>}</Section>
    <Section title="Bytteforespørsler">{swaps.filter(x=>x.from_user===userId||x.to_user===userId).map(x=><View key={x.id} style={styles.item}><Text>{nameOf(x.from_user)} → {nameOf(x.to_user)}</Text><Text style={styles.muted}>{x.status==='pending'?'Venter på mottaker':x.status==='awaiting_admin'?'Venter på admin':x.status==='approved'?'Godkjent':'Avslått'}</Text>{x.to_user===userId&&x.status==='pending'&&<View style={styles.row}><Btn title="Godta" onPress={()=>respond(x.id,true)}/><Btn title="Avslå" danger onPress={()=>respond(x.id,false)}/></View>}</View>)}{!swaps.some(x=>x.from_user===userId||x.to_user===userId)&&<Empty text="Ingen forespørsler."/>}</Section>
  </>;
}

function MessagesScreen({ isAdmin }){
  const [items,setItems]=useState([]);
  useEffect(()=>{load();},[]);
  async function load(){const {data}=await supabase.from('messages').select('*').eq('active',true).gte('created_at',messageCutoff()).order('created_at',{ascending:false});setItems(data||[]);}
  async function removeMessage(id){
    const {error}=await supabase.from('messages').update({active:false}).eq('id',id);
    if(error) return Alert.alert('Feil',error.message);
    load();
  }
  return <Section title="Beskjeder"><Text style={styles.help}>Beskjeder vises i 24 timer.</Text>{items.length?items.map(x=><View key={x.id} style={styles.itemRow}><View style={{flex:1}}><Text>{x.text}</Text></View>{isAdmin&&<Btn title="Fjern" danger onPress={()=>removeMessage(x.id)}/>}</View>):<Empty text="Ingen aktive beskjeder."/>}</Section>;
}

function AdminScreen({ currentUserId, role }) {
  const [requests,setRequests]=useState([]);
  const [members,setMembers]=useState([]);
  const [swaps,setSwaps]=useState([]);
  const [horses,setHorses]=useState([]);
  const [horse,setHorse]=useState('');
  const [message,setMessage]=useState('');
  const [shiftLabel,setShiftLabel]=useState('Morgenfôring');
  const [selectedUser,setSelectedUser]=useState(null);
  const [selectedHorse,setSelectedHorse]=useState(null);
  const [taskTitle,setTaskTitle]=useState('');
  const [taskDate,setTaskDate]=useState(localDate());
  const [feedDate,setFeedDate]=useState(localDate());
  const [feedUser,setFeedUser]=useState(null);

  useEffect(()=>{load();},[]);
  async function load(){
    const [r,m,s,h]=await Promise.all([
      supabase.from('join_requests').select('*').eq('stable_id',STABLE_ID).eq('status','pending').order('created_at'),
      supabase.from('memberships').select('user_id,role,profiles(full_name)').eq('stable_id',STABLE_ID).eq('active',true),
      supabase.from('feeding_swap_requests').select('*').eq('stable_id',STABLE_ID).eq('status','awaiting_admin').order('requested_at'),
      supabase.from('horses').select('*').eq('stable_id',STABLE_ID).eq('active',true).order('name')
    ]);
    setRequests(r.data||[]); setMembers(m.data||[]); setSwaps(s.data||[]); setHorses(h.data||[]);
  }
  const nameOf=id=>members.find(m=>m.user_id===id)?.profiles?.full_name||id.slice(0,8);
  async function approveUser(req){const {error}=await supabase.from('memberships').insert({stable_id:STABLE_ID,user_id:req.user_id,role:'rider',active:true});if(error&&!error.message.includes('duplicate'))return Alert.alert('Feil',error.message);await supabase.from('join_requests').update({status:'approved'}).eq('id',req.id);load();}
  async function declineUser(req){await supabase.from('join_requests').update({status:'declined'}).eq('id',req.id);load();}
  async function setRoleFor(m,next){if(role!=='owner')return Alert.alert('Kun eier','Bare eier kan endre admin-tilgang.');if(m.role==='owner')return;const {error}=await supabase.from('memberships').update({role:next}).eq('stable_id',STABLE_ID).eq('user_id',m.user_id);if(error)Alert.alert('Feil',error.message);else load();}
  async function addHorse(){
    const name=horse.trim(); if(!name)return;
    if(horses.some(h=>h.name.trim().toLowerCase()===name.toLowerCase()))return Alert.alert('Finnes allerede',`${name} ligger allerede i hestelista.`);
    const {error}=await supabase.from('horses').insert({stable_id:STABLE_ID,name});if(error)Alert.alert('Feil',error.message);else{setHorse('');load();Alert.alert('Lagt til','Hesten er nå tilgjengelig når du fordeler hest.');}
  }
  function confirmRemoveHorse(h){Alert.alert('Fjern hest',`Vil du fjerne ${h.name} fra hestelista?`,[{text:'Avbryt',style:'cancel'},{text:'Fjern',style:'destructive',onPress:()=>removeHorse(h)}]);}
  async function removeHorse(h){const {error}=await supabase.from('horses').update({active:false}).eq('id',h.id);if(error)return Alert.alert('Feil',error.message);if(selectedHorse===h.id)setSelectedHorse(null);load();}
  async function saveHorseAssignment(){
    if(!selectedUser||!selectedHorse)return Alert.alert('Velg fôrrytter og hest');
    const {error}=await supabase.from('horse_assignments').upsert({stable_id:STABLE_ID,assignment_date:taskDate,user_id:selectedUser,horse_id:selectedHorse,created_by:currentUserId},{onConflict:'stable_id,assignment_date,user_id'});
    if(error)Alert.alert('Feil',error.message);else Alert.alert('Lagret',`Hesten er fordelt ${formatDate(taskDate)}.`);
  }
  async function removeHorseAssignment(){
    if(!selectedUser)return Alert.alert('Velg fôrrytter først');
    const {error}=await supabase.from('horse_assignments').delete().eq('stable_id',STABLE_ID).eq('assignment_date',taskDate).eq('user_id',selectedUser);
    if(error)Alert.alert('Feil',error.message);else Alert.alert('Fjernet',`Hestefordelingen ${formatDate(taskDate)} er fjernet.`);
  }
  async function addTask(){
    if(!selectedUser||!selectedHorse)return Alert.alert('Velg fôrrytter og hest');
    if(!taskTitle.trim())return Alert.alert('Skriv inn oppgave');
    const {error}=await supabase.from('tasks').insert({stable_id:STABLE_ID,title:taskTitle.trim(),task_date:taskDate,assigned_to:selectedUser,horse_id:selectedHorse});
    if(error)Alert.alert('Feil',error.message);else{setTaskTitle('');Alert.alert('Lagt til','Oppgaven vises hos fôrrytteren på valgt dato.');}
  }
  async function addMessage(){if(!message.trim())return;const {error}=await supabase.from('messages').insert({stable_id:STABLE_ID,text:message.trim(),created_by:currentUserId});if(error)Alert.alert('Feil',error.message);else{setMessage('');Alert.alert('Publisert','Beskjeden vises i 24 timer.');}}
  async function addShift(){
    if(!feedUser)return Alert.alert('Velg fôrrytter');
    const shiftTime=shiftLabel==='Morgenfôring'?'08:00':'20:00';
    const {error}=await supabase.from('feeding_shifts').insert({stable_id:STABLE_ID,shift_date:feedDate,shift_time:shiftTime,label:shiftLabel,assigned_to:feedUser,original_assigned_to:feedUser,created_by:currentUserId});
    if(error)Alert.alert('Feil',error.message);else Alert.alert('Lagt til',`${shiftLabel} ${formatDate(feedDate)} er opprettet.`);
  }
  async function approveSwap(x){const {data:shift}=await supabase.from('feeding_shifts').select('*').eq('id',x.shift_id).single();if(!shift)return;const a=await supabase.from('feeding_shifts').update({assigned_to:x.to_user,original_assigned_to:shift.original_assigned_to||shift.assigned_to}).eq('id',x.shift_id);if(a.error)return Alert.alert('Feil',a.error.message);await supabase.from('feeding_swap_requests').update({status:'approved',admin_decided_at:new Date().toISOString(),admin_decided_by:currentUserId}).eq('id',x.id);load();}
  async function declineSwap(x){await supabase.from('feeding_swap_requests').update({status:'declined',admin_decided_at:new Date().toISOString(),admin_decided_by:currentUserId}).eq('id',x.id);load();}

  return <>
    <Section title="Nye brukere">{requests.length?requests.map(r=><View key={r.id} style={styles.item}><Text style={styles.bold}>Ny konto · {r.user_id.slice(0,8)}</Text><Text style={styles.muted}>Venter på tilgang</Text><View style={styles.row}><Btn title="Godkjenn" onPress={()=>approveUser(r)}/><Btn title="Avslå" danger onPress={()=>declineUser(r)}/></View></View>):<Empty text="Ingen nye brukere venter."/>}</Section>

    <Section title="Brukere og roller">{members.map(m=><View key={m.user_id} style={styles.item}><Text style={styles.bold}>{m.profiles?.full_name||'Bruker'}</Text><Text style={styles.muted}>{m.role==='owner'?'Eier':m.role==='admin'?'Admin':'Fôrrytter'}</Text>{role==='owner'&&m.user_id!==currentUserId&&m.role!=='owner'&&<View style={styles.row}><Btn title="Fôrrytter" secondary={m.role!=='rider'} onPress={()=>setRoleFor(m,'rider')}/><Btn title="Admin" secondary={m.role!=='admin'} onPress={()=>setRoleFor(m,'admin')}/></View>}</View>)}</Section>

    <Section title="Fordel hest og oppgaver">
      <Text style={styles.label}>1. Velg fôrrytter</Text><View style={styles.choiceWrap}>{members.filter(m=>m.role!=='owner'||m.user_id===currentUserId).map(m=><Choice key={m.user_id} label={m.profiles?.full_name||'Bruker'} selected={selectedUser===m.user_id} onPress={()=>setSelectedUser(m.user_id)}/>)}</View>
      <Text style={styles.label}>2. Velg hest</Text><View style={styles.choiceWrap}>{horses.map(h=><Choice key={h.id} label={h.name} selected={selectedHorse===h.id} onPress={()=>setSelectedHorse(h.id)}/>)}</View>
      {!horses.length&&<Text style={styles.help}>Legg til hester i seksjonen «Hester» under først.</Text>}
      <Text style={styles.label}>3. Velg lørdag eller søndag</Text><CalendarPicker value={taskDate} onChange={setTaskDate} weekendOnly/>
      <View style={styles.row}><Btn title="Lagre hest til fôrrytter" onPress={saveHorseAssignment}/><Btn title="Fjern hestefordeling" danger onPress={removeHorseAssignment}/></View>
      <View style={styles.divider}/>
      <Field label="4. Oppgave" value={taskTitle} onChangeText={setTaskTitle} placeholder="f.eks. Møkke boks, fylle vann, pusse"/>
      <Btn title="Legg til oppgave" onPress={addTask}/>
      <Text style={styles.help}>Dato vises som dag.mnd.år. Hestefordeling kan bare velges på lørdag og søndag.</Text>
    </Section>

    <Section title="Hester">{horses.length?horses.map(h=><View key={h.id} style={styles.itemRow}><Text style={styles.bold}>🐴 {h.name}</Text><Btn title="Fjern" danger onPress={()=>confirmRemoveHorse(h)}/></View>):<Empty text="Ingen hester lagt inn ennå."/>}<Field label="Ny hest" value={horse} onChangeText={setHorse}/><Btn title="Legg til hest" onPress={addHorse}/><Text style={styles.help}>Samme hestenavn kan ikke legges inn to ganger.</Text></Section>

    <Section title="Bytter som venter på admin">{swaps.length?swaps.map(x=><View key={x.id} style={styles.item}><Text>{nameOf(x.from_user)} → {nameOf(x.to_user)}</Text><View style={styles.row}><Btn title="Godkjenn" onPress={()=>approveSwap(x)}/><Btn title="Avslå" danger onPress={()=>declineSwap(x)}/></View></View>):<Empty text="Ingen bytter venter."/>}</Section>

    <Section title="Ny fellesbeskjed"><Field label="Beskjed" value={message} onChangeText={setMessage} multiline/><Btn title="Publiser i 24 timer" onPress={addMessage}/></Section>

    <Section title="Legg inn fôring"><Text style={styles.label}>1. Velg fôrrytter</Text><View style={styles.choiceWrap}>{members.map(m=><Choice key={m.user_id} label={m.profiles?.full_name||'Bruker'} selected={feedUser===m.user_id} onPress={()=>setFeedUser(m.user_id)}/>)}</View><Text style={styles.label}>2. Velg morgen eller kveld</Text><View style={styles.choiceWrap}><Choice label="Morgenfôring" selected={shiftLabel==='Morgenfôring'} onPress={()=>setShiftLabel('Morgenfôring')}/><Choice label="Kveldsfôring" selected={shiftLabel==='Kveldsfôring'} onPress={()=>setShiftLabel('Kveldsfôring')}/></View><Text style={styles.label}>3. Velg dato</Text><CalendarPicker value={feedDate} onChange={setFeedDate}/><Btn title="Legg til fôring" onPress={addShift}/></Section>
  </>;
}

const Field=({label,...props})=><View style={{marginBottom:12}}><Text style={styles.label}>{label}</Text><TextInput {...props} style={[styles.input,props.multiline&&{minHeight:80,textAlignVertical:'top'}]} /></View>;
const Section=({title,children})=><View style={styles.card}><Text style={styles.section}>{title}</Text>{children}</View>;
const Empty=({text})=><Text style={styles.muted}>{text}</Text>;
const Center=({text})=><SafeAreaView style={styles.safe}><View style={styles.centerBox}><Text style={styles.bigTitle}>{text}</Text></View></SafeAreaView>;

const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:'#f7f3ea'},
  header:{padding:14,borderBottomWidth:1,borderBottomColor:'#ded9cf',backgroundColor:'#fff',flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  title:{fontSize:21,fontWeight:'800',color:'#283126'},bigTitle:{fontSize:25,fontWeight:'800',color:'#283126',textAlign:'center'},logo:{fontSize:42,textAlign:'center',marginBottom:8},
  muted:{color:'#6b746a',fontSize:13},centerMuted:{color:'#6b746a',fontSize:14,textAlign:'center',marginBottom:18},
  content:{padding:10,paddingBottom:120},card:{backgroundColor:'#fff',borderWidth:1,borderColor:'#ded9cf',borderRadius:15,padding:12,marginBottom:10},section:{fontSize:17,fontWeight:'800',marginBottom:10,color:'#283126'},sectionSmall:{fontSize:15,fontWeight:'800',marginVertical:12,color:'#283126'},
  item:{borderWidth:1,borderColor:'#e4e0d7',borderRadius:11,padding:10,marginBottom:8},itemRow:{borderWidth:1,borderColor:'#e4e0d7',borderRadius:11,padding:10,marginBottom:8,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
  notice:{backgroundColor:'#fff2c7',padding:10,borderRadius:10,marginBottom:8},horseCard:{backgroundColor:'#eef1ec',padding:14,borderRadius:12},horseName:{fontSize:20,fontWeight:'800',color:'#283126'},bold:{fontWeight:'700',color:'#283126'},done:{textDecorationLine:'line-through',color:'#6b746a'},
  row:{flexDirection:'row',gap:8,marginTop:8,flexWrap:'wrap'},btn:{backgroundColor:'#5f7652',paddingHorizontal:13,paddingVertical:9,borderRadius:10,minHeight:38,justifyContent:'center'},btnText:{color:'#fff',fontWeight:'700',fontSize:13},btnSecondary:{backgroundColor:'#eef1ec'},btnSecondaryText:{color:'#283126'},btnDanger:{backgroundColor:'#f7e5e3'},btnDangerText:{color:'#9f3f37'},disabled:{opacity:.5},
  input:{borderWidth:1,borderColor:'#d8d4ca',backgroundColor:'#fff',borderRadius:10,padding:11,fontSize:16,color:'#283126',marginTop:4},label:{fontSize:12,color:'#6b746a',marginBottom:6},help:{fontSize:12,color:'#6b746a',marginTop:10,lineHeight:18},helpCenter:{fontSize:14,color:'#6b746a',textAlign:'center',lineHeight:20,marginVertical:18},
  authWrap:{padding:22,justifyContent:'center',flexGrow:1},centerBox:{padding:24,justifyContent:'center',alignItems:'center',flex:1,gap:10},segment:{flexDirection:'row',gap:8,marginBottom:16},
  choiceWrap:{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:14},choice:{borderWidth:1,borderColor:'#d8d4ca',borderRadius:999,paddingHorizontal:12,paddingVertical:8,backgroundColor:'#fff'},choiceSelected:{backgroundColor:'#5f7652',borderColor:'#5f7652'},choiceText:{color:'#455443',fontWeight:'700'},choiceTextSelected:{color:'#fff'},divider:{height:1,backgroundColor:'#e4e0d7',marginVertical:14},
  calendar:{borderWidth:1,borderColor:'#e4e0d7',borderRadius:12,padding:8,marginBottom:12},calendarHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:8},calendarTitle:{fontWeight:'800',fontSize:15,color:'#283126'},weekRow:{flexDirection:'row'},weekLabel:{width:'14.285%',textAlign:'center',fontSize:11,color:'#6b746a',fontWeight:'700',paddingVertical:6},calendarGrid:{flexDirection:'row',flexWrap:'wrap'},dayCell:{width:'14.285%',height:44,alignItems:'center',justifyContent:'center',borderRadius:9},dayActive:{backgroundColor:'#5f7652'},dayDisabled:{opacity:.28},dayText:{color:'#283126',fontWeight:'600'},dayTextActive:{color:'#fff',fontWeight:'800'},dayTextDisabled:{color:'#8a8f89'},dot:{width:5,height:5,borderRadius:3,backgroundColor:'#5f7652',marginTop:2},dotActive:{backgroundColor:'#fff'},selectedDate:{fontSize:12,color:'#6b746a',marginTop:8,textAlign:'center'},
  nav:{position:'absolute',left:0,right:0,bottom:24,backgroundColor:'#fff',borderTopWidth:1,borderTopColor:'#ded9cf',borderBottomWidth:1,borderBottomColor:'#ded9cf',flexDirection:'row',paddingBottom:10,paddingTop:8},navBtn:{flex:1,paddingVertical:12,paddingHorizontal:8,alignItems:'center',borderRadius:10,marginHorizontal:3,minHeight:44,justifyContent:'center'},navActive:{backgroundColor:'#e9efe5'},navText:{fontSize:12,fontWeight:'700',color:'#455443'}
});