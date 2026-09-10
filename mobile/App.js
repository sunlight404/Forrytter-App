import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

const APP_URL = 'https://raw.githubusercontent.com/sunlight404/Forrytter-App/main/index.html';

export default function App() {
  const [html, setHtml] = useState(null);
  const [error, setError] = useState(null);
  const cacheBust = useMemo(() => Date.now(), []);

  useEffect(() => {
    let active = true;
    fetch(`${APP_URL}?v=${cacheBust}`, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(`Kunne ikke hente appen (${res.status})`);
        return res.text();
      })
      .then((text) => {
        if (active) setHtml(text);
      })
      .catch((e) => {
        if (active) setError(e.message || 'Kunne ikke hente siste versjon.');
      });
    return () => {
      active = false;
    };
  }, [cacheBust]);

  if (error) {
    return (
      <SafeAreaView style={styles.center}>
        <StatusBar barStyle="dark-content" />
        <Text style={styles.title}>Fôrrytter App</Text>
        <Text style={styles.text}>{error}</Text>
        <Text style={styles.small}>Sjekk internettforbindelsen og åpne appen på nytt.</Text>
      </SafeAreaView>
    );
  }

  if (!html) {
    return (
      <SafeAreaView style={styles.center}>
        <StatusBar barStyle="dark-content" />
        <ActivityIndicator size="large" />
        <Text style={styles.text}>Henter siste versjon …</Text>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <WebView
        originWhitelist={['*']}
        source={{ html, baseUrl: 'https://raw.githubusercontent.com/sunlight404/Forrytter-App/main/' }}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        setSupportMultipleWindows={false}
        allowsBackForwardNavigationGestures
        style={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f3ea' },
  webview: { flex: 1, backgroundColor: '#f7f3ea' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#f7f3ea',
  },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 12, color: '#283126' },
  text: { marginTop: 12, fontSize: 16, textAlign: 'center', color: '#283126' },
  small: { marginTop: 8, fontSize: 13, textAlign: 'center', color: '#6b746a' },
});
