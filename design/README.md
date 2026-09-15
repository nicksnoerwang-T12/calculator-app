# Werkbank — Workshop 01

Ontwerp-preview van de goedgekeurde stijl: mat antraciet, warm oranje, technische vectoriconen, recente projecten, visuele profielkiezer en materiaal/arbeid/overzicht-tabbladen.

## Openen

`werkbank-design-preview.html` is volledig zelfstandig: geen externe fonts, scripts of afbeeldingen. Na het samenvoegen van deze PR en succesvolle Pages-publicatie is het adres:
https://nicksnoerwang-t12.github.io/calculator-app/werkbank-design-preview.html

Dit is geen reeds gepubliceerde branchpreview. Productie, eerdere preview en catalogustest blijven ongewijzigd.

## Bewerken en bouwen

Bewerk `design/workshop.css` en `design/workshop.js`. Voer vanuit de repositoryroot `python3 scripts/build-workshop.py` uit. De builder neemt `werkbank-v2.html` als bron en bundelt de presentatie in één zelfstandige HTML. De catalogus en rekenkern blijven uit de productiebron afkomstig.

Opslag gebruikt uitsluitend `werkbank.design.v1.*`. Geen automatische import uit productie. Importeer desgewenst een geëxporteerde JSON-calculatie en bewaar deze expliciet. De recente-projectenlijst toont alleen echt opgeslagen projecten, geen fictieve voorbeeldprijzen.

## Controle

- `node tests/design-material-calculator.test.js`
- `node tests/design-material-wizard.test.js`
- `npm install --prefix /tmp/werkbank-dom jsdom@30.0.1`
- `NODE_PATH=/tmp/werkbank-dom/node_modules node tests/design-dom.test.js`

DOM-test voert de volledige HTML uit zonder vervangende productiehelpers: nieuw project, native radioselectie, handelsmaat, lengte/aantal, toevoegen, opslaan, heropenen, tabbladen, thema en opslagisolatie. Reken-, migratie- en opslagtests slagen.

Geen echte browserscreenshots of fysieke iPhone-test uitgevoerd: Chromium-download liep op netwerktimeouts vast. JSDOM controleert interactie en HTML, niet rendering. Controleer vóór productiepromotie 320/390/430/1280px, licht/donker, toetsenbord, lange stuklijsten en schermtoetsenbord. De vormgeving is geïmplementeerd; visuele overeenstemming met het goedgekeurde ontwerp moet nog in Safari worden beoordeeld.

## Toepassing

Deze PR voegt alleen ontwerpbestanden toe. Na beoordeling kan dezelfde presentatielaag naar productie worden gebracht met behoud van `werkbank.v2.*` sleutels. Kopieer de geïsoleerde preview niet blind over productie: dat zou opgeslagen projecten uit beeld laten verdwijnen. Nieuwe productiepromotie krijgt eigen expliciete controle van opslag en calculatieprijzen.
