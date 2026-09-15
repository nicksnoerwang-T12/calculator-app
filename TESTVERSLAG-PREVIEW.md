# Testverslag leverancierscatalogus-preview

Datum: 15 september 2026.

## Geautomatiseerd uitgevoerd

- De bestaande reken-, migratie-, import-, opslag-, native-radio-, diagram- en statische tests draaien tegen het volledige inline productiescript.
- Toegevoegd: €4,29/m voor 50×30×2, 4×1000 mm = €17,16; Twentse grens €249,99/€250,00; IPE160 leveranciersgewicht en €65,61; onbekende O-prijs als `null`; maxlengte versus stockopties; 1D-stangfixture; 2D-plaatfixture; FNF-plaatgewicht en catalogusaantallen/statussen.
- De beschermde bestanden `werkbank.html` en `werkbank-v2.html` worden met hun vooraf vastgelegde SHA-256 gecontroleerd.

## Browserbeperking

In deze container zijn Chromium, WebKit en Playwright niet geïnstalleerd. Daarom zijn de verplichte echte browserinteracties, viewports 320/390/430/1280, licht/donker, screenshots, console/pageerror-controle en een fysieke iPhone/Safari-route **niet uitgevoerd**. Node/VM-tests worden niet als bewijs voor taps, focus, layout of iPhone-toetsenbordgedrag beschouwd. Zie het bronregister voor de handmatige Safari-checklist.

## Controle vóór samenvoegen — herstelronde

1. **Snapshots:** bestaande regels rekenen vanuit hun vastgelegde `unitPrice` en `priceSnapshot`. De regressietest wijzigt achtereenvolgens de catalogusprijs en de lokaal opgeslagen artikelstandaard, voert een export/import-roundtrip uit en verwacht steeds het oorspronkelijke regelbedrag.
2. **Selectieve prijsupdate:** de vergelijking bevat oude/nieuwe eenheidsprijs, oude/nieuwe regelkosten, verschil en herkomst. De test verifieert dat het bouwen/annuleren niet muteert, een eigen prijs wordt uitgesloten en uitsluitend de gekozen ID wordt bijgewerkt. De vorige snapshot wordt bewaard.
3. **Twentse grens:** als bekende bewerkingskosten de €250-grens kunnen beïnvloeden, wordt geen toeslag als definitief toegepast. `smallOrderCents` blijft dan `null` en de grondslag verschijnt als open bevestigingspunt. Zonder die beïnvloeding blijft het rapportvoorbeeld van €17,16 + €25 beschikbaar, met de grondslag als voorlopig gelabeld.
4. **Offline catalogus:** er bestaan geen aanvullende productiecatalogusbestanden die tijdens runtime geladen moeten worden. De versiecatalogus staat gebundeld in het inline productiescript. De statische test weigert externe `script`, `link` of `img`-runtimeafhankelijkheden; de rekentest voert de echte gebundelde 115 artikelen uit. De Markdown-bestanden zijn documentatie en geen runtimebron.
