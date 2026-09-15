# Klussenpreview 01

Fase 1: een klus op locatie of kantoor opnemen en begroten. De bestaande hoofdversie blijft ongewijzigd.

## Gebruikersroute

Nieuwe klus → opname (klant, locatie, omschrijving, aantal eindproducten, meetnotities, foto’s/schetsen) → materiaal → werkzaamheden → verkoopprijs → klantweergave.

Klanten kunnen lokaal worden aangemaakt en bewerkt. Selectie in een klus legt de contactgegevens vast in de klus; latere wijzigingen aan het klantenbestand veranderen bestaande klussen niet.

Werkregels ondersteunen fabricage, montage, reis/vervoer en uitbesteding; hoeveelheid × kostentarief is een totaalbedrag voor de hele klus. De bedragen worden aan de bestaande kostenberekening doorgegeven. Bestaande algemene kosten en arbeidsbegroting blijven behouden. Voorkom dubbeltelling door hetzelfde werk niet ook bij algemene productie-uren in te voeren.

Foto’s worden in de browser verkleind tot maximaal 1280 pixels en JPEG. Maximaal 6 foto’s van maximaal 650.000 tekens; opslagfouten worden gemeld. Niet-decodeerbare HEIC-bestanden krijgen een foutmelding met alternatief JPEG/PNG/WebP. Dit is geen garantie voor HEIC-ondersteuning in elke browser.

## Opslag en grenzen

Preview-opslag gebruikt uitsluitend `werkbank.jobs.v1.*`. Het automatisch bewaarde concept is apart van de expliciet bewaarde klussen. Er is nog geen account, cloudsynchronisatie, serverback-up, e-mailverzending, formele offerte of factuur. De klantweergave is een prijsindicatie die via de browser kan worden afgedrukt of als PDF bewaard.

Onvolledige materiaal-/inkoopprijzen blokkeren de klantweergave. Prijssnapshots en de rekenkern van Workshop 02 blijven behouden. Productiecalculaties kunnen via de bestaande JSON-export/import worden meegenomen. Foto’s en klusgegevens zitten ook in de JSON-export.

## Bouwen en testen

```sh
python3 scripts/build-jobs.py
node tests/jobs-core.test.js
WERKBANK_CHROMIUM=/pad/naar/chromium node tests/jobs-browser.test.js
WERKBANK_CHROMIUM=/pad/naar/chromium node tests/jobs-edge.test.js
```

De builder gebruikt de huidige hoofdversie als basis en wijzigt die niet. Browsertests starten hun eigen lokale HTTP-server.

Getest in Chromium: 320/390/1280 px, opname, klant bewaren/selecteren, foto uploaden, maten, materiaal, werkregel bewerken, prijs, privé-klantweergave, bewaren/herladen, export/importvalidatie en volle opslag. Lichte/donkere screenshots staan in jobs/screenshots. Geen fysieke iPhone/Safari- of WebKit-test uitgevoerd.

Na samenvoegen en Pages-publicatie: `werkbank-klussen-preview.html`. Er is geen wijziging aan `werkbank-v2.html` nodig om deze preview te bekijken.
