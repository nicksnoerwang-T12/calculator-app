# Fase 4 — CRO-afwerking en lege staten

## Doel
Onboarding-checklist, lege staten, lokale frictiemeting, opvolg-herinneringen, toegankelijkheid.

## Bestanden
- `cro/cro.js`+`.css` — moet als laatste laag samengevoegd worden (`scripts/promote-cro.js`):
  wrapt functies uit alle eerdere fases (`openIntakeFunnel`, `intakeRenderPricePanel`,
  `intakeFinish`, `saveCalculation`, `markQuoteSent`, `setJobFase`, `renderDashboard`,
  `renderCustomers`, `quotePipelineRowHtml`).

## Onderdelen

1. **Onboarding-checklist** (`#onboarding-checklist` op het dashboard): Tarieven instellen →
   Bedrijfsgegevens → Eerste snelprijs maken, met voortgangsbalk, verdwijnt zodra alle drie
   `done` zijn. "Tarieven instellen" is `done` zodra `werkbank.v2.intakeRates` bestaat (dus al bij
   het eerste bezoek aan Instellingen → Snelprijs-tarieven bewaren, niet pas bij een specifieke
   waarde).
2. **Lege staten**: klanten had er nog geen (toegevoegd, één zin + de bestaande "toevoegen"-vorm
   eronder als actie). Klussen/eigen-producten/bijlagen/opgeslagen-projecten hadden al een lege
   staat uit eerdere fases — hier alleen gecontroleerd, niet aangeraakt.
3. **Frictiemeting** (`werkbank.v2.metrics`, lokaal, max. 500 events, geen externe analytics):
   `intake_start`/`first_price_shown` (gekoppeld per funnel-sessie voor mediaan time-to-price),
   `template_chosen` (koppelt de sessie aan de uiteindelijke klus-id — pas gelogd bij de eerste
   echte "Klus bewaren", niet bij het verlaten van de funnel; zie de bugfix hieronder),
   `quote_sent`, `status_changed`. Overzicht in Instellingen: mediaan time-to-price, %
   intake→offerte, % offerte→opdracht.
4. **Opvolg-herinnering**: een "WhatsApp-herinnering"-knop (vooringevulde tekst via
   `quoteFollowUpText`, hergebruikt uit `quotes/quotes.js`) verschijnt naast een offerte in de
   "Offerte verzonden"-kolom zodra `isQuoteStale` (>5 dagen) true is — geen nieuwe logica, alleen
   de knop die in Fase 2 nog ontbrak.
5. **Toegankelijkheid**: `aria-live="polite"` op de prijsbalk bestond al sinds Fase 1
   (`#intake-bar`); focusbeheer bij stapwissel ook (`renderIntakeStep`'s `first.focus()`). Hier
   alleen gecontroleerd, geen nieuwe code — een volledige toegankelijkheidsaudit (schermlezer,
   kleurcontrast-meting) is niet uitgevoerd, zelfde reden als de ontbrekende browsertests.

## Een echte bug, gevonden tijdens browserverificatie

`intakeFinish()` opent de normale klus-tabs maar bewaart de klus niet (dat gebeurt pas bij een
expliciete "Klus bewaren"-klik). Een eerste versie logde `template_chosen` met de klus-id
onmiddellijk ná `intakeFinish()` — op dat moment is `savedProjectId` nog `null`, dus de
sessie-naar-klus-brug kreeg altijd `jobId:null` voor de normale route (klus eerst bekijken/
aanpassen, dán pas bewaren). Opgelost door de sessie te laten "wachten" tot de eerstvolgende
`saveCalculation()` die daadwerkelijk een id toekent — geverifieerd in de Browser-pane vóór en ná
de fix.

## Bouwen en testen
```sh
node scripts/promote-cro.js
node tests/cro-metrics.test.js
```
