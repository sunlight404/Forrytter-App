import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { heartSummary, heartTargets, loadMessageHearts, setMessageHeart, subscribeMessageHearts } from './messageHearts';

const HeartsContext = createContext(null);

export function HeartsProvider({ supabase, userId, kind, messages, children }) {
  const targets = heartTargets(kind, messages);
  const signature = targets.map(target => target.messageId + ':' + target.key).join(',');
  const [rows, setRows] = useState({}), [ready, setReady] = useState(false), [error, setError] = useState('');
  const [busy, setBusy] = useState(new Set());
  const alive = useRef(false), request = useRef(0), scope = useRef(0), locks = useRef(new Set());
  async function load() {
    const current = ++request.current;
    try {
      const result = await loadMessageHearts(supabase, targets);
      if (alive.current && current === request.current) { setRows(result); setReady(true); setError(''); }
    } catch { if (alive.current && current === request.current) setError('Kunne ikke hente hjertene. Prøv å oppdatere.'); }
  }
  useEffect(() => {
    scope.current++; alive.current = true; setReady(false); setRows({}); setError(''); load();
    const channel = subscribeMessageHearts(supabase, kind, userId, targets, load);
    // DELETE events are not subscribed to: polling safely updates removed hearts.
    const timer = setInterval(load, 15000);
    const state = AppState.addEventListener('change', value => { if (value === 'active') load(); });
    if (Platform.OS === 'web') window.addEventListener('focus', load);
    return () => {
      alive.current = false; scope.current++; request.current++; clearInterval(timer); state.remove();
      if (Platform.OS === 'web') window.removeEventListener('focus', load);
      supabase.removeChannel(channel);
    };
  }, [supabase, userId, kind, signature]);
  async function change(target) {
    if (!ready || locks.current.has(target.key)) return;
    const currentScope = scope.current;
    const wanted = !heartSummary(rows[target.key] || [], userId).own;
    locks.current.add(target.key); setBusy(new Set(locks.current)); setError('');
    try {
      await setMessageHeart(supabase, target, userId, wanted);
      if (alive.current && currentScope === scope.current) await load();
    } catch { if (alive.current && currentScope === scope.current) setError('Kunne ikke bekrefte endringen av hjertet. Prøv igjen eller oppdater.'); }
    finally { locks.current.delete(target.key); if (alive.current) setBusy(new Set(locks.current)); }
  }
  return <HeartsContext.Provider value={{targets,rows,ready,busy,userId,change}}>
    {!!messages.length && <Text style={styles.help}>Trykk på hjertet for å vise at du har fått med deg meldingen.</Text>}
    {!!error && <View><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Pressable accessibilityRole="button" onPress={load} style={styles.namesButton}><Text style={styles.namesLink}>Oppdater hjerter</Text></Pressable></View>}
    {children}
  </HeartsContext.Provider>;
}

export function MessageHeart({ messageId }) {
  const context = useContext(HeartsContext);
  const [expanded, setExpanded] = useState(false);
  if (!context) return null;
  const target = context.targets.find(item => item.messageId === messageId);
  if (!target) return null;
  const summary = heartSummary(context.rows[target.key] || [], context.userId);
  const pending = context.busy.has(target.key);
  return <View style={styles.container}>
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" accessibilityLabel={summary.own ? 'Fjern ditt hjerte fra meldingen' : 'Gi hjerte for å bekrefte at du har fått med deg meldingen'} accessibilityState={{selected:summary.own,disabled:pending || !context.ready,busy:pending}} disabled={pending || !context.ready} onPress={() => context.change(target)} style={[styles.heart,summary.own && styles.active,(pending || !context.ready) && styles.disabled]}>
        <Text style={[styles.heartText,summary.own && styles.activeText]}>{summary.own ? '♥' : '♡'} {context.ready ? summary.count : '…'}{pending ? ' · Lagrer' : ''}</Text>
      </Pressable>
      {summary.count > 0 && <Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'Skjul hvem som har gitt hjerte' : 'Se hvem som har gitt hjerte'} accessibilityState={{expanded}} onPress={() => setExpanded(value => !value)} style={styles.namesButton}><Text style={styles.namesLink}>{expanded ? 'Skjul navn' : 'Se hvem'}</Text></Pressable>}
    </View>
    {expanded && summary.count > 0 && <Text selectable style={styles.names}>{summary.names.join(', ')}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  container:{marginTop:12},actions:{flexDirection:'row',alignItems:'center',gap:8,flexWrap:'wrap'},
  heart:{minHeight:44,paddingVertical:10,paddingHorizontal:15,borderRadius:22,borderWidth:1,borderColor:'#d9d5cc',backgroundColor:'#fff',justifyContent:'center'},active:{backgroundColor:'#f9e9e9',borderColor:'#d89198'},heartText:{fontSize:17,color:'#685d59',fontWeight:'700'},activeText:{color:'#a23f4c'},disabled:{opacity:0.55},
  namesButton:{minHeight:44,padding:10,justifyContent:'center'},namesLink:{fontWeight:'700',color:'#506a43'},names:{fontSize:13,lineHeight:20,color:'#455443',marginTop:4},help:{fontSize:13,lineHeight:20,color:'#6b746a',marginBottom:10},error:{color:'#9f3f37',lineHeight:21,marginTop:8},
});
