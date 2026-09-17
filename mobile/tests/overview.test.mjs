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

import { assignmentOrigin } from '../overview.js';
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
