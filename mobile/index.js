import React from 'react';
import { registerRootComponent } from 'expo';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import App from './App';
import { DialogHost } from './dialogs';

function Root() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <App />
        <DialogHost />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

registerRootComponent(Root);
