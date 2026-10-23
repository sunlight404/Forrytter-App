export const CHAT_TABLE = 'community_messages';
export const MAX_MESSAGE_LENGTH = 2000;
export const CHAT_PAGE_SIZE = 50;
const fields = 'id,stable_id,sender_id,body,image_path,parent_id,created_at,board_message_id,sender:profiles!community_messages_sender_id_fkey(full_name)';

export function messageBody(text, imagePath = null) {
  const body = String(text || '').trim();
  if (!body && !imagePath) throw new Error('Skriv en melding eller legg til et bilde først.');
  if ([...body].length > MAX_MESSAGE_LENGTH) throw new Error('Meldingen kan ha maksimalt 2000 tegn.');
  return body;
}

// This ID prevents a retry after a lost response from sending the same message twice.
export function messageId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const value = Math.floor(Math.random() * 16);
    return (c === 'x' ? value : (value & 3) | 8).toString(16);
  });
}

export async function loadCommunityMessages(client, stableId, limit = CHAT_PAGE_SIZE) {
  const { data, error } = await client.from(CHAT_TABLE).select(fields)
    .eq('stable_id', stableId).is('parent_id', null).order('created_at', { ascending: false })
    .order('id', { ascending: false }).limit(limit + 1);
  if (error) throw error;
  const items = (data || []).slice(0, limit);
  if (!items.length) return { items: [], hasMore: false };
  const counts = await client.from('community_reply_counts').select('parent_id,reply_count')
    .eq('stable_id', stableId).in('parent_id', items.map(item => item.id));
  if (counts.error) throw counts.error;
  const byId = new Map((counts.data || []).map(row => [row.parent_id, Number(row.reply_count)]));
  return { items: items.map(item => ({ ...item, reply_count: byId.get(item.id) || 0 })), hasMore: (data || []).length > limit };
}

export async function loadCommunityReplies(client, stableId, parentId, limit = CHAT_PAGE_SIZE) {
  const parent = await client.from(CHAT_TABLE).select(fields).eq('stable_id', stableId).eq('id', parentId).is('parent_id', null).maybeSingle();
  if (parent.error) throw parent.error;
  if (!parent.data) { const error = new Error('Denne meldingen er slettet eller ikke tilgjengelig.'); error.code = 'THREAD_DELETED'; throw error; }
  const { data, error } = await client.from(CHAT_TABLE).select(fields).eq('stable_id', stableId).eq('parent_id', parentId)
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit + 1);
  if (error) throw error;
  return { parent: parent.data, items: (data || []).slice(0, limit).reverse(), hasMore: (data || []).length > limit };
}

export async function sendCommunityMessage(client, draft) {
  const message = { id: draft.id, stable_id: draft.stable_id, sender_id: draft.sender_id, body: messageBody(draft.body, draft.image_path), ...(draft.image_path ? { image_path: draft.image_path } : {}), ...(draft.parent_id ? { parent_id: draft.parent_id } : {}) };
  const { data, error } = await client.from(CHAT_TABLE).insert(message).select(fields).single();
  if (!error) return data;
  if (error.code === '23505') {
    const result = await client.from(CHAT_TABLE).select(fields).eq('stable_id', message.stable_id).eq('id', message.id).single();
    if (!result.error && result.data?.sender_id === message.sender_id && result.data?.body === message.body && (result.data?.image_path || null) === (message.image_path || null) && (result.data?.parent_id || null) === (message.parent_id || null)) return result.data;
  }
  throw error;
}

export async function deleteCommunityMessage(client, stableId, id) {
  const { data, error } = await client.from(CHAT_TABLE).delete().eq('stable_id', stableId).eq('id', id).select('id').single();
  if (error) throw error;
  if (!data) throw new Error('Meldingen kunne ikke fjernes.');
}

