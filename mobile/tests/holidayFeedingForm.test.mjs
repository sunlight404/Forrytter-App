import test from 'node:test';
import assert from 'node:assert/strict';
import Module, {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {transformFileSync} from '@babel/core';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as feeding from '../feedingDay.js';
import * as helpers from '../holidayFeeding.js';

const require=createRequire(import.meta.url),native=require('react-native-web');
const filename=fileURLToPath(new URL('../HolidayFeedingForm.js',import.meta.url));
const {code}=transformFileSync(filename,{babelrc:false,configFile:false,plugins:[['@babel/plugin-transform-react-jsx',{runtime:'automatic'}],'@babel/plugin-transform-modules-commonjs']});
const date='2026-12-25';
const options=[{value:'one',label:'Person A'},{value:'two',label:'Person B'}];
const fullShifts=()=>Object.entries({morning:['one','two'],lunch:['one'],evening:['one','two']}).flatMap(([meal,people])=>people.map((assigned_to,i)=>({id:meal+i,shift_date:date,meal,meal_slot:i+1,assigned_to})));

function mount(overrides={}) {
  const buttons=[],alerts=[],calls=[];
  const module=new Module(filename);module.filename=filename;
  module.require=name=>{
    if(name==='react-native')return {...native,Pressable:props=>{buttons.push(props);return React.createElement(native.Pressable,props);}};
    if(name==='./Dropdown')return {__esModule:true,default:()=>null};
    if(name==='./dialogs')return {Alert:{alert:(...args)=>alerts.push(args)}};
    if(name==='./feedingDay')return feeding;
    if(name==='./holidayFeeding')return helpers;
    return require(name);
  };
  module._compile(code,filename);
  const props={client:{rpc:async(...args)=>{calls.push(args);return {error:null};}},stableId:'stable',date,shifts:[],options,loading:false,error:'',onSaved:async()=>{},...overrides};
  const html=renderToStaticMarkup(React.createElement(module.exports.default,props));
  return {button:buttons.at(-1),alerts,calls,html};
}

test('an empty form saves open slots and clearly explains that they can be filled later',async()=>{
  const form=mount();assert.equal(form.button.disabled,false);
  assert(form.html.includes('Ledige plasser – kan fylles inn senere'));
  form.button.onPress();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(form.alerts.at(-1)[0],'Lagret');
  assert(form.alerts.at(-1)[1].includes('Ledige plasser er lagret og kan fylles inn senere.'));
  assert.deepEqual(form.calls[0][1].p_morning,[null,null]);
  assert.deepEqual(form.calls[0][1].p_lunch,[null]);
  assert.deepEqual(form.calls[0][1].p_evening,[null,null]);
});

test('a day with known morning/evening owners can be saved while lunch stays open',async()=>{
  const shifts=[{id:'old-one',shift_date:date,daily_slot:1,assigned_to:'one'},{id:'old-two',shift_date:date,daily_slot:2,assigned_to:'two'}];
  const form=mount({shifts});form.button.onPress();
  assert.equal(form.alerts[0][0],'Oppdater fordelingen');
  form.alerts[0][2].find(button=>button.text==='Lagre fordeling').onPress();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(form.calls[0][1].p_morning,['one','two']);
  assert.deepEqual(form.calls[0][1].p_lunch,[null]);
  assert.deepEqual(form.calls[0][1].p_evening,['one','two']);
  assert.equal(form.alerts.at(-1)[0],'Lagret');
});

test('pressing save while loading or after a failed read gives a reason and sends no write',()=>{
  for(const [overrides,message] of [[{loading:true},'Henter lagrede fôringer'],[{error:'Offline'},'Oppdater fôringer']]){
    const form=mount(overrides);assert.equal(form.button.disabled,false);form.button.onPress();
    assert(form.alerts[0][1].includes(message));assert.equal(form.calls.length,0);
  }
});

test('a complete form confirms replacement and saves once even if confirmation is pressed twice',async()=>{
  const form=mount({shifts:fullShifts()});form.button.onPress();
  assert.equal(form.alerts[0][0],'Oppdater fordelingen');
  const confirm=form.alerts[0][2].find(button=>button.text==='Lagre fordeling');confirm.onPress();confirm.onPress();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(form.calls.length,1);assert.equal(form.calls[0][0],'save_holiday_feeding');
  assert.deepEqual(form.calls[0][1].p_lunch,['one']);
  assert.equal(form.alerts.at(-1)[0],'Lagret');
});

test('a selected person who is no longer available still produces a clear error without saving',()=>{
  const form=mount({shifts:fullShifts(),options:[options[0]]});form.button.onPress();
  assert.equal(form.alerts[0][0],'Fordelingen er ikke klar');
  assert(form.alerts[0][1].includes('personen er ikke lenger tilgjengelig'));
  assert.equal(form.calls.length,0);
});

test('a server or network failure is explained and never reported as saved',async()=>{
  const message='Fôringene er endret. Oppdater og prøv igjen.';
  const form=mount({shifts:fullShifts(),client:{rpc:async()=>({error:new Error(message)})}});
  form.button.onPress();form.alerts[0][2].find(button=>button.text==='Lagre fordeling').onPress();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(form.alerts.at(-1)[0],'Kunne ikke lagre fôringer');
  assert.equal(form.alerts.at(-1)[1],message);
  assert(!form.alerts.some(([title])=>title==='Lagret'));
});
