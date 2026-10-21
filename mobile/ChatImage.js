import React, { useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { chatImageUrl } from './chatImages';

export default function ChatImage({ supabase, path }) {
  const [url, setUrl] = useState(null), [error, setError] = useState(false), [open, setOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    setUrl(null); setError(false);
    const load = async () => {
      try { const value = await chatImageUrl(supabase, path); if (alive) { setUrl(value); setError(false); } }
      catch { if (alive) setError(true); }
    };
    load(); const timer = setInterval(load, 480000);
    return () => { alive = false; clearInterval(timer); };
  }, [supabase, path, revision]);
  if (error) return <Pressable accessibilityRole="button" onPress={() => setRevision(x => x + 1)} style={styles.retry}><Text>Kunne ikke laste bildet. Trykk for å prøve igjen.</Text></Pressable>;
  if (!url) return <Text style={styles.retry}>Henter bilde …</Text>;
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Åpne bilde i full størrelse" onPress={() => setOpen(true)}>
      <Image accessibilityLabel="Bilde i chatten" source={{ uri: url }} resizeMode="contain" onError={() => setError(true)} style={styles.image} />
      <Text style={styles.hint}>Trykk for å se større</Text>
    </Pressable>
    <Modal visible={open} onRequestClose={() => setOpen(false)} animationType="fade">
      <View style={styles.viewer}>
        <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={styles.close}><Text style={styles.closeText}>Lukk bilde ✕</Text></Pressable>
        <Image accessibilityLabel="Bilde i full størrelse" source={{ uri: url }} resizeMode="contain" style={styles.full} />
      </View>
    </Modal>
  </>;
}
const styles = StyleSheet.create({
  image: { width: '100%', height: 240, marginTop: 10, backgroundColor: '#eef1ec', borderRadius: 10 },
  hint: { color: '#5f7652', marginTop: 5 }, retry: { paddingVertical: 14, minHeight: 44 },
  viewer: { flex: 1, backgroundColor: '#172018', paddingTop: 40, paddingBottom: 24 },
  close: { minHeight: 48, padding: 16, alignSelf: 'flex-end' }, closeText: { color: '#fff', fontWeight: '700' },
  full: { flex: 1, width: '100%' },
});
