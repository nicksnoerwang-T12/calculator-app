# Werkbank — Nederlandse leverancierscatalogus en Codex-bouwopdracht

Onderzoekspeildatum: **15 september 2026**. Bedragen in euro. Versie van dit rapport: 1.

## 1. Besluit en afbakening

Gebruik een **brongebonden startcatalogus met openbare verkooprichtprijzen**, niet een tabel met vermeende gemiddelde zakelijke inkoopprijzen. Een eigen inkoopprijs krijgt voorrang, maar wijzigt nooit stilzwijgend bestaande calculaties.

Dit onderzoek bestrijkt de achttien profielgroepen van de werkende materiaal-editor en de materiaalhoofdfamilies staal, RVS, aluminium, messing en koper. Het levert een gecontroleerde selectie van artikelen en een expliciete gatenlijst op. Het is **geen volledige Nederlandse artikelendatabase**. Vooral openbare, eenduidig configureerbare prijzen voor RVS en non-ferro ontbreken nog. Daar blijft het bedrag leeg: ‘op aanvraag’. De bronnen bewijzen catalogusaanbod, niet actuele magazijnvoorraad of gegarandeerde levertijd.

Er is geen betrouwbare prijsbandbreedte of marktgemiddelde vastgesteld voor de opgenomen individuele artikelen: daarvoor ontbreken voldoende onafhankelijke aanbiedingen met dezelfde specificatie én afnamebasis. De numerieke richtprijs is daarom de aangetroffen openbare artikelprijs, of een transparante omrekening daarvan. `rangeLow` en `rangeHigh` blijven `null`. Dit is nuttiger dan verschillende kwaliteiten, lengtes en ordergroottes middelen.

Dit document is een onderzoeks- en bouwspecificatie. De app, repository, productieprijzen en gebruikerscalculaties zijn tijdens dit onderzoek **niet gewijzigd**.

### Wat mag automatisch worden ingevuld?

- Een gecontroleerde prijs met leverancier, specifieke artikelcombinatie, eenheid, datum en voorwaarden.
- Een leveranciersgewicht als zodanig gelabeld; niet als gegarandeerd gemeten gewicht.
- Alleen daadwerkelijk onderzochte handelsmaten en expliciet onderbouwde lengtes.
- Geen afgeleide prijs voor een andere materiaalsoort, wanddikte, afwerking of leverancier.
- Geen handelslengte van 6 meter als de bron alleen ‘op lengte’ zegt.

## 2. Onderzoeksmethode

Geraadpleegd zijn Nederlandse leverancierpagina’s en openbare assortiments-/prijstabellen. Er zijn geen accounts gebruikt, offertes aangevraagd, orders geplaatst of onderhandelde prijzen verkregen. Sommige configuratoren en pagina’s waren niet volledig uitleesbaar; zulke waarnemingen zijn niet als gecontroleerde startprijs opgenomen.

Een gelijkwaardige vergelijking vereist minimaal: legering/staalkwaliteit, productieproces, afwerking, doorsnede en toleranties, handelslengte of zaagopdracht, hoeveelheid, prijsbasis, toeslagen en leveringswijze. Een prijs per meter van een gezaagde webshopstaaf is niet zonder meer vergelijkbaar met de meterwaarde van een hele handelsstang.

De peildatum is de onderzoeksdatum. Een bron kan een oudere indexering hebben en vermeldt meestal geen ingangsdatum of geldigheidsduur. Toon daarom ‘geraadpleegd op’, niet ‘gegarandeerd geldig tot’. Voor bestellen blijft herbevestiging nodig.

Prijsklassen:

| Code | Betekenis | Gedrag in Werkbank |
|---|---|---|
| P | Openbare prijs en prijsbasis voldoende duidelijk | Richtprijs invullen, voorwaarden zichtbaar |
| O | Artikel onderzocht, geen bruikbare openbare prijs | Bedrag `null`; ‘Op aanvraag — eigen prijs invullen’ |
| B | Prijs/eenheid/btw/configuratie ambigu of conflicterend | Niet automatisch invullen; verificatie nodig |
| M | Maatwerk of eigen artikel | Geen catalogusprijs suggereren |

Een ontbrekend gewicht of onbekende legering wordt afzonderlijk vastgelegd; een prijsstatus P betekent niet dat alle technische velden bekend zijn.

## 3. Staal: bruikbare openbare prijswaarnemingen

### 3.1 Gemeenschappelijke voorwaarden Twentse Staalhandel

Onderstaande Twentse prijzen zijn exclusief 21% btw en af fabriek. **Onder €250 exclusief btw orderbedrag wordt €25 kleine-orderkosten gerekend.** Bezorgen is op afspraak en de kosten zijn op aanvraag. Zagen/bewerken waar genoemd: offerte, niet automatisch gratis. Hanteer deze kosten per leveranciersorder, niet per materiaalregel. Bron: [leveringsvoorwaarden](https://twentsestaalhandel.nl/meer/leveringsvoorwaarden/).

Voor alle Twentse tabellen hieronder: afname is de gekozen lengte/hoeveelheid tegen de gepubliceerde eenheidsprijs, met bovengenoemde ordervoorwaarde. Er is geen aanvullende volumestaffel vastgesteld. Geen vaste stocklengte invullen waar die niet vermeld is. Prijzen zonder zaag-, transport- of behandelingskosten.

### 3.2 Vierkante en rechthoekige koker — status P

Bron: [Twentse kokers](https://twentsestaalhandel.nl/kokers/). De pagina noemt S235JR en koudgewalste kokers als voorraadassortiment; warmgewalst apart op aanvraag. Gewicht per meter en vaste handelslengtes zijn niet gepubliceerd in deze tabel. Lengte op aanvraag/te bestellen; geen 6m-stockclaim.

| Profiel-ID | Maat mm | Openbare richtprijs €/m |
|---|---|---:|
| squareTube | 20×20×2 | 2,39 |
| squareTube | 25×25×2 | 2,69 |
| squareTube | 30×30×2 | 3,22 |
| squareTube | 30×30×3 | 4,17 |
| squareTube | 40×40×2 | 4,19 |
| squareTube | 40×40×3 | 5,33 |
| squareTube | 40×40×4 | 7,04 |
| squareTube | 50×50×3 | 6,98 |
| squareTube | 60×60×3 | 8,52 |
| squareTube | 80×80×4 | 15,23 |
| rectTube | 40×20×2 | 3,20 |
| rectTube | 40×20×3 | 4,27 |
| rectTube | 50×25×2 | 4,25 |
| rectTube | 50×30×2 | 4,29 |
| rectTube | 50×30×3 | 5,75 |
| rectTube | 60×40×2 | 5,40 |
| rectTube | 60×40×3 | 7,26 |
| rectTube | 60×40×4 | 9,58 |
| rectTube | 80×40×4 | 11,68 |
| rectTube | 100×50×3 | 10,78 |

Bandbreedte per rij: niet vastgesteld; één bron. Een geometrisch berekend kokergewicht mag alleen als schatting worden getoond, niet als gepubliceerd handelsgewicht.

### 3.3 IPE — status P

Bron: [Twentse IPE](https://twentsestaalhandel.nl/balkstaal/ipe-profiel/). S235JR; levering op lengte, zaagkosten op aanvraag. Vaste handelslengtes niet vastgesteld. €/m is hieronder berekend met **het gewicht uit dezelfde leveranciersprijstabel**. Dit gewicht wijkt soms af van nominale profielboeken; bewaar beide onafhankelijk.

| Maat | Leveranciersgewicht kg/m | Openbaar €/kg | Afgeleid €/m |
|---|---:|---:|---:|
| IPE 100 | 8,3 | 1,35 | 11,205 |
| IPE 120 | 10,6 | 1,35 | 14,310 |
| IPE 140 | 13,2 | 1,35 | 17,820 |
| IPE 160 | 16,2 | 1,35 | 21,870 |
| IPE 180 | 19,2 | 1,35 | 25,920 |
| IPE 200 | 22,9 | 1,35 | 30,915 |
| IPE 240 | 31,3 | 1,36 | 42,568 |
| IPE 300 | 43,1 | 1,36 | 58,616 |

De bronprijzen zijn per kg. Afronden naar centen pas op regel-/ordertotaal, niet eerst op de afgeleide meterprijs. Bandbreedte ontbreekt.

### 3.4 HEA — status P

Bron: [Twentse HEA](https://twentsestaalhandel.nl/balkstaal/hea-profiel/). S235JR, op lengte; stocklengtes niet vastgesteld. Gewichten en kg-prijzen komen uit dezelfde bron; meterprijzen zijn omrekeningen, geen aparte aanbiedingen.

| Maat | Leveranciersgewicht kg/m | Openbaar €/kg | Afgeleid €/m |
|---|---:|---:|---:|
| HEA 100 | 17,1 | 1,35 | 23,085 |
| HEA 120 | 20,3 | 1,35 | 27,405 |
| HEA 140 | 25,2 | 1,35 | 34,020 |
| HEA 160 | 31,0 | 1,35 | 41,850 |
| HEA 180 | 36,2 | 1,35 | 48,870 |
| HEA 200 | 43,2 | 1,36 | 58,752 |
| HEA 240 | 61,5 | 1,36 | 83,640 |
| HEA 300 | 90,0 | 1,37 | 123,300 |

Geen prijsband. Een HEA 100 is een nominale profielaanduiding, geen vrij invoerbare 100×100mm-rechthoek. Exacte h/b/tw/tf uit een afzonderlijk gecontroleerd profielrecord tonen; niet uit de naam afleiden.

### 3.5 HEB — status P

Bron: [Twentse HEB](https://twentsestaalhandel.nl/balkstaal/heb-profiel/). S235JR, op lengte; vaste handelslengtes niet vastgesteld. Eén openbare prijsbron, geen bandbreedte.

| Maat | Leveranciersgewicht kg/m | Openbaar €/kg | Afgeleid €/m |
|---|---:|---:|---:|
| HEB 100 | 20,8 | 1,35 | 28,080 |
| HEB 120 | 27,3 | 1,35 | 36,855 |
| HEB 140 | 34,4 | 1,35 | 46,440 |
| HEB 160 | 43,5 | 1,35 | 58,725 |
| HEB 180 | 52,2 | 1,35 | 70,470 |
| HEB 200 | 62,5 | 1,36 | 85,000 |
| HEB 240 | 84,4 | 1,36 | 114,784 |
| HEB 300 | 119,3 | 1,37 | 163,441 |

### 3.6 UNP — status P

Bron: [Twentse UNP](https://twentsestaalhandel.nl/balkstaal/unp-profiel/). S235JR, op lengte; stocklengtes niet vastgesteld. Geen prijsband. UNP/UPN als zoeksynoniemen behandelen, nooit verwarren met UPE of een gezette U.

| Maat | Leveranciersgewicht kg/m | Openbaar €/kg | Afgeleid €/m |
|---|---:|---:|---:|
| UNP 100 | 10,8 | 1,35 | 14,580 |
| UNP 120 | 13,7 | 1,35 | 18,495 |
| UNP 140 | 16,4 | 1,35 | 22,140 |
| UNP 160 | 19,2 | 1,35 | 25,920 |
| UNP 180 | 22,5 | 1,35 | 30,375 |
| UNP 200 | 25,8 | 1,35 | 34,830 |
| UNP 240 | 33,9 | 1,36 | 46,104 |
| UNP 300 | 47,1 | 1,36 | 64,056 |

### 3.7 Hoeklijnen — status P, kwaliteit niet gespecificeerd

Bron: [Twentse hoeklijnen](https://twentsestaalhandel.nl/hoeklijnen/). Prijzen onbehandeld; categorie A €1,36/kg, B €1,72/kg. **Kwaliteit niet expliciet vastgesteld voor deze rijen**: toon ‘staal — kwaliteit bevestigen’, niet automatisch S235 of S355. Lengte en zaagkosten op aanvraag; geen standaard-stocklengte vastgelegd. Geen prijsband.

| Profiel-ID | Maat mm | kg/m leverancier | €/kg | Afgeleid €/m |
|---|---|---:|---:|---:|
| equalAngle | 40×40×4 | 2,5 | 1,36 | 3,400 |
| equalAngle | 50×50×5 | 3,8 | 1,36 | 5,168 |
| equalAngle | 60×60×6 | 5,5 | 1,36 | 7,480 |
| equalAngle | 80×80×8 | 9,8 | 1,36 | 13,328 |
| equalAngle | 100×100×10 | 15,3 | 1,36 | 20,808 |
| unequalAngle | 120×80×8 | 12,4 | 1,72 | 21,328 |
| unequalAngle | 150×100×10 | 19,4 | 1,72 | 33,368 |
| unequalAngle | 200×100×10 | 23,4 | 1,72 | 40,248 |

### 3.8 Ronde buis — status P, kwaliteit niet gespecificeerd

Bron: [Twentse buizen](https://twentsestaalhandel.nl/buizen/). Selectie uit onbehandelde A-buis; niet verwisselen met gasbuis, verzinkt of drukgecertificeerd leidingmateriaal. Geen gepubliceerd kg/m of expliciete handelslengte in deze prijsselectie. Geen prijsband.

| Profiel-ID | Buiten-Ø×wand mm | Richtprijs €/m |
|---|---|---:|
| roundTube | 17,2×1,8 | 1,64 |
| roundTube | 21,3×2 | 1,70 |
| roundTube | 26,9×2,35 | 2,58 |
| roundTube | 33,7×2,65 | 3,45 |
| roundTube | 42,4×2,65 | 4,45 |
| roundTube | 48,3×2,9 | 5,67 |
| roundTube | 60,3×2,9 | 7,14 |
| roundTube | 76,1×3,25 | 10,02 |

### 3.9 Rondstaf — status P, kwaliteit niet gespecificeerd

Bron: [Twentse stafijzer](https://twentsestaalhandel.nl/stafijzer/). Warmgewalst rond, openbaar €1,38/kg. Geen vaste stocklengte bevestigd. Genoemde gewichten zijn sterk afgerond: zet ‘leveranciersrichtgewicht’ bij de afgeleide meterprijs. Niet gebruiken als maatcontrole of gemeten massa. Geen prijsband.

| Profiel-ID | Ø mm | kg/m leverancier | Afgeleid €/m |
|---|---:|---:|---:|
| roundBar | 10 | 0,6 | 0,828 |
| roundBar | 12 | 0,9 | 1,242 |
| roundBar | 14 | 1,2 | 1,656 |
| roundBar | 16 | 1,6 | 2,208 |
| roundBar | 20 | 2,5 | 3,450 |
| roundBar | 25 | 3,9 | 5,382 |

### 3.10 Plaatstaal: alleen prijsobservatie op familieniveau

Bron: [Twentse platen](https://twentsestaalhandel.nl/platen/). Alleen hele platen; genoemde formaten 2000×1000, 2500×1250 en 3000×1500mm. Dikte-/kwaliteitcombinaties zijn niet voldoende gespecificeerd om hiervan automatisch complete SKU’s te maken.

| Uitvoering volgens bron | Openbaar €/kg | Catalogusactie |
|---|---:|---|
| Koudgewalst | 1,71 | Nog geen artikel-startprijs |
| Warmgewalst gebeitst | 1,64 | Nog geen artikel-startprijs |
| Warmgewalst St37 | 1,53 | Nog geen artikel-startprijs |
| Sendzimir | 1,91 | Nog geen artikel-startprijs |
| Zincor | 1,99 | Nog geen artikel-startprijs |
| Corten | Op aanvraag | Geen bedrag |

Geen fictieve diktekeuzes toevoegen en St37 niet zonder verdere bevestiging omzetten naar iedere moderne S235-variant. Eerst een exacte plaatvariant bevestigen. De globale gewichtsbenadering op de leverancierspagina is geen per-artikel gemeten plaatgewicht.

## 4. Aanbod met bekende maten/lengtes maar zonder bruikbare openbare startprijs

Voor alle rijen in dit hoofdstuk: richtprijs en bandbreedte **op aanvraag**, tenzij expliciet anders vermeld. Niet-gepubliceerde zaagkosten, transport en minimumafname blijven onbekend. Gewicht is leveranciersopgave, niet door ons gemeten. Losse numerieke dimensies zijn millimeters.

### 4.1 UPE en aanvullende constructiestalen kwaliteiten

Bron: [Heuvelman UPE](https://www.heuvelman.com/product/upe/). UPE wordt aangeboden in S355J2, EN10025, met 3.1-certificaat en een maximale voorraadlengte van 12m. Dit is **geen bewijs van een keuzelijst 6/8/10/12m**. Leg 12000mm vast als gepubliceerde maximale lengte, niet als bewijs van iedere kortere handelslengte.

| Profiel-ID | Aanduiding | h×b mm | kg/m | Prijs |
|---|---|---|---:|---|
| UPE | 80 | 80×50 | 8,1 | Op aanvraag |
| UPE | 100 | 100×55 | 9,9 | Op aanvraag |
| UPE | 120 | 120×60 | 12,4 | Op aanvraag |
| UPE | 160 | 160×70 | 17,4 | Op aanvraag |
| UPE | 200 | 200×80 | 23,3 | Op aanvraag |
| UPE | 240 | 240×90 | 30,2 | Op aanvraag |

**Bronconflict:** de volgorde van lijf-/flensdikte in de tabel is bij UPE80 anders dan bij volgende rijen. Daarom deze diktes niet automatisch overnemen; geometrie eerst controleren tegen een producententabel. Niet corrigeren op vermoeden.

[Heuvelman balkstaal](https://www.heuvelman.com/category/balkstaal/) noemt IPE/HEA/HEB in S235JR, S275JR en S355J2 tot maximaal 25m en UPN tot maximaal 24m. Dit is bronmateriaal voor verdere artikelvalidatie, geen toestemming om Twentse S235-prijzen toe te passen op Heuvelman S355. Geen openbare prijs vastgesteld.

### 4.2 RVS staf en strip — FNF Metaal

Bron voor alle rijen: [FNF RVS staven](https://www.fnf-metaal.nl/producten.php?sub-cat=rvs/staven). Lengtes zijn expliciet per artikel vermeld. 316L/1.4404 apart houden van 316/1.4401. Geen prijs, transporttarief of minimumafname gepubliceerd in de geraadpleegde tabel.

| Profiel-ID | Materiaal/uitvoering | Maat | Handelslengte m | kg/m |
|---|---|---|---|---:|
| roundBar | 304/1.4301 f8 | Ø20 | 3; 6 | 2,51 |
| roundBar | 304/1.4301 f8 | Ø30 | 3 | 5,65 |
| squareBar | 304/1.4301 h11 | 10 | 3 | 0,80 |
| squareBar | 304/1.4301 h11 | 20 | 3 | 3,20 |
| squareBar | 304/1.4301 h11 | 30 | 3 | 7,20 |
| strip | 304/1.4301 geslit | 30×3 | 4 | 0,72 |
| strip | 304/1.4301 geslit | 40×4 | 4; 6 | 1,28 |
| strip | 304/1.4301 geslit | 50×3 | 4 | 1,20 |
| hexBar | 304/1.4301 h11 | SW13 | 3 | 1,17 |
| hexBar | 304/1.4301 h11 | SW17 | 3 | 1,97 |
| hexBar | 304/1.4301 h11 | SW22 | 3 | 3,29 |
| roundBar | 316L/1.4404 h9 | Ø10 | 3; 6 | 0,63 |
| roundBar | 316L/1.4404 h9 | Ø20 | 3; 6 | 2,51 |
| roundBar | 316L/1.4404 h9 | Ø30 | 3; 6 | 5,65 |

### 4.3 RVS koker en zeskant: prijs niet eenduidig

| Leverancier/artikel | Onderbouwde gegevens | Prijsstatus |
|---|---|---|
| [Goed Metaal koker 40×40×2](https://www.goedmetaal.nl/goedmetaal/rvs-koker-40x40x2-mm) | 304; onbehandeld dof/mat; 2,51kg/m; op maat, ±1mm | B: meerdere vanafbedragen zonder eenduidig vastgelegde lengte; niet als €/m gebruiken |
| [RVS Products zeskant SW17](https://www.rvs-products.nl/rvs-staf-zeskant-17-x-17-mm-rvs-304-onbewerkt/) | 304, onbewerkt, blankgetrokken h11; artikel ZSZ17511 | B: categoriebedrag €4,58 ex, maar geen bruikbare lengte-/prijsbasis vastgesteld |

Bij [Goed Metaal RVS-kokers](https://www.goedmetaal.nl/rvs-koker) zijn onder andere 20×20×2, 25×25×2, 30×30×2, 30×30×3, 40×40×2 en 40×40×3 zichtbaar. Voor andere varianten dan het geopende 40×40×2-artikel ontbreken hier nog volledige kwaliteit-, lengte- en prijsgegevens: niet zelfstandig als complete catalogus-SKU activeren.

### 4.4 Aluminium staf — FNF Metaal

Bron: [FNF aluminium staven](https://www.fnf-metaal.nl/producten.php?sub-cat=aluminium/staven). Warmtebehandeling/toestand niet in deze rijen vastgesteld: geen T6/T66 bijverzinnen. Prijzen op aanvraag.

| Profiel-ID | Legering | Maat | Handelslengte m | kg/m |
|---|---|---|---|---:|
| roundBar | EN AW6060 | Ø10 | 3; 6 | 0,22 |
| roundBar | EN AW6060 | Ø20 | 6 | 0,87 |
| roundBar | EN AW6060 | Ø30 | 6 | 1,95 |
| roundBar | EN AW6082 | Ø20 | 3; 6 | 0,87 |
| roundBar | EN AW6082 | Ø25 | 3; 6 | 1,35 |
| squareBar | EN AW6060 | 10 | 6 | 0,28 |
| squareBar | EN AW6060 | 20 | 6 | 1,10 |
| squareBar | EN AW6082 | 20 | 3; 6 | 1,10 |
| squareBar | EN AW6082 | 30 | 3; 6 | 2,48 |

### 4.5 Aluminium hoeklijnen en T — FNF Metaal

Bron: [FNF aluminium profielen](https://www.fnf-metaal.nl/producten.php?sub-cat=aluminium/profielen). Alle onderstaande lengtes expliciet 6m; toestand/finish niet nader vastgesteld. Alle prijzen op aanvraag.

| Profiel-ID | Legering | Maat mm | kg/m |
|---|---|---|---:|
| equalAngle | EN AW6060 | 20×20×2 | 0,21 |
| equalAngle | EN AW6060 | 40×40×3 | 0,64 |
| equalAngle | EN AW6060 | 50×50×5 | 1,31 |
| unequalAngle | EN AW6060 | 40×20×2 | 0,32 |
| unequalAngle | EN AW6060 | 60×40×3 | 0,80 |
| unequalAngle | EN AW6060 | 100×50×5 | 2,00 |
| equalAngle | EN AW6082 | 40×40×4 | 0,84 |
| tee | EN AW6060 | 20×20×2 | 0,21 |
| tee | EN AW6060 | 25×25×2 | 0,26 |
| tee | EN AW6060 | 40×40×2 | 0,421 |

### 4.6 Aluminium plaat — FNF Metaal

Bron: [FNF aluminium platen](https://www.fnf-metaal.nl/producten.php?sub-cat=aluminium/platen). **Brongewicht is per m²**, niet per plaat. Totaal hieronder is berekend. Toestand/finish niet verder invullen dan de bron. Prijzen op aanvraag.

| Profiel-ID | Legering | Handelsformaat × dikte mm | Bron kg/m² | Afgeleid kg/plaat |
|---|---|---|---:|---:|
| plate | EN AW1050A | 2000×1000×1 | 2,754 | 5,508 |
| plate | EN AW1050A | 2000×1000×2 | 5,508 | 11,016 |
| plate | EN AW1050A | 3000×1500×3 | 8,262 | 37,179 |
| plate | EN AW5754 | 2000×1000×2 | 5,508 | 11,016 |
| plate | EN AW5754 | 2500×1250×3 | 8,262 | 25,81875 |
| plate | EN AW5754 | 3000×1500×5 | 13,770 | 61,965 |

FNF noemt ook expliciete op-maatproducten; behandel die als een aparte leveranciersdienst, niet automatisch dezelfde prijsbasis als een hele plaat.

### 4.7 Messing — FNF Metaal

Bron: [FNF messing staven](https://www.fnf-metaal.nl/producten.php?sub-cat=messing/staven). MS58 is expliciet voor platstaf; bij de geselecteerde zeskanten is de exacte legering niet afzonderlijk bevestigd. Geen MS58/CW614N-gelijkheid veronderstellen zonder bron. Prijzen op aanvraag.

| Profiel-ID | Materiaal | Maat | Handelslengte m | kg/m |
|---|---|---|---|---:|
| strip | Messing MS58 | 20×3 | Niet vermeld | 0,52 |
| strip | Messing MS58 | 30×5 | Niet vermeld | 1,29 |
| strip | Messing MS58 | 50×5 | Niet vermeld | 2,15 |
| hexBar | Messing, legering bevestigen | SW10 | 3 | 0,74 |
| hexBar | Messing, legering bevestigen | SW13 | 3 | 1,26 |
| hexBar | Messing, legering bevestigen | SW17 | 3 | 2,15 |
| hexBar | Messing, legering bevestigen | SW20 | 3 | 2,98 |

### 4.8 Koper — FNF Metaal

Bron: [FNF koper staven](https://www.fnf-metaal.nl/producten.php?sub-cat=koper/staven). Exacte koperkwaliteit/toestand niet vastgesteld. De platstaffamilie noemt handelslengtes 3/4m; artikel-specifieke bevestiging nodig voordat beide stockopties per variant actief worden. Prijzen op aanvraag.

| Profiel-ID | Maat mm | kg/m leverancier |
|---|---|---:|
| strip | 20×2 | 0,36 |
| strip | 30×3 | 0,80 |
| strip | 20×5 | 0,89 |
| strip | 30×5 | 1,34 |
| strip | 50×5 | 2,23 |
| strip | 50×10 | 4,45 |

### 4.9 T-staal en aanvullende webshopwaarnemingen

[IJzershop T-profielen](https://ijzershop.nl/316-t-profiel) biedt warmgewalst S235JR op 2m, vanaf één stuk. Geselecteerde maten: 20×20×3,5; 25×25×3,5; 30×30×4; 40×40×5; 50×50×6; 60×60×7mm. De zichtbare bedragen voor deze 2m-artikelen zijn respectievelijk €10,32; €12,68; €13,00; €17,81; €25,44; €36,11. **B-status:** de btw-status van deze specifieke weergave is niet voldoende vastgelegd; geen ex-btw-startprijs hiervan maken. Gewichten per variant niet vastgesteld.

[IJzershop koker 50×30×2](https://ijzershop.nl/koker-rechthoek/1445-stalen-koker-50-x-30-x-2mm.html): aangeboden als S235JR, koudgevormd, 2m, vermeld totaalgewicht 4,1kg. Zichtbaar €17,83, maar ex-btw-status niet voldoende vastgelegd: B, geen startprijs. Het gewicht vraagt verificatie en mag geen stilzwijgende correctie van de bestaande rekenkern worden.

[IJzershop FAQ](https://ijzershop.nl/content/51-FAQ) bevestigt prijs per omschreven lengte, geen apart B2B-tarief, en transport €15 inclusief btw binnen Nederland uitgezonderd eilanden; omgerekend circa €12,40 ex bij 21%. Lange lengtes zijn onder voorwaarden mogelijk, niet standaard bij elk artikel. Bronnen noemen verschillende toleranties; leg geen universele zaagtolerantie vast zonder artikelbevestiging.

[Metaalstore zwart warmgewalst 50×30×2](https://metaalstore.nl/koker-zwart-staal-wgw-50x30x2-mm/): zichtbaar €6,82 ex, maar gekozen lengte/eenheidsbasis onvoldoende bevestigd. B-status. Warmgewalst bovendien niet gelijkwaardig aan koudgevormde koker. Niet combineren met Twentse of IJzershop tot een marktband.

### 4.10 Ingekocht onderdeel

[RVS Products karabijnhaak 4×40, artikel 8249404 40](https://www.rvs-products.nl/karabijnhaak-4-x-40-mm-rvs-316/) is een voorbeeld voor `purchasedItem`: RVS316/A4, gepolijst, per stuk, leveranciersgewicht 0,87kg per 100 = 0,0087kg/stuk. De [homepage](https://www.rvs-products.nl/) toont €0,57 ex bij dit artikel, maar de uitgelezen productpagina bood geen bevestigde eigen prijsweergave: bewaar als prijsobservatie, **niet automatisch activeren vóór hercontrole**. Geen constructieve of hijstoepassing uit alleen deze catalogusgegevens afleiden.

`customKgM` is geen leveranciersprofiel: de gebruiker vult omschrijving, eigen kg/m, lengte en prijs in. Status M; geen catalogusgemiddelde.

## 5. Dekkingsmatrix en resterend onderzoek

| Werkbank-groep | Onderzoek / bruikbare basis | Resterende beperking |
|---|---|---|
| plate | Twentse staalprijsfamilies; FNF aluminiumformaten | Geen volledige geprijsde staal/RVS-plaat-SKU’s |
| strip | FNF RVS304, messing, koper | Prijzen op aanvraag; meer staalartikelen nodig |
| roundBar | Twentse staal; FNF RVS304/316L en aluminium | Grade/gewichtcontrole bij staal; non-ferroprijzen ontbreken |
| squareBar | FNF RVS304 en aluminium | Geen gecontroleerde ex-btw-prijs |
| hexBar | FNF RVS304 en messing | Prijzen op aanvraag |
| roundTube | Twentse A-buis | RVS/aluminium catalogus verder valideren |
| squareTube | Twentse staal; Goed Metaal RVS | RVS-prijsbasis/handelslengte ontbreken |
| rectTube | Twentse staal; twee webshopcontroles | Geen valide vergelijkbare prijsband |
| equalAngle | Twentse staal; FNF aluminium | Staalkwaliteit bevestigen; RVS uitbreiden |
| unequalAngle | Twentse staal; FNF aluminium | Idem |
| IPE | Twentse prijs; Heuvelman kwaliteitsaanbod | Nominaal gewicht vs leverancier; stocklengtes |
| HEA | Twentse prijs; Heuvelman kwaliteitsaanbod | Idem |
| HEB | Twentse prijs; Heuvelman kwaliteitsaanbod | Idem |
| UNP | Twentse prijs; Heuvelman UPN | Idem; niet mengen met UPE |
| UPE | Heuvelman S355J2, maten/gewichten | Prijs op aanvraag; diktekolommen controleren |
| tee | IJzershop staal; FNF aluminium | Staal-btw verifiëren; aluminium op aanvraag |
| customKgM | Eigen omschreven materiaal | Geen publieke universele catalogus mogelijk |
| purchasedItem | Concreet RVS316-onderdeel onderzocht | Per artikel verifiëren, geen generiek gemiddelde |

RVS430 is expliciet een **catalogusgat**: leveranciers als [HEGO](https://hego.nl/) zijn onderzocht als RVS-leverancier, maar de specifieke kwaliteitspagina was niet volledig toegankelijk. Geen volledige 430-maat×dikte×finish×gewicht×prijscombinatie veilig vastgesteld. Houd 430 beschikbaar via ‘maatwerk/eigen artikel’; geen fictieve 430-profielcatalogus activeren. Dit bewijst niet dat 430 niet leverbaar is.

Ook ‘alle aluminium’, ‘alle messing’ of ‘alle RVS316’ zijn geen enkelvoudige koopartikelen. Legering, toestand, afwerking en uitvoering blijven identiteitseigenschappen. Geen automatische RVS-IPE/HEA/HEB-combinaties creëren uit een gewone staalprofieltabel.

### 5.1 Waarom geen gemiddelde prijs per materiaalsoort?

Voor 50×30×2 is Twentse €4,29/m duidelijk; Metaalstore heeft een andere productie-uitvoering en onduidelijke configuratiebasis; IJzershop verkoopt een 2m-artikel en de btw-weergave is niet sluitend vastgelegd. Deze drie bedragen vormen **geen geldige prijsband**.

Voor RVS304-koker 40×40×2 zijn een specifiek gewicht en maat bekend, maar onvoldoende eenduidige openbare prijzen bij equivalente lengtes. De uitkomst blijft ‘op aanvraag’, ook als een zoekmachine een aantrekkelijk vanafbedrag laat zien.

### 5.2 Kwaliteitsbewaking van bronnen

- Bewaar `supplierListedWeight` los van `theoreticalWeight` en eventuele daadwerkelijke factuurmassa.
- Verschillende gewichten niet middelen. Conflicten markeren en laten verifiëren.
- Geen kg/m uit een andere leverancier gebruiken om een €/kg-offer automatisch te normaliseren zonder zichtbare, bevestigde keuze.
- Geen ontbrekend kg/m voor gewalste profielen uit scherpe-hoekgeometrie als exact handelsgewicht presenteren.
- Bewaar bron-URL per gegevensgroep, niet alleen een homepage bij de hele catalogus.
- Een geschatte zaagofferte is nog geen bindend bestelbedrag; toon bekende subtotaalbedragen en open kosten.
- Voor een commercieel SaaS-product: regel op termijn onderhouden leveranciersfeeds of afgesproken cataloguslevering. Een eenmalige webcontrole vervangt geen actualiseringsproces.

## 6. Rekenspecificatie: verbruik versus daadwerkelijke aankoop

### 6.1 Twee bedragen, nooit bij elkaar optellen

1. **Netto materiaalverbruik:** vereiste deelmaten en aantallen, bijbehorend gewicht en toegerekende materiaalwaarde.
2. **Materiaal inkopen:** werkelijk benodigde hele stangen/platen of door de leverancier gefactureerde zaagstukken, met restmateriaal en aanvullende orderkosten.

De gebruiker kiest expliciet de kostprijsmethode: ‘Volledige aankoop aan dit project toerekenen’ of ‘Alleen verbruik uit eigen voorraad’. Toon welke methode in het projecttotaal wordt gebruikt. Het andere bedrag is informatief, geen tweede kostenregel.

Voor hele stangen: groepeer alleen identieke SKU, leverancier/offer, kwaliteit en finish; plan delen met kerf en kopsnede op aantoonbare stocklengtes. `ceil(somLengtes/stockLengte)` is slechts een ondergrens, niet een geldig zaagplan. Label een heuristiek als voorstel, niet als bewezen optimum.

Voor platen: controleer de werkelijke 2D-indeling, randafstand, snijspleet en draairichting. Alleen oppervlak delen door plaatoppervlak volstaat niet. Als geen gevalideerde nesting beschikbaar is, laat het aantal hele platen expliciet invoeren en markeer dat als handmatige aankoopplanning.

Voorkom dubbele verliesopslag: zichtbaar zaagverlies/rest in de volledige aankoop niet nogmaals als hetzelfde verliespercentage doorberekenen. Een aparte reserve/breek-/bewerkingsuitval mag alleen expliciet en met eigen betekenis.

Restmateriaal is niet automatisch een korting of terugbetaling. Eventuele voorraadcredit is een afzonderlijke, door de gebruiker gekozen boekingswijze. Houd ook onderscheid tussen ‘nieuwe aankoop’ en ‘bestaande rest uit magazijn’.

### 6.2 Leveranciersorderkosten

Per order: materiaalregels + zaagkosten + bewerkingen + kleine-orderkosten + transport. Onbekend is `null`, niet 0. Toon bijvoorbeeld ‘Bekend subtotaal €…; zagen en transport nog open’. ‘Afhalen, geen transport’ is een expliciete keuze, niet de onzichtbare standaard.

Controleer minimumafname/staffels op de door de bron bedoelde basis. Twentse kleine-orderkosten niet per regel toevoegen. De grens van €250 wordt niet gehaald door de €25 toeslag zelf mee te tellen. De bron spreekt over orderbedrag; of bepaalde bewerkingskosten voor deze grens meetellen is niet nader vastgesteld. Toon die grondslag als te bevestigen wanneer dat het resultaat beïnvloedt. De grensvoorbeelden hieronder betreffen uitsluitend materiaal, zonder andere kosten. Btw pas op de relevante eindbedragen toepassen; rapport en interne prijsbasis ex btw houden.

## 7. Datamodel voor de preview

Scheid vijf objecten:

| Object | Minimale inhoud |
|---|---|
| `CatalogArticle` | stabiel ID, profiel-ID, materiaal/grade, finish/proces, maten, nominale profielnaam, geometriebron, leveranciersgewicht + eenheid, exact bewezen stockopties, maxlengte afzonderlijk |
| `SupplierOffer` | supplierId/articleId, bron-URL, geraadpleegdOp, rawPrice, currency, VAT-status, prijsbasis, hoeveelheid/staffel, ordervoorwaarden, prijsstatus, afgeleide prijs + formule |
| `UserPriceOverride` | articleId/offer-scope, eigen bedrag, eenheid, leverancier optioneel, datum, notitie; nooit sleutel op alleen materiaaldichtheid |
| `CalculationLineSnapshot` | geselecteerd artikel/offer + catalogusversie, maten, aantallen, aankoopmodus, gewichtsbasis, vastgelegd bedrag/eenheid, bron/eigenprijs, toeslagversie |
| `PurchasePlan` | delen, stangen/platen, sneden, rest, voorraadgebruik, ordergroepering, kostenallocatie en open kosten |

`knownStockLengthsMm=[]` betekent ‘geen bewezen stockkeuzes’, niet ‘elke lengte toegestaan’. `maxLengthMm=12000` is niet gelijk aan `knownStockLengthsMm=[12000]`.

Gebruik gescheiden statussen voor prijs, geometrie, kwaliteit en lengte. Een catalogusartikel kan een geldige meterprijs hebben maar nog geen bevestigde stocklengte. Lengte invoeren blijft dan mogelijk als gewenste zaag-/offertelengte met duidelijke status, niet als gegarandeerd leverbaar handelsartikel.

Voorbeeld van een brongebonden offerrecord, geen complete applicatiecode:

```json
{
  "id": "twentse-s235jr-cold-rect-50x30x2-20260915",
  "profileType": "rectTube",
  "materialFamily": "steel",
  "grade": "S235JR",
  "dimensionsMm": {"b": 50, "h": 30, "t": 2},
  "knownStockLengthsMm": [],
  "maxLengthMm": null,
  "supplierWeightKgPerM": null,
  "price": {
    "status": "public_reference",
    "amount": "4.29",
    "basis": "m",
    "currency": "EUR",
    "vatIncluded": false,
    "rangeLow": null,
    "rangeHigh": null,
    "observedOn": "2026-09-15",
    "sourceUrl": "https://twentsestaalhandel.nl/kokers/"
  },
  "orderTermsId": "twentse-20260915",
  "cutCostStatus": "quote_required",
  "transportCostStatus": "quote_required"
}
```

Geld rekenen met decimale precisie of geschaalde integers; geen voortijdige afronding op €/m. Vergelijkingsgroepen mogen prijsbasis normaliseren maar niet de werkelijk gefactureerde afnamebasis veranderen.

## 8. Codex-bouwopdracht — volledig overnemen met dit rapport als bijlage

### Doel en beschermde basis

Werk in repository `calculator-app` aan de **huidige werkende preview**. Controleer eerst branch, HEAD, bestaande tests en de echte actuele bestanden. Gebruik de meest recente gemergede werkende versie; dit rapport is geen instructie om terug te gaan naar een oude commit.

Implementeer de onderzochte catalogus en een visuele harmonicakeuze in `werkbank-preview.html`. Behoud de materiaal-editor, native profielselectie, `technicalProfileDiagram`, bestaande rekenfuncties en opgeslagen gegevens. Geen nieuwe step-wizard, geen grote frameworkmigratie en geen vervanging van de werkende editorarchitectuur. `werkbank.html` en `werkbank-v2.html` moeten byte-identiek blijven. Wijzig alleen preview, benodigde previewcatalogus/testbestanden en documentatie. Niets mergen of publiceren.

Lees dit gehele rapport. De artikelen, onzekerheden en testvoorwaarden zijn bindend. Presenteer geen ‘gemiddelde inkoopprijs’ waar alleen één openbare verkoopprijs is onderzocht. Verzin geen ontbrekende prijzen, maten, grades, gewichten of stocklengtes. Maak geen compleet materiaal×profiel×maat-kruisproduct. Voeg tijdens implementatie alleen extra artikelen toe na gelijkwaardige broncontrole en documenteer die afzonderlijk; vul gaten niet op met modelkennis.

### A. Catalogus en prijsregels eerst

1. Maak een expliciete, versieerbare catalogus op basis van hoofdstukken 3–5. Onderscheid P/O/B/M. P-prijzen mogen als openbare richtprijs worden ingevuld, O/B blijven `null`. Familieprijsobservaties voor plaatstaal zijn geen actieve exacte SKU’s.
2. Laat uitsluitend bewezen combinaties zien. Niet-onderzochte opties horen onder ‘Maatwerk / eigen artikel’. Ze verdwijnen niet uit oude calculaties. Een onbekende grade blijft onbekend; forceer geen S235/RVS304-standaard.
3. Maak `materialFamily` en `grade` onafhankelijk van dichtheid. 304, 316, 316L, 430, S235JR, S355J2 en aluminiumlegeringen niet samenvoegen. Bewaar oorspronkelijke labels van legacyregels.
4. Bestaande balkstaalmaten worden in catalogusmodus read-only: kies bijvoorbeeld HEA160, vul niet vrij hoogte/breedte/flensdikte in. Vrije geometrie blijft apart maatwerk. Gebruik de bestaande nominale geometrie uitsluitend als gecontroleerd profielrecord; leveranciersprijsgewichten overschrijven nooit de constructieve profieltabellen.
5. Rond prijzen pas op het juiste eindniveau af. Bewaar bronbedrag en basis. Geen 21% btw dubbel aftrekken. Geen onbekende prijs omzetten naar nul.

### B. Visuele harmonica binnen dezelfde editor

Volgorde: **Materiaal → Profieltype → Handelsmaat → Handelslengte of zaaglengte → Aantal**. Daaronder prijsinstellingen en het live resultaat. Het is één doorlopend formulier; niet een scherm-per-stap-wizard.

- Gebruik toegankelijke native `details/summary` of gelijkwaardig getest gedrag met `aria-expanded`. Ingeklapte secties tonen de gemaakte keuze: bijvoorbeeld ‘Staal · S235JR’, ‘Rechthoekige koker’, ‘50 × 30 × 2 mm’.
- Laat secties handmatig open/dicht; verplaats niet automatisch focus naar een invoer-/zoekveld. Het iPhone-toetsenbord mag alleen openen na expliciete tik op dat veld. Keuzes moeten zonder typen mogelijk zijn.
- Behoud herkenbare SVG-profieliconen, met tekstlabel en zichtbaar geselecteerde staat. Geen externe logo-/afbeeldingsdownloads nodig; leveranciersnamen en bronlinks volstaan. SVG is decoratief voor selectie; radiolabels blijven native aanklikbaar.
- Gebruik één stabiele modelbinding en listenerroute. Niet de volledige editorbody vervangen bij elke toetsaanslag. Geen dubbele IDs, geen verloren input, geen twee handlers die één toevoeging dubbel uitvoeren.
- Handelsmaat is een complete variant, bijvoorbeeld 50×30×2; geen losse breedte-/wandlijsten die onbestaande combinaties genereren. Bij veel maten een optionele zoekknop, niet automatisch geopende zoekinvoer.
- Toon vóór toevoegen materiaal/grade, profiel, alle maten, lengtewijze, aantal, prijsbasis, bronstatus en resultaat. Technisch diagram blijft zichtbaar met juiste maatlabels.
- Lengtekeuze: ‘Hele handelsstang/plaat’ alleen bij expliciet bewezen stockopties. ‘Op lengte laten leveren’ toont de gewenste zaaglengte en eventuele bevestigingsstatus. ‘Zelf zagen uit handelsmateriaal’ opent aankoopplanning. Geen denkbeeldige 6m-lijst.
- Bij platen kiest men eerst materiaal/dikte/handelsformaat en vervolgens gewenste deelmaten, oriëntatie en aantal. Gewenste deelmaat is niet automatisch een apart catalogusartikel.
- Als een materiaalwisseling de gekozen maat ongeldig maakt: benoem wat verandert, laat gebruiker bevestigen, wis geen eigen prijs of maten ongemerkt. Annuleren behoudt oorspronkelijke toestand.
- Actieknop ‘Materiaal toevoegen’ of ‘Wijzigingen opslaan’, goed bereikbaar boven safe-area/toetsenbord. Raakvlakken minimaal 44×44 CSS-px. Geen horizontale paginascroll op 320px. Lange omschrijvingen en bedragen mogen afbreken.
- Toon onderaan: netto benodigd, werkelijk inkopen, rest, bekende kosten en open kosten. Geen grote misleidende totaalprijs als artikelprijzen ontbreken.

### C. Eigen inkoopprijs en prijswijzigingen

- Ieder artikel heeft ‘Catalogusrichtprijs’ en ‘Mijn inkoopprijs’. Het eigen veld is direct beschikbaar, niet pas in een latere release.
- Ondersteun alleen prijsbasissen die voor dat artikel zinvol zijn: €/kg, €/m, €/m², €/hele stang, €/hele plaat, €/stuk. Een eigen €/kg-prijs vereist een bekende of expliciet gekozen gewichtsbasis.
- Eigen prijs kan gelden voor deze regel of, na keuze, als artikelstandaard voor toekomstige regels. Toon leverancier en datum optioneel. Nooit persoonlijke prijzen in een publieke catalogus of GitHub-bestand schrijven.
- ‘Terug naar catalogusrichtprijs’ toont de wijziging vóór bevestiging. Als geen bruikbare catalogusprijs bestaat, wordt de prijs weer onbekend; niet nul. Voor oude regels blijft alles ongewijzigd totdat bevestigd is.
- Sla bij toevoegen een prijssnapshot op. Catalogusupdates of wijzigingen aan de artikelstandaard hebben geen effect op bestaande regels, inclusief na herladen, importeren of openen van een project.
- ‘Prijzen bijwerken’ opent een vergelijking per geselecteerde regel: oud bedrag + eenheid, nieuw bedrag + eenheid, oude/nieuwe regelkosten, verschil, oude/nieuwe bron en eventueel gewijzigde orderkosten. Eigen prijzen standaard uitsluiten. Annuleren wijzigt niets; bevestigen wijzigt uitsluitend geselecteerde regels. Bewaar vorige snapshot voor herstellen.
- Bij alleen het wijzigen van een aantal blijft de vastgelegde eenheidsprijs gelden; een bronstaffel-/ordergrensverandering afzonderlijk en zichtbaar behandelen. Bij wijzigen naar een ander artikel de nieuwe prijskeuze tonen voordat opgeslagen wordt.

### D. Aankoopplanning en projectkosten

Implementeer hoofdstuk 6. Netto materiaalwaarde en hele-stockkosten zijn aparte uitkomsten, geen som. Groepeer identieke artikelen en leveranciersonderscheid, houd hoeveelheid per product vs hele project expliciet, neem snijverlies mee. Gebruik een aantoonbaar passend zaag-/nestvoorstel of een duidelijk handmatig ingevoerd stockaantal; claim geen optimum zonder bewijs.

Twentse kleine-orderkosten zijn één ordertoeslag. Zaag-/transportkosten onbekend laten totdat ingevuld of onderbouwd. Toon een onvolledig totaal met aantal open kostenregels. Hele-stangprijzen niet ook nogmaals met lengte vermenigvuldigen; hele-plaatprijzen niet met kg. Bewaar voldoende gegevens om de berekening later te reproduceren.

### E. Migratie, opslag en veiligheid

- Behoud alle achttien canonieke profieltypes: `plate`, `strip`, `roundBar`, `squareBar`, `hexBar`, `roundTube`, `squareTube`, `rectTube`, `equalAngle`, `unequalAngle`, `IPE`, `HEA`, `HEB`, `UNP`, `UPE`, `tee`, `customKgM`, `purchasedItem`.
- Oude `rhs` wordt veilig `rectTube` waar nodig; bestaande correcte migraties behouden. Legacy zonder catalogus-ID blijft een legacy/maatwerkregel met ongewijzigde prijs, niet op de dichtstbijzijnde SKU gokken.
- Back-up en schemaVersion voor migratie. Test ontbrekende/corrupte opslag, geblokkeerde localStorage, quota vol, import van oude en nieuwe exports. Bij opslagfout duidelijke melding en exportmogelijkheid; niet ‘opgeslagen’ tonen als het mislukt.
- Escape gebruikers- en catalogustekst, valideer geïmporteerde data, beperk grootte/aantallen zodat de browser niet vastloopt. Geen netwerkverplichting voor de basiscatalogus; de preview moet met de gebundelde gegevens offline kunnen rekenen zoals de bestaande app.

### F. Verplichte acceptatietests

Voer de bestaande tests uit en voeg onderstaande cases toe. Test met het echte volledige productiescript en echte DOM/browserinteractie. Injecteer geen vervangende `diagram`- of editorfuncties waardoor ontbrekende productieafhankelijkheden onzichtbaar worden.

| Test | Verwacht |
|---|---|
| Twentse rectTube50×30×2, 4×1000mm | Netto 4m; materiaalwaarde €17,16, exclusief open zaag-/transport- en eventuele orderkosten |
| Dezelfde regel als enige Twentse afhaalorder | €25 kleine-orderkosten één keer; bekend subtotaal €42,16; zaagkosten nog open, dus geen definitief totaal |
| Order materiaalwaarde €249,99 / €250,00 | Toeslag respectievelijk €25 / €0; grens niet inclusief eigen toeslag testen |
| IPE160, 3m, bron16,2kg/m en €1,35/kg | 48,6kg leveranciersrichtgewicht; €65,61; nominale rekenkernel niet overschreven |
| Vierkante koker2mm vs3mm | Verschillende SKU en prijs; geen prijslek van vorige keuze |
| Onbekende prijs | `null`, geen €0; project zichtbaar onvolledig |
| Eigen prijs €4,50/m, 4m | €18,00; catalogus blijft €4,29/m; bewaren/herladen behoudt eigen prijs |
| Catalogusprijs wijzigt | Bestaande snapshot blijft gelijk; annuleren update wijzigt niets; bevestigen alleen gekozen regels |
| Reset eigen prijs op O-artikel | Weer ‘op aanvraag’, nooit gratis artikel |
| Bron vermeldt maximaal12m | Geen automatisch gegenereerde 6/8/10m-stockopties |
| Synthetic fixture: stock6m, drie delen3500mm, kerf0 | Drie stangen, niet twee; aankoop18m versus netto10,5m |
| Synthetic fixture: 1000×1000 plaat, drie delen600×600, marge0 | Drie platen, niet twee op basis van oppervlak |
| Bronvermelding FNF alu plaat2000×1000×2 | 5,508kg/m² geeft 11,016kg/plaat, niet 5,508 |
| Groepering | Identieke SKU’s delen stockplan; andere grade/finish/leverancier niet |
| Aankoop en verbruik | Project rekent één gekozen kostprijsmethode; geen dubbele kosten of dubbel verlies |
| Hele-stockprijs | Eén prijs per stang/plaat; niet nogmaals ×m of ×kg |
| Nieuwe catalogus, legacy/offline import | Oude bedragen en maten blijven gelijk; geen stilzwijgende herprijzing |

De twee synthetic fixtures zijn uitsluitend tests, geen bewijs dat deze voorraadmaten bij een leverancier bestaan.

Test alle achttien profielroutes, ook maatwerk en ingekochte artikelen: selecteren → juiste editorvelden en diagram → toevoegen → bewerken → annuleren → dupliceren → verwijderen → herstellen. Test radioselectie via echte gebruikersklik, niet alleen `dispatchEvent` op een helperobject. Controleer foutenconsole en `pageerror`.

Browsermatrix: 320, 390, 430 en 1280px; licht/donker; WebKit én Chromium waar beschikbaar. Screenshots van materiaalkeuze, maatselectie, prijsoverschrijving, complete stuklijst, prijs-updatevergelijking en aankoopkosten. WebKit-emulatie is geen echte iPhone-test. Beschrijf daarnaast een korte handmatige Safari-checklist.

Als browserinstallatie/toegang ontbreekt of door beleid wordt geblokkeerd: niet omzeilen, niet claims verzinnen. Noteer welke browsertests niet uitgevoerd zijn. Een geslaagde Node-/VM-test is geen bewijs van werkende taps, focus, layout of toetsenbordbediening op iPhone. Lever dan een concept-PR met concrete testblokkade, niet ‘productiegereed’.

### G. Uitvoering in kleine controleerbare delen

1. Leg huidige werkende route en bestaande bedragen vast met regressietests.
2. Voeg data, bronstatus, snapshots en prijsresolutie toe zonder de UI-route te vervangen. Test.
3. Voeg de harmonica als laag binnen de werkende editor toe. Test alle selectie-/inputroutes.
4. Voeg eigen prijzen, expliciete prijsupdates en aankoopplanning toe. Test reken- en opslaggevallen.
5. Lever bronregister, aantallen actieve/ongeprijsde/geblokkeerde artikelen, testresultaten, screenshots en resterende gaten. Controleer dat de twee productie-HTML’s ongewijzigd zijn.

Open hoogstens een preview-PR voor review als de gebruiker dat vraagt; geen merge, productiepromotie of publicatie. De oplevering moet duidelijk onderscheiden: geïmplementeerd, daadwerkelijk getest, niet getest en niet onderzocht. Vergroot de catalogus later met geverifieerde leveranciersartikelen; ‘alles ondersteund’ mag alleen betekenen dat iedere groep correct kan omgaan met beschikbare én ontbrekende gegevens.

## 9. Vrijgavecheck voor de eigenaar

Controleer vóór gebruik voor echte offertes ten minste: juiste grade/finish, bronprijs en eenheid, zaag-/transport-/kleine-orderkosten, daadwerkelijke aankoopwijze, snapshotgedrag en de volledige iPhone-toevoegroute. Een catalogusprijs is een begrotingshulp, geen leveranciersofferte. Onderhandelingskortingen worden uitsluitend als eigen inkoopprijzen ingevoerd.

De volgende uitbreiding met de meeste waarde is het verifiëren van exacte, geprijsde RVS304/316L-kokers en platen, aluminiumkokers en standaard staalstrip/vierkant/T. De huidige gaten blijven zichtbaar totdat bewijs beschikbaar is.
