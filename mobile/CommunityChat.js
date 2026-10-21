import React, { useEffect, useRef, useState } from 'react';
import { AppState, Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Alert } from './dialogs';
import { CHAT_TABLE, CHAT_PAGE_SIZE, MAX_MESSAGE_LENGTH, deleteCommunityMessage, loadCommunityMessages, messageBody, messageId, sendCommunityMessage } from './communityMessages';
import { DIRECT_TABLE, deleteDirectMessage, loadDirectMessages, sendDirectMessage } from './directMessages';
import { HeartsProvider, MessageHeart } from './MessageHearts';
import ChatImage from './ChatImage';
import { MAX_IMAGE_BYTES, uploadChatImage } from './chatImages';

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
  const [image, setImage] = useState(null), [picking, setPicking] = useState(false);
  const [loading, setLoading] = useState(true), [sending, setSending] = useState(false);
  const [error, setError] = useState(''), [sendError, setSendError] = useState('');
  const [hasMore, setHasMore] = useState(false), [deleting, setDeleting] = useState(null);
  const alive = useRef(false), request = useRef(0), limit = useRef(CHAT_PAGE_SIZE);
  const sendLock = useRef(false), pendingDraft = useRef(null);
  const pickLock = useRef(false);

  useEffect(() => { onDraftChange?.(text || (image || picking ? '[Bilde]' : '')); }, [text, image, picking]);

  async function pickImage() {
    if (pickLock.current || sendLock.current || !canSend) return;
    pickLock.current = true; setPicking(true); setSendError('');
    try {
      // Invoke directly from the press so mobile browsers allow the system picker.
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, quality: 1 });
      if (result.canceled) return;
      const asset = result.assets[0];
      const context = ImageManipulator.manipulate(asset.uri);
      if (Math.max(asset.width, asset.height) > 1600) context.resize(asset.width >= asset.height ? { width: 1600 } : { height: 1600 });
      const rendered = await context.renderAsync();
      const prepared = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
      context.release(); rendered.release();
      if (!prepared.base64 || prepared.base64.length * 0.75 > MAX_IMAGE_BYTES) throw new Error('Bildet er for stort. Velg et mindre bilde.');
      if (alive.current) setImage(prepared);
    } catch { if (alive.current) setSendError('Kunne ikke åpne bildet. Prøv et annet bilde i JPG, PNG eller HEIC, og sjekk at appen har tilgang til bildene dine.'); }
    finally { pickLock.current = false; if (alive.current) setPicking(false); }
  }

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
    if (sendLock.current || pickLock.current || !canSend) return;
    let body;
    try { body = messageBody(text, image ? 'pending' : null); } catch (e) { setSendError(e.message); return; }
    sendLock.current = true; setSending(true); setSendError('');
    if (!pendingDraft.current || pendingDraft.current.body !== body || pendingDraft.current.image !== image) pendingDraft.current = { id: messageId(), stable_id: stableId, sender_id: userId, ...(privateChat ? { recipient_id: recipient.id } : {}), body, image };
    try {
      if (image && !pendingDraft.current.image_path) pendingDraft.current.image_path = await uploadChatImage(supabase, pendingDraft.current, image);
      await (privateChat ? sendDirectMessage : sendCommunityMessage)(supabase, pendingDraft.current);
      if (!alive.current) return;
      setText(''); setImage(null); onDraftChange?.(''); pendingDraft.current = null; await load(true);
    } catch {
      if (alive.current) setSendError('Meldingen kunne ikke bekreftes sendt. Tekst og bilde er beholdt. Trykk Send for å prøve igjen.');
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
        onChangeText={value => { setText(value); setSendError(''); }} style={styles.input} />
      {image && <View style={styles.imagePreview}><Image accessibilityLabel="Valgt bilde, ikke sendt ennå" source={{ uri: image.uri }} resizeMode="contain" style={styles.preview} /><Button title="Fjern bilde" secondary disabled={sending || picking} onPress={() => setImage(null)} /></View>}
      <View style={styles.composerActions}><Button title={picking ? 'Klargjør bilde …' : image ? 'Velg et annet bilde' : 'Legg til bilde'} secondary disabled={sending || picking || !canSend} onPress={pickImage} /></View>
      <View style={styles.composerActions}><Text style={styles.help}>{text.length}/{MAX_MESSAGE_LENGTH}</Text>
        <Button title={sending ? 'Sender …' : 'Send melding'} disabled={sending || picking || !canSend || (!text.trim() && !image)} onPress={send} /></View>
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
        {!!item.body && <Text selectable style={styles.body}>{item.body}</Text>}
        {!!item.image_path && <ChatImage supabase={supabase} path={item.image_path} />}
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
  imagePreview: { marginTop: 12, gap: 8 }, preview: { width: '100%', height: 180, borderRadius: 10, backgroundColor: '#eef1ec' },
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

