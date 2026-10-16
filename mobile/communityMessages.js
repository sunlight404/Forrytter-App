export const CHAT_TABLE = 'community_messages';
export const MAX_MESSAGE_LENGTH = 2000;
export const CHAT_PAGE_SIZE = 50;
const fields = 'id,stable_id,sender_id,body,created_at,board_message_id,sender:profiles!community_messages_sender_id_fkey(full_name)';

export function messageBody(text) {
  const body = String(text || '').trim();
  if (!body) throw new Error('Skriv en melding først.');
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
    .eq('stable_id', stableId).order('created_at', { ascending: false })
    .order('id', { ascending: false }).limit(limit + 1);
  if (error) throw error;
  return { items: (data || []).slice(0, limit), hasMore: (data || []).length > limit };
}

export async function sendCommunityMessage(client, draft) {
  const message = { id: draft.id, stable_id: draft.stable_id, sender_id: draft.sender_id, body: messageBody(draft.body) };
  const { data, error } = await client.from(CHAT_TABLE).insert(message).select(fields).single();
  if (!error) return data;
  if (error.code === '23505') {
    const result = await client.from(CHAT_TABLE).select(fields).eq('stable_id', message.stable_id).eq('id', message.id).single();
    if (!result.error && result.data?.sender_id === message.sender_id && result.data?.body === message.body) return result.data;
  }
  throw error;
}

export async function deleteCommunityMessage(client, stableId, id) {
  const { data, error } = await client.from(CHAT_TABLE).delete().eq('stable_id', stableId).eq('id', id).select('id').single();
  if (error) throw error;
  if (!data) throw new Error('Meldingen kunne ikke fjernes.');
}

