# Paywall — gratis kijkversie + €5/maand-abonnement

## Wat dit is

Freemium-laag ("prijs-tease"): zonder account werkt de hele app lokaal door — rekentools, klussen,
de volledige snelprijs-/kostprijsflow inclusief materiaal- en maatkeuze en de harmonica met
prijsopbouw. Het enige dat verborgen blijft is het **uiteindelijke bedrag** (de prijs zelf), tot
er een actief abonnement is. Dat is bewust: de bezoeker heeft dan al alle moeite gedaan, waardoor
de drempel om op het allerlaatste moment in te loggen laag is.

- €5 / maand, of €55 / jaar (= 1 maand gratis t.o.v. 12×5)
- Betalen via Mollie (iDEAL-vriendelijk voor de NL-doelgroep)

## Status: wat is af en getest, wat niet

**Af en getest (puur clientside, geen externe afhankelijkheid):**
- Gratis kijkversie: `cloud/cloud.js`'s `bootCloud()` blokkeert de app niet meer bij het opstarten
  zonder account — dat gebeurt nu alleen nog op expliciet verzoek (klik op "Inloggen" of op een
  prijs-lock).
- Prijs-tease: `renderCostTotals()` (hoofdcalculator), `intakeRenderPricePanel()`/`intakeBarHtml()`
  (snelprijs-funnel) en `customerView()` (klantweergave) zijn gewrapt om bedragen te maskeren of
  de actie te blokkeren zolang er geen actief abonnement is. Zie `tests/production-paywall.test.js`.
- Abonnementspagina (`openPricingPage()`) met maand/jaar-keuze, in de UI bereikbaar via de nieuwe
  kaart "Abonnement" in Instellingen en via elke prijs-lock-knop.

**GESCHREVEN MAAR ONGEVERIFIEERD — vereist een eigen Mollie-account om te testen:**
- `supabase/functions/mollie-checkout/index.ts` — start een Mollie-betaling/klant.
- `supabase/functions/mollie-webhook/index.ts` — verwerkt Mollie's statuscallback en zet de
  abonnementsstatus in de `subscriptions`-tabel (de enige plek die daar mag schrijven, zie
  `supabase/schema.sql`).

Deze twee functies zijn geschreven tegen de gedocumenteerde Mollie REST API (v2 Customers/
Payments/Subscriptions), maar er is in deze omgeving geen Mollie-account of API-sleutel
beschikbaar om ze daadwerkelijk te draaien. Zolang ze niet gedeployed zijn, toont de
"Start abonnement"-knop een eerlijke melding ("nog niet gekoppeld") in plaats van een kapotte of
nagemaakte betaling — er wordt nooit gedaan alsof er is afgerekend als dat niet zo is.

## Hoe live zetten (door de eigenaar, niet door mij te doen)

1. **Mollie-account aanmaken** op mollie.com, en een (test-)API-sleutel ophalen uit het
   dashboard (Ontwikkelaars → API-sleutels).
2. **Secrets zetten** in het Supabase-project:
   ```sh
   supabase secrets set MOLLIE_API_KEY=test_xxxxxxxxxxxx
   supabase secrets set APP_URL=https://nicksnoerwang-t12.github.io/calculator-app/werkbank-v2.html
   ```
   (`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_ANON_KEY` staan al automatisch klaar
   binnen Edge Functions.)
3. **Functies deployen**:
   ```sh
   supabase functions deploy mollie-checkout
   supabase functions deploy mollie-webhook --no-verify-jwt
   ```
   `--no-verify-jwt` is nodig voor de webhook: Mollie's servers sturen geen Supabase-inlogtoken mee.
4. **Schema bijwerken**: plak `supabase/schema.sql` nogmaals in de SQL Editor (idempotent, voegt
   alleen de nieuwe `subscriptions`-tabel + policies toe).
5. **Testen met een Mollie-testsleutel** (`test_...`) vóórdat je naar een live-sleutel overstapt —
   Mollie's testmodus simuleert iDEAL-betalingen zonder echt geld.
6. Pas als dit allemaal draait: vervang de test-sleutel door de live-sleutel en zet
   `--no-verify-jwt` nogmaals expliciet (deploy overschrijft niets stilzwijgend).

## Waarom subscriptions een aparte tabel is, geen veld in user_settings

`user_settings` mag de gebruiker zelf volledig overschrijven (RLS: eigen rij, alle acties). Als
de abonnementsstatus daar ook in zou staan, kon iedereen zichzelf via de browser-console gratis
"actief abonnement" geven. `subscriptions` heeft daarom alleen een **select**-policy voor de eigen
rij; schrijven kan uitsluitend via de Edge Functions met de service-role-sleutel (die RLS altijd
omzeilt). Zie `supabase/schema.sql`.
