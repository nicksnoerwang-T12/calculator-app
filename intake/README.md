# Fase 0 — Verkenning en nulmeting

Dit document is de opgeleverde verkenning voor de Snelprijs-funnel/offerteflow/STEP-opdracht.
Geen productiecode gewijzigd; dit is puur documentatie ter voorbereiding van Fase 1.

## Huidige flow

Een klus is technisch een "bewaarde calculatie" (`costState`) met een los `job`-subobject
(`costState.job`, aangemaakt via `ensureJob()`) voor alles wat niet bij de rekenkern hoort:
locatie, klantcontact, maten, foto's, werkregels, en (sinds de laatste sessie) `fase`/`faseSince`.

**Route vanaf "Nieuwe klus":** `startProject()` → `renderCostPage()` → vier tabs
(Opname `panel-site` / Materiaal `panel-materials` / Werk `panel-labor` / Prijs `panel-overview`).
De tabs zijn vaste DOM-panelen, geen aparte routes — dit is dus geen wizard/funnel, de gebruiker
kan vrij tussen tabs springen. Fase 1 vervangt dit `startProject()`-instappunt door de funnel;
de vier tabs blijven daarna bestaan als "Verfijn opname"-vervolgstap.

- **Opslag:** `CUSTOMER_KEY='werkbank.v2.customers'`, `DRAFT_KEY='werkbank.v2.draft'`. Opgeslagen
  klussen zelf zitten in `STORE.calculations` (`'werkbank.v2.calculations'`) als
  `{id, datum, schemaVersion, data}` waarbij `data` een volledige clone van `costState` is
  (dus `data.job` bevat alle job-specifieke velden). Het concept-draft (`persistDraft()`,
  gedebounced via `queueDraft()`, 450 ms) is los van expliciet bewaarde klussen.
- **`readCostInput()`** leest alle `#c-*`-invoervelden (project, klant, qty, uren, tarieven,
  opslag/marge/btw) terug in `costState`. Wordt aangeroepen vóór elke herberekening en vóór
  opslaan/exporteren.
- **`renderCostTotals()`** herberekent en tekent het overzichtspaneel (`#cost-result`) op basis
  van `costState.materials` (via `calculateMaterialList`) plus alle arbeid/kosten-velden. Roept
  intern `updateStickyTotal()` aan, die de sticky prijsbalk onderaan vult — **dit is exact de
  balk die Fase 1 als live-prijsbalk moet hergebruiken.**
- **`saleView()`** leest de zojuist gerenderde `#cost-result`-DOM terug (geen herberekening) en
  geeft `{complete, ex, inc}` — `complete` is `false` zodra er een `.err`/`.incomplete`-element
  in het resultaat staat (bv. ontbrekende prijs). Dit is de bestaande "is de prijs compleet"-check
  die de funnel voor het zekerheidsniveau `offerte` (sectie 1.6) kan hergebruiken.
- **`customerView()`** bouwt een read-only overlay met alléén de verkoopprijs (nooit kostprijs/
  marge), blokkeert volledig als `!saleView().complete`. Fase 1.6 breidt dit uit met een
  bandbreedte-weergave voor niveau ≠ offerte.
- **`syncWork()`** telt `costState.job.work` (werkregels: naam, categorie, hoeveelheid, eenheid,
  tarief) op tot `costState.other`, samen met `job.legacyOther` (de oorspronkelijke waarde van
  het "Overige kosten"-veld vóór de werkregel-feature, zodat niets dubbel telt). `c-other` wordt
  daarna read-only gezet in de UI — werkregels zijn de bron van waarheid, niet het vrije veld.

## Materiaalregel-contract

Een regel in `costState.materials[]` (gevalideerd door `validateLine(line, projectQty)`,
berekend door `calculateMaterialLine(line, projectQty, prices)`):

| Veld | Type / waarden | Verplicht wanneer |
|---|---|---|
| `id` | string, uniek binnen de klus | altijd |
| `profile` | één van de 18 `MATERIAL_PROFILE_TYPES` (zie hieronder) | altijd |
| `material` | key in `MATERIALS` (`rvs304`,`rvs316`,`rvs430`,`s235`,`s355`,`alu`,`messing`,`koper`) | altijd, behalve `purchasedItem` |
| `description` | string | alleen `purchasedItem` |
| `count` | positief geheel getal | altijd |
| `dims` | object, keys per `PROFILES[profile].dims` (bv. `length`,`width`,`t`,`b`,`h`,`D`,`a`,`sw`,`kgm`) | per profiel-specifieke velden |
| `catalogArticleId` | verwijzing naar `CATALOG_ARTICLES` | optioneel; vergrendelt afmetingen behalve `length` |
| `catalogSize` | string, key in `SECTIONS[catalog].d` | verplicht voor `IPE`/`HEA`/`HEB`/`UNP` |
| `supplierKgm`, `weightSource`, `sourceDate` | getal / string / `YYYY-MM-DD` | verplicht voor `UPE`/`tee` |
| `kgmOverride` | getal, optioneel | overschrijft berekend kg/m |
| `priceBasis` | `'kg'\|'m'\|'m2'\|'piece'\|'wholeBar'\|'wholePlate'` | altijd |
| `priceMode` | `'catalog'\|'manual'\|'list'` | altijd |
| `unitPrice` | getal of `''` | verplicht als `priceMode==='manual'` |
| `priceOrigin` | `'catalog'\|'user'` | — |
| `priceSnapshot` / `previousPriceSnapshot` | `{price,basis,source,date,...}` | vastgelegd bij bewaren/prijsreview |
| `waste` | percentage 0–1000 (`purchasedItem` altijd 0) | altijd |
| `note` | string, optioneel | — |

**De 18 profielgroep-ID's** (`MATERIAL_PROFILE_TYPES`, bevroren array):
`plate, strip, roundBar, squareBar, hexBar, roundTube, squareTube, rectTube, equalAngle,
unequalAngle, IPE, HEA, HEB, UNP, UPE, tee, customKgM, purchasedItem`.

**Prijsstatussen** (`CATALOG_STATUS`, exacte definitie uit de code):
`P` = Openbare richtprijs, `O` = Op aanvraag, `B` = Geblokkeerd: prijsbasis verifiëren,
`M` = Maatwerk / eigen artikel. Sjablonen in Fase 1 genereren regels met `catalogArticleId`
waar mogelijk; bij status O/B/M blijft `resolvePrice()` gewoon `price:null` teruggeven — de
funnel mag dit tonen als bandbreedte-placeholder maar mag de rekenkern niet aanpassen (zie
harde randvoorwaarde 2).

**Nieuw voor Fase 1/3:** het contract heeft nu ook een optioneel `source`-veld
(`'template'` voor sjabloon-gegenereerde regels, `'step'` voor STEP-afgeleide regels, met
`attachmentId` erbij) en een bandbreedte-drager op klusniveau (zekerheidsniveau, zie Fase 1.6) —
dit bestaat nog niet in de huidige rekenkern en moet als toevoeging, niet als wijziging, landen.

## Herbruikbare functies (niet dupliceren)

- **`invoicing/invoicing.js`**: `assignDocumentNumber(job, type, profile, now)` — puur, idempotent,
  aparte tellers `nextOfferteNummer`/`nextFactuurNummer` in het bedrijfsprofiel
  (`werkbank.v2.companyProfile`). `companyProfileFields()`/`companyProfileGroups()` — het
  bedrijfsprofiel-formulier-contract. `renderDocumentOverlay(type, job, profile)` — de
  offerte/factuur-printlayout, hergebruikt `saleView()`. Fase 2 breidt dit uit met versienummers
  en regelgroepering; de documentnummering zelf blijft ongewijzigd herbruikbaar.
- **`cloud/cloud.js`**: `createCloudAdapter(client)` (push/pullAll/remove per tabel),
  `mergeProjectRows(localList, cloudRows)` + `mergeProjects(rows)` — **let op: de opdracht
  noemt dit `syncProjects`, de werkelijke functienaam in de code is `mergeProjects`/
  `mergeProjectRows`.** `queueRetry(entry)` bestaat al (offline-wachtrij, laatste 20 items,
  sleutel `SYNC_QUEUE_KEY`) — Fase 3's bijlage-upload-wachtrij kan dit patroon letterlijk volgen.
  `SETTINGS_KEYS` is de array die bepaalt welke lokale sleutels meesyncen via `user_settings`;
  nieuwe instellingen (sjabloon-tarieven, metrics) moeten hieraan toegevoegd worden, niet in een
  aparte tabel, tenzij het document expliciet een eigen tabel vraagt (templates/quotes/attachments).

## Nulmeting — testresultaten

Alle Node-tests gedraaid (Chromium-tests kunnen in deze omgeving niet draaien, geen browserbinary
beschikbaar — bekende, eerder gemelde beperking):

| Resultaat | Bestand |
|---|---|
| PASS | cloud-adapter, design-material-calculator, design-material-wizard, invoicing, job-fase, jobs-core, material-calculator, material-wizard, preview-static, production-jobs-core, production-material-calculator, production-material-wizard, production-purchase-planning |
| **FAIL (pre-existing, gedocumenteerd, niet gefixt)** | `catalog-publication.test.js` en `production-catalog.test.js` (SHA256-check tegen `werkbank-preview.html`) — bekend CRLF/`core.autocrlf`-artefact van deze Windows-omgeving, niet gerelateerd aan app-code, sinds meerdere sessies zo. |

**Wél gefixt tijdens deze nulmeting** (geen Fase-1-code, herstel van een bestaande, stale test):
`production-catalog.test.js`'s externe-dependency-allowlist verwachtte nog steeds *alleen* de
Supabase-CDN-URL, maar classificeerde sinds de vorige sessie ten onrechte ook lokale `brand/*`-
assets en `manifest.webmanifest` als "extern", en had de inmiddels bewust goedgekeurde Google
Fonts-CDN nooit toegevoegd aan de allowlist. Zonder deze fix was harde randvoorwaarde 2
("bestaande tests blijven groen") bij de start van Fase 1 al niet haalbaar geweest. De test filtert
nu alleen echte `http(s)://`-verwijzingen als "extern" en staat expliciet Supabase + Google Fonts
toe.
| SKIP (geen Chromium-binary) | design-browser, design-browser-edge, design-dom, jobs-browser, jobs-edge, workshop-promotion |

## Nulmeting — time-to-price

Huidige pad "Nieuwe klus" → eerste zichtbare verkoopprijs:

1. Dashboard → "+ Nieuwe klus" (1 klik) → opent op tab **Opname**.
2. Klik tab **Materiaal** (2).
3. Klik "Materiaal toevoegen" → profielkeuze-scherm (3) → profiel kiezen (1 klik).
4. Materiaal-editor: materiaalsoort (select, heeft een default, meestal geen actie nodig),
   handelsmaat kiezen (1 verplichte keuze uit de lijst — dit triggert vaak ook automatisch de
   catalogusprijs), lengte invullen (1 verplicht getal). Minimaal **2 verplichte invoeren**.
5. "Materiaal toevoegen" klikken om de regel te bevestigen (1 klik) → terug naar Materiaal-tab.
6. Klik tab **Prijs** (4) → eerste verkoopprijs zichtbaar (mits qty=1 default en geen andere
   verplichte velden open staan).

**Nulmeting: 4 schermen (Opname/Materiaal/profielkeuze+editor/Prijs), ~6 interacties waarvan
2 verplichte invoervelden, geen harde tijdmeting beschikbaar (geen gescripte browsertest in
deze omgeving) — geschat 45–90 s voor een geoefende gebruiker, aanzienlijk meer voor een eerste
keer. Fase 1 moet dit aantoonbaar naar ≤ 5 invoeren / ≤ 3 schermen / ≤ 60 s brengen** (acceptatie
1.7) — de huidige 4-schermen-met-catalogus-diepte is het getal om tegen te meten.

## Wat dit betekent voor Fase 1

- De funnel is een nieuw instappunt vóór `renderCostPage()`, niet een vervanging ervan — na stap 4
  levert de funnel gewoon een `costState`/`costState.job` op en het bestaande tab-systeem doet de
  rest ongewijzigd.
- `queueDraft`/`persistDraft` (450 ms debounce) bestaan al en zijn precies wat 1.1 vraagt —
  hergebruiken, niet opnieuw bouwen.
- `saleView().complete` is al de bestaande "mag ik de klant een prijs tonen"-check; het
  zekerheidsniveau-systeem (1.6) is een laag daarboven, geen vervanging.

# Fase 1 — Snelprijs-funnel

## Doel

Binnen 60 seconden en maximaal 5 invoeren een prijsbandbreedte kunnen noemen. Vervangt het
instappunt "Nieuwe klus" (was: direct het opnameformulier) door een 4-staps funnel; de bestaande
tabs (Opname/Materiaal/Werk/Prijs) blijven ongewijzigd bestaan als verfijningsstap na stap 4.

## Bestanden

- `intake/templates.js` — de sjabloon-engine: 11 catalogus-sjablonen + Maatwerk/reparatie, elk
  `{id, group, name, icon, params[], build(params, ctx)}`. `build()` is een pure functie en is
  los van de funnel-UI core-getest (`tests/intake-templates.test.js`).
- `intake/intake.js` — de funnel-UI zelf: state, stappen, prijsbalk, eigen producten,
  instellingenkaart voor de sjabloon-tarieven, en de overgang naar een normale klus
  (`intakeFinish()`). Pure helpers (zekerheidsniveau, bandbreedte, prijszin, diff-berekening)
  staan bovenaan het bestand, apart core-getest (`tests/intake-funnel.test.js`), zonder DOM.
- `intake/intake.css` — uitsluitend bestaande tokens/klassen (`--surface`, `--line`, `--accent`,
  `.act`/`.ghost`/`.job-panel`, `.fase-badge`), geen nieuwe hex-kleuren.
- `scripts/promote-intake.js` — voegt de drie bestanden samen in `werkbank-v2.html`
  (`templates.js` vóór `intake.js`, zelfde patroon als `promote-jobs.js`).

## Flow

1. **Stap 1 (wat)** — sjabloonkaarten gegroepeerd per categorie, "Jouw producten" bovenaan als er
   eigen producten bewaard zijn, "Maatwerk / reparatie" altijd onderaan. Kiezen zet
   `intakeState.templateId`/`params` en gaat naar stap 2.
2. **Stap 2 (maten)** — velden uit `template.params` (nummer met stepper, keuze-pills, toggle,
   vrije tekst voor maatwerk), plus optioneel foto/schets (hergebruikt `compressJobPhoto`).
   Live herberekening 150 ms gedebouncet (`intakeRecalcSoon`).
3. **Stap 3 (prijs)** — prijsbandbreedte groot, zekerheidsniveau-badge, snelinstelbare
   afwerking/montage/marge, "Kopieer prijszin", en een knop om het zekerheidsniveau handmatig te
   verhogen (nooit automatisch te verlagen).
   Op desktop (≥ 1024 px, "Bel-modus") worden stap 2 en 3 samen getoond (CSS-grid, twee kolommen)
   — dezelfde onderliggende stap-nummering blijft gewoon 1–4 lopen.
4. **Stap 4 (volgende)** — optionele klantgegevens, dan één van: Verfijn opname / Klantweergave /
   Offerte versturen (roept `openDocument('offerte')` aan als die functie bestaat — Fase 2 —
   anders valt hij terug op de klantweergave) / Bewaar als eigen product.

`intakeFinish(action)` bouwt de sjabloonregels (`template.build()`), zet een normale
`costState`/`costState.job` op via het bestaande `renderCostPage()`, en slaat de gekozen
sjabloon-parameters op in `costState.job.intake` (zodat een latere herberekening met andere
parameters mogelijk blijft — regels dragen `source:'template'`).

## Opslagsleutels

| Sleutel | Inhoud |
|---|---|
| `werkbank.v2.intake.draft` | funnel-state vóór stap 4 (debounced, 450 ms), verwijderd bij `intakeFinish()` |
| `werkbank.v2.templates` | eigen producten: `{id, baseTemplateId, name, customerTag, params, lastMaterialCents, updatedAt, archived}` |
| `werkbank.v2.intakeRates` | sjabloon-tarieven (montage-uurtarief, voorrijkosten, poedercoat-toeslag, bandbreedtes), toegevoegd aan `SETTINGS_KEYS` zodat cloud-sync ze meeneemt |

`costState.job.intake = {templateId, params, manualLevel, ownProductId, confidence}` — géén
nieuwe topsleutel, leeft in het bestaande `job`-subobject en syncbaar via de bestaande
projectopslag (harde randvoorwaarde 2: geen wijziging aan bestaande opslagsleutels).

## Prijsbepaling (waarom geen wijziging aan de rekenkern)

Sjabloonregels prijzen bewust op **`priceBasis:'kg'`** in plaats van `'m'`. Reden: `resolvePrice()`
(ongewijzigd) heeft alleen een generieke fallback-prijs per kg (`getPrices()[materiaal]`), geen
generieke meterprijs — die hangt af van het exacte profiel/de exacte maat. Met `'m'` als basis kreeg
elke sjabloonregel zonder catalogusmatch "Prijs ontbreekt"; met `'kg'` resolveert elke regel altijd
naar op z'n minst een grove schatting. Dat is precies het verschil tussen "we kunnen altijd een
indicatie geven" (het hele punt van deze fase) en "we hebben een exacte catalogusmatch nodig".

Dit onderscheid is ook waarom er twee volledigheidscontroles bestaan:
`intakeMaterialsComplete()` (er is een prijs, funnel niet geblokkeerd — telt de kg-vuistregel mee)
en `intakeMaterialsConfirmed()` (de prijs ligt vast: eigen ingevulde prijs of een exacte
catalogusmatch — telt de kg-vuistregel NIET mee). Alleen de laatste mag het zekerheidsniveau naar
`offerte` (bandbreedte 0) optillen; een eerdere versie gebruikte per ongeluk de eerste, waardoor de
funnel bijna altijd meteen "Offerte" toonde in plaats van "Indicatie" — zie de bugfix-notities
hieronder.

## Grenzen (bewust niet gedaan)

- **Profielkeuzes zijn vuistregels, geen sterkteberekening.** Draagbalk (overspanning/20) en
  Kolom-balk frame zijn expliciet gemarkeerd in de gegenereerde regel-notitie: laat een
  constructeur dit controleren vóór uitvoering.
- **Afwerkingskeuze geeft alleen bij "Gepoedercoat" een aparte kostenregel.** Blank/Gemenied/
  Verzinkt worden in de materiaalnotitie vermeld maar krijgen geen eigen toeslagregel — er was
  geen tarief hiervoor gevraagd in de opdracht en drie extra instellingenvelden erbij verzinnen
  leek verder te gaan dan gevraagd.
- **Iconen:** sjablonen in de groepen Hekwerk/Poort gebruiken `icon:'fence'`, dat nog niet in de
  bestaande `UI_PATHS`-set zit — valt terug op het generieke tools-icoon (`uiIcon()`'s eigen
  fallback-gedrag). Geen nieuwe SVG-iconen getekend; dit is puur cosmetisch, geen functionele
  beperking.
- **Screenshots:** licht/donker/mobiel/desktop zijn interactief geverifieerd via de Browser-pane
  (zie testrapport), maar niet als bestand weggeschreven naar `intake/screenshots/` — er is in
  deze omgeving geen lichtgewicht pagina-naar-PNG-mechanisme voorhanden zonder een aparte
  upload-pijplijn per screenshot te bouwen (zoals wel gedaan is voor de merk-iconen in een eerdere
  stap). Gerapporteerd als bekende beperking in plaats van stilzwijgend overgeslagen.

## Bouwen en testen

```sh
node scripts/promote-intake.js
node tests/intake-templates.test.js
node tests/intake-funnel.test.js
```

Geen Chromium-browsertest (`WERKBANK_CHROMIUM=…`) toegevoegd — zelfde, herhaaldelijk gemelde
beperking als de rest van deze sessie (geen Chromium-binary beschikbaar). In plaats daarvan is de
volledige funnel interactief doorlopen via de Browser-pane-tool: stap 1–4 op mobiel (375/390 px) en
desktop (1280 px, Bel-modus met stap 2+3 naast elkaar), licht en donker thema, eigen product
bewaren/herladen, en de overgang naar de bestaande Opname/Materiaal/Prijs-tabs (bevestigd: dezelfde
verkoopprijs als de funnel's eigen live-preview).

**Twee echte bugs gevonden en gefixt tijdens deze verificatie** (niet in de pure-functietests
gevangen, wel in de browser): (1) `bindIntakeQuickToggles()` crashte met een null-dereference
zodra stap 2 zonder het prijspaneel werd gerenderd (mobiel); (2) de onderste prijsbalk werd niet
opnieuw getekend na een handmatige niveau-wijziging, waardoor hij een verouderd bedrag bleef tonen.
Beide gefixt en opnieuw geverifieerd. Een derde bug (`showToast` bestond niet als functie, alleen
als CSS-klasse) kwam pas aan het licht bij het testen van "Bewaar als eigen product" — toegevoegd
als kleine, herbruikbare helper.
