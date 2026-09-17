import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
function worker(clients=[]){const handlers={},notifications=[],opened=[];const self={location:{origin:'https://app.test'},addEventListener:(name,handler)=>handlers[name]=handler,registration:{showNotification:async(...args)=>notifications.push(args)},clients:{matchAll:async()=>clients,openWindow:async url=>opened.push(url)}};vm.runInNewContext(source,{self,URL});return{handlers,notifications,opened};}
test('push payload produces a visible notification with click destination',async()=>{const w=worker();let pending;w.handlers.push({data:{json:()=>({id:'one',title:'Hestedag',body:'Oppdatert',url:'/?tab=today'})},waitUntil:p=>pending=p});await pending;assert.equal(w.notifications[0][0],'Hestedag');assert.equal(w.notifications[0][1].tag,'one');assert.equal(w.notifications[0][1].icon,'/icon-192.png');});
test('malformed payload still shows a notification',async()=>{const w=worker();let pending;w.handlers.push({data:{json:()=>{throw Error();}},waitUntil:p=>pending=p});await pending;assert.equal(w.notifications[0][0],'Fôrrytter App');});
test('notification clicks cannot open another origin',async()=>{const w=worker();let pending;w.handlers.notificationclick({notification:{close(){},data:{url:'https://evil.test/'}},waitUntil:p=>pending=p});await pending;assert.deepEqual(w.opened,['https://app.test/']);});
test('notification click focuses and navigates an existing app window',async()=>{const visited=[];const w=worker([{url:'https://app.test/',navigate:async u=>visited.push(u),focus:async()=>visited.push('focused')}]);let pending;w.handlers.notificationclick({notification:{close(){},data:{url:'/?tab=horseSwaps'}},waitUntil:p=>pending=p});await pending;assert.deepEqual(visited,['https://app.test/?tab=horseSwaps','focused']);assert.equal(w.opened.length,0);});
