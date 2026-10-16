import { FEEDING_MEALS, feedingDay } from './feedingDay.js';
import { isRedDay } from './holidays.js';

export function seedHolidayPlan(date,shifts) {
  return Object.fromEntries(feedingDay(date,shifts).meals.map(meal=>{
    const slots=meal.assignments.filter(s=>s.meal===meal.key&&s.meal_slot);
    if (slots.length) return [meal.key,Array.from({length:meal.people},(_,i)=>slots.find(s=>s.meal_slot===i+1)?.assigned_to||null)];
    const owners=[...new Set(meal.assignments.map(s=>s.assigned_to).filter(Boolean))];
    // Do not silently choose a lunch owner from an older shared daily assignment.
    return [meal.key,Array.from({length:meal.people},(_,i)=>owners.length>meal.people?null:owners[i]||null)];
  }));
}

export function holidayPlanIssues(date,plan,activeUserIds) {
  if (!isRedDay(date)) return ['Velg en rød dag i stallkalenderen.'];
  const issues=[],active=activeUserIds?new Set(activeUserIds):null;
  for (const meal of FEEDING_MEALS) {
    const owners=Array.isArray(plan?.[meal.key])?plan[meal.key]:[];
    if (plan?.[meal.key]!=null&&!Array.isArray(plan[meal.key])) issues.push(`${meal.label}: ugyldige personvalg.`);
    if (owners.length>meal.people) issues.push(`${meal.label}: velg ${meal.people} ${meal.people===1?'person':'personer'}.`);
    for (let i=0;i<meal.people;i++) {
      const field=`${meal.label} – person ${i+1}`;
      if (owners[i]&&active&&!active.has(owners[i])) issues.push(`${field}: personen er ikke lenger tilgjengelig. Velg en annen.`);
    }
    const filled=owners.filter(Boolean);
    if (new Set(filled).size!==filled.length) issues.push(`${meal.label}: velg forskjellige personer.`);
  }
  return issues;
}

export function normalizeHolidayPlan(plan) {
  return Object.fromEntries(FEEDING_MEALS.map(meal=>[meal.key,Array.from({length:meal.people},(_,i)=>plan?.[meal.key]?.[i]||null)]));
}

export function holidayUnassignedSlots(plan) {
  const normalized=normalizeHolidayPlan(plan);
  return FEEDING_MEALS.flatMap(meal=>normalized[meal.key].flatMap((person,i)=>person?[]:[`${meal.label} – person ${i+1}: ikke fordelt ennå.`]));
}

export function holidayPlanSummary(plan) {
  const normalized=normalizeHolidayPlan(plan);
  return FEEDING_MEALS.map(meal=>`${meal.label}: ${normalized[meal.key].filter(Boolean).length} av ${meal.people} personer fordelt.`).join('\n');
}

export function holidaySaveIssues({date,plan,activeUserIds,loading,error}) {
  if (loading) return ['Henter lagrede fôringer. Vent til hentingen er ferdig, og trykk «Lagre fordeling» igjen.'];
  if (error) return ['Lagrede fôringer kunne ikke hentes. Trykk «Oppdater fôringer» før du prøver å lagre igjen.'];
  return holidayPlanIssues(date,plan,activeUserIds);
}

export function validateHolidayPlan(date,plan) {
  const issues=holidayPlanIssues(date,plan);
  if (issues.length) throw new Error(issues.join('\n'));
}

export async function saveHolidayFeeding(client,{stableId,date,plan,expected}) {
  validateHolidayPlan(date,plan);
  const normalized=normalizeHolidayPlan(plan);
  const {error}=await client.rpc('save_holiday_feeding',{
    p_stable:stableId,p_date:date,p_morning:normalized.morning,p_lunch:normalized.lunch,p_evening:normalized.evening,p_expected:expected,
  });
  if (error) throw error;
}
