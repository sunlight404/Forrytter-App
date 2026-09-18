import test from 'node:test';import assert from 'node:assert/strict';import {groupAgreements,groupLabel} from '../agreementGroups.js';
const rule=(p,d,training='Tur')=>({id:p+':'+d,user_id:'u',horse_id:'h',start_date:'2026-09-19',training_text:training,week_parity:p,weekday:d});
test('all four weekend slots share one card',()=>{const gs=groupAgreements([rule(0,6),rule(0,7),rule(1,6),rule(1,7)]);assert.equal(gs.length,1);assert.equal(groupLabel(gs[0]),'Lørdag og Søndag · alle uker');});
test('diagonal slots never imply extra dates',()=>{const gs=groupAgreements([rule(0,6),rule(1,7)]);assert.equal(gs.length,2);assert.ok(gs.every(g=>g.parities.length*g.days.length===g.ids.length));});
test('different training is not collapsed',()=>assert.equal(groupAgreements([rule(0,6),rule(0,7,'Trav')]).length,2));
