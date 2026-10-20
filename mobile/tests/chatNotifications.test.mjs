import test from 'node:test';
import assert from 'node:assert/strict';
import { pushPayload } from '../../supabase/functions/push-notifications/payload.ts';

test('group notification opens group chat', () => {
  const payload = pushPayload({id:'g',title:'Ny melding i gruppechatten',tab:'chat'}, 'https://app.test');
  const url = new URL(payload.url);
  assert.equal(url.searchParams.get('tab'), 'chat');
  assert.equal(url.href, 'https://app.test/?tab=chat');
});
test('private notification opens Chat in the existing app and conceals message content', () => {
  const payload = pushPayload({id:'p',title:'Ny privat melding',tab:'chatPrivate',body:'Hemmelig tekst',sender_id:'privat-person'}, 'https://app.test');
  const url = new URL(payload.url);
  assert.equal(url.searchParams.get('tab'), 'chat');
  assert.equal(url.href, 'https://app.test/?tab=chat');
  assert.ok(!JSON.stringify(payload).includes('Hemmelig tekst'));
  assert.ok(!JSON.stringify(payload).includes('privat-person'));
});
test('existing notification destinations and fallback remain available', () => {
  for (const tab of ['today','feeding','horseSwaps','messages']) {
    assert.equal(new URL(pushPayload({tab},'https://app.test').url).searchParams.get('tab'),tab);
  }
  assert.equal(new URL(pushPayload({tab:'https://evil.test'},'https://app.test').url).href,'https://app.test/?tab=today');
});
