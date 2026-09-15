# Workshop 02 — hoofdversie

Workshop 02 is op verzoek van de gebruiker overgezet naar `werkbank-v2.html`.
De hoofdversie gebruikt de bestaande `werkbank.v2.*`-opslag: bestaande projecten en eigen prijzen blijven beschikbaar. Ontwerpcalculaties blijven in de aparte previewopslag; overbrengen kan met Export/Import JSON.

## Reproduceerbaar bouwen

Vanuit de repositoryroot:

```sh
python3 scripts/build-workshop.py
python3 scripts/promote-workshop.py
```

De builder leest `design/base-catalogus.html`, de bewaarde catalogusbasis vóór de UI-promotie. Zo wordt de nieuwe UI nooit tweemaal geïnjecteerd. Werk de bron en preview bij voor toekomstige functies, test, en promoveer daarna expliciet.

## Browsercontroles

```sh
WERKBANK_PAGE=werkbank-v2.html WERKBANK_CHROMIUM=/pad/naar/chromium node tests/design-browser.test.js
WERKBANK_PAGE=werkbank-v2.html WERKBANK_CHROMIUM=/pad/naar/chromium node tests/design-browser-edge.test.js
```

De browsertests ondersteunen zowel preview als hoofdversie. De publicatie behoudt de bestaande opslagsleutels. De oude catalogus-baselinecontrole is verplaatst naar de bewaarde bron; reken-, catalogus- en snapshotcontroles blijven de werkelijke productiepagina gebruiken.
