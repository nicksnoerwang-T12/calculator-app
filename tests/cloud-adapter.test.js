'use strict';
// Test de puur-functionele delen van cloud/cloud.js in isolatie: createCloudAdapter (met een
// nep-Supabase-client, geen netwerk) en de merge*-functies (data in, data uit, geen DOM/opslag).
// De rest van cloud.js (auth-overlay, DOM, boot-volgorde) is net als jobs.js afhankelijk van een
// echte browser/Playwright en wordt hier niet nagebootst — zie tests/production-jobs-core.test.js
// voor dezelfde, eerder al toegelichte beperking.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const src = fs.readFileSync('cloud/cloud.js', 'utf8');
const grab = (start, end) => src.slice(src.indexOf(start), end ? src.indexOf(end) : undefined);

const adapterSource = grab('function createCloudAdapter', 'const cloudAdapter=');
const mergeSource = grab('function mergeProjectRows', 'function mergeProjects(rows)');

const context = { console };
vm.createContext(context);
vm.runInContext(adapterSource + '\n' + mergeSource + `
this.api = { createCloudAdapter, mergeProjectRows, mergeCustomerRows, mergeSettingsValues };
`, context);
const { api } = context;

// --- createCloudAdapter: push/pullAll/remove tegen een nep-client, geen echt netwerk. ---
function fakeClient({ upsertError = null, selectRows = [], selectError = null, deleteError = null } = {}) {
  const calls = { upsert: [], select: [], delete: [] };
  return {
    calls,
    from(table) {
      return {
        upsert: async (rows) => { calls.upsert.push({ table, rows }); return { error: upsertError }; },
        select: async () => { calls.select.push(table); return { data: selectRows, error: selectError }; },
        delete: () => ({ eq: async (col, id) => { calls.delete.push({ table, col, id }); return { error: deleteError }; } })
      };
    }
  };
}

(async () => {
  // push: lege array doet geen netwerkcall en meldt ok.
  {
    const client = fakeClient();
    const adapter = api.createCloudAdapter(client);
    const r = await adapter.push('projects', []);
    assert.equal(r.ok, true);
    assert.equal(client.calls.upsert.length, 0, 'lege push mag geen upsert-call doen');
  }
  // push: succesvolle upsert.
  {
    const client = fakeClient();
    const adapter = api.createCloudAdapter(client);
    const r = await adapter.push('customers', [{ id: 'a' }]);
    assert.equal(r.ok, true);
    assert.equal(client.calls.upsert[0].table, 'customers');
  }
  // push: fout van Supabase wordt doorgegeven, niet verborgen.
  {
    const client = fakeClient({ upsertError: new Error('network') });
    const adapter = api.createCloudAdapter(client);
    const r = await adapter.push('projects', [{ id: 'a' }]);
    assert.equal(r.ok, false);
    assert(r.error);
  }
  // pullAll: geeft rijen terug, of een lege waarde + ok:false bij een fout (nooit een crash).
  {
    const client = fakeClient({ selectRows: [{ id: 'x' }] });
    const adapter = api.createCloudAdapter(client);
    const r = await adapter.pullAll('projects');
    assert.equal(r.ok, true);
    assert.deepEqual(r.value, [{ id: 'x' }]);
  }
  {
    const client = fakeClient({ selectError: new Error('down') });
    const adapter = api.createCloudAdapter(client);
    const r = await adapter.pullAll('projects');
    assert.equal(r.ok, false);
    assert.deepEqual(r.value, []);
  }
  // remove: roept delete().eq('id',id) aan op de juiste tabel.
  {
    const client = fakeClient();
    const adapter = api.createCloudAdapter(client);
    const r = await adapter.remove('customers', 'c1');
    assert.equal(r.ok, true);
    assert.deepEqual(client.calls.delete[0], { table: 'customers', col: 'id', id: 'c1' });
  }

  // --- mergeProjectRows: cloud wint alleen als het echt nieuwer is; lokaal blijft leidend bij gelijke/oudere cloudrij. ---
  {
    const local = [{ id: 'p1', datum: '2026-09-10T00:00:00.000Z', project: 'oud' }];
    const cloud = [{ data: { id: 'p1', datum: '2026-09-15T00:00:00.000Z', project: 'nieuw' }, updated_at: '2026-09-15T00:00:00.000Z' }];
    const merged = api.mergeProjectRows(local, cloud);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].project, 'nieuw', 'nieuwere cloudversie moet de oudere lokale versie vervangen');
  }
  {
    const local = [{ id: 'p1', datum: '2026-09-15T00:00:00.000Z', project: 'lokaal-nieuwer' }];
    const cloud = [{ data: { id: 'p1', datum: '2026-09-10T00:00:00.000Z', project: 'cloud-ouder' }, updated_at: '2026-09-10T00:00:00.000Z' }];
    const merged = api.mergeProjectRows(local, cloud);
    assert.equal(merged[0].project, 'lokaal-nieuwer', 'een oudere cloudrij mag een nieuwere lokale rij niet overschrijven');
  }
  {
    // Alleen-lokaal (nog nooit gesynchroniseerd) en alleen-cloud (ander apparaat) blijven allebei behouden.
    const local = [{ id: 'only-local', datum: '2026-09-01T00:00:00.000Z' }];
    const cloud = [{ data: { id: 'only-cloud', datum: '2026-09-01T00:00:00.000Z' }, updated_at: '2026-09-01T00:00:00.000Z' }];
    const merged = api.mergeProjectRows(local, cloud);
    assert.equal(merged.length, 2);
    assert(merged.some(x => x.id === 'only-local') && merged.some(x => x.id === 'only-cloud'));
  }

  // --- mergeCustomerRows: cloudrij vult/overschrijft op id, geen duplicaten. ---
  {
    const local = [{ id: 'c1', name: 'Oud' }];
    const cloud = [{ id: 'c1', name: 'Nieuw', contact: 'Piet' }, { id: 'c2', name: 'Tweede' }];
    const merged = api.mergeCustomerRows(local, cloud);
    assert.equal(merged.length, 2);
    assert.equal(merged.find(c => c.id === 'c1').name, 'Nieuw');
  }

  // --- mergeSettingsValues: cloud vult alleen ontbrekende (null) lokale waarden aan, overschrijft nooit een bestaande lokale keuze. ---
  {
    const local = { theme: null, vat: 21 };
    const cloud = { theme: 'dark', vat: 9 };
    const merged = api.mergeSettingsValues(local, cloud);
    assert.equal(merged.theme, 'dark', 'ontbrekende lokale instelling wordt aangevuld vanuit de cloud');
    assert.equal(merged.vat, 21, 'een bestaande lokale instelling mag niet stilzwijgend overschreven worden');
  }
  {
    const merged = api.mergeSettingsValues({ theme: null }, null);
    assert.equal(merged.theme, null, 'geen cloudrij (nog nooit gesynchroniseerd) mag niet crashen');
  }

  console.log('cloud-adapter: push/pull/remove en merge-logica (projecten, klanten, instellingen) geslaagd');
})().catch(e => { console.error(e); process.exit(1); });
