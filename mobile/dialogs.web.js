import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

// React Native's Alert is not implemented on web. Keep the same button callbacks.
const pending = [];
let notify = () => {};
export const Alert = {
  alert(title, message = '', buttons) {
    pending.push({title, message, buttons: buttons?.length ? buttons : [{text:'OK'}]});
    notify();
  },
};
export function DialogHost() {
  const [, refresh] = useState(0);
  useEffect(() => {
    notify = () => refresh(value => value + 1);
    notify();
    return () => { notify = () => {}; };
  }, []);
  const current = pending[0];
  const close = button => {
    pending.shift();
    notify();
    button?.onPress?.();
  };
  const cancel = () => {
    const button = current?.buttons.find(item => item.style === 'cancel');
    if (button) close(button);
    else if (current?.buttons.length === 1) close(current.buttons[0]);
  };
  return <Modal visible={!!current} transparent animationType="fade" onRequestClose={cancel}>
    <View style={styles.backdrop}>
      <View style={styles.card} accessibilityRole="alert" aria-modal="true">
        <Text style={styles.title}>{current?.title}</Text>
        {!!current?.message && <Text style={styles.message}>{current.message}</Text>}
        <ScrollView style={{maxHeight:320}}>
          {current?.buttons.map((button,index) => <Pressable key={index} accessibilityRole="button" onPress={()=>close(button)}
            style={[styles.button,button.style==='destructive'&&styles.danger]}>
            <Text style={styles.buttonText}>{button.text || 'OK'}</Text>
          </Pressable>)}
        </ScrollView>
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop:{flex:1,backgroundColor:'rgba(20,30,18,.45)',justifyContent:'center',alignItems:'center',padding:20},
  card:{backgroundColor:'#fff',width:'100%',maxWidth:430,padding:24,borderRadius:16},
  title:{fontSize:20,fontWeight:'700',color:'#283126',marginBottom:12},
  message:{fontSize:16,lineHeight:24,marginBottom:20,color:'#455443'},
  button:{minHeight:46,padding:12,backgroundColor:'#5f7652',borderRadius:10,marginBottom:8,alignItems:'center',justifyContent:'center'},
  danger:{backgroundColor:'#9f3f37'},buttonText:{color:'#fff',fontWeight:'700',fontSize:15},
});
