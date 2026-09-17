import React,{useState} from 'react';
import { passwordRecoveryConfigured } from './authConfiguration';
import {View,Text,TextInput,Pressable,ScrollView,SafeAreaView} from 'react-native';
export const APP_URL='https://forrytter-stall-nordstjerna.expo.app/';
const button=(label,onPress,disabled=false)=><Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={{padding:13,backgroundColor:'#5f7652',borderRadius:10,marginTop:12,opacity:disabled?0.5:1}}><Text style={{color:'white',fontWeight:'700'}}>{label}</Text></Pressable>;
const input={borderWidth:1,borderColor:'#d8d4ca',padding:12,borderRadius:10,marginTop:8,backgroundColor:'white',fontSize:16};
export default function PasswordRecovery({supabase,session,reset=false,onClose}){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState('');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[done,setDone]=useState(false);
 async function send(){
  if(!passwordRecoveryConfigured)return;
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))return setMessage('Skriv inn e-postadressen du bruker i appen.');
  setBusy(true);setMessage('');try{const {error}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:APP_URL});if(error)throw error;setMessage('Hvis e-postadressen er registrert, får du en lenke for å velge nytt passord. Sjekk også søppelpost.');}catch{setMessage('Kunne ikke sende lenken. Vent litt og prøv igjen.');}finally{setBusy(false);}
 }
 async function save(){
  if(password.length<8)return setMessage('Bruk minst 8 tegn i det nye passordet.');
  if(password!==confirmation)return setMessage('Passordene er ikke like.');
  setBusy(true);setMessage('');try{const {error}=await supabase.auth.updateUser({password});if(error)throw error;setPassword('');setConfirmation('');setDone(true);setMessage('Passordet er endret. Du er logget inn på denne enheten.');}catch(e){setMessage(e.message||'Passordet kunne ikke lagres. Be om en ny lenke hvis den gamle har utløpt.');}finally{setBusy(false);}
 }
 if(!passwordRecoveryConfigured&&(!reset||!session))return <SafeAreaView style={{flex:1,backgroundColor:'#f7f3ea'}}><View style={{padding:24,maxWidth:560,alignSelf:'center',width:'100%'}}><Text style={{fontSize:26,fontWeight:'800',marginBottom:14}}>Glemt passord</Text><Text>Passordhjelp blir snart tilgjengelig. Kontakt administrator hvis du ikke kommer inn. Har du en konto med telefoninnlogging, kan du bruke SMS-kode.</Text>{button('Tilbake',onClose)}</View></SafeAreaView>;
 return <SafeAreaView style={{flex:1,backgroundColor:'#f7f3ea'}}><ScrollView contentContainerStyle={{padding:24,maxWidth:560,width:'100%',alignSelf:'center',flexGrow:1,justifyContent:'center'}}><Text style={{fontSize:26,fontWeight:'800',marginBottom:14}}>{reset?'Velg nytt passord':'Glemt passord'}</Text>{reset&&session&&!done?<><Text>Konto: {session.user.email}</Text><TextInput accessibilityLabel="Nytt passord" placeholder="Nytt passord (minst 8 tegn)" autoComplete="new-password" secureTextEntry value={password} onChangeText={setPassword} style={input}/><TextInput accessibilityLabel="Gjenta nytt passord" placeholder="Gjenta nytt passord" autoComplete="new-password" secureTextEntry value={confirmation} onChangeText={setConfirmation} style={input}/>{button(busy?'Lagrer …':'Lagre nytt passord',save,busy)}</>:!done?<><Text>{reset?'Lenken er utløpt eller ugyldig. Be om en ny lenke nedenfor.':'Skriv inn e-postadressen din, så får du en lenke for å velge nytt passord.'}</Text><TextInput accessibilityLabel="E-post for nytt passord" autoComplete="email" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} style={input}/>{button(busy?'Sender …':'Send passordlenke',send,busy||!passwordRecoveryConfigured)}</>:null}{!!message&&<Text accessibilityRole="alert" style={{marginTop:16,lineHeight:23}}>{message}</Text>}{button(done?'Til Min oversikt':'Tilbake',onClose,busy)}</ScrollView></SafeAreaView>;
}
