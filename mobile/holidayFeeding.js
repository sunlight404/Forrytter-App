import { FEEDING_MEALS, feedingDay } from './feedingDay.js';
import { isRedDay } from './holidays.js';

export function seedHolidayPlan(date,shifts) {
  return Object.fromEntries(feedingDay(date,shifts).meals.map(meal=>{
    const owners=[...new Set(meal.assignments.map(s=>s.assigned_to).filter(Boolean))];
    // Do not silently choose a lunch owner from an older shared daily assignment.
    return [meal.key,Array.from({length:meal.people},(_,i)=>owners.length>meal.people?null:owners[i]||null)];
  }));
}

export function validateHolidayPlan(date,plan) {
  if (!isRedDay(date)) throw new Error('Velg en rød dag i stallkalenderen');
  for (const meal of FEEDING_MEALS) {
    const owners=plan[meal.key];
    if (!Array.isArray(owners)||owners.length!==meal.people||owners.some(person=>!person)) throw new Error(`${meal.label}: velg ${meal.people} ${meal.people===1?'person':'personer'}`);
    if (new Set(owners).size!==owners.length) throw new Error(`${meal.label}: velg forskjellige personer`);
  }
}

export async function saveHolidayFeeding(client,{stableId,date,plan,expected}) {
  validateHolidayPlan(date,plan);
  const {error}=await client.rpc('save_holiday_feeding',{
    p_stable:stableId,p_date:date,p_morning:plan.morning,p_lunch:plan.lunch,p_evening:plan.evening,p_expected:expected,
  });
  if (error) throw error;
}
