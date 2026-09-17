import React from 'react';
import {View,Text,Linking,Pressable} from 'react-native';
export async function disableDeviceNotifications(){}
export default function Notifications(){return <View style={{padding:16,backgroundColor:'white',borderRadius:14,marginBottom:14}}><Text style={{fontWeight:'700'}}>Varsler</Text><Text>Aktiver varsler i nettappen på telefon eller PC.</Text><Pressable onPress={()=>Linking.openURL('https://forrytter-stall-nordstjerna.expo.app/')}><Text style={{paddingVertical:12,color:'#244b3a'}}>Åpne nettappen</Text></Pressable></View>;}
