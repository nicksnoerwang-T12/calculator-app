# Fase 2 — Offerteflow

## Doel

Het conversiemoment: vanuit een klus met één actie een offerte naar de klant, status wordt
"Offerte verzonden", en de klus is terug te vinden in een pipeline-overzicht op het dashboard.

## Bestanden

- `quotes/quotes.js` — snapshot-opbouw (`buildQuoteSnapshot`), verzenden (Web Share → WhatsApp →
  mailto), statuspipeline-wiring, dashboard-KPI's en pipeline-kolommen. Pure helpers
  (nummerformaat, groepstoewijzing, telefoonnormalisatie, staleness, KPI-berekening) bovenaan,
  apart core-getest zonder DOM (`tests/quotes.test.js`).
- `quotes/quotes.css` — uitsluitend bestaande tokens/klassen.
- `scripts/promote-quotes.js` — moet ná `promote-invoicing.js` en `promote-intake.js` draaien
  (gebruikt `assignDocumentNumber`/`companyProfileFields` uit invoicing, `JOB_FASES`/`setJobFase`
  uit de basis-app).

## Wat is hergebruikt, wat is nieuw

**Hergebruikt, niet gedupliceerd:** `assignDocumentNumber` (invoicing.js) kent nog steeds het
onderliggende offertenummer toe (`"2026-0001"`, met de bestaande, al geteste idempotentie en
tellerlogica) — `formatQuoteNumber()` zet dat alleen om naar de weergavevorm uit 2.1
(`"OFF-2026-0001"`, `"OFF-2026-0001-v2"` bij een volgende versie). `companyProfileFields`/het
bedrijfsprofiel worden letterlijk hergebruikt voor het briefhoofd. `renderDocumentOverlay`
(invoicing.js) blijft ongewijzigd bestaan voor de eenvoudige print-offerte/factuur van vorige
sessie; de nieuwe, rijkere `renderQuoteDocument` is een aanvulling, geen vervanging — de
bestaande "Factuur maken"-knop roept nog steeds de oude flow aan, alleen "Offerte maken" is
omgeleid naar `openQuoteFlow()`.

**Nieuw:** het snapshot-/versiesysteem (`werkbank.v2.quotes`), de groeps-toewijzing van
verkoopbedrag naar Materiaal/Werkzaamheden/Montage/Overig (zie hieronder), de verzendketen, en de
statuspipeline-migratie (zie volgende sectie).

## Statuspipeline: migratie van de vorige sessie se 7-statusset

De klus-statuspipeline die twee stappen geleden is gebouwd (`Offerte, Opdracht,
Wacht op materiaal, In werkplaats, Montage, Geleverd, Afgekeurd`) is **vervangen** door de exacte
reeks uit 2.3: `Indicatie → Opname → Offerte verzonden → Opdracht → In werkplaats → Montage →
Geleverd → Gefactureerd`, plus de zijtakken `Afgewezen`/`Vervallen` (met verplichte reden,
gevraagd via `prompt()` zodra je naar een van die twee overschakelt). Dit is een bewuste,
opdracht-conforme wijziging, geen ongelukje:

- `wacht_op_materiaal` is vervallen — stond niet in deze opdracht.
- `geleverd` is expliciet **niet terminaal**: de next-best-action is dan "Factureer", de klus is
  pas echt klaar bij `gefactureerd`/`afgewezen`/`vervallen`.
- De bestaande dashboard-kaart "Lopende staalprojecten" (met de Werkplaats/Montage-uitsplitsing)
  is aangepast: het derde bucket toonde eerst "Wacht op materiaal", nu "Offerte verzonden".
- `tests/job-fase.test.js` is bijgewerkt om de nieuwe set te toetsen (10 statussen, exacte
  volgorde, terminaliteit, reden-veld) — bewust aangepast, niet omzeild, om aan harde
  randvoorwaarde 2 ("bestaande tests blijven groen") te kunnen voldoen ná deze wijziging.

## Verkoopbedrag per groep — waarom geen kostprijs zichtbaar wordt

De rekenkern levert alleen één totaal verkoopbedrag (kostprijs × opslag × marge), geen bedrag per
categorie. Om toch "Materiaal / Werkzaamheden / Montage / Overig" te tonen zonder ooit de
leverancierskostprijs te lekken: `groupQuoteDirectCents()` telt de *directe* kosten per groep
(materiaal via de bestaande rekenkern, werk via de categorie op elke werkregel), en
`allocateQuoteGroups()` schaalt die vier directe bedragen met precies dezelfde marge/opslagratio
als het totaal. De laatste groep krijgt het rekenkundige restant, zodat de groepen altijd exact
optellen tot het echte verkooptotaal — geen zichtbare tussenstap onthult de kostprijs, en er is
geen afrondingsverschil tussen de som van de groepen en het totaal.

## Verzenden

1. Web Share API met bestand (`navigator.canShare({files})`) — werkt alleen als er een echte
   PDF-blob is; zie hieronder waarom die er nu niet is.
2. Valt terug op een paneel met een WhatsApp- en/of mailto-link (telefoonnummer genormaliseerd
   naar E.164 via `normalizeDutchPhone`) plus een "Ik heb hem verstuurd"-knop — exact de
   2-stappen-instructie uit 2.2 ("bewaar eerst de PDF via de printknop, voeg hem dan bij").
3. Markeren als verzonden (`markQuoteSent`) zet de klus-status naar `offerte_verzonden`, legt
   `job.lastQuoteCents`/`job.quoteSentAt` vast (gebruikt door de dashboard-KPI's) en bewaart de
   klus.
4. **Niet gebouwd: de Supabase Edge Function `send-quote` (Resend-mail met bijlage).** Dit vereist
   een API-key in Supabase-secrets en een functie-deploy op het Supabase-project van de
   gebruiker — iets waar ik geen toegang toe heb vanuit deze sessie. De app detecteert dit
   correct door er simpelweg nooit gebruik van te maken (optie 1–3 dekken alle gevallen al); een
   toekomstige sessie met Supabase CLI-toegang kan dit alsnog toevoegen zonder de rest van deze
   flow te raken.

## PDF: bewuste keuze voor print-naar-PDF, geen jsPDF/html2canvas

2.1 staat een echte PDF-blob toe "alleen als de agent dit binnen 200 KB gzipped via jsdelivr kan
laden". jsPDF alleen al is doorgaans 150–190 KB geminificeerd; met html2canvas erbij (nodig om de
opgemaakte offerte, inclusief foto's, om te zetten) komt het gecombineerde gewicht vrijwel zeker
boven de 200 KB gzipped uit. Zonder een manier om dat in deze omgeving betrouwbaar te meten vóór
het toevoegen van een nieuwe, zware afhankelijkheid aan een verder bewust lichte, bundler-loze
app, is hier gekozen voor de expliciet toegestane uitwijkroute: de bestaande print-CSS-aanpak
(`customer-print`, hergebruikt van `customerView`/`renderDocumentOverlay`) en `window.print()`.
Web Share krijgt hierdoor nooit een echte bestands-bijlage (`pdfBlob` is altijd `null` in
`sendQuote()`) en valt daardoor altijd meteen door naar de WhatsApp/mailto-keuzes — dat is geen
bug, dat is de bewuste consequentie van deze keuze.

## Opslagsleutels

| Sleutel | Inhoud |
|---|---|
| `werkbank.v2.quotes` | array offerte-snapshots: `{id, jobId, version, number, createdAt, level, company, customer, project, description, photos, groups, totals, validUntil, terms, sentAt, sentChannel}` |

Cloud: nieuwe tabel `quotes` (RLS, idempotent) in `supabase/schema.sql`, gesynchroniseerd via
hetzelfde `createCloudAdapter`-patroon als `projects`/`customers`. Ook de tabel `templates` (voor
Fase 1's eigen producten, die dit nog niet had) is er in deze fase alsnog bijgevoegd, inclusief
werkende sync in `intake/intake.js`.

**Een architecturale correctie tijdens het bouwen:** zowel `intake.js` als `quotes.js` moeten een
nieuwe sleutel aan de offline-retrywachtrij-afhandeling (`flushRetryQueue`) toevoegen. Een eerste
versie liet allebei die functie *volledig* overschrijven — de laag die als laatste wordt
samengevoegd (`quotes.js`) zou dan stilzwijgend de retry-afhandeling van de andere laag
(`templates`) verliezen. Opgelost met een gedeeld `retryHandlers`-register waar elke laag alleen
zijn eigen sleutel aan toevoegt, onafhankelijk van samenvoegvolgorde.

## Grenzen (bewust niet gedaan)

- Geen Supabase Edge Function / Resend-koppeling (zie boven).
- Geen echte PDF-blob (zie boven) — Web Share met bestand wordt daardoor nooit echt geoefend,
  alleen de fallback-keten.
- Geen aparte browsertest (zelfde, herhaaldelijk gemelde beperking: geen Chromium-binary in deze
  omgeving). Wel volledig interactief doorlopen: offerte bouwen → document tonen → als verzonden
  markeren → statuswijziging + dashboard-pipeline + KPI's bevestigd, licht/donker/mobiel/desktop.
- Geen screenshot-bestanden weggeschreven (zelfde reden als Fase 1).

## Bouwen en testen

```sh
node scripts/promote-quotes.js
node tests/quotes.test.js
node tests/job-fase.test.js
```
