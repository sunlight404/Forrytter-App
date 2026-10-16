import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { feedingDay } from './feedingDay';
import { feedingLabel } from './overview';
import { holidayLabel } from './holidays';

export default function FeedingDay({date,shifts,nameOf,loading,error}) {
  const plan=feedingDay(date,shifts),holiday=holidayLabel(date);
  return <View>
    {!!holiday && <View style={styles.holiday}><Text style={styles.holidayTitle}>Rød dag · {holiday}</Text><Text style={styles.help}>Morgen, lunsj og kveld skal fordeles denne dagen.</Text></View>}
    {plan.meals.map(meal=><View key={meal.key} style={[styles.card,meal.missing&&!loading&&!error&&styles.missing]}>
      <Text style={styles.title}>{meal.label}</Text>
      {loading?<Text style={styles.help}>Henter ansvarlige …</Text>:error?<Text style={styles.help}>Ansvarlige kunne ikke bekreftes. Oppdater fôringene.</Text>:meal.assignments.length?meal.assignments.map(shift=><Text key={shift.id} style={!shift.assigned_to?styles.unassigned:styles.person}>{nameOf(shift.assigned_to)}</Text>):<Text style={styles.unassigned}>Ikke fordelt</Text>}
    </View>)}
    {plan.extras.map(shift=><View key={shift.id} style={styles.card}><Text style={styles.title}>{feedingLabel(shift)}</Text><Text style={styles.person}>{nameOf(shift.assigned_to)}</Text></View>)}
    {!plan.meals.length&&!plan.extras.length&&<Text style={styles.help}>{loading?'Henter fôringer …':error?'Oppdater for å se ansvarlige.':'Ingen fôringer registrert denne dagen.'}</Text>}
  </View>;
}

const styles=StyleSheet.create({
  holiday:{borderRadius:10,backgroundColor:'#fff0ee',borderWidth:1,borderColor:'#ecc9c5',padding:12,marginTop:8,marginBottom:12},holidayTitle:{color:'#983c37',fontWeight:'800'},
  card:{padding:12,borderWidth:1,borderColor:'#ded9cf',borderRadius:12,marginBottom:10,backgroundColor:'#fafbf8'},missing:{borderColor:'#d9b57a',backgroundColor:'#fffaf0'},title:{fontWeight:'800',color:'#283126',marginBottom:5},person:{color:'#455443',lineHeight:22},unassigned:{color:'#855517',fontWeight:'700',lineHeight:22},help:{color:'#6b746a',lineHeight:21,marginTop:4,marginBottom:6},
});
