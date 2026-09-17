// Dates and times are local stable calendar values, never UTC conversions.
export const STANDARD_TASKS = ['Møkke ute og inne', 'Fylle vann ute og inne', 'Gjøre i stand kraftfôr', 'Smøre utstyr', 'Fylling av fôrposer'];
export const dateKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export const timeKey = (d = new Date()) => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
export function nextWeekend(d = new Date()) {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  while (![0,6].includes(next.getDay())) next.setDate(next.getDate()+1);
  return dateKey(next);
}
export const isWeekend = value => [0,6].includes(new Date(`${value}T12:00:00`).getDay());
export const feedingLabel = shift => shift.label === 'Fôring' ? (shift.shift_time < '12:00' ? 'Morgenfôring' : 'Kveldsfôring') : shift.label;
export const upcomingShiftFilter = (date, time) => `shift_date.gt.${date},and(shift_date.eq.${date},shift_time.gte.${time})`;

export function isoWeek(value) {
  const [year,month,day] = value.split('-').map(Number);
  const d = new Date(Date.UTC(year,month-1,day));
  d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));
  const start = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil(((d-start)/86400000+1)/7);
}
export const weekLabel = value => `Uke ${isoWeek(value)} · ${isoWeek(value)%2===0?'partallsuke':'oddetallsuke'}`;
export const agreementLabel = rule => `${rule.weekday===6?'Lørdag':'Søndag'} i ${rule.week_parity===0?'partallsuker':'oddetallsuker'}`;

// Concrete calendar rows remain authoritative: never reconstruct dates from a rule,
// because cancellations, individual changes and approved swaps override that rule.
export function assignmentOrigin(assignment, agreements = [], swap = null) {
  const rule = agreements.find(item => item.id === assignment.recurring_id);
  if (rule) return `Fast avtale · ${agreementLabel(rule)}`;
  if (swap?.status === 'approved') {
    const original = swap.from_assignment_id === assignment.id ? swap.to_snapshot : swap.to_assignment_id === assignment.id ? swap.from_snapshot : null;
    if (original?.horse_id === assignment.horse_id && original?.assignment_date === assignment.assignment_date) return 'Godkjent hestebytte';
  }
  return 'Avtale for denne datoen';
}
