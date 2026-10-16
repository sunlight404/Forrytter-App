import test from 'node:test';
import assert from 'node:assert/strict';
import {saveHolidayFeeding,seedHolidayPlan,validateHolidayPlan} from '../holidayFeeding.js';
import {feedingDay} from '../feedingDay.js';

const date='2026-12-25';
const plan={morning:['one','two'],lunch:['one'],evening:['one','two']};
const base={stableId:'stable',date,plan,expected:['old-shift']};
test('2 morning, 1 lunch and 2 evening can be covered by two people; a third is optional',()=>{
  assert.doesNotThrow(()=>validateHolidayPlan(date,plan));
  assert.doesNotThrow(()=>validateHolidayPlan(date,{...plan,lunch:['three']}));
});
test('wrong counts, missing people, duplicate people within a meal and ordinary Sundays are rejected before saving',async()=>{
  let calls=0;const client={rpc:async()=>{calls++;return {error:null};}};
  for(const changed of [{morning:['one']},{morning:['one','one']},{lunch:['one','two']},{lunch:[null]},{evening:['two',null]}]){
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
