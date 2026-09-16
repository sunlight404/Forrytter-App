import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
export default function Dropdown({label,value,onChange,options,placeholder='Velg navn',disabled=false}) {
  const [open,setOpen]=useState(false),[search,setSearch]=useState('');
  const selected=options.find(o=>o.value===value);
  return <View style={{marginBottom:14}}><Text style={{fontSize:12,color:'#6b746a',marginBottom:6}}>{label}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{expanded:open,disabled}} disabled={disabled} onPress={()=>{setSearch('');setOpen(true);}} style={{borderWidth:1,borderColor:'#d8d4ca',borderRadius:10,padding:13,backgroundColor:'#fff',opacity:disabled?.5:1}}><Text style={{color:'#283126',fontSize:16}}>{selected?.label||placeholder} ▾</Text></Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={()=>setOpen(false)}><View style={{flex:1,backgroundColor:'rgba(20,30,18,.45)',justifyContent:'center',padding:20}}><View style={{backgroundColor:'#fff',borderRadius:14,padding:18,maxHeight:'80%'}}>
      <Text style={{fontSize:19,fontWeight:'700',marginBottom:12}}>{label}</Text>
      <TextInput accessibilityLabel="Søk etter navn" placeholder="Søk etter navn" value={search} onChangeText={setSearch} style={{borderWidth:1,borderColor:'#d8d4ca',padding:12,borderRadius:8,marginBottom:10}}/>
      <ScrollView keyboardShouldPersistTaps="handled">{options.filter(o=>o.label.toLocaleLowerCase('nb').includes(search.toLocaleLowerCase('nb'))).map(o=><Pressable accessibilityRole="button" key={o.value} onPress={()=>{onChange(o.value);setOpen(false);}} style={{padding:14,backgroundColor:o.value===value?'#eef1ec':'#fff',borderBottomWidth:1,borderBottomColor:'#eee'}}><Text style={{fontSize:16}}>{o.label}</Text></Pressable>)}{!options.length&&<Text>Ingen navn tilgjengelig.</Text>}</ScrollView>
      <Pressable accessibilityRole="button" onPress={()=>setOpen(false)} style={{padding:14,alignItems:'center'}}><Text>Avbryt</Text></Pressable>
    </View></View></Modal>
  </View>;
}
