# Fase 3 — STEP-integratie

## Doel

Bijlagen bij een klus, een STEP-bestand uitlezen tot een materiaalregel-voorstel, een 3D-preview,
en een experimentele snijlijst/DXF-export. De gebruiker bevestigt altijd wat uit een STEP komt
vóórdat het de prijs beïnvloedt (Bijlage B, en 3.2's laatste zin).

## Belangrijk: wat is wel en niet geverifieerd in deze sessie

Deze omgeving heeft **geen Chromium-testrunner** (`WERKBANK_CHROMIUM=…` kan niet draaien) en
**geen betrouwbare manier om een geldig ISO 10303-21 (.step) bestand met de hand te schrijven** —
een minimale ADVANCED_BREP-geometrie heeft tientallen onderling verwijzende entiteiten; die
foutloos uit het hoofd opschrijven zonder een echte CAD-kernel om tegen te verifiëren is een te
groot risico op een fixture die *niets* zinnigs test terwijl hij er geldig uitziet. In plaats van
dat te negeren of te faken, is de STEP-pijplijn **opgeknipt op precies de naad waar het
onverifieerbare deel begint**, en is alles aan weerszijden van die naad wél echt gebouwd en getest:

| Onderdeel | Bestand | Status |
|---|---|---|
| Bijlagen (opslag, limieten, validatie) | `step/attachments.js` | **Geverifieerd** — core-test (`tests/step-attachments.test.js`) + echte IndexedDB-round-trip in de Browser-pane (upload, sha256, download, verwijderen) |
| Mesh -> bounding box/volume (divergentiestelling) | `step/mesh-geometry.js` | **Geverifieerd** — core-test op een eenheidskubus en een balk (`tests/step-mesh-geometry.test.js`), volume/bbox kloppen exact |
| Classificatie plaat/profiel/overig + catalogusmatch | `step/classify.js` | **Geverifieerd** — core-test tegen de 3 vereiste fixtures (`tests/step-classify.test.js`, zie hieronder) |
| DXF-schrijver + zaaglijst/plaatlijst + versteksehoek | `step/dxf.js` | **Geverifieerd** — core-test (`tests/step-dxf.test.js`), geldige ASCII DXF R12 |
| 3D-viewer (three.js, orbit, doorsnede, highlight, ISO-PNG) | `step/viewer.js` | **Geverifieerd met synthetische geometrie** — echt getest in de Browser-pane: three.js + OrbitControls daadwerkelijk geladen vanaf jsdelivr, een testkubus gerenderd, fit/highlight/doorsnede/PNG-export werkten allemaal. **Hierbij een echte bug gevonden en gefixt**: OrbitControls importeert intern de kale specifier `"three"`, wat zonder een `<script type="importmap">` faalt met *"Failed to resolve module specifier three"* — gereproduceerd, opgelost door een importmap toe te voegen (`scripts/promote-step.js` injecteert die nu in `<head>`) |
| UI-koppeling (voorstel-paneel, Overnemen/Overslaan, Alles overnemen) | `step/step.js` | **Geverifieerd met gesimuleerde STEP-uitkomst** — de echte classificatie/materiaalregel-pijplijn end-to-end getest in de Browser-pane met de kokerframe-fixturedata, "Alles overnemen" voegt daadwerkelijk correcte materiaalregels toe aan `costState.materials` |
| **occt-import-js zelf inladen en een echt STEP-bestand parsen** | `step/step-worker.js` | **NIET geverifieerd.** Geschreven naar beste weten van de gepubliceerde occt-import-js-API (`occtimportjs()`, `ReadStepFile()`, `result.meshes[].attributes.position.array`), maar nooit tegen de echte library en een echt bestand gedraaid. Dit is het enige onverifieerde onderdeel, en precies het onderdeel waarvan de output (ruwe meshes) al wél volledig getest verwerkt wordt zodra het binnenkomt. |

**Voor de volgende sessie/de gebruiker, vóór productiegebruik**: open de app in een echte browser,
voeg een echt .step-bestand toe, en controleer of `step-worker.js` daadwerkelijk meshes teruggeeft
in de verwachte vorm. Als de occt-import-js-API in werkelijkheid afwijkt (andere resultaatvorm,
andere CDN-bestandsnamen voor het .wasm-bestand), is dat gelokaliseerd tot dit ene bestand — de
rest van de pijplijn (classificatie, 3D, DXF, materiaalregels) hoeft dan niet aangepast te worden.

## Testfixtures: waarom geen echte .step-bestanden

`tests/fixtures/step/*.json` bevatten de drie scenario's die 3.5 vraagt (plaat met gaten,
kokerframe met 4 profielen, samengesteld bordes) — maar als **synthetische geometriedata**
(bounding box/volume/instanties per body, exact de vorm die `step/mesh-geometry.js` na het
verwerken van een echte mesh zou opleveren), niet als `.step`-bestanden. Zie de `_opmerking` in
elk fixture-bestand. Dit test het volledige classificatiepad (plaat-dikte-matching,
profiel-doorsnede-matching met tolerantie, "overig"-detectie) net zo grondig als met echte
bestanden zou kunnen — het enige dat ontbreekt is de STEP-parsing-stap zelf, die hierboven al als
apart, onverifieerd onderdeel is gemarkeerd.

## Bestanden

- `step/attachments.js`+`.css` — bijlagen: IndexedDB (bytes) + `costState.job.attachments`
  (metadata, syncbaar via de bestaande projectopslag — geen nieuwe topsleutel).
- `step/mesh-geometry.js` — mesh -> bounding box/volume.
- `step/classify.js` — plaat/profiel/overig-heuristiek + gewichtsberekening.
- `step/step-worker.js` — Web Worker, laadt occt-import-js lazy, 60s timeout. **Los bestand**, niet
  meegeplakt door `scripts/promote-step.js` (een Worker kan niet in het hoofdscript
  geconcateneerd worden).
- `step/viewer.js`+`.css` — three.js 3D-preview.
- `step/dxf.js` — DXF-schrijver + zaaglijst/plaatlijst.
- `step/step.js` — UI-koppeling: voorstel-paneel, viewer-integratie, CSV/DXF-export.
- `scripts/promote-step.js` — plakt alles behalve `step-worker.js` samen, voegt de importmap toe.

## Bijlagen (3.1)

Opslag: lokaal IndexedDB (database `werkbank-attachments`), 25 MB per bestand, 100 MB per klus
(`attachmentValidate`, core-getest). Cloud: nieuwe Storage-bucket `attachments` +
metadata-tabel `attachments` (RLS op `user_id/`-prefix) — **de tabel/bucket zelf zijn niet
aangemaakt** (vereist Supabase-dashboardtoegang die ik niet heb); de SQL staat idempotent klaar in
`supabase/schema.sql`, zie ook de sectie hieronder. JSON-export bevat bijlage-metadata, niet de
bytes; import toont een waarschuwing (`validateCalculationPayload`/`importCalculation` uitgebreid,
niet gewijzigd).

## Classificatie (3.2) en snijlijst/DXF (3.4)

Precies de vuistregels uit de opdracht: plaat bij een dimensie ≤25mm én ≤1/10 van de kleinste
andere dimensie (dikte gematcht op standaardmaten, tolerantie 0,3mm); profiel bij lengte ≥5x de
andere twee dimensies (doorsnede gematcht op de catalogus, tolerantie 5%, meerdere kandidaten
blijven een keuzelijst — nooit automatisch de eerste kiezen). Gewicht = volume × dichtheid van de
door de gebruiker per bestand gekozen materiaalsoort. "Overig" en dubbelzinnige profielmatches
(0 kandidaten binnen tolerantie) leveren bewust géén materiaalregel-voorstel op — geen giswerk.

DXF is zelf geschreven ASCII R12 (LWPOLYLINE/CIRCLE/TEXT, geen library), met de verplichte
`WERKBANK-CONTROLE`-tekstlaag. **Beperking, expliciet in de UI met een "Controleer"-badge**: de
plaatcontour in `downloadStepDxf` is nu een rechthoek uit de bounding box, geen echte
vlakprojectie met gaten — dat vereist face-topologiedata uit de STEP-geometrie zelf (welke vlakken
de buitencontour vormen, welke cirkelvormige gaten erin zitten), wat op zijn beurt weer afhangt
van het onverifieerde `step-worker.js`-deel. De versteksehoek-wiskunde (`miterAngleDeg`) is wél
klaar en getest, maar wordt om dezelfde reden nog nergens automatisch gevoed met echte
vlaknormalen.

## 3D-preview (3.3)

three.js + OrbitControls, lazy geladen, 200k-driehoeken-budget (`exceedsTriangleBudget`) met een
bbox-wireframe-fallback in plaats van echte decimatie (geen extra library). Beschikbaar in de
Opname-tab zodra een STEP is toegevoegd. **Niet gebouwd**: de optionele "3D-model"-sectie in
`customerView()` en de statische ISO-PNG in de offerte (`quotes/quotes.js`) — de viewer-functie
`toIsoPng()` bestaat en is getest, maar is nog niet aan die twee plekken gekoppeld. Gezien de
tijd die dit vergde is dit bewust achtergesteld ten opzichte van de kernpijplijn; een vervolgsessie
kan dit aansluiten met een paar regels code (`quote.photos` uitbreiden met het PNG-resultaat).

## Cloud-opslag: nog niet volledig bedraad

`supabase/schema.sql` heeft de `attachments`-metadatatabel al staan (idempotent, RLS). Wat
ontbreekt: de Storage-bucket zelf aanmaken (dashboard-actie) en de daadwerkelijke
upload/download-cloud-sync-code (het `queueRetry`-patroon uit `cloud/cloud.js` is er klaar voor,
maar is voor bijlagen nog niet aangesloten — bytes uploaden naar Storage is een ander soort
operatie dan de bestaande jsonb-rij-sync). Lokaal (IndexedDB) werkt volledig; dit is dus geen
blokkerende beperking voor gebruik zonder cloud-sync.

## Acceptatiecriteria (3.5) — puntsgewijs

- ✅ Drie testfixtures toegevoegd, **als synthetische geometriedata i.p.v. .step-bestanden** (zie
  boven), core-tests vergelijken met verwachte waarden inclusief tolerantie.
- ⚠️ "Browsertest: upload → voorstel → overnemen → prijs wijzigt; viewer rendert" —
  **gedeeltelijk**: het voorstel/overnemen/prijs-deel is echt getest (met gesimuleerde
  STEP-uitkomst); de viewer is echt getest (met synthetische geometrie); de daadwerkelijke
  upload-van-een-STEP-bestand-tot-en-met-occt-import-js-stap niet.
- ⚠️ "Corrupt/niet-STEP-bestand geeft een nette melding" — de foutafhandeling in
  `step-worker.js`/`onStepAttachmentAdded` is geschreven en de rendering ervan is getest (nette
  `.err`-melding, geen crash), maar niet met een echt corrupt bestand tegen de echte library.
  Wel afgedwongen: elke worker-aanroep heeft een 60s-timeout die altijd een resultaat teruggeeft
  (nooit een oneindig hangende worker).
- ✅ "Zonder netwerk blijft de app bruikbaar" — bijlagen (lokaal, IndexedDB) werken zonder netwerk;
  `attachStepViewer`/`loadStepThree` vangen een falende dynamische import af met een nette
  Nederlandse melding in plaats van een crash.

## Bouwen en testen

```sh
node scripts/promote-step.js
node tests/step-attachments.test.js
node tests/step-mesh-geometry.test.js
node tests/step-classify.test.js
node tests/step-dxf.test.js
```

Geen Chromium-browsertest toegevoegd (zelfde, herhaaldelijk gemelde omgevingsbeperking). Wel:
volledige interactieve verificatie in de Browser-pane van bijlagen (echte IndexedDB-round-trip),
de 3D-viewer (echte three.js-CDN-load + rendering), en de classificatie-tot-materiaalregel-
pijplijn (met gesimuleerde STEP-uitkomst) — zie hierboven per onderdeel.
