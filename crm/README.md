# CRM — Nooit meer vergeten, contact in één tik, overzicht

Drie pakketten, in volgorde: acties/opvolging (dit pakket), contact-in-één-tik, overzicht/KPI's.
Elk pakket bouwt op de bestaande app zonder iets te vervangen — zie §0 hieronder voor precies wat
er al bestond en hoe dit erop aansluit.

## §0 Verkenning

### 0.1 Klant (`werkbank.v2.customers`, functie `customers()` in jobs.js/werkbank-v2.html)
`{ id, name, contact, email, phone }` — geen adres/lat/lng, dat komt in pakket 2. Gelezen/
geschreven via `storageAdapter`/`safeGet`/`safeSet` met sleutel `CUSTOMER_KEY`.
**Bron-drift rechtgetrokken**: `jobs/jobs.js` had nog `CUSTOMER_KEY = 'werkbank.jobs.v1.customers'`
staan terwijl de gebouwde `werkbank-v2.html` allang `'werkbank.v2.customers'` gebruikte (ooit
direct in het samengevoegde bestand gepatcht, nooit teruggeschreven). Rechtgetrokken in `jobs/
jobs.js` op verzoek van de gebruiker — beide staan nu weer gelijk.

Cloud-merge (`cloud/cloud.js`): `syncCustomers()` pusht de hele lokale lijst naar Supabase-tabel
`customers` (upsert op `id`), `mergeCustomerRows()` voegt cloud-rijen en lokale rijen samen op
`id` (cloud wint bij een conflict — geen timestamp-vergelijking, in tegenstelling tot projecten).
`queueRetry()`/`flushRetryQueue()` vangen offline pushes op via een gedeeld retry-register
(`retryHandlers`) — CRM-acties/-log sluiten hierop aan, zie §Sync hieronder.

### 0.2 Klus/project (`STORE.calculations`, functies `savedProjects()`/`ensureJob()`)
Een klus is één entry `{ id, datum, schemaVersion, data }` in `STORE.calculations`; `entry.data`
is een volledige `costState`-snapshot, met `data.job` (opname: metingen/foto's/werk/klantvelden)
en `data.job.customerId` als koppeling naar `werkbank.v2.customers`. Het dashboard
(`renderDashboard()`) toont de laatste 5 via `$('recent-design')`.

**Statusveld (fase, zie §0.3)**: leeft op `costState.job.fase`, niet als los top-level veld op de
`STORE.calculations`-entry — CRM-code die "alle klussen met fase X" wil, leest dus
`savedProjects().filter(row => row.data.job?.fase === 'x')`.

### 0.3 Statusveld — al aanwezig, exact overeenkomend

`JOB_FASES`/`JOB_FASE_LABELS`/`JOB_FASE_TONE`/`TERMINAL_FASES`/`setJobFase()` bestaan al (uit een
eerdere sessie, gebouwd voor de offerteflow-pipeline) en staan **alleen in `werkbank-v2.html`**,
nooit in een brontekstlaag geschreven — vergelijkbaar met de `CUSTOMER_KEY`-drift hierboven, weer
een geval van "direct in het samengevoegde bestand gepatcht". De waarden/volgorde/labels komen
**exact** overeen met wat dit CRM-document vraagt:

`indicatie → opname → offerte_verzonden → opdracht → in_werkplaats → montage → geleverd →
gefactureerd`, zijtakken `afgewezen`/`vervallen` (met reden).

Badge-tinten zijn op verzoek van de gebruiker gelijkgetrokken met de spec: `opdracht` staat nu op
`primary` (= de "primary-tint" uit de spec) en `montage` op `warning` (was eerst `info`/`primary`).
Dit verandert de kleur van bestaande, elders al zichtbare badges (offertepipeline, dashboard-KPI's)
— functioneel niets stuk, puur een kleurwissel, bewust zo gekozen.

Veldnamen: de app gebruikt `job.fase` (niet `status`), `job.faseSince` (niet `statusChangedAt`) en
`job.faseReason` (niet `statusReden`) — CRM-code bouwt hierop voort onder de bestaande namen, geen
parallelle `status`-velden. **Toegevoegd in dit pakket**: `job.faseHistory` (array van
`{fase, at}`), want dat bestond nog niet en is nodig voor pakket 3's doorlooptijd-KPI's. Bestaande
klussen zonder historie krijgen bij de eerste fasewissel na deze update een historie die begint bij
hun huidige fase (niet met terugwerkende kracht te reconstrueren — dat is geen bug, dat is precies
"vanaf nu bijhouden", zoals het brondocument zelf voorschrijft in §4.2).

### Navigatie (bottom-nav, 4 knoppen)
Basis-HTML: Home/Tools/Instellingen/Prijzen; `jobs/jobs.js` herlabelt naar Klussen/Gereedschap/·
/Klanten (Prijzen→Klanten, eigen route `#klanten`). Instellingen krijgt zijn label via een
generieke remap elders (`settings`-icoon, "Instellingen"). Een nieuwe nav-knop toevoegen = een
`<button class="nav-btn" data-route="…">` in de `.bottom-nav` invoegen/herschikken plus een tak in
`routeHash()`.

**Besluit (met de gebruiker afgestemd):** Vandaag wordt de nieuwe eerste knop; Instellingen
verdwijnt uit de bottom-nav en krijgt een icoon-knop rechtsboven in de kop (`.masthead`) in plaats
daarvan — minst frequent gebruikte bestemming, blijft net zo goed op één tik bereikbaar. De
resterende drie (Klussen/Gereedschap/Klanten) behouden hun bestaande onderlinge volgorde. Nieuwe
nav: **Vandaag · Klussen · Gereedschap · Klanten**. Vandaag is ook het nieuwe startscherm (lege
hash bij het opstarten routeert er nu naartoe, tenzij er een conceptklus wordt hervat).

## Opslagsleutels (dit pakket)
- `werkbank.v2.crm.actions` — array van acties (zie `crm/crm.js` voor het exacte schema).
- `werkbank.v2.crm.settings` — verwaarlozingsdrempels per fase + dagstart-voorkeuren.
- `werkbank.v2.crm.lastDagstart` — datum (YYYY-MM-DD) van de laatst getoonde dagstart-samenvatting.
- Cloudtabel `crm_actions` (RLS, eigen rijen) — zie `supabase/schema.sql`.

## Automatische regels (pakket 1, exact deze drie — geen regelbouwer)
1. Bij aanmaken van een klus: actie `opname` (of `offerte` als er al materiaal/prijs is —
   in de praktijk bij het aanmaken altijd `opname`, `offerte` is voor toekomstig gebruik
   gereserveerd), vervaldatum morgen.
2. Bij fasewissel naar `offerte_verzonden`: actie `bellen` "Offerte opvolgen", vervaldatum over 5
   dagen.
3. Bij fasewissel naar `geleverd`: actie `factuur` "Factureren", vervaldatum morgen.

## Pakket 2 — Contact in één tik

### Datamodel
- `werkbank.v2.crm.log` — array van contactregels `{ id, customerId, projectId?, at, channel,
  note, actionId?, createdAt }`, exact het schema uit het brondocument. Append-only vanuit de
  client (zie de cloud-merge hieronder).
- `werkbank.v2.crm.templates` — de 5 berichtsjablonen (of de 5 standaardsjablonen als er nog
  niets bewaard is). Zit in de bestaande `SETTINGS_KEYS`-lijst (net als bedrijfsgegevens), geen
  eigen tabel.
- Cloudtabel `crm_log` (RLS, eigen rijen) — zie `supabase/schema.sql`.
- `customers` kreeg drie nieuwe kolommen: `address`, `lat`, `lng` (`alter table … add column if
  not exists`, idempotent op een tabel die al bestond).

### Klantkaart (`#klant/<id>`)
Vervangt niet de klantenlijst zelf (die blijft, met een adresveld erbij), maar wél wat er gebeurt
als je op een klant klikt: niet langer inline bewerken, maar naar de nieuwe klantkaart. Drie
gelijkwaardige contactknoppen (Bel/WhatsApp/Mail — **bewust alle drie `.ghost`, niet `.act`**: de
harde randvoorwaarde staat max één primaire/oranje knop per scherm toe, en geen van de drie is "de"
hoofdactie hier), auto-loggen bij elke klik, een uitkomst-balk na `visibilitychange`, tijdlijn
(logregels + acties + fasewissels + verzonden offerte-/factuurdocumenten uit `quotes/`, per dag
gegroepeerd — precies de vier bronnen die het brondocument noemt), en de klussen van deze klant met
statusbadge + live berekend openstaand bedrag (dezelfde rekenkern als `renderCostTotals`, tegen
een bewaarde snapshot i.p.v. de actieve `costState`).

### Twee echte bugs gevonden en gefixt tijdens het bouwen
1. **`hashchange`/`popstate`-listeners wezen naar een verouderde `routeHash`-referentie.**
   `addEventListener` legt de functiewaarde op het moment van registreren vast, geen live binding
   — mijn twee `routeHash`-wraps (Vandaag, `#klant/<id>`) veranderden dus wél een directe
   `routeHash()`-aanroep, maar niet wat er gebeurde bij de terug-knop of `location.hash = …`.
   Opgelost zoals `jobs.js` het al deed: de oude listener expliciet verwijderen en de nieuwe
   (gewrapte) functie opnieuw registreren.
2. **`syncCustomers()`/`mergeCustomerRows()` (cloud.js) kenden alleen name/contact/email/phone.**
   Een nieuw veld als `address` werd bij het pushen stilzwijgend niet meegestuurd, en bij het
   mergen na een pull zelfs actief weggegooid (de cloud-rij herbouwt een klant met precies die
   vier velden). Beide functies gewrapt om address/lat/lng mee te nemen zonder de bestaande vier
   velden aan te raken.

### Testen & verificatie (pakket 2)
- **Node core-test**: `tests/crm-contact.test.js` — E.164-normalisatie (10 gevallen, incl. lege/
  ontbrekende invoer en een buitenlands 00-nummer), tel:/wa.me/mailto-links, sjabloon-
  placeholders (ontbrekende variabelen worden stil leeg, geen "undefined"), haversine-afstand
  (geverifieerd tegen de bekende Amsterdam-Utrecht-afstand), tijdlijn-opbouw en -groepering.
- **Browsertest**: interactief geverifieerd (zelfde beperking, geen Chromium-binary — zie pakket
  1). Klant aanmaken met telefoon/e-mail → klantkaart openen → "Bel" logt direct → uitkomst-balk
  na terugkeer → "Terugbellen" plant een actie én vult de logregel aan; WhatsApp met sjabloon
  "Offerte opvolgen" bouwt een correcte, echt geopende `wa.me`-URL met ingevulde placeholders;
  snelnotitie opslaan verschijnt in de tijdlijn; adres → "Adres op kaart zetten" heeft een **echte
  Nominatim-aanroep** gedaan (De Dam, Amsterdam → 52.373/4.892, klopt) en "In de buurt" op Vandaag
  vond die klant terug op 0,0 km. Instellingen toont de nieuwe kaart "Berichten" met alle 5
  sjablonen. Geen screenshot-bestanden — zelfde reden als pakket 1 (geen tool om er een op schijf
  te zetten), wél handmatig bekeken (375 px, donker thema, klantkaart rendert correct met drie
  gelijke ghost-knoppen).
- **Snelnotitie-dictatie (`SpeechRecognition`)**: **niet browsergetest.** De browser-pane in deze
  omgeving ondersteunt geen microfooninvoer; de code zelf detecteert correct of de API bestaat
  (`window.SpeechRecognition || window.webkitSpeechRecognition`) en toont de mic-knop alleen dan,
  zoals gevraagd — het dicteren zelf is dus ongeverifieerd, niet stilzwijgend.

## Pakket 3 — Overzicht & inzicht

Het brondocument nummert dit "Pakket 4" (springt van 2 naar 4, waarschijnlijk een tikfout in de
oorspronkelijke opzet) — functioneel is dit het derde en laatste pakket, zo gebouwd.

### Kanban-bord / mobiele lijst (`#pipeline`)
Nieuwe pagina, bereikbaar via "Pipeline ›" boven de nieuwe KPI-kaarten op het dashboard (geen
eigen bottom-nav-knop — die vier slots zijn al vol na pakket 1's "Vandaag"). Op ≥1024 px acht
kolommen (`indicatie` t/m `gefactureerd` — de hoofdroute; `afgewezen`/`vervallen` bewust geen
kolom, die klussen zijn klaar). Kolomkop toont aantal + totaal excl. btw. Slepen tussen kolommen
(HTML5 drag-and-drop, geen library) roept `crmSetProjectFase()` aan, die de al-gewrapte
`setJobFase()` van pakket 1 hergebruikt door `savedProjectId` tijdelijk op de doelklus te zetten —
zo gelden de automatische acties uit pakket 1 ook hier, zonder die logica te dupliceren. Terug naar
een eerdere fase vraagt eerst bevestiging. Onder 1024 px dezelfde data als filterbare lijst met
statuschips (geen bord — sleepbewegingen zijn geen goed idee op een telefoonscherm).

### Dashboard-KPI's
Drie nieuwe kaarten (`#crm-kpi-block`, eigen sectie "Opvolging"), **naast** de bestaande
"Conversie laatste 30 dagen"/"Gem. tijd offerte → opdracht"-kaarten van de offerteflow (`quotes/`)
— bewust niet vervangen of samengevoegd. Die bestaande kaarten meten iets net anders (verzonden
offerte-*documenten*, gemiddelde over 30 dagen) dan wat dit brondocument vraagt (klussen die de
fase `offerte_verzonden` *bereikt* hebben, mediaan over 90 dagen) — een klus kan die fase bereiken
zonder dat er al een formeel offertedocument is verstuurd. Twee losstaande, eerlijk verschillende
inzichten, geen dubbele claim op dezelfde waarheid.

### Agenda-export (.ics)
Elke actie op Vandaag heeft een agenda-icoon (naast bellen/verzet/klaar) die één `.ics`-bestand
genereert; Instellingen → Opvolging heeft "Alle open acties exporteren" voor één bestand met alle
VEVENTs. Gebruikt `navigator.share` met een `File` als dat kan (mobiel), anders een gewone
download — zelfde eerst-kijken-wat-kan-patroon als de rest van de app. RFC 5545: CRLF-
regeleinden, regels gevouwen op 75 tekens, `UID`/`DTSTART`/`SUMMARY`/`DESCRIPTION` verplicht
aanwezig, `VALARM` 30 minuten van tevoren.

### Testen & verificatie (pakket 3)
- **Node core-test**: `tests/crm-overview.test.js` — conversie-/doorlooptijd-/openstaand-KPI's op
  een fixture van precies 15 klussen (zoals de acceptatie-eis vraagt) met uiteenlopende
  statushistorie, plus volledige .ics-vormvalidatie (regellengte ≤ 75, CRLF, gevouwen
  vervolgregels beginnen met een spatie, verplichte velden, meerdere VEVENTs in één VCALENDAR).
- **Browsertest**: kanban-bord renderde correct (8 kolommen, juiste aantallen/totalen per kolom);
  een fasewissel via `crmSetProjectFase()` (het daadwerkelijke sleep-doelmechanisme, drag-events
  zelf zijn lastig betrouwbaar te simuleren via automatisering) wijzigde de fase, breidde de
  faseHistory uit én maakte de bijbehorende automatische actie aan (pakket 1's regels werken dus
  ook via het bord); mobiele filterchips filterden de lijst correct; dashboard-KPI's toonden
  kloppende, live berekende getallen; een gegenereerd `.ics`-bestand bevatte de juiste `UID`/
  `DTSTART`/structuur. Kanban-bord ook in donker thema op 1280 px bekeken — rendert schoon. Geen
  screenshot-bestanden, zelfde reden als de vorige twee pakketten.
- **Web Share API**: niet browsergetest (geen echte mobiele share-sheet beschikbaar in deze
  omgeving) — de code valt aantoonbaar correct terug op een gewone download als `navigator.share`
  ontbreekt of het bestand weigert.

## Testen & verificatie (pakket 1)

- **Node core-test**: `tests/crm-actions.test.js` — de drie automatische regels, zwevende-klus-
  detectie, verwaarlozingsdrempels (incl. dat een afgeronde actie/logregel als recenter contact
  telt dan alleen de fasewissel), afronden/verzetten, dagvenster-selecties (achterstallig/
  vandaag/komende 7 dagen — tijdzonebestendig opgebouwd, geen hardgecodeerde UTC-tijden), dagstart
  eenmaal per kalenderdag.
- **Browsertest**: geen Chromium-binary beschikbaar in deze omgeving (zelfde, herhaaldelijk
  gedocumenteerde beperking als de rest van dit project — zie root-README). In plaats daarvan
  interactief geverifieerd via het browser-automatiseringspaneel: een klus aanmaken → automatische
  "Opname inplannen"-actie verschijnt; fasewissel naar `offerte_verzonden` → automatische "Offerte
  opvolgen"-actie; Vandaag-scherm toont de actie, "Klaar" opent het "Volgende actie?"-scherm, een
  snelknop rondt af én plant de vervolgactie; alle acties afronden zonder vervolg → klus wordt
  zichtbaar zwevend met "Plan actie"; Instellingen toont de nieuwe kaart "Opvolging"; geverifieerd
  op 375 px in donker thema (renderde correct — kop, dagstart-samenvatting, zwevende-klus-badge,
  nieuwe bottom-nav met Vandaag actief).
- **Screenshot-bestanden in `crm/screenshots/`**: **niet aanwezig.** Deze omgeving heeft geen tool
  om een browserscreenshot als PNG-bestand op schijf te zetten (het browserautomatiseringspaneel
  geeft een beeld terug, niet een opslaanbaar bestand) — zelfde beperking als de ontbrekende
  Chromium-binary hierboven, niet stilzwijgend overgeslagen. Als je dit echt als bestanden nodig
  hebt: zelf een schermafbeelding maken in de browser, of dit lokaal laten draaien waar wel een
  screenshot-tool beschikbaar is.
- **Bestaande klussen zonder status/acties**: geverifieerd dat `crmIsJobFloating`/`crmIsRotting`
  een ontbrekende `job.fase` als `'indicatie'` behandelen (geen crash) en dus als zwevend/mogelijk
  verwaarloosd meetellen, precies zoals het brondocument vraagt.
- **Incidentele bijvangst**: `saveCalculation()` liet `savedProjectId` voorheen altijd op `null`
  staan na een save, waardoor élke herhaalde "Klus bewaren"-klik in dezelfde sessie een
  duplicaat-entry aanmaakte (bestond al vóór dit pakket, zie de kanttekening bovenaan `crm/crm.js`).
  Om dubbele automatische acties te voorkomen zet de nieuwe wrap `savedProjectId` nu wél na de
  eerste save — dat voorkomt als bijeffect ook de duplicaat-entries binnen één sessie. Geen
  volledige herstructurering van de save-logica; buiten scope van dit pakket.

## Grenzen (bewust, zoals het brondocument vraagt)
- Geen regelbouwer — precies de drie regels hierboven, niet configureerbaar.
- Dagstart-notificatie werkt alleen als de app open staat (`Notification` + `setTimeout` bij het
  openen van de app) — geen pushserver, dus geen notificatie als de telefoon dicht is/de site niet
  open staat. Alleen aan als de gebruiker het zelf aanzet in Instellingen → Opvolging.
- Geen wijziging aan `intake/`, de rekenkern of de offerte-/factuurdocumenten zelf.
- (pakket 2) Geocoding gebeurt uitsluitend op expliciet verzoek (knop "Adres op kaart zetten"),
  nooit automatisch bij het opslaan van een klant, en met een zichtbare uitleg dat het adres naar
  OpenStreetMap gaat, zoals gevraagd.
- (pakket 2) "In de buurt" toont alleen klanten met een open actie of actieve klus én al eerder
  geocodeerde coördinaten — geen automatische geocoding van de hele klantenlijst in de
  achtergrond (zou tegen de "alleen op expliciet verzoek"-regel ingaan).
- (pakket 3) Agenda-export is eenmalig, geen sync — een wijziging die je later in je agenda-app
  maakt (verzetten, verwijderen) komt niet terug in Werkbank, en andersom werkt een latere
  verzetting van de actie in Werkbank niet door in een al geëxporteerd `.ics`-bestand. Dat staat
  ook letterlijk in de instellingenkaart.
- (pakket 3) De nieuwe dashboard-KPI's vervangen de bestaande offerteflow-KPI's niet — zie de
  toelichting in pakket 3 hierboven waarom dat twee bewust verschillende metingen zijn.
- (pakket 3) Geen dieper-dan-90-dagen-instelbare periode voor de conversie-KPI, geen ander
  tijdvenster instelbaar voor de doorlooptijd-mediaan — vast op wat het brondocument vraagt.
