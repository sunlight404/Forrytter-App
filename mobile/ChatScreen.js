import React, { useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Alert } from './dialogs';
import CommunityChat from './CommunityChat';
import { DIRECT_TABLE, loadDirectInbox } from './directMessages';

export default function ChatScreen(props) {
  const [section, setSection] = useState('group');
  const draft = useRef('');
  function choose(next) {
    if (next === section) return;
    const change = () => { draft.current = ''; setSection(next); };
    if (draft.current.trim()) Alert.alert('Forkaste utkast?', 'Meldingen er ikke sendt. Vil du gå videre uten å sende?', [
      { text: 'Bli her', style: 'cancel' }, { text: 'Forkast utkast', style: 'destructive', onPress: change },
    ]); else change();
  }
  return <View>
    <View accessibilityRole="tablist" style={styles.tabs}>
      {[['group', 'Gruppechat'], ['private', 'Privat · én til én']].map(([key, label]) => <Pressable key={key} accessibilityRole="tab" accessibilityState={{selected:section === key}} onPress={() => choose(key)} style={[styles.tab, section === key && styles.selected]}><Text style={[styles.tabText, section === key && styles.selectedText]}>{label}</Text></Pressable>)}
    </View>
    {section === 'group' ? <CommunityChat {...props} onDraftChange={value => { draft.current = value; }} /> : <PrivateChats {...props} onDraftChange={value => { draft.current = value; }} />}
  </View>;
}

function PrivateChats({ supabase, stableId, userId, onDraftChange }) {
  const [contacts, setContacts] = useState([]), [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState(''), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const alive = useRef(false), request = useRef(0), draft = useRef('');
  async function load(quiet = false) {
    const current = ++request.current;
    if (!quiet) setLoading(true);
    try {
      const result = await loadDirectInbox(supabase, stableId, userId);
      if (alive.current && request.current === current) { setContacts(result); setError(''); }
    } catch { if (alive.current && request.current === current) setError('Kunne ikke hente samtalene. Prøv igjen når du har nett.'); }
    finally { if (alive.current && request.current === current) setLoading(false); }
  }
  useEffect(() => {
    alive.current = true; load();
    const channel = supabase.channel(`forrytter-inbox-${stableId}-${userId}`)
      .on('postgres_changes', {event:'INSERT',schema:'public',table:DIRECT_TABLE,filter:`stable_id=eq.${stableId}`}, () => load(true))
      .subscribe(status => { if (status === 'SUBSCRIBED') load(true); });
    const timer = setInterval(() => load(true), 15000);
    const state = AppState.addEventListener('change', value => { if (value === 'active') load(true); });
    const focus = () => load(true);
    if (Platform.OS === 'web') window.addEventListener('focus', focus);
    return () => {
      alive.current = false; request.current++; clearInterval(timer); state.remove();
      if (Platform.OS === 'web') window.removeEventListener('focus', focus);
      supabase.removeChannel(channel);
    };
  }, [supabase, stableId, userId]);
  function back() {
    const leave = () => { draft.current = ''; onDraftChange?.(''); setSelectedId(null); load(true); };
    if (draft.current.trim()) Alert.alert('Forkaste utkast?', 'Meldingen er ikke sendt. Vil du gå tilbake til samtalene?', [
      {text:'Bli her',style:'cancel'}, {text:'Forkast utkast',style:'destructive',onPress:leave},
    ]); else leave();
  }
  const selected = contacts.find(contact => contact.id === selectedId);
  if (selected) return <View>
    <Pressable accessibilityRole="button" onPress={back} style={styles.back}><Text style={styles.backText}>‹ Alle private samtaler</Text></Pressable>
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <CommunityChat key={selected.id} supabase={supabase} stableId={stableId} userId={userId} recipient={selected} onDraftChange={value => { draft.current = value; onDraftChange?.(value); }} />
  </View>;
  const filtered = contacts.filter(contact => contact.name.toLocaleLowerCase('nb').includes(search.trim().toLocaleLowerCase('nb')));
  return <View style={styles.card}>
    <Text style={styles.title}>Private samtaler</Text>
    <Text style={styles.help}>Velg et stallmedlem å skrive til. Samtalen er bare synlig for deg og den du velger.</Text>
    {contacts.some(contact => contact.duplicateName) && <Text style={styles.help}>Like navn skilles med en profil-ID. Din profil-ID er {userId.slice(-6)}. Bekreft riktig profil med personen hvis navnet er likt.</Text>}
    <TextInput accessibilityLabel="Søk etter stallmedlem" value={search} onChangeText={setSearch} placeholder="Søk etter navn …" style={styles.search} />
    <Pressable accessibilityRole="button" disabled={loading} onPress={() => load()} style={styles.back}><Text style={styles.backText}>{loading ? 'Henter …' : 'Oppdater samtaler'}</Text></Pressable>
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {!filtered.length && !loading && !error && <Text style={styles.help}>{search ? 'Ingen navn passer søket.' : 'Ingen andre stallmedlemmer å skrive til ennå.'}</Text>}
    {filtered.map(contact => <Pressable key={contact.id} accessibilityRole="button" accessibilityLabel={`Åpne privat samtale med ${contact.name}`} onPress={() => { draft.current = ''; onDraftChange?.(''); setSelectedId(contact.id); }} style={styles.contact}>
      <Text style={styles.name}>{contact.name}{!contact.active ? ' · Tidligere medlem' : ''}</Text>
      {contact.latest ? <><Text numberOfLines={2} style={styles.preview}>{contact.latest.sender_id === userId ? 'Du: ' : ''}{contact.latest.body}</Text><Text style={styles.date}>{new Date(contact.latest.created_at).toLocaleString('nb-NO',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</Text></> : <Text style={styles.help}>Start en privat samtale ›</Text>}
    </Pressable>)}
  </View>;
}

const styles = StyleSheet.create({
  tabs:{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:12},tab:{minHeight:44,borderRadius:10,padding:12,backgroundColor:'#eef1ec',justifyContent:'center'},selected:{backgroundColor:'#5f7652'},tabText:{fontWeight:'700',color:'#344033'},selectedText:{color:'#fff'},
  card:{backgroundColor:'#fff',borderWidth:1,borderColor:'#ded9cf',borderRadius:15,padding:14,marginBottom:10},title:{fontSize:19,fontWeight:'800',color:'#283126'},help:{color:'#6b746a',lineHeight:21,marginTop:6},
  search:{borderWidth:1,borderColor:'#ded9cf',borderRadius:12,padding:12,fontSize:16,backgroundColor:'#fafbf8',marginTop:14},back:{minHeight:44,paddingVertical:12,justifyContent:'center',alignSelf:'flex-start'},backText:{color:'#344d2e',fontWeight:'700'},
  contact:{borderWidth:1,borderColor:'#ded9cf',borderRadius:12,padding:14,marginTop:10,minHeight:64,backgroundColor:'#fafaf8'},name:{color:'#283126',fontWeight:'800',fontSize:16},preview:{color:'#455443',lineHeight:21,marginTop:6},date:{color:'#6b746a',fontSize:12,marginTop:6},error:{color:'#9f3f37',lineHeight:21,marginVertical:10},
});
