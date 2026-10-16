// Named Norwegian public holidays; ordinary Sundays are excluded by stall policy.
// Calendar dates are ISO date strings;
// UTC is used only for calendar arithmetic, never to convert a user's local day.
const cache = new Map();
const iso = date => `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}-${String(date.getUTCDate()).padStart(2,'0')}`;
function parse(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const [year,month,day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year,month-1,day,12));
  return iso(date) === value ? date : null;
}

export function easterSunday(year) {
  if (!Number.isInteger(year) || year < 1583 || year > 9999) throw new Error('Ugyldig kalenderår.');
  const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4;
  const f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30;
  const i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
  const month=Math.floor((h+l-7*m+114)/31),day=(h+l-7*m+114)%31+1;
  return iso(new Date(Date.UTC(year,month-1,day,12)));
}

export function norwegianHolidays(year) {
  if (cache.has(year)) return cache.get(year);
  const easter=parse(easterSunday(year)),days={};
  const add=(date,name)=>{days[date]=days[date]?`${days[date]} / ${name}`:name;};
  for (const [month,day,name] of [[1,1,'Første nyttårsdag'],[5,1,'Arbeidernes dag'],[5,17,'Grunnlovsdagen'],[12,25,'Første juledag'],[12,26,'Andre juledag']]) add(`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,name);
  for (const [offset,name] of [[-3,'Skjærtorsdag'],[-2,'Langfredag'],[0,'Første påskedag'],[1,'Andre påskedag'],[39,'Kristi himmelfartsdag'],[49,'Første pinsedag'],[50,'Andre pinsedag']]) {
    const date=new Date(easter);date.setUTCDate(date.getUTCDate()+offset);add(iso(date),name);
  }
  const result=Object.freeze(days);cache.set(year,result);return result;
}

export function holidayLabel(value) {
  const date=parse(value);if (!date || date.getUTCFullYear()<1583) return '';
  return norwegianHolidays(date.getUTCFullYear())[value] || '';
}
export const isRedDay = value => !!holidayLabel(value);

export function redDaysInMonth(year,month) {
  const days=new Date(Date.UTC(year,month,0,12)).getUTCDate();
  return Array.from({length:days},(_,index)=>`${year}-${String(month).padStart(2,'0')}-${String(index+1).padStart(2,'0')}`)
    .filter(isRedDay).map(date=>({date,label:holidayLabel(date)}));
}
