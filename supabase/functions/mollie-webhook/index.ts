// Supabase Edge Function: ontvangt Mollie's webhook-callback bij elke betaalstatuswijziging en
// werkt de subscriptions-tabel bij. Dit is de ENIGE plek die naar subscriptions mag schrijven
// (met de service-role-sleutel, die RLS omzeilt) — zie supabase/schema.sql.
// ONGEVERIFIEERD — zie mollie-checkout/index.ts voor dezelfde disclaimer en paywall/README.md
// voor de deploy-stappen (o.a. deze functie-URL als webhook bij Mollie registreren).
//
// Mollie stuurt een POST met x-www-form-urlencoded body: id=tr_xxxxxxx (de betalings-ID).
// Antwoord altijd met 200, ook bij een interne fout — anders blijft Mollie dezelfde call herhalen.

import { createClient } from 'npm:@supabase/supabase-js@2';

const MOLLIE_API_KEY = Deno.env.get('MOLLIE_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const PLAN_INTERVAL: Record<string, string> = { monthly: '1 month', yearly: '12 months' };
const PLAN_AMOUNT: Record<string, string> = { monthly: '5.00', yearly: '55.00' };

async function mollie(path: string, init: RequestInit = {}) {
  const res = await fetch('https://api.mollie.com/v2/' + path, {
    ...init,
    headers: { Authorization: 'Bearer ' + MOLLIE_API_KEY, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  return { ok: res.ok, status: res.status, body: await res.json() };
}

Deno.serve(async (req) => {
  try {
    const form = await req.formData();
    const paymentId = form.get('id') as string | null;
    if (!paymentId) return new Response('ok', { status: 200 });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { body: payment, ok } = await mollie('payments/' + paymentId);
    if (!ok) return new Response('ok', { status: 200 }); // onbekende/verwijderde betaling: niets te doen

    const userId = payment?.metadata?.user_id as string | undefined;
    const plan = (payment?.metadata?.plan as string | undefined) || 'monthly';
    if (!userId) return new Response('ok', { status: 200 });

    if (payment.status === 'paid' && payment.sequenceType === 'first') {
      // Eerste (geslaagde) betaling legt het incassomandaat vast — nu pas de terugkerende
      // Subscription bij Mollie aanmaken, met dezelfde webhook-URL voor toekomstige termijnen.
      const { body: sub, ok: subOk } = await mollie('customers/' + payment.customerId + '/subscriptions', {
        method: 'POST',
        body: JSON.stringify({
          amount: { currency: 'EUR', value: PLAN_AMOUNT[plan] },
          interval: PLAN_INTERVAL[plan],
          description: 'Werkbank-abonnement — ' + plan,
          webhookUrl: SUPABASE_URL + '/functions/v1/mollie-webhook',
        }),
      });
      await admin.from('subscriptions').upsert({
        user_id: userId, status: 'active', plan, mollie_customer_id: payment.customerId,
        mollie_subscription_id: subOk ? sub.id : null,
        current_period_end: addInterval(new Date(), plan).toISOString(),
        updated_at: new Date().toISOString(),
      });
    } else if (payment.sequenceType === 'recurring') {
      // Terugkerende termijn: bij geslaagde betaling de periode verlengen, bij mislukte betaling
      // de status op 'past_due' zetten zodat de app weer op slot gaat totdat het is opgelost.
      const status = payment.status === 'paid' ? 'active' : (['failed', 'expired', 'canceled'].includes(payment.status) ? 'past_due' : undefined);
      if (status) {
        const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
        if (status === 'active') update.current_period_end = addInterval(new Date(), plan).toISOString();
        await admin.from('subscriptions').update(update).eq('user_id', userId);
      }
    } else if (payment.status === 'failed' || payment.status === 'canceled' || payment.status === 'expired') {
      await admin.from('subscriptions').update({ status: 'none', updated_at: new Date().toISOString() }).eq('user_id', userId).eq('status', 'pending');
    }

    return new Response('ok', { status: 200 });
  } catch (_e) {
    return new Response('ok', { status: 200 });
  }
});

function addInterval(date: Date, plan: string): Date {
  const d = new Date(date);
  if (plan === 'yearly') d.setFullYear(d.getFullYear() + 1); else d.setMonth(d.getMonth() + 1);
  return d;
}
