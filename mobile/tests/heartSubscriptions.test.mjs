import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { subscribeMessageHearts } from '../messageHearts.js';

const user='11111111-1111-4111-8111-111111111111';
function fixture() {
  const client = createClient('https://fixture.supabase.co','fixture-public-key',{auth:{persistSession:false,autoRefreshToken:false}});
  // Keep the real SDK's channel lifecycle and topic reuse, with no network.
  client.realtime.connect = () => {};
  const clean = async () => { for (const channel of client.getChannels()) channel.teardown(); await client.realtime.disconnect(); };
  return { client, clean };
}
test('opening comments while the group heart provider is subscribed does not reuse its channel or throw',async()=>{
  const {client,clean}=fixture();
  try {
    const group = subscribeMessageHearts(client,'community',user,[],()=>{});
    const comments = subscribeMessageHearts(client,'community',user,[],()=>{});
    assert.notEqual(group,comments);
    assert.notEqual(group.topic,comments.topic);
    assert.equal(client.getChannels().length,2);
    // A changed page or reopening comments must not reuse a channel still closing.
    const reopened=subscribeMessageHearts(client,'community',user,[],()=>{});
    assert.notEqual(reopened,comments);
    assert.notEqual(reopened,group);
  } finally { await clean(); }
});
