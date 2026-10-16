import test from 'node:test';
import assert from 'node:assert/strict';
import {saveHolidayFeeding,seedHolidayPlan,validateHolidayPlan,holidayPlanIssues,holidaySaveIssues,holidayUnassignedSlots} from '../holidayFeeding.js';
import {feedingDay} from '../feedingDay.js';

const date='2026-12-25';
const plan={morning:['one','two'],lunch:['one'],evening:['one','two']};
const base={stableId:'stable',date,plan,expected:['old-shift']};
test('2 morning, 1 lunch and 2 evening can be covered by two people; a third is optional',()=>{
  assert.doesNotThrow(()=>validateHolidayPlan(date,plan));
  assert.doesNotThrow(()=>validateHolidayPlan(date,{...plan,lunch:['three']}));
});
test('each additional December day accepts the same 2/1/2 plan',async()=>{
  const calls=[];const client={rpc:async(name,args)=>{calls.push([name,args]);return {error:null};}};
  for(const day of [24,27,28,29,30,31])await saveHolidayFeeding(client,{...base,date:`2026-12-${day}`});
  assert.equal(calls.length,6);
  assert(calls.every(([name,args])=>name==='save_holiday_feeding'&&args.p_morning.length===2&&args.p_lunch.length===1&&args.p_evening.length===2));
});
test('excess people, invalid fields, duplicate people within a meal and ordinary Sundays are rejected before saving',async()=>{
  let calls=0;const client={rpc:async()=>{calls++;return {error:null};}};
  for(const changed of [{morning:['one','two','three']},{morning:['one','one']},{lunch:['one','two']},{lunch:'one'},{evening:['one','two','three']}]){
    await assert.rejects(saveHolidayFeeding(client,{...base,plan:{...plan,...changed}}));
  }
  await assert.rejects(saveHolidayFeeding(client,{...base,date:'2026-10-18'}));
  assert.equal(calls,0);
});
test('all five assignments save atomically with the loaded revision',async()=>{
  const calls=[];await saveHolidayFeeding({rpc:async(...args)=>{calls.push(args);return {error:null};}},base);
  assert.deepEqual(calls,[['save_holiday_feeding',{p_stable:'stable',p_date:date,p_morning:plan.morning,p_lunch:plan.lunch,p_evening:plan.evening,p_expected:['old-shift']}] ]);
});
test('failed saves and stale revisions remain failures',async()=>{
  for(const message of ['Ingen nettforbindelse','Fôringene er endret. Oppdater og prøv igjen.']){
    const error=new Error(message);await assert.rejects(saveHolidayFeeding({rpc:async()=>({error})},base),e=>e===error);
  }
});
test('an older shared daily plan is preserved and does not silently pick a lunch owner',()=>{
  const shifts=[{id:'a',shift_date:date,daily_slot:1,assigned_to:'one'},{id:'b',shift_date:date,daily_slot:2,assigned_to:'two'}];
  assert.deepEqual(seedHolidayPlan(date,shifts),{morning:['one','two'],lunch:[null],evening:['one','two']});
  assert.equal(feedingDay(date,shifts).meals[1].assignments.length,2);
});
test('each meal shows its own people and requires exactly 2, 1 and 2 assignments',()=>{
  const shifts=Object.entries({...plan,lunch:['three']}).flatMap(([meal,owners])=>owners.map((assigned_to,i)=>({id:meal+i,shift_date:date,meal,meal_slot:i+1,assigned_to})));
  const day=feedingDay(date,shifts);
  assert.deepEqual(day.meals.map(m=>[m.key,m.required,m.assignedCount,m.missing]),[['morning',2,2,false],['lunch',1,1,false],['evening',2,2,false]]);
  assert.deepEqual(day.meals[1].assignments.map(s=>s.assigned_to),['three']);
  const incomplete=feedingDay(date,shifts.filter(s=>s.id!=='evening1'));
  assert.equal(incomplete.meals[2].missing,true);assert.equal(incomplete.meals[0].missing,false);
});

test('unassigned fields are named without blocking partial saves, and disappear as they are filled',()=>{
  const incomplete={morning:['one',null],lunch:[null],evening:['one',null]};
  assert.deepEqual(holidayUnassignedSlots(incomplete),[
    'Morgenfôring – person 2: ikke fordelt ennå.',
    'Lunsjfôring – person 1: ikke fordelt ennå.',
    'Kveldsfôring – person 2: ikke fordelt ennå.',
  ]);
  assert.deepEqual(holidayUnassignedSlots({...incomplete,lunch:['two']}),[
    'Morgenfôring – person 2: ikke fordelt ennå.',
    'Kveldsfôring – person 2: ikke fordelt ennå.',
  ]);
  assert.deepEqual(holidayPlanIssues(date,incomplete),[]);
  assert.deepEqual(holidayPlanIssues(date,plan),[]);
});

test('a saved owner missing from the selectable members is explained instead of silently looking complete',()=>{
  const issues=holidayPlanIssues(date,plan,['one']);
  assert.equal(issues.length,2);
  assert(issues[0].startsWith('Morgenfôring – person 2: personen er ikke lenger tilgjengelig.'));
  assert(issues[1].startsWith('Kveldsfôring – person 2: personen er ikke lenger tilgjengelig.'));
});

test('loading, failed reads and complete plans have explicit save outcomes',()=>{
  const options={date,plan,activeUserIds:['one','two']};
  assert.match(holidaySaveIssues({...options,loading:true})[0],/Henter lagrede fôringer/);
  assert.match(holidaySaveIssues({...options,error:'Offline'})[0],/Oppdater fôringer/);
  assert.deepEqual(holidaySaveIssues(options),[]);
  assert.deepEqual(holidaySaveIssues({...options,plan:{}}),[]);
  assert.equal(holidayUnassignedSlots({}).length,5);
});

test('partial saves preserve blank slots, pad missing meals and send the known people',async()=>{
  const calls=[];const client={rpc:async(...args)=>{calls.push(args);return {error:null};}};
  await saveHolidayFeeding(client,{...base,plan:{morning:[null,'two'],lunch:['one']}});
  assert.deepEqual(calls[0][1],{p_stable:'stable',p_date:date,p_morning:[null,'two'],p_lunch:['one'],p_evening:[null,null],p_expected:['old-shift']});
});

test('reopening a partial day preserves each slot and later additions retain known people',async()=>{
  const partial={morning:[null,'two'],lunch:['one'],evening:[null,null]};
  const shifts=Object.entries(partial).flatMap(([meal,people])=>people.map((assigned_to,i)=>({id:meal+i,shift_date:date,meal,meal_slot:i+1,assigned_to}))).reverse();
  const reopened=seedHolidayPlan(date,shifts);assert.deepEqual(reopened,partial);
  const calls=[];await saveHolidayFeeding({rpc:async(...args)=>{calls.push(args);return {error:null};}},{...base,plan:{...reopened,morning:['one',reopened.morning[1]]},expected:shifts.map(s=>s.id)});
  assert.deepEqual(calls[0][1].p_morning,['one','two']);assert.deepEqual(calls[0][1].p_lunch,['one']);
  const day=feedingDay(date,shifts);assert.deepEqual(day.meals.map(m=>[m.assignedCount,m.missing]),[[1,true],[1,false],[0,true]]);
});
