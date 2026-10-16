# Fôrrytter App 1.9.5

Mobilappen er en React Native/Expo-app med Supabase. App.js er appen som kjøres; index.html i prosjektroten er en eldre, separat demonstrasjon.

## Nytt i 1.9.5 – Tre fôringer bare på hellig-/høytidsdager

Kalenderen markerer norske hellig-/høytidsdager rødt, med navn
på den valgte dagen. Påske, Kristi himmelfart og pinse beregnes for kalenderåret.
Høytider som faller på samme dato, vises samlet. Vanlige søndager og
palmesøndag utløser ikke automatisk fôringsbehov. Første påske- og pinsedag
og øvrige navngitte høytidsdager er med også når de faller på en søndag.
Skoleferier, julaften og nyttårsaften er ikke egne røde dager.
Listen bruker de navngitte hellig-/høytidsdagene i
[helligdagsfredloven](https://lovdata.no/nav/lov/1995-02-24-12) og
[loven om 1. og 17. mai](https://lovdata.no/nav/lov/1947-04-26-1), med stallens
avgrensning til disse dagene i stedet for alle søndager.

Fôringskalenderen viser morgen, lunsj og kveld på alle røde dager, også før
ansvarlige er valgt. Manglende fordeling merkes tydelig. Admin får en liste
over røde dager i den viste måneden som fremdeles mangler fordeling.

Eksisterende dagsansvar med én eller to personer brukes for alle tre fôringer.
Admin lagrer fortsatt ansvaret gjennom `save_daily_feeding`. Ingen personer
tildeles automatisk. Individuelle fôringer og ekstraregistreringer bevares.
Fôringsbehov beregnes fra datoen, mens navnene følger lagrede vakter. Dette
krever ingen ny databasemigrasjon og endrer ikke eksisterende fôringsavtaler.

Verifikasjon: 49 kodetester, inkludert helligdager, tidssoner, overlappende
høytider, søndager uten automatiske behov og bevaring av lagrede søndagsvakter.
Seks databasekontroller fra versjon 1.9.4 i
`supabase/tests/holiday_feeding.sql` verifiserer lagring på en helligdag i uken,
felles ansvar, beskyttelse mot utdaterte lagringer og adminrettigheter.
Alle testdata rulles tilbake. Web-eksport er kontrollert.

## Nytt i 1.9.3 – Hjerter som bekreftelse

Gruppechat, private samtaler og Beskjeder har hjerteknapp, antall og **Se hvem**.
Brukeren trykker selv for å bekrefte at meldingen er fått med. Det er ikke en
automatisk lesekvittering. Trykk på nytt for å fjerne eget hjerte. Hjertene på
en importert tavlebeskjed er de samme i gruppechatten og på den opprinnelige
beskjeden i appen.

Migrasjonen `20261016175038_message_hearts.sql` oppretter `message_reactions`.
Hver bruker kan gi ett hjerte per melding, bare som seg selv. RLS følger
tilgangen til originalmeldingen; administratorer utenfor en privat samtale
får heller ikke se dens reaksjoner. Bare brukeren kan fjerne sitt eget hjerte.
Sletting av en melding fjerner dens reaksjoner. Ingen TV- eller pushkobling
legges til. Telefonnummer og e-post vises ikke i reaksjonene.

Verifikasjon: 39 kodetester, web-eksport og 23 nye databasekontroller for hjerter.
SQL-kontrollene i `supabase/tests/message_hearts.sql` ble kjørt i fem isolerte
transaksjoner med alle testdata rullet tilbake. De dekker blant annet telling,
lagring, av/på, duplikater, avsenderidentitet, navn og privat tilgang.

## Nytt i 1.9.2 – Tavlehistorikk og private samtaler

Chat har valgene **Gruppechat** og **Privat · én til én**. Private samtaler startes
ved å velge et aktivt stallmedlem ved navn. Like navn skilles med en profil-ID.
Brukerne beholder samme telefon-/SMS- eller e-postinnlogging.

`direct_messages` lagrer private meldinger med avsender og mottaker. RLS tillater
lesing bare for de to deltakerne med aktiv stalltilgang, uten administratorunntak.
Bare avsender kan slette sin egen melding, og da slettes den for begge. Sending
krever at mottakeren fortsatt er aktiv i samme stall. Historikk kan leses av en
fortsatt aktiv deltaker etter at den andre har forlatt stallen.

Migrasjonen `20261016171821_private_chat_and_board_history.sql` kopierer alle
lagrede tavlebeskjeder for Stall Nordstjerna til gruppechatten én gang, inkludert
utløpte/inaktive beskjeder. Tekst, avsender og opprinnelig dato bevares.
`board_message_id` hindrer duplikater og kan ikke settes av klienter. Importen
oppdaterer ikke tavla og sender ingen nye pushvarsler. Nye chatmeldinger speiles
ikke tilbake til tavla. Private meldinger vises heller ikke i gruppechatten.

Kontroller: `npm test` tester sending, innboks, toveis samtaler, paginering,
navnelikhet, retry og feilhåndtering. `supabase/tests/private_chat.sql` har 22
databasekontroller og ruller alle testdata tilbake. Den verifiserer blant annet
at mottaker kan svare, at uvedkommende administrator ikke kan lese samtalen,
og at tilbakekalt medlemskap sperrer tilgang. Gruppechatens 14 eksisterende
databasekontroller beholdes. Web bygges med `npm run build:web` fra `mobile/`.

## Nytt i 1.3.0

- Admin skriver trening som fritekst på en enkelt dato eller som standard på en fast avtale. Rytteren ser treningen ved dagens/neste hest og valgt oppgavedato.
- «Faste fôrrytteravtaler» støtter partallsuker og oddetallsuker, lørdag, søndag eller begge. Ukenummer følger ISO-uken, også uke 53 ved årsskifte. Dette er ikke nødvendigvis samme rytme som hver 14. dag.
- «Mine faste hestedager» viser rytterens avtaler. Datoene med standardoppgaver opprettes for et rullerende år og fylles daglig av en databasejobb.
- Enkeltdatoer og avlysninger overstyrer faste avtaler. Endring/avslutning bevarer historiske og påbegynte dager samt ekstraoppgaver.
- Eksisterende faste avtaler må registreres av admin; ingen avtaler er gjettet ut fra tidligere enkeltdatoer.

## Beholdt fra forrige versjon

- «Min oversikt» viser dagens hest, neste hest med dato og navn, og neste fôring med dato og morgen/kveld. Neste hest søkes uten en begrensning til inneværende uke eller måned.
- Neste fôring er første registrerte vakt fra nå av. En passert morgenfôring vises fortsatt under dagens fôringer, men er ikke neste vakt.
- Trykk på hesten for å åpne oppgavene på riktig dato. Oppgavekalenderen lar også rytteren se andre datoer og ekstraoppgaver.
- Fem standardoppgaver lagres automatisk sammen med tildelingen og krysses av separat. Admin kan fortsatt legge til ekstraoppgaver for valgt hest, rytter og dato.
- Kalender for alle fôringsdager, bytteforespørsler, beskjeder, godkjenning av brukere, roller, norsk datoformat, helgevalg, fjerning av hester og kontroll mot like hestenavn beholdes.

## Test med Expo Go

Fra mobile-mappen i denne versjonen:

```sh
npm ci
npm test
npm start
```

Skann QR-koden med Expo Go. Telefon og PC må være på samme nettverk. Bruk en godkjent stallkonto. Versjonen er 1.5.0; Android versionCode og iOS buildNumber er 7.

Hvis din gamle prosjektmappe har lokale endringer i app.json (ikon/EAS-oppsett), behold dem og bruk en separat prosjektkopi til testing. Ikke overskriv lokale innstillinger ved oppdatering.

## Database

Migrasjonen supabase/migrations/20260915100538_assignment_standard_tasks.sql er anvendt på appens eksisterende Supabase-prosjekt. Den trenger ikke kjøres på nytt der. Migrasjonsnummeret følger den registrerte versjonen i databasen.

Dette er en oppgradering av eksisterende skjema, ikke et komplett oppsett for en tom database. Den legger til assignment_id og standard_task_key på tasks og beholder eksisterende tilgangspolicyer. Ryttere kan bare endre fullføringsfeltene på egne oppgaver.

Ved gjentatt lagring beholdes fem oppgaver og avkryssingene. Ved endring av hest/dato/rytter erstattes bare genererte oppgaver med fem nye, uavkryssede oppgaver. Ved fjerning av tildelingen slettes bare de genererte oppgavene. Ekstraoppgaver beholder sin opprinnelige hest, rytter og dato. Historiske oppgaver endres ikke. Dagens og fremtidige eksisterende tildelinger fylles med standardoppgaver.

## Kontroller

```sh
npm test
npx expo export --platform android --platform ios --output-dir dist
```

supabase/tests/assignment_standard_tasks.sql tester med faktiske databasepolicyer: fem oppgaver, individuell avkryssing, tilgang for rytter, avvisning av uvedkommende, gjentatt lagring, hestebytte og sletting. Testen trenger to eksisterende profiler og oppretter en isolert teststall. Alt rulles tilbake.

Telefonkontroll før publisering:

1. Fordel en helgehest fra admin og åpne «Min oversikt» som rytteren på en hverdag. Kontroller navn, neste dato og alle fem oppgavene.
2. Legg til en ekstraoppgave, kryss av én oppgave, åpne appen på nytt og kontroller at avkryssingen er bevart.
3. Lagre samme tildeling igjen. Kontroller at den fortsatt har fem standardoppgaver samt ekstraoppgaven.
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

## Migrasjon og tester for faste avtaler

`supabase/migrations/20260915112216_recurring_horses_and_training.sql` er anvendt. Nye avtaler er beskyttet av RLS: stallmedlemmer kan lese, admin/eier kan lagre. Ingen nye funksjoner hever brukerens rettigheter. Cron-jobben `forrytter-recurring-horse-dates` vedlikeholder kommende datoer daglig.

`supabase/tests/recurring_horses_and_training.sql` tester riktige uketyper og dager, begge helgedager, fem oppgaver, fritekst, bevaring av enkeltdatoer/utførte oppgaver/ekstraoppgaver, avlysning, avslutning og at ryttere ikke kan endre avtaler. Alle testdata rulles tilbake. Begge SQL-testene og de fire datotestene besto, samt web- og iOS-eksport. Innlogget visuell bruk og installasjon på fysisk telefon gjenstår å prøve med stallkontoen.

Admin: Åpne «Faste fôrrytteravtaler», velg rytter, uketype, dager, hest, startdato og trening. Bruk «Hest og trening på en dato» for individuelle endringer. Oppdater Android til versjon 1.3.1 for å få denne visningen og riktig håndtering av avlyste datoer.

## Nytt i 1.3.1

Fylling av fôrposer er femte standardoppgave. Migrasjonen 20260915114256_feed_bag_standard_task.sql utvider oppgavetypene og legger den til på dagens og kommende aktive tildelinger. Historikk, avkryssinger og ekstraoppgaver beholdes. Begge databasetestene besto med fem oppgaver; individuell avkryssing testes på den nye oppgaven.

## Nytt i 1.4.0

Bruker- og hestenavn velges i nedtrekksmenyer. Android har søk i navnelisten; nettleseren bruker en vanlig tastaturtilgjengelig meny. Fôringsbytte viser alle aktive ryttere uten tidligere begrensning til åtte navn.

Admin: Brukere og roller > Velg bruker > Fjern bruker fra stallen. Dette deaktiverer medlemskapet, avslutter faste avtaler, avlyser kommende ikke-påbegynte hestedager, fristiller fremtidige fôringer og avslår uavklarte bytter. Konto, historikk og ekstraoppgaver beholdes. Fordel fristilte vakter i Fôringer uten rytter. Gi tilgang igjen gjenåpner medlemskapet uten å starte gamle avtaler på nytt.

Eier og egen innlogging er beskyttet. Bare eier kan endre administratorers tilgang eller roller. Databasetest med tilbakeføring kontrollerer tilgangstap, historikk, fristilling av vakter, gjenåpning og beskyttelser. Ingen faktiske brukere er fjernet under testingen. Versjon 1.4.0 bruker Android-kode 6.

## Nytt i 1.5.0

Fanen Bytt hest lar rytteren velge egen hestedato, mottaker og mottakerens hestedato. Samme dato bytter hester; ulike datoer bytter de to hestedagene. Mottaker må godta før admin kan godkjenne. Admin behandler hestebytter i samme fane. Sender kan trekke forespørselen tilbake, og mottaker kan trekke en godkjenning tilbake frem til admin har godkjent.

Godkjenningen skjer samlet i databasen med kontroll av tilganger, opprinnelige hester/datoer/trening, fullførte oppgaver og datokollisjoner. Trening og ekstraoppgaver følger hesten/datoen. Fem standardoppgaver opprettes per ny tildeling. Faste avtaler beholdes, og de opprinnelige datoene blokkeres fra automatisk gjenoppretting ved et bytte mellom datoer. Hvis avtalen er endret siden forespørselen, må den avslås og sendes på nytt.

Migrasjonen 20260916071512_horse_swap_requests.sql er anvendt. supabase/tests/horse_swap_requests.sql tester begge byttetyper, godkjenningsrekkefølge, uendret tildeling før godkjenning, ekstraoppgaver, standardoppgaver, faste avtaler, duplikater, gjentatt godkjenning, endret trening, utførte oppgaver og fjerning av bruker. Alle testdata rulles tilbake. Versjon 1.5.0 bruker Android-kode 7.


## Nytt i 1.9.1 – Chat for alle godkjente medlemmer

Fanen **Chat** inneholder en felles gruppechat for de eksisterende stallkontoene.
Telefonkontoer bruker samme SMS-innlogging som før og trenger ingen e-postadresse
eller separat ChatGPT-/Sites-konto. E-postkontoer bruker sin vanlige innlogging.
Tilgang til chatten avgjøres av aktivt stallmedlemskap og bruker-ID i databasen.

Chatten viser avsender og tidspunkt. Brukeren kan slette egne meldinger, og admin
eller eier kan moderere. Eldre meldinger kan lastes inn. Ved sendefeil beholdes
teksten, og gjentatt sending av samme forespørsel lager ikke duplikater.

Meldinger lagres i `community_messages`, adskilt fra `messages` og
`get_tv_messages()`. Gruppechatten vises ikke på tavla og bruker ikke
push-triggeren for tavlebeskjeder.

Web eksporteres fortsatt med `npm run build:web` fra `mobile/` til `mobile/dist/`.
Oppdater den eksisterende Expo-publikasjonen med `eas deploy --prod` fra `mobile/`
etter eksport og innlogging i riktig Expo-konto. Dette endrer ikke hvem som
får lese stalldata; den eksisterende telefon-/e-postinnloggingen og
medlemskontrollen gjelder fortsatt. Ingen ekstra Sites-e-postinvitasjon brukes.

Verifikasjon: 24 kodekontroller, inkludert SMS-innlogging uten e-post og sending
til gruppechatten. Databasetesten for chatten har 14 kontroller av medlemskap,
senderidentitet, sletting og at tavlebeskjedene er uendret. SQL-testene ruller
alle testdata tilbake. Innlogget visuell testing og Expo-publisering krever
separat tilgang til den eksisterende kontoen.

