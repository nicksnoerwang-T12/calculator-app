/* Service Worker, uitsluitend voor share_target (Fase 5.3): op een statische host (geen
   server-backend) is een SW de enige manier om een POST van het OS-deelmenu te ontvangen — de
   host zelf kan geen multipart/form-data verwerken. Legt het gedeelde bestand tijdelijk vast in
   de Cache Storage API; de app zelf (zie de "pendingShare"-afhandeling in cro/cro.js) haalt het
   bij het laden op en verplaatst het naar de echte bijlage-opslag (IndexedDB, step/attachments.js).

   ONGEVERIFIEERD: kon in deze sessie niet getest worden — het vereist een geïnstalleerde PWA en
   een echte OS-deelactie (telefoon/desktop "Delen naar..."-menu), wat hier niet te simuleren is.
   Geschreven naar de gepubliceerde Web Share Target-spec, niet tegen een echte deelactie gedraaid. */

const SHARE_CACHE = 'werkbank-share-target-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method === 'POST' && url.pathname.endsWith('/share-target.html')) {
    event.respondWith((async () => {
      try {
        const formData = await event.request.formData();
        const file = formData.get('gedeeld');
        const title = formData.get('title') || '';
        const text = formData.get('text') || '';
        const cache = await caches.open(SHARE_CACHE);
        if (file && typeof file.arrayBuffer === 'function') {
          await cache.put('/pending-share-file', new Response(file, { headers: { 'x-share-name': file.name || 'gedeeld', 'x-share-type': file.type || '' } }));
        }
        await cache.put('/pending-share-meta', new Response(JSON.stringify({ title, text, at: new Date().toISOString() })));
      } catch (e) { /* geen bruikbare share-payload; app toont dan gewoon niets bijzonders */ }
      return Response.redirect('werkbank-v2.html#gedeeld', 303);
    })());
  }
});
