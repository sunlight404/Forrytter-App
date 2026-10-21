import { decode } from 'base64-arraybuffer';

export const CHAT_IMAGE_BUCKET = 'chat-images';
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_URL_SECONDS = 600;

export function chatImagePath(draft) {
  const ids = [draft.stable_id, draft.sender_id, draft.id];
  if (ids.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || ''))) throw new Error('Ugyldig bildemelding.');
  return `${ids[0]}/${ids[1]}/${ids[2]}.jpg`;
}

export async function uploadChatImage(client, draft, image) {
  const bytes = decode(image.base64 || '');
  if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES) throw new Error('Bildet må være mindre enn 5 MB. Velg et mindre bilde.');
  const path = chatImagePath(draft);
  const { error } = await client.storage.from(CHAT_IMAGE_BUCKET).upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  // An immutable UUID path is reused only for this exact draft after a lost response.
  if (error && String(error.statusCode) !== '409' && error.code !== 'Duplicate') throw error;
  return path;
}

export async function chatImageUrl(client, path) {
  const { data, error } = await client.storage.from(CHAT_IMAGE_BUCKET).createSignedUrl(path, IMAGE_URL_SECONDS);
  if (error || !data?.signedUrl) throw error || new Error('Bildet kunne ikke hentes.');
  return data.signedUrl;
}
