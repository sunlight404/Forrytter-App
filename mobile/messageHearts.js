import { messageId } from './communityMessages.js';

export const HEART_TABLE = 'message_reactions';
export function subscribeMessageHearts(client, kind, userId, targets, onChange) {
  // Each mounted provider and effect run owns its channel. The group and an
  // open comment thread coexist; the SDK reuses matching topics and rejects
  // adding listeners to a channel that has already subscribed.
  return client.channel(`forrytter-hearts-${kind}-${userId}-${messageId()}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: HEART_TABLE }, payload => {
      if (targets.some(target => payload.new[target.column] === target.id)) onChange();
    }).subscribe();
}
const columns = { community: 'community_message_id', direct: 'direct_message_id', board: 'board_message_id' };
const fields = 'id,community_message_id,direct_message_id,board_message_id,user_id,created_at,reactor:profiles!message_reactions_user_id_fkey(full_name)';
function uuid(value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '')) throw new Error('Ugyldig melding.');
  return value;
}

export function heartTargets(kind, messages) {
  if (!columns[kind]) throw new Error('Ugyldig meldingstype.');
  return messages.map(message => {
    // A copied board post shares its acknowledgements with the original post.
    const targetKind = kind === 'community' && message.board_message_id ? 'board' : kind;
    const id = uuid(targetKind === 'board' && kind === 'community' ? message.board_message_id : message.id);
    return { messageId: message.id, kind: targetKind, column: columns[targetKind], id, key: `${targetKind}:${id}` };
  });
}

export async function loadMessageHearts(client, targets) {
  const groups = new Map();
  for (const target of targets) {
    if (!groups.has(target.column)) groups.set(target.column, new Set());
    groups.get(target.column).add(target.id);
  }
  const queries = [];
  for (const [column, ids] of groups) {
    const all = [...ids];
    for (let i = 0; i < all.length; i += 50) queries.push(client.from(HEART_TABLE).select(fields).in(column, all.slice(i, i + 50)).order('created_at').order('id'));
  }
  const results = await Promise.all(queries);
  const failure = results.find(result => result.error);
  if (failure) throw failure.error;
  const rows = results.flatMap(result => result.data || []);
  const byTarget = {};
  for (const row of rows) {
    const kind = Object.keys(columns).find(key => row[columns[key]]);
    if (!kind) continue;
    const key = `${kind}:${row[columns[kind]]}`;
    (byTarget[key] ||= []).push(row);
  }
  return byTarget;
}

// Desired state instead of a server-side toggle makes retries safe.
export async function setMessageHeart(client, target, userId, wanted) {
  if (columns[target.kind] !== target.column) throw new Error('Ugyldig meldingstype.');
  uuid(target.id); uuid(userId);
  if (!wanted) {
    const { error } = await client.from(HEART_TABLE).delete().eq(target.column, target.id).eq('user_id', userId);
    if (error) throw error;
    return;
  }
  const { error } = await client.from(HEART_TABLE).insert({ [target.column]: target.id, user_id: userId });
  if (!error) return;
  if (error.code === '23505') {
    const existing = await client.from(HEART_TABLE).select('id').eq(target.column, target.id).eq('user_id', userId).maybeSingle();
    if (!existing.error && existing.data) return;
  }
  throw error;
}

export function heartSummary(rows, userId) {
  const unique = [...new Map(rows.map(row => [row.user_id, row])).values()];
  const names = unique.map(row => ({ id: row.user_id, name: row.user_id === userId ? 'Deg' : row.reactor?.full_name || 'Tidligere medlem' }));
  return {
    count: unique.length,
    own: unique.some(row => row.user_id === userId),
    names: names.map(person => names.filter(other => other.name.toLocaleLowerCase('nb') === person.name.toLocaleLowerCase('nb')).length > 1 ? `${person.name} · profil ${person.id.slice(-6)}` : person.name).sort((a,b) => a.localeCompare(b,'nb')),
  };
}
