import { CHAT_PAGE_SIZE, messageBody } from './communityMessages.js';

export const DIRECT_TABLE = 'direct_messages';
const fields = 'id,stable_id,sender_id,recipient_id,body,image_path,created_at,sender:profiles!direct_messages_sender_id_fkey(full_name),recipient:profiles!direct_messages_recipient_id_fkey(full_name)';
const uuid = value => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '')) throw new Error('Velg en mottaker fra stallen.');
  return value;
};

export async function loadDirectInbox(client, stableId, userId) {
  uuid(userId);
  const [members, messages] = await Promise.all([
    client.from('memberships').select('user_id,profiles(full_name)').eq('stable_id', stableId).eq('active', true).eq('archived', false),
    client.from(DIRECT_TABLE).select(fields).eq('stable_id', stableId)
      .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(200),
  ]);
  if (members.error) throw members.error;
  if (messages.error) throw messages.error;
  return directContacts(members.data || [], messages.data || [], userId);
}

export function directContacts(members, messages, userId) {
  const nameCounts = new Map();
  for (const member of members) {
    const name = (member.profiles?.full_name || 'Medlem uten navn').trim().toLocaleLowerCase('nb');
    nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
  }
  const contacts = new Map(members.filter(member => member.user_id !== userId).map(member => [member.user_id, {
    id: member.user_id, name: member.profiles?.full_name || 'Medlem uten navn', active: true, latest: null,
    duplicateName: nameCounts.get((member.profiles?.full_name || 'Medlem uten navn').trim().toLocaleLowerCase('nb')) > 1,
  }]));
  for (const message of messages) {
    if (message.sender_id !== userId && message.recipient_id !== userId) continue;
    const incoming = message.recipient_id === userId;
    const id = incoming ? message.sender_id : message.recipient_id;
    if (!contacts.has(id)) contacts.set(id, { id, name: (incoming ? message.sender : message.recipient)?.full_name || 'Tidligere medlem', active: false, latest: null });
    const contact = contacts.get(id);
    if (!contact.latest || message.created_at > contact.latest.created_at || (message.created_at === contact.latest.created_at && message.id > contact.latest.id)) contact.latest = message;
  }
  return [...contacts.values()].map(contact => ({ ...contact, name: contact.duplicateName ? `${contact.name} · profil ${contact.id.slice(-6)}` : contact.name }))
    .sort((a, b) => (b.latest?.created_at || '').localeCompare(a.latest?.created_at || '') || a.name.localeCompare(b.name, 'nb'));
}

export async function loadDirectMessages(client, stableId, userId, recipientId, limit = CHAT_PAGE_SIZE) {
  uuid(userId); uuid(recipientId);
  const { data, error } = await client.from(DIRECT_TABLE).select(fields).eq('stable_id', stableId)
    .or(`and(sender_id.eq.${userId},recipient_id.eq.${recipientId}),and(sender_id.eq.${recipientId},recipient_id.eq.${userId})`)
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit + 1);
  if (error) throw error;
  return { items: (data || []).slice(0, limit), hasMore: (data || []).length > limit };
}

export async function sendDirectMessage(client, draft) {
  uuid(draft.recipient_id); uuid(draft.sender_id);
  if (draft.recipient_id === draft.sender_id) throw new Error('Velg en annen person å skrive til.');
  const message = { id: draft.id, stable_id: draft.stable_id, sender_id: draft.sender_id, recipient_id: draft.recipient_id, body: messageBody(draft.body, draft.image_path), ...(draft.image_path ? { image_path: draft.image_path } : {}) };
  const { data, error } = await client.from(DIRECT_TABLE).insert(message).select(fields).single();
  if (!error) return data;
  if (error.code === '23505') {
    const result = await client.from(DIRECT_TABLE).select(fields).eq('stable_id', message.stable_id).eq('id', message.id).single();
    if (!result.error && result.data?.sender_id === message.sender_id && result.data?.recipient_id === message.recipient_id && result.data?.body === message.body && (result.data?.image_path || null) === (message.image_path || null)) return result.data;
  }
  throw error;
}

export async function deleteDirectMessage(client, stableId, id) {
  const { data, error } = await client.from(DIRECT_TABLE).delete().eq('stable_id', stableId).eq('id', id).select('id').single();
  if (error) throw error;
  if (!data) throw new Error('Meldingen kunne ikke fjernes.');
}
