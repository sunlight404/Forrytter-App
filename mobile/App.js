import {groupAgreements,groupLabel} from './agreementGroups';
import 'react-native-url-polyfill/auto';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { Alert } from './dialogs';
import Dropdown from './Dropdown';
import PasswordRecovery from './PasswordRecovery';
import { authOptions } from './authOptions';
import HorseSwaps from './HorseSwaps';
import Notifications, { disableDeviceNotifications } from './Notifications';
const memberOptions=members=>members.map(m=>({value:m.user_id,label:(m.profiles?.full_name||'Uten navn')+(m.active===false?' (fjernet)':'')})).sort((a,b)=>a.label.localeCompare(b.label,'nb'));
const horseOptions=horses=>horses.map(h=>({value:h.id,label:h.name})).sort((a,b)=>a.label.localeCompare(b.label,'nb'));
import { STANDARD_TASKS, nextWeekend, isWeekend, feedingLabel, timeKey, upcomingShiftFilter, weekLabel, agreementLabel, assignmentOrigin } from './overview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cffaswmpbllyqrnikelf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_P7zccZ0hlS7KfTvQLgcjYQ_uxQkF1hM';
const STABLE_ID = '67d21b8e-a592-479a-b7c6-2157055e6c03';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: authOptions(AsyncStorage, Platform.OS === 'web'),
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
  <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.btn, secondary && styles.btnSecondary, danger && styles.btnDanger, disabled && styles.disabled]}>
    <Text style={[styles.btnText, secondary && styles.btnSecondaryText, danger && styles.btnDangerText]}>{title}</Text>
  </Pressable>
);

const Choice = ({ label, selected, onPress }) => (
  <Pressable onPress={onPress} style={[styles.choice, selected && styles.choiceSelected]}>
    <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
  </Pressable>
);

function CalendarPicker({ value, onChange, weekendOnly=false, markedDates=[], onMonthChange }) {
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
  const move = delta => {const next=new Date(shown.getFullYear(),shown.getMonth()+delta,1);setShown(next);onMonthChange?.(toIsoDate(next));};
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
    <Text style={styles.selectedDate}>Valgt: {formatDateLong(value)} · {weekLabel(value)}</Text>
  </View>;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [membership, setMembership] = useState(null);
  const [membershipLoading,setMembershipLoading]=useState(true),[membershipError,setMembershipError]=useState('');
  const membershipRequest=useRef(0),sessionUser=useRef(null);
  const [authError,setAuthError]=useState('');
  const [recovering,setRecovering]=useState(()=>{if(Platform.OS!=='web')return false;try{return new URLSearchParams(window.location.hash.slice(1)).get('type')==='recovery'||!!new URLSearchParams(window.location.hash.slice(1)).get('error')||window.sessionStorage.getItem('forrytter-password-recovery')==='1';}catch{return false;}});
  function finishRecovery(){setRecovering(false);if(Platform.OS==='web'){try{window.sessionStorage.removeItem('forrytter-password-recovery');window.history.replaceState(null,'',window.location.pathname+window.location.search);}catch{}}}
  const [tab, setTab] = useState(() => { const value=Platform.OS==='web'&&typeof window!=='undefined'&&window.location?new URLSearchParams(window.location.search).get('tab'):null; return ['today','horseSwaps','feeding','messages'].includes(value)?value:'today'; });
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let live=true;
    const {data:sub}=supabase.auth.onAuthStateChange((event,next)=>{
      if(!live)return;
      if(sessionUser.current!==(next?.user?.id||null)){sessionUser.current=next?.user?.id||null;membershipRequest.current++;setMembership(null);setMembershipError('');setMembershipLoading(!!next);}
      setSession(next);
      if(event==='PASSWORD_RECOVERY'){setRecovering(true);if(Platform.OS==='web'){try{window.sessionStorage.setItem('forrytter-password-recovery','1');}catch{}}}
    });
    supabase.auth.getSession().then(({data,error})=>{if(!live)return;if(error)setAuthError('Kunne ikke hente innloggingen. Kontroller nettforbindelsen og prøv igjen.');else setSession(data.session);setLoading(false);}).catch(()=>{if(live){setAuthError('Kunne ikke hente innloggingen. Prøv å åpne appen igjen.');setLoading(false);}});
    const listener=AppState.addEventListener('change',state=>{if(state==='active')supabase.auth.startAutoRefresh();else if(Platform.OS!=='web')supabase.auth.stopAutoRefresh();});
    if(Platform.OS!=='web'&&AppState.currentState==='active')supabase.auth.startAutoRefresh();
    return()=>{live=false;sub.subscription.unsubscribe();listener.remove();};
  }, []);

  useEffect(() => {
    if (!session?.user) { membershipRequest.current++;setMembership(null);setMembershipLoading(false); return; }
    loadMembership();
  }, [session, refreshKey]);

  async function loadMembership() {
    if(!session?.user)return;
    const id=++membershipRequest.current;setMembershipLoading(true);
    try{
      const {data,error}=await supabase.from('memberships').select('*').eq('user_id',session.user.id).eq('stable_id',STABLE_ID).eq('active',true).maybeSingle();
      if(error)throw error;if(id!==membershipRequest.current)return;
      setMembership(data||null);setMembershipError('');
      if(!data)await supabase.from('join_requests').upsert({stable_id:STABLE_ID,user_id:session.user.id,status:'pending'},{onConflict:'stable_id,user_id',ignoreDuplicates:true});
    }catch{if(id===membershipRequest.current)setMembershipError('Kunne ikke hente stalltilgangen. Du er fortsatt logget inn. Prøv igjen når du har nett.');}
    finally{if(id===membershipRequest.current)setMembershipLoading(false);}
  }

  useEffect(()=>{if(!session?.user)return;const timer=setInterval(loadMembership,60000);const listener=AppState.addEventListener('change',state=>{if(state==='active')loadMembership();});return()=>{clearInterval(timer);listener.remove();};},[session?.user?.id]);
  if (loading) return <Center text="Starter Fôrrytter App …" />;
  if(recovering)return <PasswordRecovery supabase={supabase} session={session} reset onClose={finishRecovery}/>;
  if(authError&&!session)return <SafeAreaView style={styles.safe}><View style={styles.centerBox}><Text>{authError}</Text><Btn title="Prøv igjen" onPress={async()=>{const {data,error}=await supabase.auth.getSession();if(!error){setSession(data.session);setAuthError('');}}}/></View></SafeAreaView>;
  if (!session) return <AuthScreen />;
  if(!membership&&membershipLoading)return <Center text="Henter din oversikt …"/>;
  if(!membership&&membershipError)return <SafeAreaView style={styles.safe}><View style={styles.centerBox}><Text>{membershipError}</Text><Btn title="Prøv igjen" onPress={loadMembership}/></View></SafeAreaView>;
  if (!membership) return <WaitingScreen identifier={session.user.email || session.user.phone || 'Ny bruker'} onRefresh={() => setRefreshKey(x => x + 1)} onLogout={async () => { try { await disableDeviceNotifications(supabase); } catch { Alert.alert('Varsler', 'Varsler kunne ikke slås av. Slå dem av i enhetens innstillinger hvis andre skal bruke enheten.'); } await supabase.auth.signOut(); }} />;

  const isAdmin = membership.role === 'owner' || membership.role === 'admin';
  const tabs = isAdmin ? ['today','horseSwaps','feeding','messages','admin'] : ['today','horseSwaps','feeding','messages'];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <View><Text style={styles.title}>Fôrrytter App</Text><Text style={styles.muted}>Stall Nordstjerna · {membership.role === 'owner' ? 'Eier' : membership.role === 'admin' ? 'Admin' : 'Fôrrytter'}</Text></View>
        <Btn title="Logg ut" secondary onPress={async () => { try { await disableDeviceNotifications(supabase); } catch { Alert.alert('Varsler', 'Varsler kunne ikke slås av. Slå dem av i enhetens innstillinger hvis andre skal bruke enheten.'); } await supabase.auth.signOut(); }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {!!membershipError&&<Text accessibilityRole="alert">{membershipError}</Text>}
        {tab === 'today' && <TodayScreen userId={session.user.id} />}
        {tab === 'horseSwaps' && <HorseSwaps supabase={supabase} stableId={STABLE_ID} userId={session.user.id} isAdmin={isAdmin}/>}
        {tab === 'feeding' && <FeedingScreen userId={session.user.id} />}
        {tab === 'messages' && <MessagesScreen isAdmin={isAdmin} />}
        {tab === 'admin' && isAdmin && <AdminScreen currentUserId={session.user.id} role={membership.role} />}
      </ScrollView>
      <View style={styles.nav}>
        {tabs.map(t => <Pressable key={t} onPress={() => setTab(t)} style={[styles.navBtn, tab===t && styles.navActive]}><Text style={styles.navText}>{({today:'Min oversikt',horseSwaps:'Bytt hest',feeding:'Fôring',messages:'Beskjeder',admin:'Admin'})[t]}</Text></Pressable>)}
      </View>
    </SafeAreaView>
  );
}

function AuthScreen() {
  const [forgot,setForgot]=useState(false);
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

  if(forgot)return <PasswordRecovery supabase={supabase} onClose={()=>setForgot(false)}/>;
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.authWrap}><Text style={styles.logo}>🐴</Text><Text style={styles.bigTitle}>Fôrrytter App</Text><Text style={styles.centerMuted}>Stall Nordstjerna</Text><View style={styles.card}>
    <View style={styles.segment}><Btn title="Logg inn" onPress={() => {setMode('login');setSmsSent(false);}} secondary={mode!=='login'} /><Btn title="Ny bruker" onPress={() => {setMode('signup');setSmsSent(false);}} secondary={mode!=='signup'} /></View>
    <Text style={styles.label}>Velg innlogging</Text>
    <View style={styles.segment}><Btn title="E-post" onPress={() => changeMethod('email')} secondary={method!=='email'} /><Btn title="Telefon" onPress={() => changeMethod('phone')} secondary={method!=='phone'} /></View>
    {mode==='signup' && <Field label="Fullt navn" value={name} onChangeText={setName} />}
    {method==='email' ? <>
      <Field label="E-post" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <Field label="Passord" value={password} onChangeText={setPassword} secureTextEntry />
      <Btn title={busy ? 'Vent …' : mode==='login' ? 'Logg inn' : 'Opprett bruker'} onPress={submitEmail} disabled={busy} />
      {mode==='login'&&<><Text style={styles.help}>Innloggingen huskes på denne enheten.</Text><View style={{marginTop:12}}><Btn title="Glemt passord?" secondary onPress={()=>setForgot(true)}/></View></>}
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

function HorseDayTasks({userId,selectedDate,showHorse=false}) {
  const [tasks,setTasks]=useState([]),[dayAssignment,setDayAssignment]=useState(null);
  const [saving,setSaving]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const taskRequest=useRef(0),savingRef=useRef(false);
  useEffect(()=>{
    loadTasks();
    const refresh=()=>loadTasks(true);
    const timer=setInterval(refresh,30000);
    const listener=AppState.addEventListener('change',state=>{if(state==='active')refresh();});
    if(Platform.OS==='web')window.addEventListener('focus',refresh);
    return()=>{clearInterval(timer);listener.remove();if(Platform.OS==='web')window.removeEventListener('focus',refresh);taskRequest.current++;};
  },[selectedDate,userId]);
  async function loadTasks(background = false) {
    if(savingRef.current)return;
    const id = ++taskRequest.current;
    setError(''); if(!background)setLoading(true);
    if (!background) { setTasks([]); setDayAssignment(null); }
    try {
      const [result,day] = await Promise.all([
        supabase.from('tasks').select('*,horses(name)').eq('stable_id',STABLE_ID).eq('task_date',selectedDate).eq('assigned_to',userId).order('standard_task_key',{nullsFirst:false}).order('created_at'),
        supabase.from('horse_assignments').select('*,horses(name)').eq('stable_id',STABLE_ID).eq('user_id',userId).eq('assignment_date',selectedDate).eq('is_cancelled',false).maybeSingle()
      ]);
      if(day.error) throw day.error;
      if (result.error) throw result.error;
      if (id === taskRequest.current) {setTasks(result.data || []);setDayAssignment(day.data);}
    } catch (e) { if (id === taskRequest.current) setError('Kunne ikke oppdatere oppgavene. Prøv igjen.'); } finally { if(id===taskRequest.current)setLoading(false); }
  }
  async function toggle(task){
    if (savingRef.current) return;
    savingRef.current = true; taskRequest.current++; setSaving(task.id);
    try {
      const {data,error}=await supabase.from('tasks').update({completed:!task.completed,completed_at:!task.completed?new Date().toISOString():null}).eq('stable_id',STABLE_ID).eq('assigned_to',userId).eq('id',task.id).select('id,completed,completed_at').single();
      if(error) throw error;
      setTasks(items => items.map(item => item.id === data.id ? {...item,...data} : item));
    } catch (e) { Alert.alert('Ikke lagret','Avkryssingen kunne ikke lagres. Prøv igjen.'); }
    finally { savingRef.current = false; setSaving(null); }
  }

  return <View style={{marginTop:12}}><Text style={styles.sectionSmall}>Oppgaver · {formatDate(selectedDate)}</Text>{showHorse&&dayAssignment&&<><Text style={styles.bold}>{dayAssignment.horses?.name}</Text><TrainingText text={dayAssignment.training_text}/></>}{error?<><Text accessibilityRole="alert">{error}</Text><Btn title="Prøv igjen" secondary onPress={()=>loadTasks()}/></>:null}{loading?<Text style={styles.muted}>Henter oppgaver …</Text>:tasks.length?tasks.map(x=><Pressable key={x.id} accessibilityRole="checkbox" accessibilityState={{checked:x.completed,disabled:!!saving}} disabled={!!saving} onPress={()=>toggle(x)} style={styles.item}><Text style={x.completed?styles.done:null}>{x.completed?'✓ ':'○ '}{x.title}</Text>{x.horses?.name&&<Text style={styles.muted}>Hest: {x.horses.name}</Text>}</Pressable>):<Empty text="Ingen oppgaver på valgt dato."/>}</View>;
}

function TodayScreen({ userId }) {
  const [messages, setMessages] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [nextAssignment, setNextAssignment] = useState(null);
  const [nextShift, setNextShift] = useState(null);
  const [agreements,setAgreements] = useState([]);
  const [selectedDate, setSelectedDate] = useState(localDate());
  const [today, setToday] = useState(localDate());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  const [showCalendar,setShowCalendar]=useState(false);
  const [showDetails,setShowDetails]=useState(false);
  const [taskRevision,setTaskRevision]=useState(0);
  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') load(); });
    const focus = () => load();
    if (Platform.OS === 'web') window.addEventListener('focus', focus);
    return () => { clearInterval(timer); listener.remove(); if (Platform.OS === 'web') window.removeEventListener('focus', focus); request.current++; };
  }, [userId]);

  async function load(){
    const id = ++request.current;
    const d=localDate(); setToday(d); setBusy(true); setError('');
    try {
      const [m,s,a,n,f,r]=await Promise.all([
        supabase.from('messages').select('*').eq('stable_id',STABLE_ID).eq('active',true).gte('created_at',messageCutoff()).order('created_at',{ascending:false}),
        supabase.from('feeding_shifts').select('*').eq('stable_id',STABLE_ID).eq('shift_date',d).eq('assigned_to',userId).order('shift_time'),
        supabase.from('horse_assignments').select('*,horses(name)').eq('stable_id',STABLE_ID).eq('assignment_date',d).eq('user_id',userId).eq('is_cancelled',false),
        supabase.from('horse_assignments').select('*,horses(name)').eq('stable_id',STABLE_ID).gt('assignment_date',d).eq('user_id',userId).eq('is_cancelled',false).order('assignment_date').limit(1).maybeSingle(),
        supabase.from('feeding_shifts').select('*').eq('stable_id',STABLE_ID).eq('assigned_to',userId).or(upcomingShiftFilter(d,timeKey())).order('shift_date').order('shift_time').limit(1).maybeSingle(),
        supabase.from('recurring_horse_assignments').select('*,horses(name)').eq('stable_id',STABLE_ID).eq('user_id',userId).eq('active',true).order('week_parity').order('weekday')
      ]);
      const failure = [m,s,a,n,f,r].find(result => result.error);
      if (failure) throw failure.error;
      let swap = null;
      if (n.data && !n.data.recurring_id) {
        const result = await supabase.from('horse_swap_requests').select('status,from_assignment_id,to_assignment_id,from_snapshot,to_snapshot').eq('stable_id',STABLE_ID).eq('status','approved').or(`from_assignment_id.eq.${n.data.id},to_assignment_id.eq.${n.data.id}`).order('decided_at',{ascending:false}).limit(1).maybeSingle();
        if (result.error) throw result.error;
        swap = result.data;
      }
      if (id !== request.current) return;
      setMessages(m.data||[]); setShifts(s.data||[]); setAssignments(a.data||[]);
      setNextAssignment(n.data ? {...n.data, origin:assignmentOrigin(n.data,r.data||[],swap)} : null); setNextShift(f.data); setAgreements(r.data||[]);
    } catch (e) { if (id === request.current) setError('Kunne ikke oppdatere oversikten. Prøv igjen.'); }
    finally { if (id === request.current) setBusy(false); }
  }

  return <>
    <Section title="Min oversikt"><Text style={styles.muted}>{formatDateLong(today)} · {weekLabel(today)} · Versjon 1.7.7</Text>{error?<Text accessibilityRole="alert">{error}</Text>:null}<Btn title={busy?'Oppdaterer …':'Oppdater'} disabled={busy} secondary onPress={()=>{load();setTaskRevision(v=>v+1);}}/></Section>
    {assignments.length>0&&<Section title="Min hest i dag">{assignments.map(a=><View key={a.id}><View style={styles.horseCard}><Text style={styles.horseName}>🐴 {a.horses?.name || 'Hest'}</Text><Text>{formatDateLong(today)}</Text><TrainingText text={a.training_text}/></View><HorseDayTasks key={a.id+today+taskRevision} userId={userId} selectedDate={today}/></View>)}</Section>}
    <Section title="Neste gang jeg har hest">{nextAssignment?<><View style={styles.horseCard}><Text style={styles.horseName}>🐴 {nextAssignment.horses?.name || 'Hest'}</Text><Text>{formatDateLong(nextAssignment.assignment_date)} · {weekLabel(nextAssignment.assignment_date)}</Text><Text style={styles.muted}>{nextAssignment.origin}</Text>{!nextAssignment.recurring_id&&nextAssignment.origin!=='Godkjent hestebytte'&&<Text style={styles.help}>Treningen er lagret spesielt for denne datoen og overstyrer fast avtale.</Text>}<TrainingText text={nextAssignment.training_text}/></View><HorseDayTasks key={nextAssignment.id+nextAssignment.assignment_date+taskRevision} userId={userId} selectedDate={nextAssignment.assignment_date}/></>:<Empty text="Ingen kommende hestetildeling registrert."/>}</Section>
    {(shifts.length>0||nextShift)&&<Section title="Mine fôringer">{shifts.map(shift=><View key={shift.id} style={styles.item}><Text style={styles.bold}>I dag · {feedingLabel(shift)}</Text><Text style={styles.muted}>{formatDate(shift.shift_date)}</Text></View>)}{nextShift&&!shifts.some(shift=>shift.id===nextShift.id)&&<View style={styles.item}><Text style={styles.bold}>{feedingLabel(nextShift)}</Text><Text>{formatDateLong(nextShift.shift_date)}</Text></View>}</Section>}
    <Btn title={showDetails?'Skjul flere valg':'Flere valg'} secondary onPress={()=>setShowDetails(v=>!v)}/>
    {showDetails&&<>
    <Section title="Mine faste hestedager">{agreements.length?groupAgreements(agreements).map(r=><View key={r.key} style={styles.item}><Text style={styles.bold}>{r.horses?.name} · {groupLabel(r)}</Text><Text style={styles.muted}>Fra {formatDate(r.start_date)}</Text><TrainingText text={r.training_text}/></View>):<Empty text="Ingen fast avtale registrert. Admin kan legge inn partalls- og oddetallsuker."/>}</Section>
    <Section title="Oppgaver på andre datoer"><Btn title={showCalendar?'Skjul kalender':'Velg en annen dato'} secondary onPress={()=>setShowCalendar(v=>!v)}/>{showCalendar&&<><CalendarPicker value={selectedDate} onChange={setSelectedDate}/><HorseDayTasks key={selectedDate+taskRevision} userId={userId} selectedDate={selectedDate} showHorse/></>}</Section>
    <Notifications supabase={supabase} stableId={STABLE_ID} userId={userId}/>
    </>}
    {messages.length>0&&<Section title="Beskjeder">{messages.length?messages.map(x=><View key={x.id} style={styles.notice}><Text>{x.text}</Text></View>):<Empty text="Ingen nye beskjeder."/>}</Section>}
  </>;
}

function FeedingScreen({ userId }) {
 const [shifts,setShifts]=useState([]),[members,setMembers]=useState([]),[selectedDate,setSelectedDate]=useState(localDate()),[visibleMonth,setVisibleMonth]=useState(localDate()),[busy,setBusy]=useState(false),[error,setError]=useState(''),[updated,setUpdated]=useState(null);
 const request=useRef(0);
 useEffect(()=>{load();const timer=setInterval(load,30000);const listener=AppState.addEventListener('change',state=>{if(state==='active')load();});const focus=()=>load();if(Platform.OS==='web')window.addEventListener('focus',focus);return()=>{request.current++;clearInterval(timer);listener.remove();if(Platform.OS==='web')window.removeEventListener('focus',focus);};},[selectedDate,visibleMonth,userId]);
 async function load(){const id=++request.current;setBusy(true);setError('');try{
 const selected=parseIsoDate(visibleMonth),first=toIsoDate(new Date(selected.getFullYear(),selected.getMonth(),1)),last=toIsoDate(new Date(selected.getFullYear(),selected.getMonth()+1,0));
 const from=selectedDate<first?selectedDate:first,to=selectedDate>last?selectedDate:last;
 const [s,m]=await Promise.all([supabase.from('feeding_shifts').select('*').eq('stable_id',STABLE_ID).gte('shift_date',from).lte('shift_date',to).order('shift_date').order('shift_time'),supabase.from('memberships').select('user_id,role,profiles(full_name)').eq('stable_id',STABLE_ID)]);
 if(s.error)throw s.error;if(m.error)throw m.error;if(id!==request.current)return;setShifts(s.data||[]);setMembers(m.data||[]);setUpdated(new Date());
 }catch{if(id===request.current)setError('Kunne ikke oppdatere fôringene. Listen kan være utdatert. Prøv igjen.');}finally{if(id===request.current)setBusy(false);}}
 const nameOf=id=>id?(members.find(m=>m.user_id===id)?.profiles?.full_name||'Tidligere bruker'):'Ikke fordelt';
 const dayShifts=shifts.filter(s=>s.shift_date===selectedDate),marked=[...new Set(shifts.map(s=>s.shift_date))];
 return <Section title="Fôringskalender"><Btn title={busy?'Oppdaterer …':'Oppdater fôringer'} disabled={busy} secondary onPress={load}/>{!!error&&<Text accessibilityRole="alert" style={styles.help}>{error}</Text>}{updated&&<Text style={styles.help}>Sist oppdatert {updated.toLocaleTimeString('nb-NO',{hour:'2-digit',minute:'2-digit'})} · oppdateres automatisk</Text>}<CalendarPicker value={selectedDate} onChange={date=>{setSelectedDate(date);setVisibleMonth(date);}} onMonthChange={setVisibleMonth} markedDates={marked}/><Text style={styles.sectionSmall}>{formatDateLong(selectedDate)}</Text>{dayShifts.length?dayShifts.map(s=><View key={s.id} style={styles.itemRow}><View><Text style={styles.bold}>{feedingLabel(s)}</Text><Text style={styles.muted}>{nameOf(s.assigned_to)}</Text></View></View>):busy?<Text>Henter fôringer …</Text>:!error&&<Empty text="Ingen morgen- eller kveldsfôring registrert denne dagen."/>}</Section>;
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
  const [adminPanel,setAdminPanel]=useState('overview');
  const [taskUser,setTaskUser]=useState(null),[taskHorse,setTaskHorse]=useState(null),[tasksDate,setTasksDate]=useState(localDate());
  const [requests,setRequests]=useState([]);
  const [members,setMembers]=useState([]);
  const [horses,setHorses]=useState([]);
  const [horse,setHorse]=useState('');
  const [allMembers,setAllMembers]=useState([]);
  const [managedUser,setManagedUser]=useState(null);
  const [profileSearch,setProfileSearch]=useState(''),[profileName,setProfileName]=useState(''),[profileFilter,setProfileFilter]=useState('active');
  useEffect(()=>{setProfileName(allMembers.find(m=>m.user_id===managedUser)?.profiles?.full_name||'');},[managedUser,allMembers]);
  async function saveProfileName(){if(!managedUser||!profileName.trim())return Alert.alert('Skriv inn navn');setMemberBusy(true);try{const {error}=await supabase.rpc('admin_update_profile_name',{p_stable:STABLE_ID,p_user:managedUser,p_name:profileName.trim()});if(error)throw error;await load();Alert.alert('Navn lagret','Navnet er oppdatert i brukerlisten.');}catch(e){Alert.alert('Kunne ikke lagre navn',e.message);}finally{setMemberBusy(false);}}

  const [unassigned,setUnassigned]=useState([]);
  const [replacements,setReplacements]=useState({});
  const [memberVersion,setMemberVersion]=useState(0);
  const [memberBusy,setMemberBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [shiftLabel,setShiftLabel]=useState('Morgenfôring');
  const [selectedUser,setSelectedUser]=useState(null);
  const [selectedHorse,setSelectedHorse]=useState(null);
  const [taskTitle,setTaskTitle]=useState('');
  const [adminTaskRevision,setAdminTaskRevision]=useState(0);
  const [trainingText,setTrainingText]=useState('');
  const [assignmentLoading,setAssignmentLoading]=useState(false);
  const [assignmentLoadFailed,setAssignmentLoadFailed]=useState(false);
  const [assignmentError,setAssignmentError]=useState('');
  const [taskDate,setTaskDate]=useState(nextWeekend());
  const [feedDate,setFeedDate]=useState(localDate());
  const [feedUser,setFeedUser]=useState(null);
  const [feedMonth,setFeedMonth]=useState(localDate()),[adminFeeds,setAdminFeeds]=useState([]),[feedLoading,setFeedLoading]=useState(true),[feedError,setFeedError]=useState(''),[feedSaving,setFeedSaving]=useState(false);
  const feedRequest=useRef(0),feedWorking=useRef(false);
  useEffect(()=>{if(adminPanel!=='feeding')return;loadAdminFeeds();const timer=setInterval(loadAdminFeeds,30000);const focus=()=>loadAdminFeeds();const listener=AppState.addEventListener('change',state=>{if(state==='active')focus();});if(Platform.OS==='web')window.addEventListener('focus',focus);return()=>{feedRequest.current++;clearInterval(timer);listener.remove();if(Platform.OS==='web')window.removeEventListener('focus',focus);};},[adminPanel,feedMonth,feedDate]);
  async function loadAdminFeeds(){const id=++feedRequest.current;setFeedLoading(true);setFeedError('');try{const d=parseIsoDate(feedMonth),first=toIsoDate(new Date(d.getFullYear(),d.getMonth(),1)),last=toIsoDate(new Date(d.getFullYear(),d.getMonth()+1,0));const {data,error}=await supabase.from('feeding_shifts').select('*').eq('stable_id',STABLE_ID).gte('shift_date',feedDate<first?feedDate:first).lte('shift_date',feedDate>last?feedDate:last).order('shift_date').order('shift_time');if(error)throw error;if(id===feedRequest.current)setAdminFeeds(data||[]);}catch{if(id===feedRequest.current)setFeedError('Kunne ikke hente fôringer. Oppdater før du registrerer en vakt.');}finally{if(id===feedRequest.current)setFeedLoading(false);}}
  function confirmRemoveFeeding(shift){const person=allMembers.find(m=>m.user_id===shift.assigned_to)?.profiles?.full_name||(shift.assigned_to?'Tidligere bruker':'Ikke fordelt');Alert.alert('Fjern fôring',formatDateLong(shift.shift_date)+' · '+feedingLabel(shift)+' · '+person+'. Vil du fjerne denne vakten?', [{text:'Avbryt',style:'cancel'},{text:'Fjern fôring',style:'destructive',onPress:()=>removeFeeding(shift)}]);}
  async function removeFeeding(shift){if(feedWorking.current)return;feedWorking.current=true;setFeedSaving(true);try{const {error}=await supabase.from('feeding_shifts').delete().eq('stable_id',STABLE_ID).eq('id',shift.id).select('id').single();if(error)throw error;await Promise.all([loadAdminFeeds(),load()]);Alert.alert('Fjernet','Fôringen er fjernet fra kalenderen.');}catch(e){Alert.alert('Kunne ikke fjerne fôring',e.message);}finally{feedWorking.current=false;setFeedSaving(false);}}

  useEffect(()=>{
    let live=true;
    setTrainingText(''); setAssignmentError(''); setAssignmentLoadFailed(false);
    if(!selectedUser){setAssignmentLoading(false);return;}
    setAssignmentLoading(true);
    supabase.from('horse_assignments').select('horse_id,training_text,is_cancelled,recurring_id').eq('stable_id',STABLE_ID).eq('user_id',selectedUser).eq('assignment_date',taskDate).maybeSingle().then(({data,error})=>{
      if(!live)return;
      if(error){setAssignmentLoadFailed(true);setAssignmentError('Kunne ikke hente dagens avtale. Velg datoen på nytt.');}
      else if(data){setSelectedHorse(data.horse_id);setTrainingText(data.training_text||'');if(!data.recurring_id&&!data.is_cancelled)setAssignmentError('Denne datoen har en egen treningsplan som overstyrer den faste avtalen.');if(data.is_cancelled)setAssignmentError('Denne dagen er avlyst. Lagre for å gjenopprette den.');}
      setAssignmentLoading(false);
    }).catch(()=>{if(live){setAssignmentLoadFailed(true);setAssignmentError('Kunne ikke hente dagens avtale.');setAssignmentLoading(false);}});
    return()=>{live=false;};
  },[selectedUser,taskDate]);

  useEffect(()=>{load();},[]);
  async function load(){
    const [r,m,h,u]=await Promise.all([
      supabase.from('join_requests').select('*').eq('stable_id',STABLE_ID).eq('status','pending').order('created_at'),
      supabase.from('memberships').select('user_id,role,active,profiles(full_name)').eq('stable_id',STABLE_ID).eq('archived',false),
      supabase.from('horses').select('*').eq('stable_id',STABLE_ID).eq('active',true).order('name'),
      supabase.from('feeding_shifts').select('*').eq('stable_id',STABLE_ID).is('assigned_to',null).gte('shift_date',localDate()).order('shift_date').order('shift_time')
    ]);
    setRequests(r.data||[]); setAllMembers(m.data||[]);setMembers((m.data||[]).filter(x=>x.active));setUnassigned(u.data||[]); setHorses(h.data||[]);
  }
  const nameOf=id=>members.find(m=>m.user_id===id)?.profiles?.full_name||id.slice(0,8);
  function confirmMemberAccess(m){
    Alert.alert(m.active?'Fjern bruker fra stallen':'Gi tilgang igjen',m.active?`Vil du fjerne ${m.profiles?.full_name||'brukeren'}? Faste hesteavtaler avsluttes. Kommende fôringer fristilles og må fordeles på nytt. Historikk og utførte oppgaver beholdes.`:'Brukeren får stalltilgang igjen. Tidligere faste avtaler og vakter må registreres på nytt.',[{text:'Avbryt',style:'cancel'},{text:m.active?'Fjern bruker':'Gi tilgang',style:m.active?'destructive':'default',onPress:()=>changeMemberAccess(m)}]);
  }
  async function changeMemberAccess(m){
    setMemberBusy(true);
    try{const {error}=await supabase.from('memberships').update({active:!m.active}).eq('stable_id',STABLE_ID).eq('user_id',m.user_id).select('user_id').single();if(error)throw error;
      setSelectedUser(null);setFeedUser(null);setMemberVersion(v=>v+1);await load();Alert.alert('Lagret',m.active?'Brukeren er fjernet. Kontroller Fôringer uten rytter.':'Brukeren har tilgang igjen.');
    }catch(e){Alert.alert('Kunne ikke endre tilgang',e.message);}finally{setMemberBusy(false);}
  }
  async function reassignFeeding(shift){
    const person=replacements[shift.id];if(!person)return Alert.alert('Velg ny fôrrytter');
    const {error}=await supabase.from('feeding_shifts').update({assigned_to:person}).eq('stable_id',STABLE_ID).eq('id',shift.id).is('assigned_to',null).select('id').single();
    if(error)Alert.alert('Kunne ikke fordele',error.message);else{await load();Alert.alert('Lagret','Fôringen er fordelt.');}
  }
  async function approveUser(req){const {error}=await supabase.from('memberships').upsert({stable_id:STABLE_ID,user_id:req.user_id,role:'rider',active:true},{onConflict:'stable_id,user_id'});if(error&&!error.message.includes('duplicate'))return Alert.alert('Feil',error.message);await supabase.from('join_requests').update({status:'approved'}).eq('id',req.id);load();}
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
    if(assignmentLoading||assignmentLoadFailed)return;
    if(!selectedUser||!selectedHorse)return Alert.alert('Velg fôrrytter og hest');
    if(!isWeekend(taskDate))return Alert.alert('Velg lørdag eller søndag');
    const {error}=await supabase.from('horse_assignments').upsert({stable_id:STABLE_ID,assignment_date:taskDate,user_id:selectedUser,horse_id:selectedHorse,created_by:currentUserId,training_text:trainingText.trim(),recurring_id:null,is_cancelled:false},{onConflict:'stable_id,assignment_date,user_id'});
    if(error)Alert.alert('Feil',error.message);else {setAdminTaskRevision(v=>v+1);Alert.alert('Lagret',`Hest og trening er lagret ${formatDate(taskDate)}.`);}
  }
  async function removeHorseAssignment(){
    if(!selectedUser)return Alert.alert('Velg fôrrytter først');
    const {error}=await supabase.from('horse_assignments').update({is_cancelled:true,recurring_id:null}).eq('stable_id',STABLE_ID).eq('assignment_date',taskDate).eq('user_id',selectedUser);
    if(error)Alert.alert('Feil',error.message);else {setAdminTaskRevision(v=>v+1);Alert.alert('Fjernet',`Hestefordelingen ${formatDate(taskDate)} er fjernet.`);}
  }
  async function addTask(){
    if(!taskUser||!taskHorse)return Alert.alert('Velg fôrrytter og hest');
    if(!taskTitle.trim())return Alert.alert('Skriv inn oppgave');
    const {error}=await supabase.from('tasks').insert({stable_id:STABLE_ID,title:taskTitle.trim(),task_date:tasksDate,assigned_to:taskUser,horse_id:taskHorse});
    if(error)Alert.alert('Feil',error.message);else{setTaskTitle('');setAdminTaskRevision(v=>v+1);Alert.alert('Lagt til','Oppgaven vises hos fôrrytteren på valgt dato.');}
  }
  async function addMessage(){if(!message.trim())return;const {error}=await supabase.from('messages').insert({stable_id:STABLE_ID,text:message.trim(),created_by:currentUserId});if(error)Alert.alert('Feil',error.message);else{setMessage('');Alert.alert('Publisert','Beskjeden vises i 24 timer.');}}
  async function addShift(){
    if(!feedUser)return Alert.alert('Velg fôrrytter');if(feedWorking.current||feedLoading||feedError)return;
    const shiftTime=shiftLabel==='Morgenfôring'?'08:00':'20:00';feedWorking.current=true;setFeedSaving(true);
    try{const {data:existing,error:checkError}=await supabase.from('feeding_shifts').select('id').eq('stable_id',STABLE_ID).eq('shift_date',feedDate).eq('shift_time',shiftTime).limit(1);if(checkError)throw checkError;if(existing.length){await loadAdminFeeds();return Alert.alert('Fôringen er allerede registrert','Fjern feilregistreringen nedenfor før du legger inn en ny.');}
    const {error}=await supabase.from('feeding_shifts').insert({stable_id:STABLE_ID,shift_date:feedDate,shift_time:shiftTime,label:shiftLabel,assigned_to:feedUser,original_assigned_to:feedUser,created_by:currentUserId});if(error)throw error;await Promise.all([loadAdminFeeds(),load()]);Alert.alert('Lagt til',shiftLabel+' '+formatDate(feedDate)+' er opprettet.');}catch(e){Alert.alert('Kunne ikke registrere fôring',e.message);}finally{feedWorking.current=false;setFeedSaving(false);}
  }

  const sections=[['profiles','Brukerprofiler','Finn en bruker, godkjenn tilgang og endre rolle.'],['agreements','Faste avtaler','Rediger faste helger, hest og trening.'],['training','Hest og trening','Endre hest eller trening på én bestemt dato.'],['tasks','Oppgaver','Legg til og fjern oppgaver for en hestedag.'],['feeding','Fôringer','Fordel morgen- og kveldsfôring.'],['horses','Hester','Legg til eller fjern hester fra listen.'],['messages','Beskjeder','Publiser en beskjed til alle.']];
  const currentSection=sections.find(x=>x[0]===adminPanel);
  return <>
    <Section title="Admin"><Text style={styles.help}>Velg hva du vil administrere.</Text>{adminPanel!=='overview'&&<Btn title="Tilbake til adminoversikt" secondary onPress={()=>setAdminPanel('overview')}/>}<View style={styles.choiceWrap}>{sections.map(([key,title])=><Choice key={key} label={title} selected={adminPanel===key} onPress={()=>setAdminPanel(key)}/>)}</View>{currentSection&&<><Text style={styles.bold}>{currentSection[1]}</Text><Text style={styles.help}>{currentSection[2]}</Text></>}</Section>
    {adminPanel==='overview'&&<Section title="Adminoversikt"><Text style={styles.help}>{members.length} aktive brukere · {horses.length} hester</Text>{requests.length>0&&<Btn title={requests.length+' nye brukere venter på godkjenning'} onPress={()=>setAdminPanel('profiles')}/>} {unassigned.length>0&&<Btn title={unassigned.length+' fôringer mangler rytter'} onPress={()=>setAdminPanel('feeding')}/>} {sections.map(([key,title,description])=><Pressable key={key} accessibilityRole="button" accessibilityLabel={'Åpne '+title} style={styles.item} onPress={()=>setAdminPanel(key)}><Text style={styles.bold}>{title} →</Text><Text style={styles.help}>{description}</Text></Pressable>)}</Section>}

    <View style={{display:adminPanel==='profiles'?'flex':'none'}}><Section title="Nye brukere">{requests.length?requests.map(r=><View key={r.id} style={styles.item}><Text style={styles.bold}>Ny konto · {r.user_id.slice(0,8)}</Text><Text style={styles.muted}>Venter på tilgang</Text><View style={styles.row}><Btn title="Godkjenn" onPress={()=>approveUser(r)}/><Btn title="Avslå" danger onPress={()=>declineUser(r)}/></View></View>):<Empty text="Ingen nye brukere venter."/>}</Section></View>

    <View style={{display:adminPanel==='profiles'?'flex':'none'}}><Section title="Brukerprofiler"><Field label="Søk etter navn" value={profileSearch} onChangeText={setProfileSearch} placeholder="Skriv hele eller deler av navnet"/><View style={styles.choiceWrap}>{[['active','Aktive'],['removed','Fjernede'],['all','Alle']].map(([key,label])=><Choice key={key} label={label} selected={profileFilter===key} onPress={()=>setProfileFilter(key)}/>)}</View><Dropdown label="Velg profil å redigere" value={managedUser} onChange={setManagedUser} options={memberOptions(allMembers.filter(m=>(profileFilter==='all'||(profileFilter==='active'?m.active:!m.active))&&(m.profiles?.full_name||'').toLocaleLowerCase('nb').includes(profileSearch.trim().toLocaleLowerCase('nb'))))}/>{!managedUser&&<Empty text="Velg en bruker for å se navn, rolle og tilgang."/>}{allMembers.filter(m=>m.user_id===managedUser).map(m=><View key={m.user_id} style={styles.item}><Text style={styles.bold}>Du redigerer: {m.profiles?.full_name||'Bruker'}</Text><Field label="Navn på profilen" value={profileName} onChangeText={setProfileName} maxLength={120}/><Btn title={memberBusy?'Lagrer …':'Lagre navn'} disabled={memberBusy||!profileName.trim()||profileName.trim()===(m.profiles?.full_name||'')} onPress={saveProfileName}/><Text style={styles.muted}>{m.role==='owner'?'Eier':m.role==='admin'?'Admin':'Fôrrytter'}{!m.active?' · Fjernet fra stallen':''}</Text>{role==='owner'&&m.active&&m.user_id!==currentUserId&&m.role!=='owner'&&<View style={styles.row}><Btn title="Fôrrytter" secondary={m.role!=='rider'} onPress={()=>setRoleFor(m,'rider')}/><Btn title="Admin" secondary={m.role!=='admin'} onPress={()=>setRoleFor(m,'admin')}/></View>}{m.user_id!==currentUserId&&m.role!=='owner'&&(role==='owner'||m.role==='rider')&&<Btn title={m.active?'Fjern bruker fra stallen':'Gi tilgang igjen'} danger={m.active} disabled={memberBusy} onPress={()=>confirmMemberAccess(m)}/>}</View>)}<Text style={styles.help}>Fjerning stenger stalltilgangen. Kontoen og historikken beholdes. Eier kan ikke fjernes her.</Text></Section></View>
    <View style={{display:adminPanel==='feeding'?'flex':'none'}}><Section title="Fôringer uten rytter">{unassigned.length?unassigned.map(shift=><View key={shift.id} style={styles.item}><Text style={styles.bold}>{formatDate(shift.shift_date)} · {feedingLabel(shift)}</Text><Dropdown label="Ny fôrrytter" value={replacements[shift.id]} onChange={value=>setReplacements(x=>({...x,[shift.id]:value}))} options={memberOptions(members)}/><Btn title="Fordel fôringen" onPress={()=>reassignFeeding(shift)}/></View>):<Empty text="Ingen kommende fôringer mangler rytter."/>}</Section></View>

    <View style={{display:adminPanel==='agreements'?'flex':'none'}}><RecurringAgreementsAdmin key={memberVersion} members={members} horses={horses} currentUserId={currentUserId}/></View>
    <View style={{display:adminPanel==='training'?'flex':'none'}}><Section title="Hest og trening på en dato">
      <Dropdown label="1. Velg fôrrytter" value={selectedUser} onChange={setSelectedUser} options={memberOptions(members)}/>
      <Dropdown label="2. Velg hest" value={selectedHorse} onChange={setSelectedHorse} options={horseOptions(horses)}/>
      {!horses.length&&<Text style={styles.help}>Legg til hester i seksjonen «Hester» under først.</Text>}
      <Text style={styles.label}>3. Velg lørdag eller søndag</Text><CalendarPicker value={taskDate} onChange={setTaskDate} weekendOnly/>
      {selectedUser&&<View style={styles.notice}><Text style={styles.bold}>Du redigerer: {nameOf(selectedUser)}</Text><Text>{formatDateLong(taskDate)}{selectedHorse?' · '+(horses.find(h=>h.id===selectedHorse)?.name||''):''}</Text><Text>Endringen gjelder bare denne datoen.</Text></View>}<Field label="Trening denne dagen" value={trainingText} onChangeText={setTrainingText} multiline maxLength={4000} placeholder="Beskriv hva slags trening hesten skal ha"/><Text style={styles.help}>En lagring her gjelder bare valgt dato og overstyrer eventuell fast avtale.</Text>{!!assignmentError&&<Text style={styles.help}>{assignmentError}</Text>}<View style={styles.row}><Btn title="Lagre hest og trening" disabled={assignmentLoading||assignmentLoadFailed} onPress={saveHorseAssignment}/><Btn title="Fjern hestefordeling" danger onPress={removeHorseAssignment}/></View>

    </Section></View>

    <View style={{display:adminPanel==='tasks'?'flex':'none'}}><Section title="Oppgaver">
      <Text style={styles.help}>Velg rytter, hest og dato for å legge til eller fjerne oppgaver.</Text>
      <Dropdown label="Fôrrytter for oppgaver" value={taskUser} onChange={setTaskUser} options={memberOptions(members)}/>
      <Dropdown label="Hest for oppgaver" value={taskHorse} onChange={setTaskHorse} options={horseOptions(horses)}/>
      <CalendarPicker value={tasksDate} onChange={setTasksDate}/>
      <View style={styles.divider}/>
      <Text style={styles.bold}>Fem faste standardoppgaver</Text>
      {STANDARD_TASKS.map(title=><Text key={title} style={styles.help}>○ {title}</Text>)}
      <Text style={styles.help}>Opprettes automatisk når du lagrer hestetildelingen. Hver oppgave kan krysses av individuelt.</Text>
      {taskUser&&taskHorse&&<View style={styles.notice}><Text style={styles.bold}>Oppgaver for {nameOf(taskUser)}</Text><Text>{horses.find(h=>h.id===taskHorse)?.name} · {formatDateLong(tasksDate)}</Text></View>}<Field label="Ekstra oppgave" value={taskTitle} onChangeText={setTaskTitle} placeholder="En ekstra oppgave for valgt hest, rytter og dato"/>
      <Btn title="Legg til oppgave" onPress={addTask}/>
      <AdminTaskList key={[taskUser,taskHorse,tasksDate,adminTaskRevision].join(":")} userId={taskUser} horseId={taskHorse} date={tasksDate}/>

    </Section></View>

    <View style={{display:adminPanel==='horses'?'flex':'none'}}><Section title="Hester">{horses.length?horses.map(h=><View key={h.id} style={styles.itemRow}><Text style={styles.bold}>🐴 {h.name}</Text><Btn title="Fjern" danger onPress={()=>confirmRemoveHorse(h)}/></View>):<Empty text="Ingen hester lagt inn ennå."/>}<Field label="Ny hest" value={horse} onChangeText={setHorse}/><Btn title="Legg til hest" onPress={addHorse}/><Text style={styles.help}>Samme hestenavn kan ikke legges inn to ganger.</Text></Section></View>


    <View style={{display:adminPanel==='messages'?'flex':'none'}}><Section title="Ny fellesbeskjed"><Field label="Beskjed" value={message} onChangeText={setMessage} multiline/><Btn title="Publiser i 24 timer" onPress={addMessage}/></Section></View>

    <View style={{display:adminPanel==='feeding'?'flex':'none'}}><Section title="Legg inn fôring"><Text style={styles.help}>Prikk i kalenderen betyr at dagen har registrert fôring. Velg en dato for å se morgen og kveld.</Text><Btn title={feedLoading?'Oppdaterer …':'Oppdater fôringer'} secondary disabled={feedLoading||feedSaving} onPress={loadAdminFeeds}/><CalendarPicker value={feedDate} onChange={date=>{setFeedDate(date);setFeedMonth(date);}} onMonthChange={setFeedMonth} markedDates={[...new Set(adminFeeds.map(s=>s.shift_date))]}/>{!!feedError&&<Text accessibilityRole="alert">{feedError}</Text>}<Text style={styles.bold}>{formatDateLong(feedDate)}</Text>{['Morgenfôring','Kveldsfôring'].map(label=>{const matches=adminFeeds.filter(s=>s.shift_date===feedDate&&feedingLabel(s)===label);return <View key={label} style={styles.item}><Text style={styles.bold}>{label}</Text>{matches.length?matches.map(shift=><View key={shift.id}><Text>{allMembers.find(m=>m.user_id===shift.assigned_to)?.profiles?.full_name||(shift.assigned_to?'Tidligere bruker':'Ikke fordelt')}</Text><Btn title="Fjern fôring" danger disabled={feedSaving||feedLoading} onPress={()=>confirmRemoveFeeding(shift)}/></View>):<Text style={styles.muted}>{feedLoading?'Henter …':feedError?'Ukjent status':'Ikke registrert'}</Text>}</View>;})}<Dropdown label="Velg fôrrytter" value={feedUser} onChange={setFeedUser} options={memberOptions(members)}/><Text style={styles.label}>Velg morgen eller kveld</Text><View style={styles.choiceWrap}><Choice label="Morgenfôring" selected={shiftLabel==='Morgenfôring'} onPress={()=>setShiftLabel('Morgenfôring')}/><Choice label="Kveldsfôring" selected={shiftLabel==='Kveldsfôring'} onPress={()=>setShiftLabel('Kveldsfôring')}/></View><Btn title={feedSaving?'Lagrer …':'Legg til fôring'} disabled={feedSaving||feedLoading||!!feedError||!feedUser} onPress={addShift}/></Section></View>
  </>;
}

const TrainingText=({text})=><View style={{marginVertical:8}}><Text style={styles.bold}>Planlagt trening</Text><Text style={{color:'#455443',lineHeight:21}}>{text||'Admin har ikke beskrevet trening ennå.'}</Text></View>;

const Field=({label,...props})=><View style={{marginBottom:12}}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} {...props} style={[styles.input,props.multiline&&{minHeight:80,textAlignVertical:'top'}]} /></View>;
const Section=({title,children})=><View style={styles.card}><Text style={styles.section}>{title}</Text>{children}</View>;
const Empty=({text})=><Text style={styles.muted}>{text}</Text>;
const Center=({text})=><SafeAreaView style={styles.safe}><View style={styles.centerBox}><Text style={styles.bigTitle}>{text}</Text></View></SafeAreaView>;

const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:'#f7f3ea',...(Platform.OS==='web'?{width:'100%',maxWidth:1000,alignSelf:'center'}:{})},
  header:{padding:14,borderBottomWidth:1,borderBottomColor:'#ded9cf',backgroundColor:'#fff',flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  title:{fontSize:21,fontWeight:'800',color:'#283126'},bigTitle:{fontSize:25,fontWeight:'800',color:'#283126',textAlign:'center'},logo:{fontSize:42,textAlign:'center',marginBottom:8},
  muted:{color:'#6b746a',fontSize:13},centerMuted:{color:'#6b746a',fontSize:14,textAlign:'center',marginBottom:18},
  content:{padding:10,paddingBottom:120},card:{backgroundColor:'#fff',borderWidth:1,borderColor:'#ded9cf',borderRadius:15,padding:12,marginBottom:10},section:{fontSize:17,fontWeight:'800',marginBottom:10,color:'#283126'},sectionSmall:{fontSize:15,fontWeight:'800',marginVertical:12,color:'#283126'},
  item:{borderWidth:1,borderColor:'#e4e0d7',borderRadius:11,padding:10,marginBottom:8},itemRow:{borderWidth:1,borderColor:'#e4e0d7',borderRadius:11,padding:10,marginBottom:8,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
  notice:{backgroundColor:'#fff2c7',padding:10,borderRadius:10,marginBottom:8},horseCard:{backgroundColor:'#eef1ec',padding:14,borderRadius:12},horseName:{fontSize:20,fontWeight:'800',color:'#283126'},bold:{fontWeight:'700',color:'#283126'},done:{textDecorationLine:'line-through',color:'#6b746a'},
  row:{flexDirection:'row',gap:8,marginTop:8,flexWrap:'wrap'},btn:{backgroundColor:'#5f7652',paddingHorizontal:13,paddingVertical:9,borderRadius:10,minHeight:38,justifyContent:'center'},btnText:{color:'#fff',fontWeight:'700',fontSize:13},btnSecondary:{backgroundColor:'#eef1ec'},btnSecondaryText:{color:'#283126'},btnDanger:{backgroundColor:'#f7e5e3'},btnDangerText:{color:'#9f3f37'},disabled:{opacity:.5},
  input:{borderWidth:1,borderColor:'#d8d4ca',backgroundColor:'#fff',borderRadius:10,padding:11,fontSize:16,color:'#283126',marginTop:4},label:{fontSize:12,color:'#6b746a',marginBottom:6},help:{fontSize:12,color:'#6b746a',marginTop:10,lineHeight:18},helpCenter:{fontSize:14,color:'#6b746a',textAlign:'center',lineHeight:20,marginVertical:18},
  authWrap:{width:'100%',maxWidth:560,alignSelf:'center',padding:22,justifyContent:'center',flexGrow:1},centerBox:{padding:24,justifyContent:'center',alignItems:'center',flex:1,gap:10},segment:{flexDirection:'row',gap:8,marginBottom:16},
  choiceWrap:{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:14},choice:{borderWidth:1,borderColor:'#d8d4ca',borderRadius:999,paddingHorizontal:12,paddingVertical:8,backgroundColor:'#fff'},choiceSelected:{backgroundColor:'#5f7652',borderColor:'#5f7652'},choiceText:{color:'#455443',fontWeight:'700'},choiceTextSelected:{color:'#fff'},divider:{height:1,backgroundColor:'#e4e0d7',marginVertical:14},
  calendar:{borderWidth:1,borderColor:'#e4e0d7',borderRadius:12,padding:8,marginBottom:12},calendarHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:8},calendarTitle:{fontWeight:'800',fontSize:15,color:'#283126'},weekRow:{flexDirection:'row'},weekLabel:{width:'14.285%',textAlign:'center',fontSize:11,color:'#6b746a',fontWeight:'700',paddingVertical:6},calendarGrid:{flexDirection:'row',flexWrap:'wrap'},dayCell:{width:'14.285%',height:44,alignItems:'center',justifyContent:'center',borderRadius:9},dayActive:{backgroundColor:'#5f7652'},dayDisabled:{opacity:.28},dayText:{color:'#283126',fontWeight:'600'},dayTextActive:{color:'#fff',fontWeight:'800'},dayTextDisabled:{color:'#8a8f89'},dot:{width:5,height:5,borderRadius:3,backgroundColor:'#5f7652',marginTop:2},dotActive:{backgroundColor:'#fff'},selectedDate:{fontSize:12,color:'#6b746a',marginTop:8,textAlign:'center'},
  nav:{position:'absolute',left:0,right:0,bottom:Platform.OS==='web'?0:24,backgroundColor:'#fff',borderTopWidth:1,borderTopColor:'#ded9cf',borderBottomWidth:1,borderBottomColor:'#ded9cf',flexDirection:'row',paddingBottom:10,paddingTop:8},navBtn:{flex:1,paddingVertical:12,paddingHorizontal:8,alignItems:'center',borderRadius:10,marginHorizontal:3,minHeight:44,justifyContent:'center'},navActive:{backgroundColor:'#e9efe5'},navText:{fontSize:12,fontWeight:'700',color:'#455443'}
});

function RecurringAgreementsAdmin({members,horses,currentUserId}) {
 const [rules,setRules]=useState([]),[user,setUser]=useState(null),[horse,setHorse]=useState(null),[parities,setParities]=useState([0]),[days,setDays]=useState([6]),[start,setStart]=useState(localDate()),[training,setTraining]=useState(''),[editing,setEditing]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const working=useRef(false);useEffect(()=>{load();},[]);
 const nameOf=id=>members.find(m=>m.user_id===id)?.profiles?.full_name||'Fôrrytter';
 async function load(){const {data,error}=await supabase.from('recurring_horse_assignments').select('*,horses(name)').eq('stable_id',STABLE_ID).eq('active',true).order('week_parity').order('weekday');if(error)setError('Kunne ikke hente faste avtaler.');else {setRules(data||[]);setError('');}}
 function edit(g){setEditing(g);setUser(g.user_id);setHorse(g.horse_id);setParities(g.parities);setDays(g.days);setStart(g.start_date);setTraining(g.training_text||'');}
 function reset(){setEditing(null);setUser(null);setHorse(null);setParities([0]);setDays([6]);setStart(localDate());setTraining('');}
 const toggle=(set,value)=>set(xs=>xs.includes(value)?xs.filter(x=>x!==value):[...xs,value].sort());
 async function save(){if(!user||!horse||!days.length||!parities.length)return Alert.alert('Velg rytter, hest, minst én uketype og én dag');if(working.current)return;working.current=true;setBusy(true);try{const {error}=await supabase.rpc('save_recurring_agreement_group',{p_stable:STABLE_ID,p_user:user,p_horse:horse,p_parities:parities,p_days:days,p_start:start,p_training:training.trim(),p_previous:editing?.ids||[]});if(error)throw error;reset();await load();Alert.alert('Fast avtale lagret','Valgte uker og dager er lagret samlet. Trening på enkeltdatoer som er endret separat, beholdes.');}catch(e){Alert.alert('Kunne ikke lagre',e.message);}finally{working.current=false;setBusy(false);}}
 function stop(g){Alert.alert('Avslutt fast avtale',nameOf(g.user_id)+' · '+groupLabel(g)+'. Kommende dager uten fullførte oppgaver fjernes. Egne endringer på enkeltdatoer beholdes.',[{text:'Avbryt',style:'cancel'},{text:'Avslutt avtalen',style:'destructive',onPress:async()=>{setBusy(true);try{const {error}=await supabase.from('recurring_horse_assignments').update({active:false}).eq('stable_id',STABLE_ID).in('id',g.ids);if(error)throw error;reset();await load();}catch(e){Alert.alert('Kunne ikke avslutte',e.message);}finally{setBusy(false);}}}]);}
 const form=<View style={{marginTop:12}}>{editing?<Text style={styles.bold}>Rediger avtalen for {nameOf(user)}</Text>:<Dropdown label="Fôrrytter" value={user} onChange={setUser} options={memberOptions(members)}/>}<Text style={styles.label}>Uker – velg én eller begge</Text><View style={styles.choiceWrap}>{[0,1].map(p=><Choice key={p} label={p===0?'Partallsuker':'Oddetallsuker'} selected={parities.includes(p)} onPress={()=>!busy&&toggle(setParities,p)}/>)}</View><Text style={styles.label}>Dager – velg én eller begge</Text><View style={styles.choiceWrap}>{[6,7].map(d=><Choice key={d} label={d===6?'Lørdag':'Søndag'} selected={days.includes(d)} onPress={()=>!busy&&toggle(setDays,d)}/>)}</View><Dropdown label="Hest" value={horse} onChange={setHorse} options={horseOptions(horses)}/><Text style={styles.label}>Avtalen gjelder fra</Text><CalendarPicker value={start} onChange={setStart}/><Field label="Trening på faste hestedager" value={training} onChangeText={setTraining} multiline maxLength={4000} placeholder="Admin beskriver treningen her"/><Btn title={busy?'Lagrer …':'Lagre fast avtale'} disabled={busy} onPress={save}/>{editing&&<Btn title="Avbryt redigering" secondary disabled={busy} onPress={reset}/>}<Text style={styles.help}>Gjelder valgte uketyper og dager. Trening som er lagret spesielt for én dato, overstyrer den faste avtalen.</Text></View>;
 return <Section title="Faste fôrrytteravtaler"><Text style={styles.bold}>{weekLabel(localDate())}</Text><Text style={styles.help}>Velg både oddetalls- og partallsuker for alle uker, og lørdag, søndag eller begge dager.</Text>{!!error&&<><Text>{error}</Text><Btn title="Prøv igjen" secondary onPress={load}/></>}{groupAgreements(rules).map(g=><View key={g.key} style={styles.item}><Text style={styles.bold}>{nameOf(g.user_id)} · {g.horses?.name}</Text><Text>{groupLabel(g)} · fra {formatDate(g.start_date)}</Text><TrainingText text={g.training_text}/><View style={styles.row}><Btn title="Rediger" secondary disabled={busy} onPress={()=>edit(g)}/><Btn title="Avslutt" danger disabled={busy} onPress={()=>stop(g)}/></View>{editing?.key===g.key&&form}</View>)}{!rules.length&&!error&&<Empty text="Ingen faste avtaler registrert ennå."/>}{!editing&&<><View style={styles.divider}/><Text style={styles.bold}>Ny fast avtale</Text>{form}</>}</Section>;
}

function AdminTaskList({userId,horseId,date}){
 const [tasks,setTasks]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(null);
 useEffect(()=>{let live=true;if(!userId||!horseId){setLoading(false);return;}
 supabase.from('tasks').select('id,title,completed,standard_task_key').eq('stable_id',STABLE_ID).eq('assigned_to',userId).eq('horse_id',horseId).eq('task_date',date).order('created_at').then(({data,error})=>{if(live){if(error)setError('Kunne ikke hente oppgavene. Velg datoen på nytt.');else setTasks(data||[]);setLoading(false);}}).catch(()=>{if(live){setError('Kunne ikke hente oppgavene.');setLoading(false);}});return()=>{live=false;};},[userId,horseId,date]);
 async function remove(task){if(busy)return;setBusy(task.id);setError('');try{const {data,error}=await supabase.from('tasks').delete().eq('stable_id',STABLE_ID).eq('assigned_to',userId).eq('horse_id',horseId).eq('task_date',date).eq('id',task.id).select('id').single();if(error)throw error;if(data)setTasks(xs=>xs.filter(x=>x.id!==task.id));}catch{setError('Oppgaven kunne ikke fjernes. Prøv igjen.');}finally{setBusy(null);}}
 function confirm(task){Alert.alert('Fjern oppgave','Vil du fjerne «'+task.title+'» for valgt hest og rytter '+formatDate(date)+'?'+(task.completed?' Oppgaven er allerede fullført.':''),[{text:'Avbryt',style:'cancel'},{text:'Fjern oppgave',style:'destructive',onPress:()=>remove(task)}]);}
 if(!userId||!horseId)return null;
 return <View style={{marginTop:16}}><Text style={styles.bold}>Oppgaver for valgt hest og dato</Text><Text style={styles.help}>Fjerning gjelder bare denne rytteren, hesten og datoen. Andre hestedager beholder oppgavene sine.</Text>{!!error&&<Text accessibilityRole="alert">{error}</Text>}{loading?<Text>Henter oppgaver …</Text>:tasks.length?tasks.map(t=><View key={t.id} style={styles.item}><Text>{t.completed?'✓ ':''}{t.title}</Text><Text style={styles.muted}>{t.standard_task_key?'Standardoppgave':'Ekstraoppgave'}{t.completed?' · Fullført':''}</Text><Btn title={busy===t.id?'Fjerner …':'Fjern oppgave'} danger disabled={!!busy} onPress={()=>confirm(t)}/></View>):!error&&<Empty text="Ingen oppgaver for valgt hest og dato."/>}</View>;
}
