import React, {useEffect,useRef,useState} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import Dropdown from './Dropdown';
import {Alert} from './dialogs';
import {FEEDING_MEALS} from './feedingDay';
import {saveHolidayFeeding,seedHolidayPlan,holidaySaveIssues,holidayUnassignedSlots,holidayPlanSummary} from './holidayFeeding';

export default function HolidayFeedingForm({client,stableId,date,shifts,options,loading,error,onSaved}) {
  const [plan,setPlan]=useState(()=>seedHolidayPlan(date,shifts));
  const [expected,setExpected]=useState(()=>shifts.map(s=>s.id));
  const [dirty,setDirty]=useState(false),[saving,setSaving]=useState(false);
  const [saveError,setSaveError]=useState('');
  const working=useRef(false);
  const revision=shifts.map(s=>`${s.id}:${s.assigned_to||''}`).sort().join('|');
  useEffect(()=>{
    if (!dirty&&!loading&&!error) {setPlan(seedHolidayPlan(date,shifts));setExpected(shifts.map(s=>s.id));}
  },[date,revision,loading,error,dirty]);
  const issues=holidaySaveIssues({date,plan,activeUserIds:options.map(person=>person.value),loading,error});
  const unassigned=holidayUnassignedSlots(plan);
  const choose=(meal,index,value)=>{setDirty(true);setSaveError('');setPlan(previous=>({...previous,[meal]:previous[meal].map((person,i)=>i===index?value:person)}));};
  function explainMissing() {
    if (!issues.length) return false;
    Alert.alert(loading?'Henter fôringer':error?'Kunne ikke hente fôringer':'Fordelingen er ikke klar',issues.join('\n'));
    return true;
  }
  async function save() {
    if(working.current||explainMissing())return;
    working.current=true;setSaving(true);setSaveError('');
    try {
      await saveHolidayFeeding(client,{stableId,date,plan,expected});
      await onSaved();setDirty(false);
      Alert.alert('Lagret',holidayPlanSummary(plan)+(unassigned.length?'\nLedige plasser er lagret og kan fylles inn senere.':'\nAlle fôringene er fordelt.'));
    } catch(e) {const message=e.message||'Kunne ikke lagre. Kontroller nettforbindelsen og prøv igjen.';setSaveError(message);Alert.alert('Kunne ikke lagre fôringer',message);}
    finally {working.current=false;setSaving(false);}
  }
  function confirmSave() {
    if(working.current||explainMissing())return;
    if(expected.length)Alert.alert('Oppdater fordelingen',holidayPlanSummary(plan)+'\nValgene lagres. Tomme plasser blir stående ledige og kan fylles inn senere.',[{text:'Avbryt',style:'cancel'},{text:'Lagre fordeling',onPress:save}]);
    else save();
  }
  return <View>
    <Text style={styles.heading}>Fordel personer per måltid</Text>
    <Text style={styles.help}>Lagre de personene du vet om nå. Ledige plasser kan fylles inn senere. Samme person kan ha flere måltider.</Text>
    {FEEDING_MEALS.map(meal=><View key={meal.key} style={styles.meal}>
      <Text style={styles.heading}>{meal.label} · {meal.people} {meal.people===1?'person':'personer'}</Text>
      {Array.from({length:meal.people},(_,i)=><Dropdown key={i} label={`${meal.label} – person ${i+1}`} value={plan[meal.key]?.[i]} disabled={saving||loading||!!error} onChange={value=>choose(meal.key,i,value)} options={options.filter(person=>!(plan[meal.key]||[]).some((id,index)=>index!==i&&id===person.value))}/>)}
    </View>)}
    {!loading&&!error&&unassigned.length>0&&<View style={styles.issueBox}><Text style={styles.issueHeading}>Ledige plasser – kan fylles inn senere</Text>{unassigned.map((message,i)=><Text key={i} style={styles.issueText}>{message}</Text>)}</View>}
    {issues.length>0&&<View style={styles.issueBox}><Text style={styles.issueHeading}>{loading?'Henter fôringer …':error?'Fôringer må oppdateres':'Rett dette før lagring:'}</Text>{issues.map((message,i)=><Text key={i} accessibilityRole="alert" style={styles.issueText}>{message}</Text>)}</View>}
    {!!saveError&&<Text accessibilityRole="alert" style={styles.issueText}>{saveError}</Text>}
    <Pressable accessibilityRole="button" accessibilityState={{disabled:saving,busy:saving}} disabled={saving} onPress={confirmSave} style={[styles.button,saving&&styles.disabled]}><Text style={styles.buttonText}>{saving?'Lagrer …':'Lagre fordeling'}</Text></Pressable>
  </View>;
}
const styles=StyleSheet.create({heading:{fontWeight:'800',color:'#283126',fontSize:16,marginBottom:8},help:{color:'#6b746a',lineHeight:21,marginBottom:12},meal:{padding:12,borderWidth:1,borderColor:'#ded9cf',borderRadius:12,marginBottom:12},issueBox:{padding:12,borderWidth:1,borderColor:'#d9b57a',borderRadius:10,backgroundColor:'#fffaf0',marginBottom:12},issueHeading:{fontWeight:'800',color:'#704816',marginBottom:6},issueText:{color:'#855517',lineHeight:22,marginBottom:6},button:{backgroundColor:'#5f7652',padding:14,borderRadius:10,alignItems:'center',marginBottom:10},buttonText:{fontWeight:'700',fontSize:16,color:'#fff'},disabled:{opacity:.45}});
