import { feedingLabel } from './overview.js';
import { isRedDay } from './holidays.js';

export const FEEDING_MEALS = [
  {key:'morning',label:'Morgenfôring'},
  {key:'lunch',label:'Lunsjfôring'},
  {key:'evening',label:'Kveldsfôring'},
];
function mealKey(shift) {
  const label=feedingLabel(shift).toLocaleLowerCase('nb');
  if (label.includes('morgen')) return 'morning';
  if (label.includes('lunsj')) return 'lunch';
  if (label.includes('kveld')) return 'evening';
  return null;
}

export function feedingDay(date,shifts) {
  const day=shifts.filter(shift=>shift.shift_date===date);
  const daily=day.filter(shift=>shift.daily_slot),individual=day.filter(shift=>!shift.daily_slot);
  if (!isRedDay(date) && !daily.length) return {meals:[],extras:individual};
  return {
    meals:FEEDING_MEALS.map(meal=>{
      const assignments=[...daily,...individual.filter(shift=>mealKey(shift)===meal.key)];
      return {...meal,assignments,missing:!assignments.length||assignments.some(shift=>!shift.assigned_to)};
    }),
    extras:individual.filter(shift=>!mealKey(shift)),
  };
}
