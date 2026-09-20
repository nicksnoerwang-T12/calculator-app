/* Sjabloon-engine voor de snelprijs-funnel: data, geen UI. Elk sjabloon is
   { id, group, name, icon, params[], build(p, ctx) }. build() is een pure functie:
   params -> { materials:[...], work:[...], confidence }. Materiaalregels volgen exact het
   contract uit intake/README.md ("Materiaalregel-contract"); werkregels het contract van
   jobs.js (name, category, quantity, unit, rate).
   ctx = { uid, hourlyRate, montageRate, voorrijkosten, poedercoatM2 } — wordt door de
   aanroeper samengesteld (leest instellingen/costState), build() zelf leest nooit globale
   state, zodat elk sjabloon geïsoleerd getest kan worden.
   Vuistregel, geen sterkteberekening: profielkeuzes zijn praktijkschattingen voor een
   snelle indicatie, geen constructieve dimensionering. Dat staat ook letterlijk in de
   gegenereerde regel-notities bij draagbalk/kolom-balk-frame.

   Materiaalsoort en profielmaat (koker-/buis-/staf-/hoeklijngrootte) zijn per sjabloon
   kiesbaar (zie materialChoice/sizeChoice hieronder) — géén stille aanname meer, wél nog
   steeds "altijd een prijs": bestaat er een exacte catalogusmatch voor de gekozen combinatie
   (CATALOG_ARTICLES, al gevuld door de kernrekenmodule), dan krijgt de regel een echte
   leveranciersprijs; ontbreekt die, dan valt de regel terug op de bestaande algemene
   €/kg-vuistregel met precies de gekozen afmeting (zie sizedBar). */

function mat(ctx, line) {
  return Object.assign({
    id: ctx.uid(), countMode: 'project', priceBasis: 'kg', priceMode: 'catalog',
    priceOrigin: 'catalog', waste: 5, source: 'template'
  }, line);
}
function work(ctx, entry) {
  return Object.assign({ id: ctx.uid(), unit: 'uur', category: 'Fabricage' }, entry);
}
function voorrijden(ctx) {
  return work(ctx, { name: 'Voorrijden', quantity: 1, rate: ctx.voorrijkosten, unit: 'rit', category: 'Reis & vervoer' });
}
function montage(ctx, uren, name) {
  return work(ctx, { name: name || 'Montage', quantity: Math.max(0.25, uren), rate: ctx.montageRate, category: 'Montage' });
}
function lassen(ctx, uren, name) {
  return work(ctx, { name: name || 'Lassen', quantity: Math.max(0.1, uren), rate: ctx.hourlyRate, category: 'Fabricage' });
}
function poedercoat(ctx, m2, name) {
  return work(ctx, { name: name || 'Poedercoating', quantity: Math.max(0.1, m2), rate: ctx.poedercoatM2, unit: 'm²', category: 'Uitbesteding' });
}
// Rechthoekige balk/profiel in meterprijs; lengte in mm.
// priceBasis 'kg': geen catalogArticleId/catalogSize gekoppeld, dus resolvePrice() valt terug
// op het algemene €/kg-tarief per materiaalsoort (altijd beschikbaar) in plaats van een
// meterprijs die alleen bestaat bij een exacte of familie-catalogusmatch. Dat is precies wat
// de funnel nodig heeft: altijd een prijs, ook zonder catalogusmatch.
function bar(ctx, profile, material, count, lengthMm, dims, note) {
  return mat(ctx, { profile, material, count, dims: Object.assign({ length: lengthMm }, dims), priceBasis: 'kg', note });
}
function plateLine(ctx, material, lengthMm, widthMm, tMm, note) {
  return mat(ctx, { profile: 'plate', material, count: 1, dims: { length: lengthMm, width: widthMm, t: tMm }, priceBasis: 'kg', note });
}
function hardware(ctx, description, note) {
  return mat(ctx, {
    profile: 'purchasedItem', description, count: 1, priceBasis: 'piece', priceMode: 'manual',
    priceOrigin: 'user', unitPrice: '', waste: 0, note: note || 'Prijs op aanvraag — eigen prijs invullen.'
  });
}
// Rule-of-thumb overspanning -> profielhoogte (span/20), afgerond naar de dichtstbijzijnde
// beschikbare IPE/HEA-maat. Geen sterkteberekening; altijd door een constructeur te laten
// controleren, zie de notitie op de gegenereerde regel.
function beamSize(sections, spanMm) {
  const target = spanMm / 20;
  const cols = sections.cols;
  let best = cols[0];
  for (const c of cols) if (Math.abs(c - target) < Math.abs(best - target)) best = c;
  return { size: String(best), kgm: sections.d[best][7] };
}

/* ---------- Materiaalsoort + profielmaat: kiesbaar per sjabloon ---------- */

// Vaste maatvoeringkeuzes per profielvorm — gebaseerd op de daadwerkelijke leverancierscatalogus
// (CATALOG_ARTICLES, S235-reeks als basis) aangevuld met een paar veelgebruikte maten die daar
// niet in staan (die vallen dan terug op de algemene €/kg-vuistregel, zie sizedBar hieronder —
// geen fabricage van een prijs die er niet is, alleen een geometrisch geldige keuze).
const STD_SIZES = {
  rectTube: [[30, 20, 2], [40, 20, 2], [40, 20, 3], [50, 25, 2], [50, 30, 2], [50, 30, 3], [60, 40, 2], [60, 40, 3], [60, 40, 4], [80, 40, 4], [100, 50, 3], [100, 50, 4]],
  squareTube: [[20, 2], [25, 2], [30, 2], [30, 3], [40, 2], [40, 3], [40, 4], [50, 3], [60, 3], [80, 4], [100, 5]],
  roundTube: [[17.2, 1.8], [21.3, 2], [26.9, 2.35], [33.7, 2.65], [42.4, 2.65], [48.3, 2.9], [60.3, 2.9], [76.1, 3.25]],
  equalAngle: [[40, 4], [50, 5], [60, 6], [80, 8], [100, 10]],
  squareBar: [[10], [12], [14], [16], [20]]
};
function sizeLabels(profile) { return STD_SIZES[profile].map(v => v.join('×')); }
// Vertaalt een gekozen maatlabel terug naar een dims-object via de vaste veldvolgorde van het
// profiel zelf (PROFILES[profile].fields, zonder 'length') — elk profiel definieert zijn
// veldvolgorde dus maar één keer, hier wordt hij hergebruikt in plaats van herhaald.
function dimsFromLabel(profile, label) {
  const keys = PROFILES[profile].fields.map(f => f.key).filter(k => k !== 'length');
  const nums = String(label).split('×').map(s => parseFloat(s));
  const dims = {};
  keys.forEach((k, i) => dims[k] = nums[i]);
  return dims;
}
// Exacte catalogusmatch zoeken voor de gekozen combinatie profiel + materiaal + afmeting.
function findCatalogArticle(profile, material, dims) {
  return CATALOG_ARTICLES.find(a => a.profileType === profile && a.material === material &&
    Object.keys(dims).every(k => Math.abs((a.dimensionsMm[k] ?? NaN) - dims[k]) < 0.01)) || null;
}
// Materiaalregel met een door de gebruiker gekozen maat + materiaal. Bestaat er een exacte
// catalogusmatch, dan krijgt de regel een echte leveranciersprijs (bron "Catalogusrichtprijs")
// in plaats van de algemene €/kg-vuistregel — precies wat een prijsopbouw "ter controle" nodig
// heeft. Ontbreekt de match, dan blijft de regel gewoon op de vuistregel, met exact de gekozen
// afmeting (geen stille aanname meer, wél nog steeds altijd een prijs).
function sizedBar(ctx, profile, material, count, lengthMm, dims, note) {
  const line = bar(ctx, profile, material, count, lengthMm, dims, note);
  const article = findCatalogArticle(profile, material, dims);
  if (article) Object.assign(line, {
    catalogArticleId: article.id, priceBasis: article.price.basis === 'wholePlate' ? 'wholePlate' : article.price.basis,
    priceMode: 'catalog', priceOrigin: 'catalog', supplierKgm: article.supplierWeightKgPerM ?? undefined
  });
  return line;
}
function materialChoice(defaultMaterial) {
  return { id: 'material', label: 'Materiaalsoort', type: 'choice', options: ['s235', 's355', 'rvs304', 'rvs316', 'alu'], default: defaultMaterial || 's235' };
}
function sizeChoice(id, label, profile, defaultDims) {
  return { id, label, type: 'choice', options: sizeLabels(profile), default: defaultDims.join('×'), profile };
}
// Kaderprofiel voor poorten/deuren: één vlakke keuzelijst die koker- én hoeklijnmaten samen
// aanbiedt (voorkomt een los "profielvorm"-veld waarvan de opties van weer een ander veld
// zouden moeten afhangen — de funnel kent alleen statische keuzelijsten). "Koker" met 2 getallen
// is een vierkante koker (squareTube), met 3 getallen een rechthoekige koker (rectTube);
// "Hoeklijn" is altijd gelijkzijdig (equalAngle).
function parseFramedChoice(value) {
  const [kind, sizeLabel] = String(value).split(' ');
  const numCount = sizeLabel.split('×').length;
  const profile = kind === 'Hoeklijn' ? 'equalAngle' : (numCount === 3 ? 'rectTube' : 'squareTube');
  return { profile, dims: dimsFromLabel(profile, sizeLabel) };
}
function framedChoice(id, label, options, defaultValue) {
  return { id, label, type: 'choice', options, default: defaultValue };
}

const TEMPLATES = [
{
  id: 'hekwerk-spijlen', group: 'Hekwerk / balustrade / leuning', name: 'Spijlenhekwerk', icon: 'fence',
  params: [
    { id: 'length', label: 'Lengte', unit: 'm', type: 'number', min: 0.5, max: 100, step: 0.5, default: 3 },
    { id: 'height', label: 'Hoogte', unit: 'mm', type: 'number', min: 600, max: 2000, step: 50, default: 1000 },
    { id: 'spacing', label: 'Spijlafstand', unit: 'mm', type: 'number', min: 80, max: 150, step: 5, default: 110 },
    materialChoice('s235'),
    sizeChoice('railSize', 'Regelmaat (boven/onder)', 'rectTube', [40, 20, 2]),
    sizeChoice('spindleSize', 'Spijlmaat', 'squareBar', [12]),
    { id: 'finish', label: 'Afwerking', type: 'choice', options: ['Blank', 'Gemenied', 'Verzinkt', 'Gepoedercoat'], default: 'Gepoedercoat' },
    { id: 'mount', label: 'Montage door ons', type: 'boolean', default: true }
  ],
  build(p, ctx) {
    const lengthMm = p.length * 1000, spindles = Math.ceil(lengthMm / p.spacing) + 1;
    const railDims = dimsFromLabel('rectTube', p.railSize), spindleDims = dimsFromLabel('squareBar', p.spindleSize);
    const materials = [
      sizedBar(ctx, 'rectTube', p.material, 2, lengthMm, railDims, 'Boven- en onderregel'),
      sizedBar(ctx, 'squareBar', p.material, spindles, p.height, spindleDims, 'Spijlen, ' + p.finish.toLowerCase())
    ];
    const w = [lassen(ctx, spindles * 2 * 0.08, 'Lassen spijlen'), voorrijden(ctx)];
    if (p.mount) w.push(montage(ctx, p.length * 0.35));
    if (p.finish === 'Gepoedercoat') w.push(poedercoat(ctx, p.length * (p.height / 1000)));
    return { materials, work: w, confidence: 'indicatie' };
  }
},
{
  id: 'balustrade-handregel', group: 'Hekwerk / balustrade / leuning', name: 'Balustrade met handregel', icon: 'fence',
  params: [
    { id: 'length', label: 'Lengte', unit: 'm', type: 'number', min: 0.5, max: 50, step: 0.5, default: 4 },
    { id: 'height', label: 'Hoogte', unit: 'mm', type: 'number', min: 900, max: 1200, step: 50, default: 1000 },
    { id: 'postSpacing', label: 'Stijlafstand', unit: 'mm', type: 'number', min: 500, max: 2000, step: 100, default: 1200 },
    materialChoice('s235'),
    sizeChoice('tubeSize', 'Buismaat (handregel + stijlen)', 'roundTube', [42.4, 2]),
    sizeChoice('infillSize', 'Tussenregelmaat', 'squareTube', [20, 2]),
    { id: 'finish', label: 'Afwerking', type: 'choice', options: ['Blank', 'Gemenied', 'Verzinkt', 'Gepoedercoat'], default: 'Gepoedercoat' },
    { id: 'mount', label: 'Montage door ons', type: 'boolean', default: true }
  ],
  build(p, ctx) {
    const lengthMm = p.length * 1000, posts = Math.ceil(lengthMm / p.postSpacing) + 1;
    const tubeDims = dimsFromLabel('roundTube', p.tubeSize), infillDims = dimsFromLabel('squareTube', p.infillSize);
    const materials = [
      sizedBar(ctx, 'roundTube', p.material, 1, lengthMm, tubeDims, 'Handregel'),
      sizedBar(ctx, 'roundTube', p.material, posts, p.height, tubeDims, 'Stijlen'),
      sizedBar(ctx, 'squareTube', p.material, 2, lengthMm, infillDims, 'Tussenregels vulling')
    ];
    const w = [lassen(ctx, posts * 2 * 0.1), voorrijden(ctx)];
    if (p.mount) w.push(montage(ctx, p.length * 0.4));
    if (p.finish === 'Gepoedercoat') w.push(poedercoat(ctx, p.length * (p.height / 1000)));
    return { materials, work: w, confidence: 'indicatie' };
  }
},
{
  id: 'trapleuning', group: 'Hekwerk / balustrade / leuning', name: 'Trapleuning', icon: 'fence',
  params: [
    { id: 'length', label: 'Lengte (horizontaal)', unit: 'm', type: 'number', min: 0.5, max: 20, step: 0.5, default: 3 },
    { id: 'height', label: 'Hoogte boven trede', unit: 'mm', type: 'number', min: 900, max: 1100, step: 50, default: 1000 },
    { id: 'angle', label: 'Hellingshoek trap', unit: '°', type: 'number', min: 0, max: 45, step: 5, default: 30 },
    materialChoice('s235'),
    sizeChoice('railSize', 'Leuningbuismaat', 'roundTube', [42.4, 2]),
    sizeChoice('postSize', 'Stijlbuismaat', 'roundTube', [33.7, 2]),
    { id: 'finish', label: 'Afwerking', type: 'choice', options: ['Blank', 'Gemenied', 'Verzinkt', 'Gepoedercoat'], default: 'Gepoedercoat' },
    { id: 'mount', label: 'Montage door ons', type: 'boolean', default: true }
  ],
  build(p, ctx) {
    const railMm = Math.round(p.length * 1000 / Math.cos(p.angle * Math.PI / 180));
    const posts = Math.ceil(p.length * 1000 / 900) + 1;
    const railDims = dimsFromLabel('roundTube', p.railSize), postDims = dimsFromLabel('roundTube', p.postSize);
    const materials = [
      sizedBar(ctx, 'roundTube', p.material, 1, railMm, railDims, 'Trapleuning, schuin gemeten'),
      sizedBar(ctx, 'roundTube', p.material, posts, p.height, postDims, 'Stijlen op trede')
    ];
    const w = [lassen(ctx, posts * 2 * 0.1), voorrijden(ctx)];
    if (p.mount) w.push(montage(ctx, p.length * 0.5, 'Montage (trap, extra tijd)'));
    if (p.finish === 'Gepoedercoat') w.push(poedercoat(ctx, p.length * (p.height / 1000)));
    return { materials, work: w, confidence: 'indicatie' };
  }
},
{
  id: 'trap-recht', group: 'Trap / bordes / platform', name: 'Rechte steektrap', icon: 'weight',
  params: [
    { id: 'rise', label: 'Te overbruggen hoogte', unit: 'mm', type: 'number', min: 500, max: 4000, step: 50, default: 2500 },
    { id: 'width', label: 'Breedte', unit: 'mm', type: 'number', min: 600, max: 1200, step: 50, default: 900 },
    materialChoice('s235'),
    sizeChoice('stringerSize', 'Boomstukmaat (stringers)', 'rectTube', [100, 50, 4]),
    { id: 'treadThickness', label: 'Plaatdikte treden', unit: 'mm', type: 'choice', options: ['4', '5', '6', '8'], default: '5' },
    { id: 'finish', label: 'Afwerking', type: 'choice', options: ['Blank', 'Gemenied', 'Verzinkt', 'Gepoedercoat'], default: 'Blank' },
    { id: 'mount', label: 'Montage door ons', type: 'boolean', default: true }
  ],
  build(p, ctx) {
    const treads = Math.max(2, Math.round(p.rise / 180));
    const run = treads * 250;
    const stringerLen = Math.round(Math.sqrt(p.rise * p.rise + run * run));
    const stringerDims = dimsFromLabel('rectTube', p.stringerSize);
    const materials = [
      sizedBar(ctx, 'rectTube', p.material, 2, stringerLen, stringerDims, 'Boomstukken (stringers), vuistregel 180 mm stapafstand'),
      plateLine(ctx, p.material, p.width, 250, parseFloat(p.treadThickness), 'Treden, ' + treads + ' stuks (traanplaat)')
    ];
    materials[1].count = treads;
    const w = [lassen(ctx, treads * 0.3), voorrijden(ctx)];
    if (p.mount) w.push(montage(ctx, p.rise / 1000 * 0.6));
    if (p.finish === 'Gepoedercoat') w.push(poedercoat(ctx, (stringerLen / 1000) * (p.width / 1000) * 0.6));
    return { materials, work: w, confidence: 'indicatie' };
  }
},
{
  id: 'bordes-leuning', group: 'Trap / bordes / platform', name: 'Bordes met leuning', icon: 'weight',
  params: [
    { id: 'width', label: 'Breedte', unit: 'mm', type: 'number', min: 600, max: 2000, step: 50, default: 1000 },
    { id: 'depth', label: 'Diepte', unit: 'mm', type: 'number', min: 600, max: 2000, step: 50, default: 1000 },
    { id: 'height', label: 'Hoogte boven vloer', unit: 'mm', type: 'number', min: 300, max: 2000, step: 50, default: 900 },
    materialChoice('s235'),
    sizeChoice('frameSize', 'Draagframemaat', 'rectTube', [60, 40, 3]),
    sizeChoice('legSize', 'Pootmaat', 'squareTube', [60, 3]),
    { id: 'deckThickness', label: 'Plaatdikte bordes', unit: 'mm', type: 'choice', options: ['3', '4', '5', '6'], default: '4' },
    { id: 'railing', label: 'Leuning rondom', type: 'boolean', default: true },
    { id: 'mount', label: 'Montage door ons', type: 'boolean', default: true }
  ],
  build(p, ctx) {
    const frameDims = dimsFromLabel('rectTube', p.frameSize), legDims = dimsFromLabel('squareTube', p.legSize);
    const materials = [
      sizedBar(ctx, 'rectTube', p.material, 2, p.width, frameDims, 'Draagframe, breedterichting'),
      sizedBar(ctx, 'rectTube', p.material, 2, p.depth, frameDims, 'Draagframe, dieprichting'),
      sizedBar(ctx, 'squareTube', p.material, 4, p.height, legDims, 'Poten'),
      plateLine(ctx, p.material, p.depth, p.width, parseFloat(p.deckThickness), 'Bordesplaat')
    ];
    const w = [lassen(ctx, 8 * 0.15), voorrijden(ctx)];
    if (p.railing) {
      materials.push(sizedBar(ctx, 'roundTube', p.material, 1, Math.round((p.width + p.depth) * 2 * 0.7), { D: 42.4, t: 2 }, 'Leuning, ca. 3 zijden'));
      materials.push(sizedBar(ctx, 'roundTube', p.material, 6, 1000, { D: 33.7, t: 2 }, 'Leuningstijlen'));
      w.push(lassen(ctx, 6 * 2 * 0.1, 'Lassen leuning'));
    }
    if (p.mount) w.push(montage(ctx, (p.width / 1000) * (p.depth / 1000) * 0.8));
    return { materials, work: w, confidence: 'indicatie' };
  }
},
{
  id: 'draagbalk', group: 'Frame / constructie / draagbalk', name: 'Draagbalk (IPE/HEA op overspanning)', icon: 'weight',
  params: [
    { id: 'span', label: 'Overspanning', unit: 'm', type: 'number', min: 1, max: 15, step: 0.25, default: 4 },
    { id: 'family', label: 'Profielfamilie', type: 'choice', options: ['IPE', 'HEA'], default: 'IPE' },
    materialChoice('s235'),
    { id: 'heightOverride', label: 'Profielhoogte (optioneel, anders vuistregel span/20)', unit: 'mm', type: 'choice',
      options: ['Automatisch'].concat([80, 100, 120, 140, 160, 180, 200, 220, 240, 270, 300, 330, 360, 400, 450, 500, 550, 600].map(String)), default: 'Automatisch' },
    { id: 'count', label: 'Aantal balken', type: 'number', min: 1, max: 6, step: 1, default: 1 },
    { id: 'mount', label: 'Hijsen/monteren door ons', type: 'boolean', default: true }
  ],
  build(p, ctx) {
    const spanMm = p.span * 1000, sections = ctx.sections[p.family];
    let choice, override = p.heightOverride && p.heightOverride !== 'Automatisch';
    if (override) {
      const wanted = Number(p.heightOverride);
      const nearest = sections.cols.reduce((best, c) => Math.abs(c - wanted) < Math.abs(best - wanted) ? c : best, sections.cols[0]);
      choice = { size: String(nearest), kgm: sections.d[nearest][7] };
    } else {
      choice = beamSize(sections, spanMm);
    }
    const materials = [Object.assign(mat(ctx, {
      profile: p.family, material: p.material, count: p.count, dims: { length: spanMm },
      catalogSize: choice.size, priceBasis: 'kg',
      note: p.family + ' ' + choice.size + (override ? ' — handmatig gekozen' : ' — vuistregel (overspanning/20)') + ', geen sterkteberekening. Laat een constructeur dit controleren vóór uitvoering.'
    }))];
    const w = [voorrijden(ctx)];
    if (p.mount) w.push(work(ctx, { name: 'Hijsen en monteren', quantity: Math.max(0.5, p.count * p.span * 0.25), rate: ctx.montageRate, category: 'Montage' }));
    return { materials, work: w, confidence: 'indicatie' };
  }
},
{
  id: 'kolom-balk-frame', group: 'Frame / constructie / draagbalk', name: 'Kolom-balk frame', icon: 'weight',
  params: [
    { id: 'width', label: 'Breedte', unit: 'm', type: 'number', min: 1, max: 10, step: 0.5, default: 4 },
    { id: 'depth', label: 'Diepte', unit: 'm', type: 'number', min: 1, max: 10, step: 0.5, default: 4 },
    { id: 'height', label: 'Hoogte', unit: 'm', type: 'number', min: 2, max: 6, step: 0.25, default: 3 },
    materialChoice('s235'),
    sizeChoice('columnSize', 'Kolommaat', 'squareTube', [100, 5]),
    sizeChoice('memberSize', 'Balkmaat (breedte + diepte)', 'rectTube', [100, 50, 4]),
    { id: 'mount', label: 'Montage door ons', type: 'boolean', default: true }
  ],
  build(p, ctx) {
    const columnDims = dimsFromLabel('squareTube', p.columnSize), beamDims = dimsFromLabel('rectTube', p.memberSize);
    const materials = [
      sizedBar(ctx, 'squareTube', p.material, 4, p.height * 1000, columnDims, 'Kolommen'),
      sizedBar(ctx, 'rectTube', p.material, 2, p.width * 1000, beamDims, 'Balken, breedterichting — vuistregel, geen sterkteberekening'),
      sizedBar(ctx, 'rectTube', p.material, 2, p.depth * 1000, beamDims, 'Balken, dieprichting — vuistregel, geen sterkteberekening')
    ];
    const w = [lassen(ctx, 8 * 0.4), voorrijden(ctx)];
    if (p.mount) w.push(montage(ctx, p.width * p.depth * 0.5));
    return { materials, work: w, confidence: 'indicatie' };
  }
},
{
  id: 'werktafel-frame', group: 'Frame / constructie / draagbalk', name: 'Werktafel/frame', icon: 'weight',
  params: [
    { id: 'width', label: 'Breedte', unit: 'mm', type: 'number', min: 400, max: 3000, step: 50, default: 1200 },
    { id: 'depth', label: 'Diepte', unit: 'mm', type: 'number', min: 400, max: 1500, step: 50, default: 700 },
    { id: 'height', label: 'Hoogte', unit: 'mm', type: 'number', min: 600, max: 1000, step: 10, default: 850 },
    materialChoice('s235'),
    sizeChoice('legSize', 'Pootmaat', 'squareTube', [40, 3]),
    sizeChoice('frameSize', 'Onderframemaat', 'rectTube', [30, 20, 2]),
    { id: 'top', label: 'Blad', type: 'choice', options: ['Geen blad', 'Plaatstaal', 'Multiplex'], default: 'Plaatstaal' },
    { id: 'topThickness', label: 'Bladdikte (bij plaatstaal)', unit: 'mm', type: 'choice', options: ['2', '3', '4'], default: '3' }
  ],
  build(p, ctx) {
    const legDims = dimsFromLabel('squareTube', p.legSize), frameDims = dimsFromLabel('rectTube', p.frameSize);
    const materials = [
      sizedBar(ctx, 'squareTube', p.material, 4, p.height, legDims, 'Poten'),
      sizedBar(ctx, 'rectTube', p.material, 2, p.width, frameDims, 'Onderframe, breedterichting'),
      sizedBar(ctx, 'rectTube', p.material, 2, p.depth, frameDims, 'Onderframe, dieprichting')
    ];
    if (p.top === 'Plaatstaal') materials.push(plateLine(ctx, p.material, p.depth, p.width, parseFloat(p.topThickness), 'Werkblad'));
    if (p.top === 'Multiplex') materials.push(hardware(ctx, 'Multiplex werkblad ' + p.width + '×' + p.depth + ' mm', 'Inkoop, geen eigen staalproductie.'));
    const w = [lassen(ctx, 8 * 0.12), voorrijden(ctx)];
    return { materials, work: w, confidence: 'indicatie' };
  }
},
{
  id: 'draaipoort', group: 'Poort / deur / afscheiding', name: 'Draaipoort', icon: 'fence',
  params: [
    { id: 'width', label: 'Doorgangsbreedte', unit: 'mm', type: 'number', min: 1000, max: 6000, step: 100, default: 3000 },
    { id: 'height', label: 'Hoogte', unit: 'mm', type: 'number', min: 800, max: 2000, step: 50, default: 1500 },
    { id: 'leaves', label: 'Uitvoering', type: 'choice', options: ['Enkel', 'Dubbel'], default: 'Enkel' },
    materialChoice('s235'),
    framedChoice('kaderProfile', 'Kaderprofiel', ['Koker 40×3', 'Koker 40×4', 'Koker 50×3', 'Hoeklijn 40×4', 'Hoeklijn 50×5', 'Hoeklijn 60×6'], 'Koker 40×3'),
    sizeChoice('spindleSize', 'Vulling (spijlmaat)', 'squareBar', [12]),
    { id: 'finish', label: 'Afwerking', type: 'choice', options: ['Blank', 'Gemenied', 'Verzinkt', 'Gepoedercoat'], default: 'Gepoedercoat' },
    { id: 'mount', label: 'Montage door ons', type: 'boolean', default: true }
  ],
  build(p, ctx) {
    const leafCount = p.leaves === 'Dubbel' ? 2 : 1, leafWidth = p.width / leafCount;
    const spindles = (Math.ceil(leafWidth / 110) + 1) * leafCount;
    const kader = parseFramedChoice(p.kaderProfile), spindleDims = dimsFromLabel('squareBar', p.spindleSize);
    const materials = [
      sizedBar(ctx, kader.profile, p.material, 2 * leafCount, leafWidth, kader.dims, 'Kader, boven/onder per vleugel'),
      sizedBar(ctx, kader.profile, p.material, 2 * leafCount, p.height, kader.dims, 'Kader, stijlen per vleugel'),
      sizedBar(ctx, 'squareBar', p.material, spindles, p.height - 80, spindleDims, 'Vulling'),
      hardware(ctx, 'Scharnieren en slot')
    ];
    const w = [lassen(ctx, (4 * leafCount) * 0.15 + spindles * 0.06), voorrijden(ctx)];
    if (p.mount) w.push(montage(ctx, 2 + p.width / 1000 * 0.3));
    if (p.finish === 'Gepoedercoat') w.push(poedercoat(ctx, (p.width / 1000) * (p.height / 1000)));
    return { materials, work: w, confidence: 'indicatie' };
  }
},
{
  id: 'schuifpoort', group: 'Poort / deur / afscheiding', name: 'Schuifpoort', icon: 'fence',
  params: [
    { id: 'width', label: 'Doorgangsbreedte', unit: 'mm', type: 'number', min: 1500, max: 8000, step: 100, default: 4000 },
    { id: 'height', label: 'Hoogte', unit: 'mm', type: 'number', min: 1000, max: 2000, step: 50, default: 1500 },
    materialChoice('s235'),
    framedChoice('kaderProfile', 'Kaderprofiel', ['Koker 60×40×3', 'Koker 60×40×4', 'Koker 80×40×4', 'Hoeklijn 50×50×5', 'Hoeklijn 60×60×6', 'Hoeklijn 80×80×8'], 'Koker 60×40×3'),
    sizeChoice('spindleSize', 'Vulling (spijlmaat)', 'squareBar', [12]),
    { id: 'finish', label: 'Afwerking', type: 'choice', options: ['Blank', 'Gemenied', 'Verzinkt', 'Gepoedercoat'], default: 'Gepoedercoat' },
    { id: 'mount', label: 'Montage door ons', type: 'boolean', default: true }
  ],
  build(p, ctx) {
    const spindles = Math.ceil(p.width / 110) + 1;
    const kader = parseFramedChoice(p.kaderProfile), spindleDims = dimsFromLabel('squareBar', p.spindleSize);
    const materials = [
      sizedBar(ctx, kader.profile, p.material, 2, p.width * 1.15, kader.dims, 'Kader boven/onder, +15% overlap voor rijrail'),
      sizedBar(ctx, kader.profile, p.material, 2, p.height, kader.dims, 'Kader stijlen'),
      sizedBar(ctx, 'squareBar', p.material, spindles, p.height - 80, spindleDims, 'Vulling'),
      hardware(ctx, 'Rijrail en loopwielen')
    ];
    const w = [lassen(ctx, 4 * 0.2 + spindles * 0.06), voorrijden(ctx)];
    if (p.mount) w.push(montage(ctx, 2 + p.width / 1000 * 0.5, 'Montage (rail ingraven/bevestigen)'));
    if (p.finish === 'Gepoedercoat') w.push(poedercoat(ctx, (p.width / 1000) * (p.height / 1000)));
    return { materials, work: w, confidence: 'indicatie' };
  }
},
{
  id: 'stalen-deur', group: 'Poort / deur / afscheiding', name: 'Stalen deur/kozijn', icon: 'fence',
  params: [
    { id: 'width', label: 'Breedte', unit: 'mm', type: 'number', min: 700, max: 1200, step: 10, default: 900 },
    { id: 'height', label: 'Hoogte', unit: 'mm', type: 'number', min: 1900, max: 2400, step: 10, default: 2100 },
    materialChoice('s235'),
    framedChoice('kaderProfile', 'Kozijnprofiel', ['Koker 40×3', 'Koker 40×4', 'Koker 50×3', 'Hoeklijn 40×4', 'Hoeklijn 50×5'], 'Koker 40×3'),
    { id: 'frameOnly', label: 'Alleen kozijn (geen deurblad)', type: 'boolean', default: false },
    { id: 'doorThickness', label: 'Plaatdikte deurblad', unit: 'mm', type: 'choice', options: ['1.5', '2', '3'], default: '2' },
    { id: 'finish', label: 'Afwerking', type: 'choice', options: ['Blank', 'Gemenied', 'Verzinkt', 'Gepoedercoat'], default: 'Gepoedercoat' },
    { id: 'mount', label: 'Montage door ons', type: 'boolean', default: true }
  ],
  build(p, ctx) {
    const kader = parseFramedChoice(p.kaderProfile);
    const materials = [
      sizedBar(ctx, kader.profile, p.material, 2, p.width, kader.dims, 'Kozijn, boven/onder'),
      sizedBar(ctx, kader.profile, p.material, 2, p.height, kader.dims, 'Kozijn, stijlen')
    ];
    if (!p.frameOnly) {
      materials.push(plateLine(ctx, p.material, p.height - 20, p.width - 20, parseFloat(p.doorThickness), 'Deurblad'));
      materials.push(hardware(ctx, 'Scharnieren en cilinderslot'));
    }
    const w = [lassen(ctx, 4 * 0.15), voorrijden(ctx)];
    if (p.mount) w.push(montage(ctx, 2));
    if (p.finish === 'Gepoedercoat') w.push(poedercoat(ctx, (p.width / 1000) * (p.height / 1000)));
    return { materials, work: w, confidence: 'indicatie' };
  }
},
{
  id: 'maatwerk', group: 'Maatwerk / reparatie', name: 'Maatwerk / reparatie', icon: 'tools', always: true,
  params: [
    { id: 'omschrijving', label: 'Wat ga je maken of herstellen?', type: 'text', default: '' },
    { id: 'material', label: 'Materiaalsoort', type: 'choice', options: ['s235', 's355', 'rvs304', 'rvs316', 'alu', 'messing', 'koper'], default: 's235' },
    { id: 'kg', label: 'Geschat materiaalgewicht', unit: 'kg', type: 'number', min: 0, max: 2000, step: 5, default: 50 },
    { id: 'uren', label: 'Geschatte uren', unit: 'uur', type: 'number', min: 0, max: 200, step: 0.5, default: 4 }
  ],
  build(p, ctx) {
    const density = ctx.densities[p.material] || 7850;
    const widthM = 0.5, tM = 0.01, volumeM3 = Math.max(0.0001, p.kg) / density;
    const lengthMm = Math.max(1, Math.round((volumeM3 / (widthM * tM)) * 1000));
    const materials = [plateLine(ctx, p.material, lengthMm, widthM * 1000, tM * 1000,
      'Geschat materiaalgewicht (maatwerk), geen echte plaatmaat — ' + p.kg + ' kg ' + ctx.materialNames[p.material])];
    const w = [
      work(ctx, { name: p.omschrijving || 'Maatwerk', quantity: Math.max(0.25, p.uren), rate: ctx.hourlyRate, category: 'Fabricage' }),
      voorrijden(ctx)
    ];
    return { materials, work: w, confidence: 'indicatie' };
  }
}
];
