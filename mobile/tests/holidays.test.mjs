import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { easterSunday, holidayLabel, isRedDay, norwegianHolidays, redDaysInMonth } from '../holidays.js';
import { feedingDay } from '../feedingDay.js';

test('Norwegian fixed holidays and Sundays are red, ordinary Saturdays and eves are not',()=>{
  for(const date of ['2026-01-01','2026-05-01','2026-05-17','2026-12-25','2026-12-26','2026-10-18'])assert.equal(isRedDay(date),true,date);
  for(const date of ['2026-10-17','2026-12-24','2026-12-31','2026-05-08'])assert.equal(isRedDay(date),false,date);
  assert.equal(holidayLabel('2026-10-18'),'Søndag');
  assert.equal(holidayLabel('2026-12-25'),'Første juledag');
  assert.equal(isRedDay('2026-02-30'),false);assert.equal(isRedDay(''),false);
});

test('movable holidays match 2026 and 2027, including very early and late Easter',()=>{
  assert.equal(easterSunday(2026),'2026-04-05');assert.equal(easterSunday(2027),'2027-03-28');
  assert.equal(easterSunday(2008),'2008-03-23');assert.equal(easterSunday(2038),'2038-04-25');
  const expected={'2026-04-02':'Skjærtorsdag','2026-04-03':'Langfredag','2026-04-05':'Første påskedag','2026-04-06':'Andre påskedag','2026-05-14':'Kristi himmelfartsdag','2026-05-24':'Første pinsedag','2026-05-25':'Andre pinsedag'};
  for(const [date,name] of Object.entries(expected))assert.equal(holidayLabel(date),name);
  assert.equal(holidayLabel('2027-03-25'),'Skjærtorsdag');
});

test('overlapping holidays keep both names but create only one date with three feedings',()=>{
  const label=norwegianHolidays(2027)['2027-05-17'];assert(label.includes('Grunnlovsdagen'));assert(label.includes('Andre pinsedag'));
  assert.equal(redDaysInMonth(2027,5).filter(day=>day.date==='2027-05-17').length,1);
  assert.equal(feedingDay('2027-05-17',[]).meals.length,3);
});

test('every red day has morning, lunch and evening needs even before assignment',()=>{
  const plan=feedingDay('2026-12-25',[]);
  assert.deepEqual(plan.meals.map(meal=>meal.label),['Morgenfôring','Lunsjfôring','Kveldsfôring']);
  assert(plan.meals.every(meal=>meal.missing&&meal.assignments.length===0));
  assert.equal(feedingDay('2026-10-16',[]).meals.length,0);
});

test('one or two saved daily owners cover all three feedings without manufacturing assignments',()=>{
  const first={id:'one',shift_date:'2026-12-25',daily_slot:1,assigned_to:'rider-one'};
  const second={id:'two',shift_date:'2026-12-25',daily_slot:2,assigned_to:'rider-two'};
  for(const shifts of [[first],[first,second]]){
    const plan=feedingDay('2026-12-25',shifts);assert(plan.meals.every(meal=>!meal.missing&&meal.assignments.length===shifts.length));
  }
  const partial=feedingDay('2026-12-25',[first,{...second,assigned_to:null}]);assert(partial.meals.every(meal=>meal.missing));
  assert.equal(feedingDay('2026-12-26',[first,second]).meals[0].assignments.length,0);
});

test('existing individual shifts and extra feeding notes are preserved and only missing meals are unassigned',()=>{
  const shifts=[{id:'a',shift_date:'2026-12-25',label:'Morgenfôring',assigned_to:'a'},{id:'b',shift_date:'2026-12-25',label:'Kveldsfôring',assigned_to:'b'},{id:'extra',shift_date:'2026-12-25',label:'Ekstra fôr til hest',assigned_to:'c'}];
  const plan=feedingDay('2026-12-25',shifts);assert.equal(plan.meals[0].missing,false);assert.equal(plan.meals[1].missing,true);assert.equal(plan.meals[2].missing,false);
  assert.equal(plan.extras[0].id,'extra');assert.equal(shifts.length,3);
});

test('December and January red-day lists cross years cleanly and do not label school breaks as holidays',()=>{
  assert(redDaysInMonth(2026,12).some(day=>day.date==='2026-12-25'));
  assert(redDaysInMonth(2027,1).some(day=>day.date==='2027-01-01'));
  assert(!redDaysInMonth(2026,12).some(day=>day.date==='2026-12-24'));
});

test('holiday dates remain identical across Oslo, US and extreme positive time zones',()=>{
  const moduleUrl=new URL('../holidays.js',import.meta.url).href;
  const code=`import {holidayLabel,easterSunday} from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify([easterSunday(2027),holidayLabel('2027-03-25'),holidayLabel('2027-05-17')]));`;
  const results=['Europe/Oslo','America/Los_Angeles','Pacific/Kiritimati'].map(TZ=>execFileSync(process.execPath,['--input-type=module','-e',code],{env:{...process.env,TZ},encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim());
  assert.equal(new Set(results).size,1);
});
