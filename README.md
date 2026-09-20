# Werkbank

Nederlandstalige, mobile-first kostprijscalculator en mini-ERP voor zzp'ers in de staalbouw/
metaalbewerking. Eén bestand (`werkbank-v2.html`), geen build-stap, geen bundler, geen framework.

## Modules

Elke module leeft in zijn eigen map als brontekst, en wordt via een `scripts/promote-<naam>.js`
samengevoegd in `werkbank-v2.html`. De brontekst zelf is nooit de live app — `werkbank-v2.html` is
dat, ná het draaien van de promote-scripts.

| Map | Wat | README |
|---|---|---|
| `jobs/` | Klusopname: klant, maten, foto's, werkregels | [jobs/README.md](jobs/README.md) |
| `cloud/` | Supabase-accounts en multi-device-sync | — |
| `invoicing/` | Offerte/factuur-documentnummering en -profiel | — |
| `ui-polish/` | Maatzoekfunctie in de materiaal-editor | — |
| `intake/` | Snelprijs-funnel: sjablonen, bandbreedtes, eigen producten | [intake/README.md](intake/README.md) |
| `quotes/` | Offerteflow: versturen, statuspipeline, dashboard-KPI's | [quotes/README.md](quotes/README.md) |
| `step/` | Bijlagen, STEP-classificatie, 3D-preview, DXF | [step/README.md](step/README.md) |
| `cro/` | Onboarding, frictiemeting, opvolg-herinneringen | [cro/README.md](cro/README.md) |
| `brand/` | Logo/favicon-assets (geen promote-script, statische bestanden) | — |
| `design/` | Vroege ontwerp-preview (Workshop 02), geen wijzigingen nodig om de hoofdversie te bekijken | — |

## Bouwvolgorde (vaste volgorde — latere lagen wrappen functies uit eerdere lagen)

```sh
python3 scripts/build-workshop.py       # alleen nodig als design/base-catalogus.html wijzigt
python3 scripts/promote-workshop.py     # basis-app + leverancierscatalogus
node scripts/promote-jobs.js            # klusopname
node scripts/promote-cloud.js           # accounts/sync
node scripts/promote-invoicing.js       # offerte/factuur-documentnummering
node scripts/promote-ui-polish.js       # maatzoekfunctie
node scripts/promote-intake.js          # snelprijs-funnel (na jobs/invoicing)
node scripts/promote-quotes.js          # offerteflow (na invoicing/intake)
node scripts/promote-step.js            # bijlagen/STEP/3D/DXF (na jobs/intake)
node scripts/promote-cro.js             # onboarding/frictiemeting (moet als laatste)
```

`werkbank-v2.html` bevat op dit moment alle bovenstaande lagen al samengevoegd. De promote-
scripts zijn idempotent-beschermd (ze gooien een duidelijke fout als hun laag al aanwezig is) —
gebruik ze om een vervolgwijziging op de brontekst opnieuw samen te voegen, niet om een tweede
keer dezelfde laag te plakken. Bij een wijziging aan brontekst van een laag die vroeg in de keten
zit (bv. `jobs/`), moet je vanaf `werkbank-v2.html`'s ongewijzigde basis (`git checkout --
werkbank-v2.html` als er geen andere losse wijzigingen aan dat bestand openstaan) opnieuw de hele
keten doorlopen.

## Testen

```sh
# Node-tests (rekenkern, alle lagen se pure functies) — draaien overal, geen browser nodig:
for f in tests/*.test.js; do node "$f"; done

# Chromium-browsertests — vereisen een lokale Chromium-installatie:
WERKBANK_CHROMIUM=/pad/naar/chromium node tests/jobs-browser.test.js
WERKBANK_PAGE=werkbank-v2.html WERKBANK_CHROMIUM=/pad/naar/chromium node tests/design-browser.test.js
```

**Bekende, blijvende testuitkomst**: `tests/catalog-publication.test.js` en
`tests/production-catalog.test.js` falen op een SHA256-check tegen `werkbank-preview.html` door
een CRLF/`core.autocrlf`-verschil in deze Windows-ontwikkelomgeving — niet gerelateerd aan
app-code, al meerdere sessies zo. Alle overige Node-tests (21 stuks, exclusief 7 die een
Chromium-binary vereisen die in deze omgeving niet beschikbaar was) slagen.

## Supabase (cloud-sync)

Plak `supabase/schema.sql` eenmalig in de Supabase SQL Editor (idempotent, veilig opnieuw te
draaien). Tabellen: `customers`, `projects`, `user_settings` (bestonden al), plus sinds deze sessie
`quotes` en `templates` (RLS, idempotent). **Nog niet aangemaakt**: de Storage-bucket
`attachments` voor STEP/DXF/PDF-bijlagen (vereist Supabase-dashboardtoegang) — zie
[step/README.md](step/README.md) voor de volledige bijlage-opslagstatus.

## Belangrijkste beperking van deze hele sessie

Geen Chromium-binary beschikbaar in deze uitvoeringsomgeving: alle `*-browser.test.js`/
`*-edge.test.js`/`design-dom.test.js`/`workshop-promotion.test.js`-tests konden niet draaien.
Elke fase is in plaats daarvan interactief geverifieerd via een los browser-automatiseringspaneel
(echte Chromium-rendering, geen headless-simulatie) — per module-README staat precies wat daarbij
wel en niet is gecontroleerd. `step/README.md` heeft de meest uitgebreide toelichting: het
STEP-parsen zelf (occt-import-js) kon niet tegen een echt bestand geverifieerd worden.
