// Notification previews never contain private message text or participant names.
export function pushPayload(job, site) {
  const url = new URL('/', site);
  const tab = job.tab === 'chatPrivate' ? 'chat' :
    ['today', 'feeding', 'horseSwaps', 'messages', 'chat'].includes(job.tab) ? job.tab : 'today';
  url.searchParams.set('tab', tab);
  return { id: job.id, title: job.title, body: 'Åpne Fôrrytter App for å se oppdateringen.', url: url.href };
}
