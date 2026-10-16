import React, {useEffect,useRef,useState} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import Dropdown from './Dropdown';
import {Alert} from './dialogs';
import {FEEDING_MEALS} from './feedingDay';
import {saveHolidayFeeding,seedHolidayPlan,validateHolidayPlan} from './holidayFeeding';

export default function HolidayFeedingForm({client,stableId,date,shifts,options,loading,error,onSaved}) {
  const [plan,setPlan]=useState(()=>seedHolidayPlan(date,shifts));
  const [expected,setExpected]=useState(()=>shifts.map(s=>s.id));
  const [dirty,setDirty]=useState(false),[saving,setSaving]=useState(false);
  const working=useRef(false);
  const revision=shifts.map(s=>`${s.id}:${s.assigned_to||''}`).sort().join('|');
  useEffect(()=>{
    if (!dirty&&!loading&&!error) {setPlan(seedHolidayPlan(date,shifts));setExpected(shifts.map(s=>s.id));}
  },[date,revision,loading,error,dirty]);
  let valid=true;try{validateHolidayPlan(date,plan);}catch{valid=false;}
  const choose=(meal,index,value)=>{setDirty(true);setPlan(previous=>({...previous,[meal]:previous[meal].map((person,i)=>i===index?value:person)}));};
  async function save() {
    if(working.current||loading||error)return;
    working.current=true;setSaving(true);
    try {
      await saveHolidayFeeding(client,{stableId,date,plan,expected});
      await onSaved();setDirty(false);
      Alert.alert('Lagret','Morgen: 2 personer. Lunsj: 1 person. Kveld: 2 personer.');
    } catch(e) {Alert.alert('Kunne ikke lagre fôringer',e.message||'Prøv igjen.');}
    finally {working.current=false;setSaving(false);}
  }
  function confirmSave() {
    if(!valid||working.current||loading||error)return;
    if(expected.length)Alert.alert('Erstatt fôringer denne dagen','De lagrede fôringene erstattes med valgt fordeling: to morgen, én lunsj og to kveld.',[{text:'Avbryt',style:'cancel'},{text:'Lagre fordeling',onPress:save}]);
    else save();
  }
  return <View>
    <Text style={styles.heading}>Fordel personer per måltid</Text>
    <Text style={styles.help}>Samme person kan ha flere måltider. Dere trenger ikke tre forskjellige personer.</Text>
    {FEEDING_MEALS.map(meal=><View key={meal.key} style={styles.meal}>
      <Text style={styles.heading}>{meal.label} · {meal.people} {meal.people===1?'person':'personer'}</Text>
      {Array.from({length:meal.people},(_,i)=><Dropdown key={i} label={`${meal.label} – person ${i+1}`} value={plan[meal.key]?.[i]} disabled={saving||loading||!!error} onChange={value=>choose(meal.key,i,value)} options={options.filter(person=>!(plan[meal.key]||[]).some((id,index)=>index!==i&&id===person.value))}/>)}
    </View>)}
    <Pressable accessibilityRole="button" accessibilityState={{disabled:saving||loading||!!error||!valid}} disabled={saving||loading||!!error||!valid} onPress={confirmSave} style={[styles.button,(saving||loading||!!error||!valid)&&styles.disabled]}><Text style={styles.buttonText}>{saving?'Lagrer …':'Lagre fordeling'}</Text></Pressable>
    {!valid&&<Text style={styles.help}>Velg to personer til morgen, én til lunsj og to til kveld.</Text>}
  </View>;
}
const styles=StyleSheet.create({heading:{fontWeight:'800',color:'#283126',fontSize:16,marginBottom:8},help:{color:'#6b746a',lineHeight:21,marginBottom:12},meal:{padding:12,borderWidth:1,borderColor:'#ded9cf',borderRadius:12,marginBottom:12},button:{backgroundColor:'#5f7652',padding:14,borderRadius:10,alignItems:'center',marginBottom:10},buttonText:{fontWeight:'700',fontSize:16,color:'#fff'},disabled:{opacity:.45}});
