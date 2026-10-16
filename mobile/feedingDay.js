import { feedingLabel } from './overview.js';
import { isRedDay } from './holidays.js';

export const FEEDING_MEALS = [
  {key:'morning',label:'Morgenfôring',people:2},
  {key:'lunch',label:'Lunsjfôring',people:1},
  {key:'evening',label:'Kveldsfôring',people:2},
];
function mealKey(shift) {
  if (shift.meal) return shift.meal;
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
      const required=isRedDay(date)?meal.people:null;
      const assignedCount=new Set(assignments.map(shift=>shift.assigned_to).filter(Boolean)).size;
      const overAssigned=!!required&&assignedCount>required;
      return {...meal,assignments,required,assignedCount,overAssigned,missing:!assignments.length||assignments.some(shift=>!shift.assigned_to)||(!!required&&assignedCount!==required)};
    }),
    extras:individual.filter(shift=>!mealKey(shift)),
  };
}
