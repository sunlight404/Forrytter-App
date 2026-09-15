# Fôrrytter App 1.2.0 – testversjon

Mobilappen er en React Native/Expo-app med Supabase. App.js er appen som kjøres; index.html i prosjektroten er en eldre, separat demonstrasjon.

## Nytt

- «Min oversikt» viser dagens hest, neste hest med dato og navn, og neste fôring med dato og morgen/kveld. Neste hest søkes uten en begrensning til inneværende uke eller måned.
- Neste fôring er første registrerte vakt fra nå av. En passert morgenfôring vises fortsatt under dagens fôringer, men er ikke neste vakt.
- Trykk på hesten for å åpne oppgavene på riktig dato. Oppgavekalenderen lar også rytteren se andre datoer og ekstraoppgaver.
- Fire standardoppgaver lagres automatisk sammen med tildelingen og krysses av separat. Admin kan fortsatt legge til ekstraoppgaver for valgt hest, rytter og dato.
- Kalender for alle fôringsdager, bytteforespørsler, beskjeder, godkjenning av brukere, roller, norsk datoformat, helgevalg, fjerning av hester og kontroll mot like hestenavn beholdes.

## Test med Expo Go

Fra mobile-mappen i denne versjonen:

```sh
npm ci
npm test
npm start
```

Skann QR-koden med Expo Go. Telefon og PC må være på samme nettverk. Bruk en godkjent stallkonto. Versjonen er 1.2.0; Android versionCode og iOS buildNumber er 3.

Hvis din gamle prosjektmappe har lokale endringer i app.json (ikon/EAS-oppsett), behold dem og bruk en separat prosjektkopi til testing. Ikke overskriv lokale innstillinger ved oppdatering.

## Database

Migrasjonen supabase/migrations/20260915100538_assignment_standard_tasks.sql er anvendt på appens eksisterende Supabase-prosjekt. Den trenger ikke kjøres på nytt der. Migrasjonsnummeret følger den registrerte versjonen i databasen.

Dette er en oppgradering av eksisterende skjema, ikke et komplett oppsett for en tom database. Den legger til assignment_id og standard_task_key på tasks og beholder eksisterende tilgangspolicyer. Ryttere kan bare endre fullføringsfeltene på egne oppgaver.

Ved gjentatt lagring beholdes fire oppgaver og avkryssingene. Ved endring av hest/dato/rytter erstattes bare genererte oppgaver med fire nye, uavkryssede oppgaver. Ved fjerning av tildelingen slettes bare de genererte oppgavene. Ekstraoppgaver beholder sin opprinnelige hest, rytter og dato. Historiske oppgaver endres ikke. Dagens og fremtidige eksisterende tildelinger fylles med standardoppgaver.

## Kontroller

```sh
npm test
npx expo export --platform android --platform ios --output-dir dist
```

supabase/tests/assignment_standard_tasks.sql tester med faktiske databasepolicyer: fire oppgaver, individuell avkryssing, tilgang for rytter, avvisning av uvedkommende, gjentatt lagring, hestebytte og sletting. Testen trenger to eksisterende profiler og oppretter en isolert teststall. Alt rulles tilbake.

Telefonkontroll før publisering:

1. Fordel en helgehest fra admin og åpne «Min oversikt» som rytteren på en hverdag. Kontroller navn, neste dato og alle fire oppgavene.
2. Legg til en ekstraoppgave, kryss av én oppgave, åpne appen på nytt og kontroller at avkryssingen er bevart.
3. Lagre samme tildeling igjen. Kontroller at den fortsatt har fire standardoppgaver samt ekstraoppgaven.
4. Registrer morgen og kveld, også neste måned. Kontroller «Neste fôring», kalenderen og bytteforespørsler.
5. Kontroller dagens hest, tomme tilstander, helgevalg, fjerning av feil hest/tildeling og avvisning av et likt hestenavn.

## APK og iOS

```sh
eas build -p android --profile preview
eas build -p ios --profile preview
```

Dette krever EAS-innlogging/prosjektoppsett; iOS krever Apple-signering. Expo-eksport er en kontroll av appens JavaScript og ressurser, ikke en signert APK/IPA eller en telefonprøve.

## Eksisterende teknisk gjeld

Supabase-kontrollen før og etter migrasjonen viste de samme eksisterende varslene: eldre funksjoner med forhøyede rettigheter, manglende policy på app_config (tilgangen er stengt), og deaktivert kontroll av lekkede passord. Ingen nye varsler kom fra denne migrasjonen. Se [databasekontrollen](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) og [passordbeskyttelse](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Installasjonen rapporterte 10 moderate avhengighetsvarsler. Disse bør behandles separat fra funksjonsoppdateringen; automatiske hovedversjonsoppgraderinger er ikke utført.

## PC og iPhone – nettapp

Nettappen bruker samme appkode og Supabase-data som Android-appen.

- PC: Åpne nettadressen i Edge eller Chrome. Nettleserens installeringsmeny kan legge den til som en egen app.
- iPhone: Åpne nettadressen i Safari, velg Del og Legg til på Hjem-skjerm.
- Internett kreves for oppdaterte data og lagring. Ingen stalldata eller innlogging lagres i service worker-cachen.
- Dette er en nettapp på iPhone. En egen signert iOS-app via TestFlight krever Apple Developer-medlemskap.

Utvikling: `npm run web`. Publiserbar eksport: `npm run build:web`.

Web har egne bekreftelsesvinduer, inkludert valgene ved bytte og fjerning. Native Android/iOS beholder de opprinnelige systemdialogene. Innloggingsvisningen er kontrollert ved PC-bredde og 390 × 844, inkludert e-post-/telefonvalg og manglende-informasjon-dialoger. Den innloggede nettversjonen må også prøves med en godkjent stallkonto; ingen testinnlogging eller kontodata er lagt inn i appen.

Publisert nettapp: https://forrytter-stall-nordstjerna.expo.app
