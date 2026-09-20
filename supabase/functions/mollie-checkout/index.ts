// Supabase Edge Function: start een Mollie-checkout voor het maand- of jaarabonnement.
// ONGEVERIFIEERD — geschreven tegen de gedocumenteerde Mollie REST API (v2 Customers/Payments),
// maar nooit tegen een echt Mollie-account gedraaid (er is hier geen Mollie-account/API-key
// beschikbaar om dit te testen). Controleer bij het deployen in ieder geval: de exacte
// customer/payment-response-vorm en of sequenceType 'first' + method-keuze bij iDEAL het gewenste
// mandaat oplevert. Zie ../../paywall/README.md voor de volledige deploy-stappen.
//
// Verwacht secrets (supabase secrets set ...):
//   MOLLIE_API_KEY        — geheime sleutel uit het Mollie-dashboard (test of live)
//   APP_URL                — https://nicksnoerwang-t12.github.io/calculator-app (of eigen domein)
// Gebruikt de door Supabase automatisch meegegeven SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const MOLLIE_API_KEY = Deno.env.get('MOLLIE_API_KEY')!;
const APP_URL = Deno.env.get('APP_URL') ?? 'https://nicksnoerwang-t12.github.io/calculator-app/werkbank-v2.html';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const PLAN_AMOUNT: Record<string, { value: string; description: string }> = {
  monthly: { value: '5.00', description: 'Werkbank-abonnement — maandelijks' },
  yearly: { value: '55.00', description: 'Werkbank-abonnement — jaarlijks (1 maand gratis)' },
};

async function mollie(path: string, init: RequestInit = {}) {
  const res = await fetch('https://api.mollie.com/v2/' + path, {
    ...init,
    headers: { Authorization: 'Bearer ' + MOLLIE_API_KEY, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const body = await res.json();
  if (!res.ok) throw new Error('Mollie ' + path + ': ' + (body?.detail || res.status));
  return body;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: 'niet-ingelogd' }, 401);
    const user = userData.user;

    const { plan } = await req.json();
    const chosen = PLAN_AMOUNT[plan];
    if (!chosen) return json({ error: 'ongeldig-plan' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: existing } = await admin.from('subscriptions').select('mollie_customer_id').eq('user_id', user.id).maybeSingle();

    let customerId = existing?.mollie_customer_id as string | undefined;
    if (!customerId) {
      const customer = await mollie('customers', { method: 'POST', body: JSON.stringify({ name: user.email, email: user.email, metadata: { user_id: user.id } }) });
      customerId = customer.id;
    }

    const payment = await mollie('payments', {
      method: 'POST',
      body: JSON.stringify({
        amount: { currency: 'EUR', value: chosen.value },
        description: chosen.description,
        customerId,
        sequenceType: 'first',
        redirectUrl: APP_URL + '?checkout=done',
        webhookUrl: SUPABASE_URL + '/functions/v1/mollie-webhook',
        metadata: { user_id: user.id, plan },
      }),
    });

    await admin.from('subscriptions').upsert({
      user_id: user.id, status: 'pending', plan, mollie_customer_id: customerId, updated_at: new Date().toISOString(),
    });

    return json({ checkoutUrl: payment._links.checkout.href });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
