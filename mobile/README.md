# Fôrrytter App – Android og iOS

Dette er felles mobilprosjekt for Android og iOS.

Mobilappen henter `index.html` fra hovedgrenen ved oppstart. Dermed kan endringer i webappen bli synlige i mobilappen uten at en ny APK/IPA må installeres hver gang.

## Test på telefon med Expo Go

1. Installer Node.js 22 eller nyere på PC-en.
2. Åpne Kommandoprompt i `mobile`-mappen.
3. Kjør `npm install`.
4. Kjør `npx expo start`.
5. Installer Expo Go på Android eller iPhone og skann QR-koden.

## Lag Android APK

Installer EAS CLI med `npm install -g eas-cli`, logg inn med `eas login`, og kjør:

`eas build -p android --profile preview`

Preview-profilen er satt opp til å lage APK.

## Lag iOS-testversjon

For iOS kreves Apple-signering. Logg inn i EAS og kjør:

`eas build -p ios --profile preview`

For TestFlight/produksjon brukes production-profil og Apple Developer-konto.

## Viktig før produksjon

Dagens automatiske oppdatering henter HTML fra GitHub. Repoet må derfor være tilgjengelig fra appen. Før endelig lansering bør appdata, innlogging og roller flyttes til en sikker backend, og kildekoden kan deretter gjøres privat.
