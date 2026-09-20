/* Web Worker: laadt occt-import-js (OpenCascade WASM) lazy vanaf jsdelivr, pas zodra de
   gebruiker een STEP toevoegt, en leest het bestand in tot getrianguleerde meshes. Blokkeert
   nooit de UI-thread (dat is precies waarom dit een worker is). Time-out 60s.

   ONGEVERIFIEERD: dit bestand kon in deze sessie niet tegen de echte occt-import-js-runtime en
   een echt STEP-bestand getest worden (geen Chromium-testrunner, geen betrouwbare manier om een
   geldig ISO 10303-21-bestand met de hand te schrijven — zie step/README.md). De API-vorm hier
   (occtimportjs()/ReadStepFile()/result.meshes[].attributes.position.array) is naar beste weten
   gebaseerd op de gepubliceerde occt-import-js-documentatie, maar moet ná deze sessie eenmalig
   tegen een echt bestand in een echte browser geverifieerd worden vóór productiegebruik. */

const OCCT_IMPORT_JS_URL = 'https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/occt-import-js.js';
let occtPromise = null;

function loadOcct() {
  if (occtPromise) return occtPromise;
  occtPromise = new Promise((resolve, reject) => {
    try {
      importScripts(OCCT_IMPORT_JS_URL);
      // eslint-disable-next-line no-undef
      occtimportjs({ locateFile: f => 'https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/' + f })
        .then(resolve).catch(reject);
    } catch (e) { reject(e); }
  });
  return occtPromise;
}

self.onmessage = async (event) => {
  const { id, buffer, fileName } = event.data;
  const timeout = setTimeout(() => {
    self.postMessage({ id, ok: false, error: 'Inlezen duurde langer dan 60 seconden en is afgebroken.' });
  }, 60000);
  try {
    const occt = await loadOcct();
    const result = occt.ReadStepFile(new Uint8Array(buffer), null);
    clearTimeout(timeout);
    if (!result || !result.success) { self.postMessage({ id, ok: false, error: 'Dit STEP-bestand kon niet worden gelezen. Controleer of het bestand niet beschadigd is.' }); return; }
    const meshes = (result.meshes || []).map(m => ({
      name: m.name || fileName,
      positions: m.attributes && m.attributes.position ? Array.from(m.attributes.position.array) : [],
      indices: m.index ? Array.from(m.index.array) : null,
      instances: 1
    }));
    self.postMessage({ id, ok: true, meshes, unit: result.unit || 'mm' }, []);
  } catch (e) {
    clearTimeout(timeout);
    self.postMessage({ id, ok: false, error: 'Kon niet verbinden om occt-import-js te laden, of het bestand is geen geldig STEP-bestand. Vereist internetverbinding bij de eerste keer laden.' });
  }
};
