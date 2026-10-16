import React, { useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Alert } from './dialogs';
import { CHAT_TABLE, CHAT_PAGE_SIZE, MAX_MESSAGE_LENGTH, deleteCommunityMessage, loadCommunityMessages, messageBody, messageId, sendCommunityMessage } from './communityMessages';
import { DIRECT_TABLE, deleteDirectMessage, loadDirectMessages, sendDirectMessage } from './directMessages';
import { HeartsProvider, MessageHeart } from './MessageHearts';

function Button({ title, onPress, disabled, secondary, danger }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={[styles.button, secondary && styles.secondary, danger && styles.danger, disabled && styles.disabled]}>
    <Text style={[styles.buttonText, (secondary || danger) && styles.darkText]}>{title}</Text>
  </Pressable>;
}

export default function CommunityChat({ supabase, stableId, userId, isAdmin, recipient = null, onDraftChange }) {
  const privateChat = !!recipient;
  const canSend = !privateChat || recipient.active;
  const [items, setItems] = useState([]), [text, setText] = useState('');
  const [loading, setLoading] = useState(true), [sending, setSending] = useState(false);
  const [error, setError] = useState(''), [sendError, setSendError] = useState('');
  const [hasMore, setHasMore] = useState(false), [deleting, setDeleting] = useState(null);
  const alive = useRef(false), request = useRef(0), limit = useRef(CHAT_PAGE_SIZE);
  const sendLock = useRef(false), pendingDraft = useRef(null);

  async function load(quiet = false) {
    const id = ++request.current;
    if (!quiet) setLoading(true);
    try {
      const result = privateChat
        ? await loadDirectMessages(supabase, stableId, userId, recipient.id, limit.current)
        : await loadCommunityMessages(supabase, stableId, limit.current);
      if (!alive.current || id !== request.current) return;
      setItems(result.items); setHasMore(result.hasMore); setError('');
    } catch {
      if (alive.current && id === request.current) setError('Kunne ikke hente meldingene. Prøv igjen når du har nett.');
    } finally {
      if (alive.current && id === request.current) setLoading(false);
    }
  }

  useEffect(() => {
    alive.current = true; limit.current = CHAT_PAGE_SIZE; load();
    const channel = supabase.channel(`forrytter-chat-${stableId}-${userId}-${recipient?.id || 'group'}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: privateChat ? DIRECT_TABLE : CHAT_TABLE, filter: `stable_id=eq.${stableId}` }, () => load(true))
      .subscribe(status => { if (status === 'SUBSCRIBED') load(true); });
    // Polling also catches deleted messages and restores updates after lost connections.
    const timer = setInterval(() => load(true), 15000);
    const appState = AppState.addEventListener('change', state => { if (state === 'active') load(true); });
    const focus = () => load(true);
    if (Platform.OS === 'web') window.addEventListener('focus', focus);
    return () => {
      alive.current = false; request.current++; clearInterval(timer); appState.remove();
      if (Platform.OS === 'web') window.removeEventListener('focus', focus);
      supabase.removeChannel(channel);
    };
  }, [supabase, stableId, userId, recipient?.id]);

  async function send() {
    if (sendLock.current || !canSend) return;
    let body;
    try { body = messageBody(text); } catch (e) { setSendError(e.message); return; }
    sendLock.current = true; setSending(true); setSendError('');
    if (!pendingDraft.current || pendingDraft.current.body !== body) pendingDraft.current = { id: messageId(), stable_id: stableId, sender_id: userId, ...(privateChat ? { recipient_id: recipient.id } : {}), body };
    try {
      await (privateChat ? sendDirectMessage : sendCommunityMessage)(supabase, pendingDraft.current);
      if (!alive.current) return;
      setText(''); onDraftChange?.(''); pendingDraft.current = null; await load(true);
    } catch {
      if (alive.current) setSendError('Meldingen kunne ikke bekreftes sendt. Teksten er beholdt. Trykk Send for å prøve igjen.');
    } finally {
      sendLock.current = false; if (alive.current) setSending(false);
    }
  }

  async function remove(id) {
    if (deleting) return;
    setDeleting(id); setError('');
    try {
      await (privateChat ? deleteDirectMessage : deleteCommunityMessage)(supabase, stableId, id);
      if (alive.current) { setItems(xs => xs.filter(x => x.id !== id)); await load(true); }
    } catch { if (alive.current) setError('Meldingen kunne ikke fjernes. Prøv igjen.'); }
    finally { if (alive.current) setDeleting(null); }
  }

  function confirmRemove(item) {
    Alert.alert('Slett melding', privateChat ? 'Vil du slette denne meldingen for begge i samtalen?' : 'Vil du slette denne meldingen fra gruppechatten?', [
      { text: 'Avbryt', style: 'cancel' }, { text: 'Slett', style: 'destructive', onPress: () => remove(item.id) },
    ]);
  }

  return <View>
    <View style={styles.card}>
      <Text style={styles.title}>{privateChat ? recipient.name : 'Gruppechat'}</Text>
      <Text style={styles.help}>{privateChat ? 'Privat samtale. Bare dere to kan lese meldingene. De kommer ikke i gruppechatten eller på tavla.' : 'En felles samtale for godkjente stallmedlemmer. Du bruker den samme innloggingen som ellers i appen. Meldinger her kommer ikke på tavla.'}</Text>
      {!canSend && <Text style={styles.help}>Denne personen er ikke lenger et aktivt stallmedlem. Du kan lese historikken.</Text>}
      <Text style={styles.label}>{privateChat ? 'Ny privat melding' : 'Ny melding til alle'}</Text>
      <TextInput accessibilityLabel={privateChat ? `Privat melding til ${recipient.name}` : 'Melding til fellespraten'} placeholder={privateChat ? 'Skriv en privat melding …' : 'Skriv til de andre fôrrytterne …'}
        multiline maxLength={MAX_MESSAGE_LENGTH} editable={!sending && canSend} value={text}
        onChangeText={value => { setText(value); onDraftChange?.(value); setSendError(''); }} style={styles.input} />
      <View style={styles.composerActions}><Text style={styles.help}>{text.length}/{MAX_MESSAGE_LENGTH}</Text>
        <Button title={sending ? 'Sender …' : 'Send melding'} disabled={sending || !canSend || !text.trim()} onPress={send} /></View>
      {!!sendError && <Text accessibilityRole="alert" style={styles.error}>{sendError}</Text>}
    </View>
    <View style={styles.card}>
      <View style={styles.heading}><Text style={styles.title}>Siste meldinger</Text><Button title={loading ? 'Henter …' : 'Oppdater'} secondary disabled={loading} onPress={() => load()} /></View>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {!items.length && !loading && !error && <Text style={styles.help}>Ingen meldinger ennå. Start gjerne samtalen!</Text>}
      {loading && !items.length && <Text style={styles.help}>Henter samtalen …</Text>}
      <HeartsProvider supabase={supabase} userId={userId} kind={privateChat ? 'direct' : 'community'} messages={items}>
      {items.map(item => <View key={item.id} style={[styles.message, item.sender_id === userId && styles.ownMessage]}>
        <Text style={styles.author}>{item.sender?.full_name || 'Tidligere medlem'}{item.sender_id === userId ? ' · Deg' : ''}</Text>
        <Text style={styles.date}>{new Date(item.created_at).toLocaleString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text>
        {!!item.board_message_id && <Text style={styles.source}>Fra tavla · opprinnelig dato</Text>}
        <Text selectable style={styles.body}>{item.body}</Text>
        <MessageHeart messageId={item.id}/>
        {(item.sender_id === userId || (!privateChat && isAdmin)) && <Pressable accessibilityRole="button" accessibilityLabel="Slett melding" disabled={!!deleting} onPress={() => confirmRemove(item)} style={styles.deleteAction}><Text style={styles.deleteText}>{deleting === item.id ? 'Sletter …' : 'Slett'}</Text></Pressable>}
      </View>)}
      </HeartsProvider>
      {hasMore && <Button title="Vis eldre meldinger" secondary disabled={loading} onPress={() => { limit.current += CHAT_PAGE_SIZE; load(); }} />}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ded9cf', borderRadius: 15, padding: 14, marginBottom: 10 },
  title: { fontSize: 19, fontWeight: '800', color: '#283126' },
  help: { color: '#6b746a', lineHeight: 21, marginTop: 6 },
  label: { fontWeight: '700', color: '#283126', marginTop: 16, marginBottom: 7 },
  input: { borderWidth: 1, borderColor: '#ded9cf', borderRadius: 12, padding: 12, backgroundColor: '#fafbf8', minHeight: 100, fontSize: 16, textAlignVertical: 'top' },
  composerActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 10 },
  heading: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  button: { backgroundColor: '#5f7652', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  secondary: { backgroundColor: '#eef1ec' }, danger: { backgroundColor: '#f7e5e3' },
  buttonText: { color: '#fff', fontWeight: '700' }, darkText: { color: '#344033' }, disabled: { opacity: 0.5 },
  message: { padding: 13, borderWidth: 1, borderColor: '#ded9cf', borderRadius: 12, marginBottom: 10, backgroundColor: '#fafaf8' },
  ownMessage: { backgroundColor: '#f0f5ec', borderColor: '#d4decf' },
  author: { fontWeight: '800', color: '#283126' }, date: { color: '#6b746a', fontSize: 12, marginTop: 4 },
  source: { color: '#5f7652', fontSize: 12, fontWeight: '700', marginTop: 6 },
  body: { color: '#283126', fontSize: 16, lineHeight: 24, marginTop: 9 },
  deleteAction: { alignSelf: 'flex-end', minHeight: 44, padding: 12, justifyContent: 'center' },
  deleteText: { color: '#9f3f37', fontWeight: '700' }, error: { color: '#9f3f37', lineHeight: 21, marginTop: 12 },
});

