export const groupLabel = g => g.days.map(d=>d===6?'Lørdag':'Søndag').join(' og ')+' · '+(g.parities.length===2?'alle uker':g.parities[0]===0?'partallsuker':'oddetallsuker');
export function groupAgreements(rules){
 const buckets=new Map();for(const r of rules){const key=JSON.stringify([r.user_id,r.horse_id,r.start_date,r.training_text]);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(r);}
 const result=[];for(const rows of buckets.values()){const parities=[...new Set(rows.map(r=>r.week_parity))].sort(),days=[...new Set(rows.map(r=>r.weekday))].sort();const sets=rows.length===parities.length*days.length?[rows]:parities.map(p=>rows.filter(r=>r.week_parity===p));for(const set of sets)result.push({...set[0],key:set.map(r=>r.id).sort().join(':'),ids:set.map(r=>r.id),parities:[...new Set(set.map(r=>r.week_parity))].sort(),days:[...new Set(set.map(r=>r.weekday))].sort()});}return result;
}
