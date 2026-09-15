# Previewcatalogus — bronregister

Versie `nl-suppliers-2026-09-15-v1`, geraadpleegd op 15 september 2026. De gebundelde catalogus in `werkbank-preview.html` bevat alleen combinaties uit het onderzoeksrapport. Status **P** is een openbare verkooprichtprijs exclusief btw; **O** is een onderzocht artikel zonder bruikbare openbare prijs. Onbekende kosten zijn nooit nul.

## Actief opgenomen

- Twentse Staalhandel: koudgewalste vierkante/rechthoekige kokers, IPE/HEA/HEB/UNP, hoeklijnen, A-buis en warmgewalste rondstaf. Prijzen volgen de artikel- of leveranciersgewichtbasis uit het rapport. Geen onbewezen stocklengtes.
- Heuvelman: UPE S355J2 als O-artikelen; 12.000 mm is uitsluitend `maxLengthMm`, geen stockoptie.
- FNF Metaal: geselecteerde RVS-staf/strip/zeskant, aluminiumstaf/hoek/T/plaat, messing en koper als O-artikelen. Alleen expliciet gepubliceerde handelslengtes zijn selecteerbaar.

## Bewuste gaten

B-status waarnemingen (onduidelijke btw-, lengte- of prijsbasis), plaatstaal-familieprijzen en de RVS316-karabijnhaakprijs zijn niet automatisch geprijsd. RVS430 blijft maatwerk. Zaag-, transport- en Twentse ordergrondslag buiten materiaal blijven open. Catalogusgegevens zijn begrotingshulp, geen voorraad- of leveringsgarantie.

## Handmatige Safari-checklist

1. Open de echte route naar `werkbank-preview.html` op een fysieke iPhone in Safari.
2. Voeg een materiaal toe en tik alle vijf harmonicadelen; controleer dat alleen een expliciet aangetikt tekstveld het toetsenbord opent.
3. Selecteer de native profielradio en een complete handelsmaat; controleer diagram, labels, 44px-raakvlakken en geen horizontale scroll op 320/390/430px.
4. Voer een eigen prijs in, bewaar, herlaad, reset met bevestiging en annuleer een prijsupdate.
5. Controleer licht/donker, safe-area, stuklijst, inkoop/verbruik en consolefouten. WebKit-emulatie geldt niet als echte iPhone-test.

## Runtime en offline beschikbaarheid

De basiscatalogus is bewust in `werkbank-preview.html` gebundeld. `CATALOGUS-BRONREGISTER.md` en `TESTVERSLAG-PREVIEW.md` zijn documentatie, geen scripts die de app moet ophalen. De preview bevat geen externe script-, stylesheet-, afbeeldings- of catalogusdependency. Daardoor is er geen verborgen extra catalogusbestand waarvan alleen de HTML-smoke het laden zou kunnen missen; de test voert de catalogusrecords uit het volledige inline productiescript uit.

## Twentse ordergrens

De bron spreekt over een orderbedrag van €250 exclusief btw, maar maakt niet duidelijk of bepaalde bewerkingskosten meetellen. De preview labelt de berekening op uitsluitend materiaal daarom als voorlopig. Zodra bekende bewerkingskosten de grens kunnen beïnvloeden, blijft de toeslag onbekend en verschijnt “grondslag kleine-ordergrens bevestigen” als open kostenpunt; er wordt dan geen definitieve €0 of €25 geboekt.
