import test from 'node:test';
import assert from 'node:assert/strict';
import { dateKey, timeKey, nextWeekend, isWeekend, feedingLabel } from '../overview.js';

test('local dates do not move to the previous day around midnight', () => {
  const date = new Date(2026,8,19,0,5,0);
  assert.equal(dateKey(date), '2026-09-19');
  assert.equal(timeKey(date), '00:05:00');
});
test('weekend default handles weekdays, Sundays and year boundaries', () => {
  assert.equal(nextWeekend(new Date(2026,8,15)), '2026-09-19');
  assert.equal(nextWeekend(new Date(2026,8,20)), '2026-09-20');
  assert.equal(nextWeekend(new Date(2026,11,31)), '2027-01-02');
  assert.equal(isWeekend('2026-09-15'), false);
  assert.equal(isWeekend('2026-09-19'), true);
});
test('legacy feeding labels remain meaningful and custom labels are preserved', () => {
  assert.equal(feedingLabel({label:'Fôring',shift_time:'08:00:00'}), 'Morgenfôring');
  assert.equal(feedingLabel({label:'Fôring',shift_time:'20:00:00'}), 'Kveldsfôring');
  assert.equal(feedingLabel({label:'Ekstra fôring',shift_time:'14:00:00'}), 'Ekstra fôring');
});

import { isoWeek, weekLabel, agreementLabel } from '../overview.js';
test('ISO week parity at year boundaries, including adjacent odd weeks 53 and 1',()=>{
  assert.equal(isoWeek('2027-01-02'),53);
  assert.equal(isoWeek('2027-01-09'),1);
  assert.equal(isoWeek('2027-01-16'),2);
  assert.equal(isoWeek('2026-09-19'),38);
  assert.equal(weekLabel('2027-01-02'),'Uke 53 · oddetallsuke');
  assert.equal(agreementLabel({weekday:7,week_parity:0}),'Søndag i partallsuker');
});

import { assignmentOrigin, nextHorseDays } from '../overview.js';
test('next horse identifies the actual weekend agreement', () => {
  const a = {id:'a', recurring_id:'rule', assignment_date:'2026-09-19'};
  assert.equal(assignmentOrigin(a,[{id:'rule',weekday:6,week_parity:0}]), 'Fast avtale · Lørdag i partallsuker');
});
test('only an approved swap matching the current horse and date is labelled a swap', () => {
  const a={id:'a',horse_id:'new-horse',assignment_date:'2026-09-27'};
  const swap={status:'approved',from_assignment_id:'a',to_assignment_id:'b',to_snapshot:{horse_id:'new-horse',assignment_date:'2026-09-27'}};
  assert.equal(assignmentOrigin(a,[],swap),'Godkjent hestebytte');
  assert.equal(assignmentOrigin(a,[],{...swap,status:'awaiting_admin'}),'Avtale for denne datoen');
  assert.equal(assignmentOrigin({...a,horse_id:'admin-override'},[],swap),'Avtale for denne datoen');
  assert.equal(assignmentOrigin({...a,id:'unrelated'},[],swap),'Avtale for denne datoen');
});

const horseDay = (date, horse, rest = {}) => ({id:date,assignment_date:date,horse_id:horse,is_cancelled:false,...rest});
test('all horses on the same holiday and both weekend dates remain visible',()=>{
  const holiday=[horseDay('2026-12-28','A'),horseDay('2026-12-28','B'),horseDay('2026-12-29','C')];
  assert.deepEqual(nextHorseDays(holiday,'2026-12-27'),holiday.slice(0,2));
  const weekend=[horseDay('2026-12-26','A'),horseDay('2026-12-26','B'),horseDay('2026-12-27','C')];
  assert.deepEqual(nextHorseDays(weekend,'2026-12-25'),weekend);
});
test('both horses in the next weekend appear with their own dates and training across a month boundary', () => {
  const saturday=horseDay('2026-10-31','horse-a',{training_text:'Tur'});
  const sunday=horseDay('2026-11-01','horse-b',{training_text:'Bane'});
  const rows=[sunday,saturday,horseDay('2026-11-14','horse-a')];
  assert.deepEqual(nextHorseDays(rows,'2026-10-20'),[saturday,sunday]);
  assert.equal(rows[0],sunday);
});
test('one-day agreements do not pull in a horse from a later weekend', () => {
  const saturday=horseDay('2026-10-31','horse-a');
  assert.deepEqual(nextHorseDays([saturday,horseDay('2026-11-08','horse-b')],'2026-10-20'),[saturday]);
  const sunday=horseDay('2026-11-01','horse-b');
  assert.deepEqual(nextHorseDays([sunday,horseDay('2026-11-14','horse-a')],'2026-10-20'),[sunday]);
});
test('today and cancelled days stay out of the upcoming section', () => {
  const saturday=horseDay('2026-10-31','horse-a');
  const sunday=horseDay('2026-11-01','horse-b');
  assert.deepEqual(nextHorseDays([saturday,sunday],'2026-10-31'),[sunday]);
  assert.deepEqual(nextHorseDays([saturday,{...sunday,is_cancelled:true}],'2026-10-20'),[saturday]);
  assert.deepEqual(nextHorseDays([saturday,sunday],'2026-11-01'),[]);
  assert.deepEqual(nextHorseDays([],'2026-10-20'),[]);
});
test('the same horse on both days keeps two separate task dates', () => {
  const rows=[horseDay('2026-10-31','horse-a'),horseDay('2026-11-01','horse-a')];
  assert.equal(nextHorseDays(rows,'2026-10-20').length,2);
});
test('upcoming weekend selection works across years and the ISO week 53 boundary', () => {
  const rows=[horseDay('2027-01-02','horse-a'),horseDay('2027-01-03','horse-b')];
  assert.deepEqual(nextHorseDays(rows,'2026-12-31'),rows);
  const newYear=[horseDay('2022-12-31','horse-a'),horseDay('2023-01-01','horse-b')];
  assert.deepEqual(nextHorseDays(newYear,'2022-12-20'),newYear);
});
test('an approved Sunday swap does not change the origin of the Saturday assignment', () => {
  const rows=[horseDay('2026-10-31','horse-a',{recurring_id:'saturday-rule'}),horseDay('2026-11-01','horse-b')];
  const swap={status:'approved',from_assignment_id:'2026-11-01',to_assignment_id:'other',to_snapshot:{horse_id:'horse-b',assignment_date:'2026-11-01'}};
  assert.deepEqual(nextHorseDays(rows,'2026-10-20').map(row=>assignmentOrigin(row,[{id:'saturday-rule',weekday:6,week_parity:0}],swap)),['Fast avtale · Lørdag i partallsuker','Godkjent hestebytte']);
});

