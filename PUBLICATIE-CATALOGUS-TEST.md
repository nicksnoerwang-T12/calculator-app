# Publicatiecontrole catalogustest

Deze publicatiebranch voegt uitsluitend `werkbank-catalogus-test.html` toe aan de Pages-root. De bestaande `werkbank-preview.html`, `werkbank-v2.html` en `werkbank.html` blijven byte-identiek.

Na samenvoegen van de publicatie-PR en een succesvolle GitHub Pages-publicatie is het verwachte testadres:

`https://nicksnoerwang-t12.github.io/calculator-app/werkbank-catalogus-test.html`

Het adres werkt niet vóór samenvoegen en succesvolle Pages-publicatie. Er is geen branchpreviewdeployment.

De testpagina gebruikt uitsluitend browseropslagsleutels onder `werkbank.catalogus-test.v1.*`. Daarmee leest of overschrijft zij geen prijzen, thema, favorieten, artikelprijzen of calculaties van de bestaande productie- en previewpagina’s.

De catalogus en alle productie-JavaScript staan inline in de HTML. Er zijn geen aanvullende runtimebestanden of netwerkrequests nodig. `tests/catalog-publication.test.js` voert de gebundelde catalogus en snapshot-/prijsupdatefuncties uit en bewaakt tevens opslagisolatie, offline-afhankelijkheden en de hashes van de drie beschermde HTML-bestanden.
