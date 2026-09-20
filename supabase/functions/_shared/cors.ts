// Gedeeld door beide Mollie-functies. Alleen de eigen app roept mollie-checkout aan vanuit de
// browser (mollie-webhook wordt alleen door Mollie's servers aangeroepen, geen browser-CORS nodig
// maar de headers zijn onschadelijk om ook daar te zetten).
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
