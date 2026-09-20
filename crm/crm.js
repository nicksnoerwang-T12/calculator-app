/* CRM pakket 1 — "Nooit meer vergeten": acties, zwevende klussen, verwaarlozing, Vandaag-scherm.
   Bouwt op de bestaande fase-pipeline (JOB_FASES/setJobFase, zie crm/README.md §0.3) en het
   bestaande klantenbestand (customers()/CUSTOMER_KEY) — geen nieuwe structuren, alleen een nieuwe
   laag eromheen. Wrapt bestaande functies i.p.v. ze te herschrijven, zelfde patroon als
   jobs.js/intake.js/quotes.js.

   Klus-identiteit: een "klus" is één entry in STORE.calculations ({id, datum, data}); die id is
   ook wat savedProjectId tijdens het bewerken bevat. CRM-acties koppelen via projectId aan die
   entry-id — NIET aan job.id, dat in de praktijk vrijwel nooit gezet wordt (zie de bestaande
   `job.id || savedProjectId || null`-idioom in quotes.js/cro.js, hier hergebruikt).

   Bekende beperking (bewust, geen bug): saveCalculation() maakt bij élke klik op "Klus bewaren"
   een NIEUWE entry aan (geen update-in-place van een bestaande klus) — dat bestond al vóór dit
   pakket. De automatische "nieuwe klus"-actie wordt daarom alleen aangemaakt bij de EERSTE save
   van een sessie (savedProjectId was nog null), niet bij elke herhaalde save van dezelfde klus. */

const CRM_ACTIONS_KEY = 'werkbank.v2.crm.actions';
const CRM_SETTINGS_KEY = 'werkbank.v2.crm.settings';
const CRM_DAGSTART_KEY = 'werkbank.v2.crm.lastDagstart';

const CRM_ACTION_TYPES = { bellen: 'Bellen', whatsapp: 'WhatsApp', mailen: 'Mailen', opname: 'Opname', bezoek: 'Bezoek', offerte: 'Offerte', factuur: 'Factuur', overig: 'Overig' };

/* ---------- Datamodel & opslag (pure lees/schrijffuncties) ---------- */
function crmActions() { const r = safeGet(CRM_ACTIONS_KEY, []); return Array.isArray(r) ? r : []; }
function crmSaveActions(list) { return safeSet(CRM_ACTIONS_KEY, list); }
function crmSettingsDefaults() {
  return {
    rotting: { indicatie: 3, opname: 5, offerte_verzonden: 5, opdracht: 14, in_werkplaats: 21, montage: 7, geleverd: 2 },
    dagstartNotify: false
  };
}
function crmSettings() {
  const stored = safeGet(CRM_SETTINGS_KEY, {});
  const defaults = crmSettingsDefaults();
  return { rotting: Object.assign({}, defaults.rotting, stored.rotting), dagstartNotify: !!stored.dagstartNotify };
}
function crmSaveSettings(next) { return safeSet(CRM_SETTINGS_KEY, next); }

// Bouwt één actie-record; puur (now als parameter, zelfde testpatroon als assignDocumentNumber).
function crmMakeAction(fields, now) {
  now = now || new Date();
  const iso = now.toISOString();
  return Object.assign({ id: uid(), done: false, doneAt: null, outcome: null, createdAt: iso, updatedAt: iso }, fields);
}
function crmAddDays(now, days) { const d = new Date(now); d.setDate(d.getDate() + days); return d; }

/* ---------- De drie automatische regels (exact deze, geen regelbouwer) ---------- */
function crmAutoActionForNewJob(projectId, customerId, now) {
  now = now || new Date();
  return crmMakeAction({ type: 'opname', title: 'Opname inplannen', dueAt: crmAddDays(now, 1).toISOString(), projectId, customerId: customerId || undefined }, now);
}
function crmAutoActionForFaseChange(fase, projectId, customerId, now) {
  now = now || new Date();
  if (fase === 'offerte_verzonden') return crmMakeAction({ type: 'bellen', title: 'Offerte opvolgen', dueAt: crmAddDays(now, 5).toISOString(), projectId, customerId: customerId || undefined }, now);
  if (fase === 'geleverd') return crmMakeAction({ type: 'factuur', title: 'Factureren', dueAt: crmAddDays(now, 1).toISOString(), projectId, customerId: customerId || undefined }, now);
  return null;
}

/* ---------- Zwevende klussen: actieve fase zonder open actie ---------- */
function crmIsJobFloating(row, actions) {
  const fase = row?.data?.job?.fase || 'indicatie';
  if (TERMINAL_FASES.has(fase)) return false;
  return !actions.some(a => !a.done && a.projectId === row.id);
}
function crmFloatingJobs(rows, actions) { return rows.filter(row => crmIsJobFloating(row, actions)); }

/* ---------- Verwaarlozing (rotting) per fase ---------- */
// Laatste-contactmoment = het meest recente van: statuswissel, laatst afgeronde actie op deze
// klus, laatste logregel (pakket 2 — logs=[] hier, zodat dit al werkt vóórdat pakket 2 bestaat).
function crmLastTouch(row, actions, logs) {
  const j = row.data.job || {};
  const stamps = [j.faseSince || row.datum];
  for (const a of actions) if (a.projectId === row.id && a.done && a.doneAt) stamps.push(a.doneAt);
  for (const l of (logs || [])) if (l.projectId === row.id && l.at) stamps.push(l.at);
  return stamps.reduce((max, s) => { const t = new Date(s).getTime(); return Number.isFinite(t) && t > max ? t : max; }, 0);
}
function crmDaysSince(ms, now) { now = now || new Date(); return Math.floor((now.getTime() - ms) / 86400000); }
function crmIsRotting(row, actions, logs, settings, now) {
  const fase = row?.data?.job?.fase || 'indicatie';
  if (TERMINAL_FASES.has(fase)) return { rotting: false, days: 0 };
  const threshold = settings.rotting[fase];
  if (!Number.isFinite(threshold)) return { rotting: false, days: 0 };
  const days = crmDaysSince(crmLastTouch(row, actions, logs), now);
  return { rotting: days >= threshold, days };
}
function crmRottingJobs(rows, actions, logs, settings, now) {
  return rows.map(row => Object.assign({ row }, crmIsRotting(row, actions, logs, settings, now))).filter(x => x.rotting).sort((a, b) => b.days - a.days);
}

/* ---------- Acties: afronden, verzetten, telling ---------- */
function crmCompleteAction(list, id, outcome, now) {
  now = (now || new Date()).toISOString();
  return list.map(a => a.id === id ? Object.assign({}, a, { done: true, doneAt: now, outcome: outcome || a.outcome || null, updatedAt: now }) : a);
}
function crmRescheduleAction(list, id, dueAt, now) {
  now = (now || new Date()).toISOString();
  return list.map(a => a.id === id ? Object.assign({}, a, { dueAt, updatedAt: now }) : a);
}
function crmOpenActions(actions) { return actions.filter(a => !a.done); }
function crmOverdueActions(actions, now) { now = now || new Date(); return crmOpenActions(actions).filter(a => new Date(a.dueAt).getTime() < startOfDay(now).getTime()); }
function crmTodayActions(actions, now) {
  now = now || new Date();
  const start = startOfDay(now).getTime(), end = start + 86400000;
  return crmOpenActions(actions).filter(a => { const t = new Date(a.dueAt).getTime(); return t >= start && t < end; });
}
function crmUpcomingActions(actions, now, days) {
  now = now || new Date(); days = days || 7;
  const start = startOfDay(now).getTime() + 86400000, end = start + days * 86400000;
  return crmOpenActions(actions).filter(a => { const t = new Date(a.dueAt).getTime(); return t >= start && t < end; }).sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
}
function startOfDay(d) { const c = new Date(d); c.setHours(0, 0, 0, 0); return c; }

/* ---------- Dagstart ---------- */
function crmNeedsDagstart(now) { now = now || new Date(); return safeGet(CRM_DAGSTART_KEY, '') !== ymd(now); }
function crmMarkDagstart(now) { return safeSet(CRM_DAGSTART_KEY, ymd(now || new Date())); }
function ymd(d) { return new Date(d).toISOString().slice(0, 10); }

/* ==================== Pakket 2 — Contact in één tik (pure logica) ==================== */
const CRM_LOG_KEY = 'werkbank.v2.crm.log';
const CRM_TEMPLATES_KEY = 'werkbank.v2.crm.templates';
const CRM_GEOCODE_UA = 'Werkbank';

function crmLog() { const r = safeGet(CRM_LOG_KEY, []); return Array.isArray(r) ? r : []; }
function crmSaveLog(list) { return safeSet(CRM_LOG_KEY, list); }
function crmMakeLogEntry(fields, now) { now = now || new Date(); const iso = now.toISOString(); return Object.assign({ id: uid(), at: iso, createdAt: iso }, fields); }

// E.164-normalisatie, NL-gericht: 06xxxxxxxx -> +316xxxxxxxx, 0xxxxxxxxx (vast) -> +31xxxxxxxxx,
// 0031... -> +31..., 00<landcode>... -> +<landcode>..., +... blijft ongewijzigd (na opschonen van
// spaties/haakjes/streepjes/punten). Een leeg of onherkenbaar nummer komt ongewijzigd (evt. leeg)
// terug — geen gok, geen foutmelding hier; de aanroeper beslist wat te doen met een leeg resultaat.
function crmNormalizePhone(raw) {
  if (!raw) return '';
  const s = String(raw).trim().replace(/[\s\-().]/g, '');
  if (!s) return '';
  if (s.startsWith('+')) return s;
  if (s.startsWith('0031')) return '+31' + s.slice(4);
  if (s.startsWith('00')) return '+' + s.slice(2);
  if (s.startsWith('0')) return '+31' + s.slice(1);
  return s;
}
function crmWaLink(phone, text) {
  const digits = crmNormalizePhone(phone).replace(/^\+/, '').replace(/\D/g, '');
  return 'https://wa.me/' + digits + (text ? '?text=' + encodeURIComponent(text) : '');
}
function crmMailtoLink(email, subject, body) {
  const params = [];
  if (subject) params.push('subject=' + encodeURIComponent(subject));
  if (body) params.push('body=' + encodeURIComponent(body));
  return 'mailto:' + (email || '') + (params.length ? '?' + params.join('&') : '');
}
function crmTelLink(phone) { return 'tel:' + crmNormalizePhone(phone); }

// Sjabloon-placeholders: {klant} {klus} {bedrag} {datum} {bedrijf}. Onbekende/ontbrekende
// variabelen worden stil leeg gemaakt (geen "undefined" in het bericht).
function crmFillTemplate(template, vars) {
  return String(template || '').replace(/\{(klant|klus|bedrag|datum|bedrijf)\}/g, (m, k) => (vars && vars[k] != null) ? String(vars[k]) : '');
}
function crmDefaultTemplates() {
  return [
    { id: 'offerte-opvolgen', label: 'Offerte opvolgen', text: 'Hallo {klant}, ik wilde even opvolgen of je nog vragen hebt over de offerte voor {klus} ({bedrag}). Laat het gerust weten.' },
    { id: 'afspraak-bevestigen', label: 'Afspraak bevestigen', text: 'Hallo {klant}, bij deze bevestig ik onze afspraak op {datum} voor {klus}.' },
    { id: 'klaar-voor-montage', label: 'Klaar voor levering / montage', text: 'Hallo {klant}, {klus} is klaar. We plannen de montage/levering op {datum}.' },
    { id: 'betaalherinnering', label: 'Betaalherinnering', text: 'Hallo {klant}, een vriendelijke herinnering: de factuur voor {klus} ({bedrag}) staat nog open.' },
    { id: 'bedankt', label: 'Bedankt na oplevering', text: 'Hallo {klant}, bedankt voor de opdracht voor {klus}. Fijn als je een review achterlaat of ons doorverwijst!' }
  ];
}
function crmTemplates() { const r = safeGet(CRM_TEMPLATES_KEY, null); return Array.isArray(r) && r.length === 5 ? r : crmDefaultTemplates(); }
function crmSaveTemplates(list) { return safeSet(CRM_TEMPLATES_KEY, list); }

// Haversine-afstand in km tussen twee coördinaten.
function crmHaversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function crmNearbyCustomers(list, lat, lng, maxKm) {
  return list
    .filter(c => Number.isFinite(c.lat) && Number.isFinite(c.lng))
    .map(c => Object.assign({ km: crmHaversineKm(lat, lng, c.lat, c.lng) }, { customer: c }))
    .filter(x => x.km <= (maxKm || 15))
    .sort((a, b) => a.km - b.km);
}

// Tijdlijn voor één klant: logregels + acties (aangemaakt én afgerond, apart getoond) +
// fasewissels van de klussen van deze klant (uit job.faseHistory, zie pakket 1 §0.3) + verzonden
// offerte-/factuurdocumenten (uit quotes/, optioneel — quotes mag [] of undefined zijn, dan
// draait deze functie precies zoals vóór die uitbreiding, blijft dus puur testbaar zonder de
// quotes-module erbij te hoeven laden), chronologisch, nieuwste boven.
function crmTimelineFor(customerId, logs, actions, rows, quotes) {
  const items = [];
  for (const l of logs) if (l.customerId === customerId) items.push({ kind: 'log', at: l.at, entry: l });
  for (const a of actions) {
    const belongsDirect = a.customerId === customerId;
    const belongsViaProject = a.projectId && rows.some(r => r.id === a.projectId && r.data.job && r.data.job.customerId === customerId);
    if (!belongsDirect && !belongsViaProject) continue;
    items.push({ kind: 'action-created', at: a.createdAt, entry: a });
    if (a.done && a.doneAt) items.push({ kind: 'action-done', at: a.doneAt, entry: a });
  }
  for (const row of rows) {
    const job = row.data.job || {};
    if (job.customerId !== customerId) continue;
    const history = Array.isArray(job.faseHistory) ? job.faseHistory : [];
    for (const h of history) items.push({ kind: 'fase', at: h.at, entry: { fase: h.fase, projectId: row.id, projectName: row.data.project } });
    for (const q of (quotes || [])) {
      if (q.jobId !== row.id || !q.sentAt) continue;
      items.push({ kind: 'document', at: q.sentAt, entry: { number: q.number, projectName: row.data.project, channel: q.sentChannel } });
    }
  }
  items.sort((a, b) => new Date(b.at) - new Date(a.at));
  return items;
}
function crmGroupTimelineByDay(items) {
  const groups = [];
  for (const item of items) {
    const day = ymd(item.at);
    let g = groups.find(x => x.day === day);
    if (!g) { g = { day, items: [] }; groups.push(g); }
    g.items.push(item);
  }
  return groups;
}

/* ==================== Pakket 3 — Overzicht & inzicht (pure logica) ==================== */
// Kolommen van het kanban-bord: indicatie t/m gefactureerd (de hoofdroute), zijtakken
// afgewezen/vervallen bewust niet als kolom — die klussen zijn klaar, geen opvolging meer nodig.
const CRM_PIPELINE_FASES = ['indicatie', 'opname', 'offerte_verzonden', 'opdracht', 'in_werkplaats', 'montage', 'geleverd', 'gefactureerd'];

function crmFaseHistoryOf(row) { return (row.data.job && Array.isArray(row.data.job.faseHistory)) ? row.data.job.faseHistory : []; }
// Eerste moment waarop een klus in `fase` kwam, op of ná `notBefore` (voor opeenvolgende
// stappen: "opdracht ná deze offerte_verzonden", niet een eerdere/latere ronde door elkaar).
function crmFaseEnteredAt(history, fase, notBefore) {
  const entries = history.filter(h => h.fase === fase && (!notBefore || new Date(h.at) >= new Date(notBefore)));
  return entries.length ? entries[0].at : null;
}

// KPI 1 — Conversie: % offerte_verzonden -> opdracht, laatste `days` dagen (op het moment van
// offerte verzonden, niet van vandaag — een offerte van 100 dagen geleden die gisteren opdracht
// werd telt dus niet mee, zoals "laatste 90 dagen" hoort te werken voor een instroom-conversie).
function crmConversionKpi(rows, now, days) {
  now = now || new Date(); days = days || 90;
  const cutoff = now.getTime() - days * 86400000;
  let sent = 0, converted = 0;
  for (const row of rows) {
    const history = crmFaseHistoryOf(row);
    const sentAt = crmFaseEnteredAt(history, 'offerte_verzonden');
    if (!sentAt || new Date(sentAt).getTime() < cutoff) continue;
    sent++;
    if (crmFaseEnteredAt(history, 'opdracht', sentAt)) converted++;
  }
  return { sent, converted, pct: sent ? Math.round(converted / sent * 100) : null };
}

// KPI 2 — Doorlooptijd: mediaan aantal dagen tussen twee fases (alleen klussen die beide fases
// daadwerkelijk doorlopen hebben, in die volgorde).
function crmMedianDaysBetween(rows, fromFase, toFase) {
  const diffs = [];
  for (const row of rows) {
    const history = crmFaseHistoryOf(row);
    const fromAt = crmFaseEnteredAt(history, fromFase);
    if (!fromAt) continue;
    const toAt = crmFaseEnteredAt(history, toFase, fromAt);
    if (!toAt) continue;
    diffs.push((new Date(toAt) - new Date(fromAt)) / 86400000);
  }
  if (!diffs.length) return null;
  diffs.sort((a, b) => a - b);
  const mid = Math.floor(diffs.length / 2);
  return diffs.length % 2 ? diffs[mid] : (diffs[mid - 1] + diffs[mid]) / 2;
}

// Openstaand bedrag van een opgeslagen klus: dezelfde rekenkern als renderCostTotals, maar tegen
// een losse, niet-actieve data-snapshot i.p.v. de live costState — puur lezen, niets wijzigt.
// Puur genoeg om ook zonder DOM te testen (calculateMaterialList/calculateSale/cents/positiveInt
// komen uit de kernrekenmodule, altijd vóór deze laag geladen).
function crmProjectSaleTotal(data) {
  try {
    const q = positiveInt(data.qty) || 1;
    const mat = calculateMaterialList(data.materials || [], q, getPrices());
    const labor = ((Number(data.setupHours) || 0) + (Number(data.productionHours) || 0)) * (Number(data.hourlyRate) || 0);
    const process = ['saw', 'cutting', 'bending', 'machining', 'finishing', 'transport', 'other'].reduce((s, k) => s + (Number(data[k]) || 0), 0) + (Number(data.wireKg) || 0) * (Number(data.wirePrice) || 0) + (Number(data.gasLiters) || 0) * (Number(data.gasPrice) || 0);
    const directCents = mat.cents + cents(labor + process);
    const sale = calculateSale(directCents, data.overhead, data.margin);
    return sale.error ? null : sale.saleCents;
  } catch (e) { return null; }
}
// KPI 3 — Openstaand: verwacht (offerte_verzonden) + te factureren (geleverd), in centen.
function crmOutstandingKpi(rows) {
  let verwachtCents = 0, teFacturerenCents = 0, verwachtCount = 0, teFacturerenCount = 0;
  for (const row of rows) {
    const fase = row.data.job && row.data.job.fase;
    if (fase !== 'offerte_verzonden' && fase !== 'geleverd') continue;
    const sale = crmProjectSaleTotal(row.data);
    if (sale == null) continue;
    if (fase === 'offerte_verzonden') { verwachtCents += sale; verwachtCount++; }
    else { teFacturerenCents += sale; teFacturerenCount++; }
  }
  return { verwachtCents, teFacturerenCents, verwachtCount, teFacturerenCount };
}

/* ---------- .ics-agenda-export (RFC 5545: CRLF, regels gevouwen op 75 tekens) ---------- */
function icsFoldLine(line) {
  if (line.length <= 75) return line;
  let out = '', rest = line, first = true;
  while (rest.length > 0) {
    const take = first ? 75 : 74;
    out += (first ? '' : '\r\n ') + rest.slice(0, take);
    rest = rest.slice(take);
    first = false;
  }
  return out;
}
function icsEscapeText(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
function icsDate(iso) {
  const d = new Date(iso), pad = n => String(n).padStart(2, '0');
  return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
}
function icsEventLines(action, contextLabel, appUrl, now) {
  return [
    'BEGIN:VEVENT',
    'UID:' + action.id + '@werkbank.app',
    'DTSTAMP:' + icsDate((now || new Date()).toISOString()),
    'DTSTART:' + icsDate(action.dueAt),
    'SUMMARY:' + icsEscapeText((CRM_ACTION_TYPES[action.type] || action.type) + ': ' + action.title),
    'DESCRIPTION:' + icsEscapeText([contextLabel, appUrl].filter(Boolean).join(' — ')),
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Herinnering', 'TRIGGER:-PT30M', 'END:VALARM',
    'END:VEVENT'
  ];
}
// Eén actie -> .ics; meerdere acties -> één kalenderbestand met meerdere VEVENTs (voor "Alle
// open acties exporteren"). appUrl is optioneel (link terug naar de app in DESCRIPTION).
function crmBuildIcs(actions, contextLabelFor, appUrl, now) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Werkbank//CRM//NL', 'CALSCALE:GREGORIAN'];
  for (const action of actions) lines.push(...icsEventLines(action, contextLabelFor ? contextLabelFor(action) : '', appUrl, now));
  lines.push('END:VCALENDAR');
  return lines.map(icsFoldLine).join('\r\n') + '\r\n';
}

/* ==================== UI ==================== */
/* Alles hieronder gaat ervan uit dat het in dezelfde flat-script-scope draait als de rest van
   werkbank-v2.html (uid, safeGet/safeSet, STORE, customers(), savedProjects(), uiIcon(),
   JOB_FASES/setJobFase, esc/fmt/euro, hidePages/routeHash/setNav — allemaal al gedefinieerd
   vóórdat deze laag als laatste laadt). */

UI_PATHS.calendar = 'M4 5h16v16H4z M4 9h16 M8 3v4 M16 3v4 M8 13h2 M8 17h2 M14 13h2';
UI_PATHS.bellen = 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z';
UI_PATHS.whatsapp = 'M4 20l1.3-4.7A8 8 0 1 1 8.6 19z M8.5 8.5c0 4 3 7 7 7 .8 0 1.5-1.5 1-2s-1.5-1-2-.5-1 .5-2-.5-1.5-1.5-1-2 0-1.5-.5-2-1.5-1-2 1';
UI_PATHS.mail = 'M4 6h16v12H4z M4 6l8 7 8-7';
UI_PATHS.opname = 'M12 3v18 M5 8h14 M5 16h14';
UI_PATHS.bezoek = 'M12 3a5 5 0 1 1 0 10 5 5 0 0 1 0-10z M4 21c0-4 4-6 8-6s8 2 8 6';
UI_PATHS.offerte = 'M6 3h9l5 5v13H6z M15 3v5h5 M9 13h6 M9 17h6';
UI_PATHS.factuur = 'M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6';
UI_PATHS.overig = 'M5 12h.01 M12 12h.01 M19 12h.01';

const CRM_TYPE_ICON = { bellen: 'bellen', whatsapp: 'whatsapp', mailen: 'mailen', opname: 'opname', bezoek: 'bezoek', offerte: 'offerte', factuur: 'factuur', overig: 'overig' };

function crmProjectRow(projectId) { return savedProjects().find(r => r.id === projectId) || null; }
function crmCustomerById(customerId) { return customers().find(c => c.id === customerId) || null; }
function crmContextLabel(action) {
  const row = action.projectId ? crmProjectRow(action.projectId) : null;
  const customer = action.customerId ? crmCustomerById(action.customerId) : (row && row.data.job && row.data.job.customerId ? crmCustomerById(row.data.job.customerId) : null);
  const parts = [];
  if (customer) parts.push(customer.name);
  if (row) parts.push(row.data.project || 'Naamloze klus');
  return parts.join(' — ') || 'Losse actie';
}
function crmTimeLabel(iso) { return new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }); }
function crmDateLabel(iso) { return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }); }

function crmActionRowHtml(action, opts) {
  opts = opts || {};
  const row = action.projectId ? crmProjectRow(action.projectId) : null;
  const phone = crmActionPhone(action, row);
  return '<div class="crm-action-row" data-action="' + esc(action.id) + '">' +
    '<div class="crm-action-main"><b>' + esc(action.title) + '</b><small>' + esc(crmContextLabel(action)) + (opts.showTime !== false ? ' · <span class="font-mono">' + esc(crmTimeLabel(action.dueAt)) + '</span>' : '') + '</small></div>' +
    '<div class="crm-action-actions">' +
    (phone ? '<a class="ghost crm-call-btn" href="tel:' + esc(phone) + '" aria-label="Bel ' + esc(crmContextLabel(action)) + '">' + uiIcon('bellen') + '</a>' : '') +
    '<button type="button" class="ghost crm-call-btn" data-crm-ics="' + esc(action.id) + '" aria-label="In agenda zetten">' + uiIcon('calendar') + '</button>' +
    '<button type="button" class="ghost" data-crm-snooze="' + esc(action.id) + '">Verzet</button>' +
    '<button type="button" class="act" data-crm-done="' + esc(action.id) + '">Klaar</button>' +
    '</div></div>';
}
function crmActionPhone(action, row) {
  if (action.type !== 'bellen') return null;
  const customer = action.customerId ? crmCustomerById(action.customerId) : (row && row.data.job && row.data.job.customerId ? crmCustomerById(row.data.job.customerId) : null);
  const phone = (customer && customer.phone) || (row && row.data.job && row.data.job.phone) || '';
  return phone || null;
}

function crmFloatingRowHtml(row) {
  const job = row.data.job || {};
  return '<div class="crm-floating-row" data-project="' + esc(row.id) + '">' +
    '<div class="crm-action-main"><b>' + esc(row.data.project || 'Naamloze klus') + '</b><small>' + esc(faseLabelOnly(job.fase)) + '</small></div>' +
    '<button type="button" class="ghost" data-crm-plan="' + esc(row.id) + '">Plan actie</button></div>';
}
function faseLabelOnly(fase) { return JOB_FASE_LABELS[fase] || JOB_FASE_LABELS.indicatie; }

function crmRottingRowHtml(entry) {
  const job = entry.row.data.job || {};
  return '<div class="crm-rotting-row" data-project="' + esc(entry.row.id) + '">' +
    '<div class="crm-action-main"><b>' + esc(entry.row.data.project || 'Naamloze klus') + '</b><small>' + esc(faseLabelOnly(job.fase)) + ' · ' + entry.days + ' dagen stil</small></div>' +
    '<button type="button" class="ghost" data-crm-open="' + esc(entry.row.id) + '">Openen</button></div>';
}

function crmVandaagData(now) {
  now = now || new Date();
  const actions = crmActions();
  const rows = savedProjects();
  const settings = crmSettings();
  return {
    now, actions, rows, settings,
    overdue: crmOverdueActions(actions, now),
    today: crmTodayActions(actions, now).sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt)),
    floating: crmFloatingJobs(rows, actions),
    rotting: crmRottingJobs(rows, actions, [], settings, now),
    upcoming: crmUpcomingActions(actions, now, 7)
  };
}

function crmRenderVandaag() {
  const el = crmVandaagPage;
  const d = crmVandaagData();
  const dateStr = d.now.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
  const empty = d.overdue.length + d.today.length + d.floating.length + d.rotting.length + d.upcoming.length === 0;

  let html = '<div class="page-head"><div><h1>Vandaag</h1><p class="sub">' + esc(dateStr) + '</p></div></div>';

  if (crmNeedsDagstart(d.now)) {
    html += '<div class="crm-dagstart" id="crm-dagstart" role="status">' +
      esc(d.today.length + d.overdue.length) + ' acties · ' + esc(d.overdue.length) + ' achterstallig · ' + esc(d.floating.length + d.rotting.length) + ' klussen stil' +
      '<button type="button" class="ghost" id="crm-dagstart-close" aria-label="Sluiten">×</button></div>';
  }

  if (empty) {
    html += '<div class="job-panel crm-empty"><p>Niets gepland. Geen zwevende klussen.</p><button class="act" id="crm-empty-new">+ Nieuwe klus</button></div>';
    html += crmNearbyHtml();
    el.innerHTML = html;
    const closeBtn = document.getElementById('crm-dagstart-close');
    if (closeBtn) closeBtn.onclick = () => { crmMarkDagstart(); document.getElementById('crm-dagstart').remove(); };
    const newBtn = document.getElementById('crm-empty-new');
    if (newBtn) newBtn.onclick = startProject;
    crmBindNearby();
    return;
  }

  if (d.overdue.length) {
    html += '<section class="crm-section"><h2><span class="fase-badge" data-tone="danger"><span class="fase-dot"></span>Achterstallig · ' + d.overdue.length + '</span></h2>' +
      '<div class="crm-list">' + (d.overdue.length > 5 ? '<details><summary>' + d.overdue.length + ' achterstallige acties</summary>' + d.overdue.map(a => crmActionRowHtml(a)).join('') + '</details>' : d.overdue.map(a => crmActionRowHtml(a)).join('')) + '</div></section>';
  }
  html += '<section class="crm-section"><h2>Vandaag · ' + d.today.length + '</h2>' +
    '<div class="crm-list">' + (d.today.length ? d.today.map(a => crmActionRowHtml(a)).join('') : '<p class="muted">Geen acties meer voor vandaag.</p>') + '</div></section>';
  if (d.floating.length) {
    html += '<section class="crm-section"><h2><span class="fase-badge" data-tone="warning"><span class="fase-dot"></span>Zwevende klussen · ' + d.floating.length + '</span></h2>' +
      '<div class="crm-list">' + d.floating.map(r => crmFloatingRowHtml(r)).join('') + '</div></section>';
  }
  if (d.rotting.length) {
    html += '<section class="crm-section"><h2><span class="fase-badge" data-tone="warning"><span class="fase-dot"></span>Verwaarloosd · ' + d.rotting.length + '</span></h2>' +
      '<div class="crm-list">' + d.rotting.map(r => crmRottingRowHtml(r)).join('') + '</div></section>';
  }
  if (d.upcoming.length) {
    html += '<details class="crm-section crm-upcoming"><summary>Komende 7 dagen · ' + d.upcoming.length + '</summary>' +
      '<div class="crm-list">' + d.upcoming.map(a => crmActionRowHtml(Object.assign({}, a), { showTime: false })).join('') + '</div></details>';
  }
  html += crmNearbyHtml();

  el.innerHTML = html;
  crmBindVandaag();
  crmBindNearby();
  const closeBtn = document.getElementById('crm-dagstart-close');
  if (closeBtn) closeBtn.onclick = () => { crmMarkDagstart(); document.getElementById('crm-dagstart').remove(); };
}

/* ---------- In de buurt (opt-in geolocatie, geen kaart, alleen een lijst) ---------- */
function crmNearbyHtml() {
  return '<details class="crm-section crm-upcoming" id="crm-nearby"><summary>In de buurt</summary>' +
    '<div id="crm-nearby-body"><button type="button" class="ghost" id="crm-nearby-request">Toon klanten in de buurt</button>' +
    '<p class="muted">Vraagt je locatie op (blijft op dit apparaat) en vergelijkt die met het adres van klanten met een open actie of actieve klus.</p></div></details>';
}
function crmBindNearby() {
  const btn = document.getElementById('crm-nearby-request');
  if (!btn) return;
  btn.onclick = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { document.getElementById('crm-nearby-body').innerHTML = '<p class="muted">Locatiebepaling wordt niet ondersteund op dit apparaat.</p>'; return; }
    btn.disabled = true; btn.textContent = 'Locatie bepalen…';
    navigator.geolocation.getCurrentPosition(
      pos => crmRenderNearbyList(pos.coords.latitude, pos.coords.longitude),
      () => { document.getElementById('crm-nearby-body').innerHTML = '<p class="muted">Locatie niet beschikbaar of geweigerd.</p>'; },
      { timeout: 10000 }
    );
  };
}
function crmRenderNearbyList(lat, lng) {
  const actions = crmActions(), rows = savedProjects();
  const relevantIds = new Set();
  for (const a of crmOpenActions(actions)) if (a.customerId) relevantIds.add(a.customerId);
  for (const row of rows) { const j = row.data.job || {}; if (j.customerId && !TERMINAL_FASES.has(j.fase || 'indicatie')) relevantIds.add(j.customerId); }
  const list = customers().filter(c => relevantIds.has(c.id));
  const nearby = crmNearbyCustomers(list, lat, lng, 15);
  const body = document.getElementById('crm-nearby-body');
  if (!nearby.length) { body.innerHTML = '<p class="muted">Geen klanten met coördinaten binnen 15 km, of nog geen adres op de kaart gezet (klantkaart → adres → "Adres op kaart zetten").</p>'; return; }
  body.innerHTML = '<div class="crm-list">' + nearby.map(x => '<div class="crm-action-row"><div class="crm-action-main"><b>' + esc(x.customer.name) + '</b><small>' + fmt(x.km, 1) + ' km</small></div>' +
    '<div class="crm-action-actions">' + (x.customer.phone ? '<a class="ghost crm-call-btn" href="' + esc(crmTelLink(x.customer.phone)) + '" aria-label="Bel ' + esc(x.customer.name) + '">' + uiIcon('bellen') + '</a>' : '') +
    '<a class="ghost" href="https://www.google.com/maps/dir/?api=1&destination=' + x.customer.lat + ',' + x.customer.lng + '" target="_blank" rel="noopener">Route</a></div></div>').join('') + '</div>';
}

function crmBindVandaag() {
  const el = crmVandaagPage;
  el.querySelectorAll('[data-crm-done]').forEach(b => b.onclick = () => crmOpenCompletePrompt(b.dataset.crmDone));
  el.querySelectorAll('[data-crm-snooze]').forEach(b => b.onclick = () => crmOpenSnoozeMenu(b));
  el.querySelectorAll('[data-crm-plan]').forEach(b => b.onclick = () => crmOpenPlanAction(b.dataset.crmPlan));
  el.querySelectorAll('[data-crm-open]').forEach(b => b.onclick = () => openSavedProject(crmProjectRow(b.dataset.crmOpen)));
  el.querySelectorAll('[data-crm-ics]').forEach(b => b.onclick = () => crmExportActionIcs(b.dataset.crmIcs));
}

/* ---------- Afronden: "Volgende actie?" (kern van pakket 1) ---------- */
function crmOpenCompletePrompt(actionId) {
  const action = crmActions().find(a => a.id === actionId);
  if (!action) return;
  const overlay = document.createElement('div');
  overlay.className = 'editor-backdrop no-print';
  overlay.innerHTML = '<section class="material-editor" role="dialog" aria-modal="true" aria-labelledby="crm-complete-title" style="max-width:420px">' +
    '<div class="editor-head"><h2 id="crm-complete-title">Volgende actie?</h2><button class="ghost" id="crm-complete-skip" aria-label="Overslaan en sluiten">×</button></div>' +
    '<p class="muted">' + esc(action.title) + ' — ' + esc(crmContextLabel(action)) + '</p>' +
    '<div class="crm-quick-row"><button class="ghost" data-crm-quick="1">Morgen</button><button class="ghost" data-crm-quick="3">Over 3 dagen</button><button class="ghost" data-crm-quick="7">Volgende week</button></div>' +
    '<div class="crm-type-row">' + Object.keys(CRM_ACTION_TYPES).map(t => '<button type="button" class="ghost" data-crm-type="' + t + '">' + esc(CRM_ACTION_TYPES[t]) + '</button>').join('') + '</div>' +
    '<button class="ghost" id="crm-complete-skip-2">Geen vervolgactie — klus wordt zwevend</button>' +
    '</section>';
  document.body.appendChild(overlay);
  let chosenDays = 1, chosenType = action.type;
  overlay.querySelectorAll('[data-crm-quick]').forEach(b => b.onclick = () => { chosenDays = Number(b.dataset.crmQuick); overlay.querySelectorAll('[data-crm-quick]').forEach(x => x.classList.toggle('act', x === b)); overlay.querySelectorAll('[data-crm-quick]').forEach(x => x.classList.toggle('ghost', x !== b)); crmFinishComplete(); });
  overlay.querySelectorAll('[data-crm-type]').forEach(b => b.onclick = () => { chosenType = b.dataset.crmType; overlay.querySelectorAll('[data-crm-type]').forEach(x => x.classList.toggle('act', x === b)); overlay.querySelectorAll('[data-crm-type]').forEach(x => x.classList.toggle('ghost', x !== b)); });
  function crmFinishComplete() {
    let list = crmCompleteAction(crmActions(), actionId, null, new Date());
    const next = crmMakeAction({ type: chosenType, title: CRM_ACTION_TYPES[chosenType] + ' opvolgen', dueAt: crmAddDays(new Date(), chosenDays).toISOString(), projectId: action.projectId, customerId: action.customerId }, new Date());
    list = [next, ...list];
    crmSaveActions(list);
    overlay.remove();
    crmRenderVandaag();
  }
  overlay.querySelector('#crm-complete-skip').onclick = () => { crmSaveActions(crmCompleteAction(crmActions(), actionId, null, new Date())); overlay.remove(); crmRenderVandaag(); };
  overlay.querySelector('#crm-complete-skip-2').onclick = overlay.querySelector('#crm-complete-skip').onclick;
  overlay.onkeydown = e => { if (e.key === 'Escape') overlay.querySelector('#crm-complete-skip').onclick(); };
  queueMicrotask(() => overlay.querySelector('[data-crm-quick]')?.focus());
}

/* ---------- Verzetten ---------- */
function crmOpenSnoozeMenu(btn) {
  const actionId = btn.dataset.crmSnooze;
  const overlay = document.createElement('div');
  overlay.className = 'editor-backdrop no-print';
  overlay.innerHTML = '<section class="material-editor" role="dialog" aria-modal="true" aria-labelledby="crm-snooze-title" style="max-width:360px">' +
    '<div class="editor-head"><h2 id="crm-snooze-title">Verzetten</h2><button class="ghost" id="crm-snooze-close" aria-label="Sluiten">×</button></div>' +
    '<div class="crm-quick-row"><button class="ghost" data-crm-snooze-days="1">Morgen</button><button class="ghost" data-crm-snooze-days="3">+3 dagen</button></div>' +
    '<label for="crm-snooze-date">Kies datum</label><input type="date" id="crm-snooze-date">' +
    '<button class="act" id="crm-snooze-apply">Verzetten</button></section>';
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('#crm-snooze-close').onclick = close;
  overlay.querySelectorAll('[data-crm-snooze-days]').forEach(b => b.onclick = () => { crmSaveActions(crmRescheduleAction(crmActions(), actionId, crmAddDays(new Date(), Number(b.dataset.crmSnoozeDays)).toISOString(), new Date())); close(); crmRenderVandaag(); });
  overlay.querySelector('#crm-snooze-apply').onclick = () => {
    const v = overlay.querySelector('#crm-snooze-date').value;
    if (!v) return;
    crmSaveActions(crmRescheduleAction(crmActions(), actionId, new Date(v + 'T09:00:00').toISOString(), new Date()));
    close(); crmRenderVandaag();
  };
  overlay.onkeydown = e => { if (e.key === 'Escape') close(); };
}

/* ---------- Handmatig een actie plannen (voor zwevende klussen) ---------- */
function crmOpenPlanAction(projectId) {
  const row = crmProjectRow(projectId);
  const job = (row && row.data.job) || {};
  const overlay = document.createElement('div');
  overlay.className = 'editor-backdrop no-print';
  overlay.innerHTML = '<section class="material-editor" role="dialog" aria-modal="true" aria-labelledby="crm-plan-title" style="max-width:400px">' +
    '<div class="editor-head"><h2 id="crm-plan-title">Actie plannen</h2><button class="ghost" id="crm-plan-close" aria-label="Sluiten">×</button></div>' +
    '<p class="muted">' + esc(row ? (row.data.project || 'Naamloze klus') : '') + '</p>' +
    '<label for="crm-plan-type">Type</label><select id="crm-plan-type">' + Object.keys(CRM_ACTION_TYPES).map(t => '<option value="' + t + '">' + esc(CRM_ACTION_TYPES[t]) + '</option>').join('') + '</select>' +
    '<label for="crm-plan-title-input">Titel</label><input id="crm-plan-title-input" value="Opvolgen">' +
    '<label for="crm-plan-date">Datum</label><input type="date" id="crm-plan-date" value="' + ymd(crmAddDays(new Date(), 1)) + '">' +
    '<button class="act" id="crm-plan-save">Plannen</button></section>';
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('#crm-plan-close').onclick = close;
  overlay.querySelector('#crm-plan-save').onclick = () => {
    const type = overlay.querySelector('#crm-plan-type').value, title = overlay.querySelector('#crm-plan-title-input').value.trim() || 'Opvolgen', date = overlay.querySelector('#crm-plan-date').value;
    if (!date) return;
    const action = crmMakeAction({ type, title, dueAt: new Date(date + 'T09:00:00').toISOString(), projectId, customerId: job.customerId || undefined }, new Date());
    crmSaveActions([action, ...crmActions()]);
    close(); crmRenderVandaag();
  };
  overlay.onkeydown = e => { if (e.key === 'Escape') close(); };
  queueMicrotask(() => overlay.querySelector('#crm-plan-type').focus());
}

/* ---------- Pagina, navigatie, routing ---------- */
const crmVandaagPage = document.createElement('section');
crmVandaagPage.id = 'vandaag';
crmVandaagPage.className = 'page';
crmVandaagPage.hidden = true;
document.querySelector('.wrap').append(crmVandaagPage);

(function crmRestructureNav() {
  const nav = document.querySelector('.bottom-nav');
  if (!nav) return;
  const settingsBtn = nav.querySelector('.nav-btn[data-route="instellingen"]');
  if (settingsBtn) settingsBtn.remove();
  const vandaagBtn = document.createElement('button');
  vandaagBtn.className = 'nav-btn';
  vandaagBtn.dataset.route = 'vandaag';
  vandaagBtn.setAttribute('aria-label', 'Vandaag');
  vandaagBtn.innerHTML = uiIcon('calendar') + 'Vandaag';
  vandaagBtn.onclick = () => { history.pushState(null, '', '#vandaag'); routeHash(); };
  nav.prepend(vandaagBtn);
  const actions = document.querySelector('.app-actions');
  if (actions && !document.getElementById('crm-header-settings')) {
    const gearBtn = document.createElement('button');
    gearBtn.type = 'button'; gearBtn.id = 'crm-header-settings'; gearBtn.className = 'ghost header-icon-btn';
    gearBtn.setAttribute('aria-label', 'Instellingen');
    gearBtn.innerHTML = uiIcon('settings');
    gearBtn.onclick = () => { history.pushState(null, '', '#instellingen'); routeHash(); };
    actions.prepend(gearBtn);
  }
})();

const crmBaseHidePages = hidePages;
hidePages = function () { crmBaseHidePages(); crmVandaagPage.hidden = true; };

const crmBaseRouteHash = routeHash;
routeHash = function () {
  const hash = location.hash.slice(1);
  if (!hash || hash === 'vandaag') {
    if (!hash) history.replaceState(null, '', '#vandaag');
    hidePages(); crmVandaagPage.hidden = false; crmRenderVandaag(); setNav('vandaag'); window.scrollTo({ top: 0 });
    return;
  }
  crmBaseRouteHash();
};
// Bij het opstarten heeft de basisketen (jobs.js e.a.) routeHash() al één keer aangeroepen mét
// een lege hash, vóórdat deze laag (die als een van de laatste laadt) de kans had om 'm te
// wrappen — dat landde dus nog op het oude "Klussen"-startscherm. Nu de wrap staat, hier alsnog
// een keer opnieuw routeren zodat Vandaag echt het startscherm is. Een actieve conceptklus
// (hash al op #kostprijs gezet door de resume-afhandeling) blijft met rust: de wrap grijpt dan
// niet in en delegeert gewoon door.
routeHash();

/* ---------- Automatische acties: haken in bestaande functies (zie bovenaan dit bestand) ---------- */
const crmBaseSaveCalculation = saveCalculation;
saveCalculation = function () {
  const isNew = savedProjectId === null;
  const beforeCount = (safeGet(STORE.calculations, []) || []).length;
  crmBaseSaveCalculation();
  if (!isNew) return;
  const list = safeGet(STORE.calculations, []);
  if (!Array.isArray(list) || list.length <= beforeCount) return; // opslaan afgebroken (validatie) -> geen nieuwe entry
  const entry = list[0];
  savedProjectId = entry.id; // voorkomt dubbele "opname"-acties bij herhaald bewaren in dezelfde sessie
  const job = (entry.data && entry.data.job) || {};
  crmSaveActions([crmAutoActionForNewJob(entry.id, job.customerId, new Date()), ...crmActions()]);
};

const crmBaseSetJobFase = setJobFase;
setJobFase = function (job, fase, now, reason) {
  const prevFase = job && job.fase;
  const next = crmBaseSetJobFase(job, fase, now, reason);
  if (next !== job && next.fase !== prevFase && savedProjectId) {
    const auto = crmAutoActionForFaseChange(next.fase, savedProjectId, next.customerId, now || new Date());
    if (auto) crmSaveActions([auto, ...crmActions()]);
  }
  return next;
};

/* ---------- Instellingen → kaart "Opvolging" ---------- */
function addCrmSettingsCard() {
  const settings = document.getElementById('design-settings');
  if (!settings || document.getElementById('crm-settings-save')) return;
  const s = crmSettings();
  const faseKeys = JOB_FASES.filter(([k]) => !TERMINAL_FASES.has(k)).map(([k, label]) => [k, label]);
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = '<h2>Opvolging</h2><p class="muted">Na hoeveel dagen zonder contact een klus per fase als "verwaarloosd" geldt.</p><div class="job-grid">' +
    faseKeys.map(([k, label]) => '<div><label for="crm-rot-' + k + '">' + esc(label) + '</label><input id="crm-rot-' + k + '" type="number" min="1" step="1" value="' + esc(s.rotting[k]) + '"></div>').join('') +
    '</div><div class="intake-toggle"><label for="crm-dagstart-toggle">Dagstart-melding (07:30, alleen als de app open staat)</label><input id="crm-dagstart-toggle" type="checkbox"' + (s.dagstartNotify ? ' checked' : '') + '></div>' +
    '<button class="act" id="crm-settings-save">Opvolging bewaren</button><p id="crm-settings-status" role="status" class="job-status"></p>' +
    '<button class="ghost" id="crm-export-all-ics" type="button">Alle open acties exporteren (.ics)</button>' +
    '<p class="muted">Eenmalige export — wijzigingen in je agenda komen niet terug in Werkbank.</p>';
  settings.appendChild(card);
  card.querySelector('#crm-settings-save').onclick = () => {
    const rotting = {};
    for (const [k] of faseKeys) rotting[k] = Math.max(1, Number(document.getElementById('crm-rot-' + k).value) || 1);
    const dagstartNotify = document.getElementById('crm-dagstart-toggle').checked;
    crmSaveSettings({ rotting, dagstartNotify });
    if (dagstartNotify && typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission();
    document.getElementById('crm-settings-status').textContent = 'Bewaard.';
  };
  card.querySelector('#crm-export-all-ics').onclick = crmExportAllOpenIcs;
}
// Instellingen → kaart "Berichten": de 5 sjablonen uit pakket 2, met placeholder-uitleg.
function addCrmTemplatesSettingsCard() {
  const settings = document.getElementById('design-settings');
  if (!settings || document.getElementById('crm-templates-save')) return;
  const templates = crmTemplates();
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = '<h2>Berichten</h2><p class="muted">Gebruikt bij WhatsApp/mail vanaf de klantkaart. Placeholders: {klant} {klus} {bedrag} {datum} {bedrijf}.</p>' +
    templates.map((t, i) => '<div><label for="crm-tpl-' + i + '">' + esc(t.label) + '</label><textarea id="crm-tpl-' + i + '" rows="2">' + esc(t.text) + '</textarea></div>').join('') +
    '<button class="act" id="crm-templates-save">Berichten bewaren</button><p id="crm-templates-status" role="status" class="job-status"></p>';
  settings.appendChild(card);
  card.querySelector('#crm-templates-save').onclick = () => {
    const next = templates.map((t, i) => Object.assign({}, t, { text: document.getElementById('crm-tpl-' + i).value }));
    crmSaveTemplates(next);
    document.getElementById('crm-templates-status').textContent = 'Bewaard.';
  };
}
const crmBaseAddCloudSettingsCard = typeof addCloudSettingsCard === 'function' ? addCloudSettingsCard : null;
if (crmBaseAddCloudSettingsCard) addCloudSettingsCard = function () { crmBaseAddCloudSettingsCard(); addCrmSettingsCard(); addCrmTemplatesSettingsCard(); };
addCrmSettingsCard();
addCrmTemplatesSettingsCard();

/* ---------- Dagstart-notificatie (alleen als de app open staat, geen pushserver) ---------- */
(function crmDagstartNotification() {
  const s = crmSettings();
  if (!s.dagstartNotify || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (!crmNeedsDagstart()) return;
  const now = new Date(), target = new Date(now); target.setHours(7, 30, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  const delay = target.getTime() - now.getTime();
  if (delay < 24 * 60 * 60 * 1000) setTimeout(() => { if (crmNeedsDagstart()) new Notification('Werkbank', { body: 'Bekijk je acties voor vandaag.' }); }, delay);
})();

/* ==================== Pakket 2 — Contact in één tik (UI) ==================== */

function crmCustomerRow(id) { return customers().find(c => c.id === id) || null; }
function crmProjectsForCustomer(customerId) { return savedProjects().filter(r => r.data.job && r.data.job.customerId === customerId); }

function crmKlantRowHtml(c) {
  return '<button type="button" class="recent-row crm-customer-row" data-crm-klant="' + esc(c.id) + '">' + uiIcon('document') +
    '<span><b>' + esc(c.name) + '</b><small>' + esc([c.phone, c.email].filter(Boolean).join(' · ') || 'Geen contactgegevens') + '</small></span>' +
    '<span aria-hidden="true" style="flex:0">›</span></button>';
}

/* ---------- Auto-loggen + uitkomst-balk ---------- */
let crmPendingOutcome = null;
function crmLogContact(channel, customerId, projectId, actionId, note) {
  const entry = crmMakeLogEntry({ customerId, projectId: projectId || undefined, channel, note: note || null, actionId: actionId || undefined }, new Date());
  crmSaveLog([entry, ...crmLog()]);
  return entry;
}
function crmOpenActionFor(customerId, projectId) {
  return crmActions().find(a => !a.done && (a.customerId === customerId || a.projectId === projectId));
}
function crmTriggerContact(channel, customer, projectId) {
  const openAction = crmOpenActionFor(customer.id, projectId);
  const entry = crmLogContact(channel, customer.id, projectId, openAction && openAction.id);
  crmPendingOutcome = { logId: entry.id, customerId: customer.id, projectId, customerName: customer.name, actionId: openAction && openAction.id };
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && crmPendingOutcome) {
    const pending = crmPendingOutcome; crmPendingOutcome = null;
    crmShowOutcomeBar(pending);
  }
});
function crmShowOutcomeBar(pending) {
  document.getElementById('crm-outcome-bar')?.remove();
  const bar = document.createElement('div');
  bar.id = 'crm-outcome-bar';
  bar.className = 'crm-outcome-bar no-print';
  bar.setAttribute('role', 'status');
  bar.innerHTML = '<p>Contact met ' + esc(pending.customerName) + ' — uitkomst?</p>' +
    '<div class="crm-quick-row">' +
    '<button type="button" class="ghost" data-crm-outcome="geen-gehoor">Geen gehoor</button>' +
    '<button type="button" class="ghost" data-crm-outcome="terugbellen">Terugbellen</button>' +
    '<button type="button" class="ghost" data-crm-outcome="afspraak">Afspraak</button>' +
    '<button type="button" class="ghost" data-crm-outcome="notitie">Notitie</button>' +
    '</div><button type="button" class="ghost crm-outcome-close" aria-label="Sluiten">×</button>';
  document.body.appendChild(bar);
  const close = () => bar.remove();
  bar.querySelector('.crm-outcome-close').onclick = close;
  const setOutcome = text => { crmSaveLog(crmLog().map(l => l.id === pending.logId ? Object.assign({}, l, { note: text }) : l)); };
  bar.querySelector('[data-crm-outcome="geen-gehoor"]').onclick = () => { setOutcome('Geen gehoor'); close(); };
  bar.querySelector('[data-crm-outcome="terugbellen"]').onclick = () => {
    setOutcome('Terugbellen');
    const action = crmMakeAction({ type: 'bellen', title: 'Terugbellen', dueAt: crmAddDays(new Date(), 1).toISOString(), projectId: pending.projectId, customerId: pending.customerId }, new Date());
    crmSaveActions([action, ...crmActions()]);
    close();
    if (!crmVandaagPage.hidden) crmRenderVandaag();
  };
  bar.querySelector('[data-crm-outcome="afspraak"]').onclick = () => {
    close();
    crmOpenAppointmentPicker(pending);
  };
  bar.querySelector('[data-crm-outcome="notitie"]').onclick = () => {
    close();
    crmOpenNoteSheet(pending.customerId, pending.projectId, text => setOutcome(text));
  };
}
function crmOpenAppointmentPicker(pending) {
  const overlay = document.createElement('div');
  overlay.className = 'editor-backdrop no-print';
  overlay.innerHTML = '<section class="material-editor" role="dialog" aria-modal="true" aria-labelledby="crm-appt-title" style="max-width:380px">' +
    '<div class="editor-head"><h2 id="crm-appt-title">Afspraak plannen</h2><button class="ghost" id="crm-appt-close" aria-label="Sluiten">×</button></div>' +
    '<label for="crm-appt-type">Type</label><select id="crm-appt-type"><option value="opname">Opname</option><option value="bezoek">Bezoek</option></select>' +
    '<label for="crm-appt-date">Datum</label><input type="date" id="crm-appt-date" value="' + ymd(crmAddDays(new Date(), 1)) + '">' +
    '<button class="act" id="crm-appt-save">Plannen</button></section>';
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('#crm-appt-close').onclick = close;
  overlay.querySelector('#crm-appt-save').onclick = () => {
    const type = overlay.querySelector('#crm-appt-type').value, date = overlay.querySelector('#crm-appt-date').value;
    if (!date) return;
    const action = crmMakeAction({ type, title: type === 'opname' ? 'Opname inplannen' : 'Bezoek inplannen', dueAt: new Date(date + 'T09:00:00').toISOString(), projectId: pending.projectId, customerId: pending.customerId }, new Date());
    crmSaveActions([action, ...crmActions()]);
    close();
    if (!crmVandaagPage.hidden) crmRenderVandaag();
  };
  overlay.onkeydown = e => { if (e.key === 'Escape') close(); };
}

/* ---------- Snelnotitie (tekst + optioneel dicteren) ---------- */
function crmOpenNoteSheet(customerId, projectId, onSaved) {
  const overlay = document.createElement('div');
  overlay.className = 'editor-backdrop no-print';
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  overlay.innerHTML = '<section class="material-editor" role="dialog" aria-modal="true" aria-labelledby="crm-note-title" style="max-width:420px">' +
    '<div class="editor-head"><h2 id="crm-note-title">Notitie</h2><button class="ghost" id="crm-note-close" aria-label="Sluiten">×</button></div>' +
    '<textarea id="crm-note-text" rows="5" placeholder="Typ of dicteer een notitie…"></textarea>' +
    (SpeechRec ? '<button type="button" class="ghost" id="crm-note-mic" aria-label="Dicteer notitie">🎙 Dicteren</button>' : '') +
    '<button class="act" id="crm-note-save">Opslaan</button></section>';
  document.body.appendChild(overlay);
  const textEl = overlay.querySelector('#crm-note-text');
  const close = () => overlay.remove();
  overlay.querySelector('#crm-note-close').onclick = close;
  textEl.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); overlay.querySelector('#crm-note-save').click(); } };
  if (SpeechRec) {
    const mic = overlay.querySelector('#crm-note-mic');
    let recognizing = false, recognizer = null;
    mic.onclick = () => {
      if (recognizing) { recognizer.stop(); return; }
      recognizer = new SpeechRec();
      recognizer.lang = 'nl-NL'; recognizer.interimResults = false;
      recognizer.onresult = e => { textEl.value = (textEl.value ? textEl.value + ' ' : '') + e.results[0][0].transcript; };
      recognizer.onstart = () => { recognizing = true; mic.textContent = '● Opname…'; };
      recognizer.onend = () => { recognizing = false; mic.textContent = '🎙 Dicteren'; };
      recognizer.start();
    };
  }
  overlay.querySelector('#crm-note-save').onclick = () => {
    const text = textEl.value.trim();
    if (!text) { close(); return; }
    crmLogContact('notitie', customerId, projectId, null, text);
    if (onSaved) onSaved(text);
    close();
    if (location.hash.slice(1) === 'klant/' + customerId) crmRenderKlantkaart(customerId);
  };
  overlay.onkeydown = e => { if (e.key === 'Escape') close(); };
  queueMicrotask(() => textEl.focus());
}

/* ---------- Berichtsjablonen: keuze vóór WhatsApp/Mail versturen ---------- */
function crmTemplateVars(customer, row) {
  const profile = safeGet(COMPANY_PROFILE_KEY, {});
  const sale = row ? crmProjectSaleTotal(row.data) : null;
  return {
    klant: customer.name, bedrijf: (profile && profile.bedrijfsnaam) || '',
    klus: row ? (row.data.project || 'je klus') : '', bedrag: sale != null ? euro(sale / 100) : '',
    datum: new Date().toLocaleDateString('nl-NL')
  };
}
function crmOpenTemplatePicker(channel, customer, row) {
  const overlay = document.createElement('div');
  overlay.className = 'editor-backdrop no-print';
  const vars = crmTemplateVars(customer, row);
  const templates = crmTemplates();
  overlay.innerHTML = '<section class="material-editor" role="dialog" aria-modal="true" aria-labelledby="crm-tpl-title" style="max-width:420px">' +
    '<div class="editor-head"><h2 id="crm-tpl-title">Bericht kiezen</h2><button class="ghost" id="crm-tpl-close" aria-label="Sluiten">×</button></div>' +
    '<div class="crm-template-list">' + templates.map(t => '<button type="button" class="ghost crm-template-btn" data-crm-tpl="' + esc(t.id) + '">' + esc(t.label) + '</button>').join('') +
    '<button type="button" class="ghost crm-template-btn" data-crm-tpl="_leeg">Leeg bericht</button></div></section>';
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('#crm-tpl-close').onclick = close;
  overlay.querySelectorAll('[data-crm-tpl]').forEach(b => b.onclick = () => {
    const id = b.dataset.crmTpl;
    const tpl = templates.find(t => t.id === id);
    const text = tpl ? crmFillTemplate(tpl.text, vars) : '';
    close();
    crmTriggerContact(channel, customer, row && row.id);
    crmSaveLog(crmLog().map(l => l.id === crmPendingOutcome.logId ? Object.assign({}, l, { note: tpl ? tpl.label : 'Leeg bericht' }) : l));
    const url = channel === 'whatsapp' ? crmWaLink(customer.phone, text) : crmMailtoLink(customer.email, tpl ? tpl.label : '', text);
    window.open(url, '_blank');
  });
  overlay.onkeydown = e => { if (e.key === 'Escape') close(); };
}

/* ---------- Klantkaart ---------- */
const crmKlantkaartPage = document.createElement('section');
crmKlantkaartPage.id = 'crm-klantkaart';
crmKlantkaartPage.className = 'page';
crmKlantkaartPage.hidden = true;
document.querySelector('.wrap').append(crmKlantkaartPage);

function crmRenderKlantkaart(id) {
  const c = crmCustomerRow(id);
  if (!c) { crmKlantkaartPage.innerHTML = '<div class="page-head"><h1>Klant niet gevonden</h1></div><a href="#klanten">← Terug naar klanten</a>'; return; }
  const rows = crmProjectsForCustomer(id);
  const logs = crmLog(), actions = crmActions(), allRows = savedProjects();
  const quotes = typeof QUOTE_STORE_KEY !== 'undefined' ? safeGet(QUOTE_STORE_KEY, []) : [];
  const timeline = crmGroupTimelineByDay(crmTimelineFor(id, logs, actions, allRows, quotes));

  // Bewust alle drie .ghost, niet .act: de harde randvoorwaarde staat max één primaire
  // (oranje) knop per scherm toe, en deze drie zijn gelijkwaardig — geen van de drie is "de"
  // hoofdactie van de klantkaart.
  const contactHtml = '<div class="crm-contact-buttons">' +
    (c.phone ? '<a class="ghost crm-contact-btn" href="' + esc(crmTelLink(c.phone)) + '" data-crm-contact="bellen">' + uiIcon('bellen') + 'Bel</a>' : '<button type="button" class="ghost crm-contact-btn" disabled>' + uiIcon('bellen') + 'Bel</button>') +
    (c.phone ? '<button type="button" class="ghost crm-contact-btn" data-crm-contact="whatsapp">' + uiIcon('whatsapp') + 'WhatsApp</button>' : '<button type="button" class="ghost crm-contact-btn" disabled>' + uiIcon('whatsapp') + 'WhatsApp</button>') +
    (c.email ? '<button type="button" class="ghost crm-contact-btn" data-crm-contact="mail">' + uiIcon('mail') + 'Mail</button>' : '<button type="button" class="ghost crm-contact-btn" disabled>' + uiIcon('mail') + 'Mail</button>') +
    '</div>';

  const timelineHtml = timeline.length ? timeline.map(g => '<div class="crm-timeline-day"><h3>' + esc(new Date(g.day).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })) + '</h3>' +
    g.items.map(crmTimelineItemHtml).join('') + '</div>').join('') : '<p class="muted">Nog geen contact gelogd.</p>';

  const projectsHtml = rows.length ? rows.map(row => {
    const job = row.data.job || {};
    const sale = crmProjectSaleTotal(row.data);
    return '<div class="crm-project-row" data-crm-open-project="' + esc(row.id) + '"><span><b>' + esc(row.data.project || 'Naamloze klus') + '</b>' + faseBadgeHtml(job.fase) + '</span><strong class="font-mono">' + (sale != null ? euro(sale / 100) : '—') + '</strong></div>';
  }).join('') : '<p class="muted">Nog geen klussen voor deze klant.</p>';

  crmKlantkaartPage.innerHTML = '<div class="page-head"><div><h1>' + esc(c.name) + '</h1><p class="sub">' + esc(c.address || 'Geen adres bekend') + '</p></div><a class="back" href="#klanten">← Klanten</a></div>' +
    contactHtml +
    '<button type="button" class="ghost crm-note-btn" id="crm-note-open">Notitie toevoegen</button>' +
    '<button type="button" class="ghost" id="crm-edit-open">Gegevens bewerken</button>' +
    '<div id="crm-edit-form" hidden></div>' +
    '<section class="crm-section"><h2>Tijdlijn</h2><div class="crm-timeline">' + timelineHtml + '</div></section>' +
    '<section class="crm-section"><h2>Klussen van deze klant</h2><div class="crm-list">' + projectsHtml + '</div></section>';

  crmKlantkaartPage.querySelectorAll('[data-crm-contact]').forEach(btn => {
    const channel = btn.dataset.crmContact;
    if (channel === 'bellen') { btn.addEventListener('click', () => crmTriggerContact('bellen', c, rows[0] && rows[0].id)); return; }
    btn.onclick = () => crmOpenTemplatePicker(channel, c, rows[0]);
  });
  crmKlantkaartPage.querySelectorAll('[data-crm-open-project]').forEach(row => row.onclick = () => openSavedProject(crmProjectRow(row.dataset.crmOpenProject)));
  document.getElementById('crm-note-open').onclick = () => crmOpenNoteSheet(id, rows[0] && rows[0].id);
  document.getElementById('crm-edit-open').onclick = () => crmToggleEditForm(c);
}
function crmTimelineItemHtml(item) {
  const time = crmTimeLabel(item.at);
  if (item.kind === 'log') {
    const icon = { bellen: 'bellen', whatsapp: 'whatsapp', mail: 'mail', bezoek: 'opname', notitie: 'overig' }[item.entry.channel] || 'overig';
    return '<div class="crm-timeline-item"><span class="font-mono">' + time + '</span>' + uiIcon(icon) + '<span>' + esc(crmChannelLabel(item.entry.channel)) + (item.entry.note ? ' — ' + esc(item.entry.note) : '') + '</span></div>';
  }
  if (item.kind === 'action-created') return '<div class="crm-timeline-item"><span class="font-mono">' + time + '</span>' + uiIcon('calendar') + '<span>Actie gepland: ' + esc(item.entry.title) + '</span></div>';
  if (item.kind === 'action-done') return '<div class="crm-timeline-item"><span class="font-mono">' + time + '</span>' + uiIcon('calendar') + '<span>Afgerond: ' + esc(item.entry.title) + (item.entry.outcome ? ' — ' + esc(item.entry.outcome) : '') + '</span></div>';
  if (item.kind === 'fase') return '<div class="crm-timeline-item"><span class="font-mono">' + time + '</span>' + uiIcon('document') + '<span>' + esc(item.entry.projectName || 'Klus') + ' → ' + esc(faseLabelOnly(item.entry.fase)) + '</span></div>';
  if (item.kind === 'document') return '<div class="crm-timeline-item"><span class="font-mono">' + time + '</span>' + uiIcon('offerte') + '<span>Verstuurd: ' + esc(item.entry.number || 'document') + (item.entry.projectName ? ' — ' + esc(item.entry.projectName) : '') + '</span></div>';
  return '';
}
function crmChannelLabel(ch) { return { bellen: 'Gebeld', whatsapp: 'WhatsApp-bericht', mail: 'E-mail', bezoek: 'Bezoek', notitie: 'Notitie' }[ch] || ch; }

function crmToggleEditForm(c) {
  const el = document.getElementById('crm-edit-form');
  if (!el.hidden) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  el.innerHTML = '<div class="job-panel job-grid">' +
    '<div><label for="crm-e-name">Naam / bedrijf</label><input id="crm-e-name" value="' + esc(c.name) + '"></div>' +
    '<div><label for="crm-e-contact">Contactpersoon</label><input id="crm-e-contact" value="' + esc(c.contact || '') + '"></div>' +
    '<div><label for="crm-e-email">E-mail</label><input id="crm-e-email" type="email" value="' + esc(c.email || '') + '"></div>' +
    '<div><label for="crm-e-phone">Telefoon</label><input id="crm-e-phone" type="tel" value="' + esc(c.phone || '') + '"></div>' +
    '<div class="wide"><label for="crm-e-address">Adres</label><input id="crm-e-address" value="' + esc(c.address || '') + '" placeholder="Straat, postcode, plaats"></div>' +
    '</div><button class="act" id="crm-e-save">Bewaren</button>' +
    '<button class="ghost" id="crm-e-geocode" type="button">Adres op kaart zetten</button>' +
    '<p class="muted">Stuurt het adres naar OpenStreetMap (Nominatim) om coördinaten op te zoeken — alleen als je hierop klikt.</p>' +
    (Number.isFinite(c.lat) ? '<p class="muted">Al op de kaart gezet.</p>' : '') +
    '<p id="crm-e-status" role="status" class="job-status"></p>';
  function saveCustomerFields(extra) {
    const next = Object.assign({}, c, {
      name: document.getElementById('crm-e-name').value.trim() || c.name,
      contact: document.getElementById('crm-e-contact').value.trim(),
      email: document.getElementById('crm-e-email').value.trim(),
      phone: document.getElementById('crm-e-phone').value.trim(),
      address: document.getElementById('crm-e-address').value.trim(),
    }, extra || {});
    if (next.address && next.address !== c.address && !extra) { delete next.lat; delete next.lng; } // adres gewijzigd -> oude coördinaten niet meer betrouwbaar
    safeSet(CUSTOMER_KEY, [next, ...customers().filter(x => x.id !== c.id)]);
    return next;
  }
  document.getElementById('crm-e-save').onclick = () => {
    saveCustomerFields();
    document.getElementById('crm-e-status').textContent = 'Bewaard.';
    crmRenderKlantkaart(c.id);
  };
  document.getElementById('crm-e-geocode').onclick = async () => {
    const address = document.getElementById('crm-e-address').value.trim();
    if (!address) { document.getElementById('crm-e-status').textContent = 'Vul eerst een adres in.'; return; }
    const btn = document.getElementById('crm-e-geocode'); btn.disabled = true;
    document.getElementById('crm-e-status').textContent = 'Adres opzoeken bij OpenStreetMap…';
    try {
      const res = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(address), { headers: { 'User-Agent': CRM_GEOCODE_UA } });
      const data = await res.json();
      if (!Array.isArray(data) || !data.length) { document.getElementById('crm-e-status').textContent = 'Adres niet gevonden.'; return; }
      saveCustomerFields({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
      document.getElementById('crm-e-status').textContent = 'Adres op de kaart gezet.';
      crmRenderKlantkaart(c.id);
    } catch (e) { document.getElementById('crm-e-status').textContent = 'Opzoeken mislukt — probeer het later opnieuw.'; }
    finally { btn.disabled = false; }
  };
}

/* ---------- Routing: #klant/<id> + klantenlijst wijst nu naar de klantkaart ---------- */
const crmBaseHidePages2 = hidePages;
hidePages = function () { crmBaseHidePages2(); crmKlantkaartPage.hidden = true; };

const crmBaseRouteHash2 = routeHash;
routeHash = function () {
  const hash = location.hash.slice(1);
  if (hash.indexOf('klant/') === 0) {
    hidePages(); crmKlantkaartPage.hidden = false; crmRenderKlantkaart(hash.slice(6)); setNav('klanten'); window.scrollTo({ top: 0 });
    return;
  }
  crmBaseRouteHash2();
};
// jobs.js registreert routeHash zelf als hashchange/popstate-listener (met expliciete remove+
// re-add, zie daar) — een addEventListener-registratie legt de FUNCTIEWAARDE op dat moment vast,
// niet een live binding. Onze twee wraps hierboven (Vandaag, #klant/<id>) veranderen dus wél wat
// een directe routeHash()-aanroep doet, maar NIET wat er gebeurt bij een echte hash-wijziging
// (terug/vooruit-knop, location.hash = …) — die blijft de oude, kalere versie aanroepen totdat de
// listener zelf wordt vervangen. crmBaseRouteHash2 is precies de functiewaarde die daar op dit
// moment geregistreerd staat, dus die kan veilig verwijderd en vervangen worden.
window.removeEventListener('hashchange', crmBaseRouteHash2);
window.removeEventListener('popstate', crmBaseRouteHash2);
window.addEventListener('hashchange', routeHash);
window.addEventListener('popstate', routeHash);
// De bestaande klantenlijst (renderCustomers, uit jobs.js) toont elke klant als een bewerkbare
// rij in dezelfde pagina; hier voegen we ná die render een klik-naar-klantkaart-laag overheen +
// een adresveld aan het "klant toevoegen"-formulier, zonder renderCustomers zelf te herschrijven.
const crmBaseRenderCustomers = renderCustomers;
renderCustomers = function () {
  crmBaseRenderCustomers();
  const list = customers();
  const panels = customerPage.querySelectorAll('.job-panel');
  panels.forEach((panel, i) => {
    if (i >= list.length) return; // de laatste .job-panel is het toevoeg-formulier, niet een klant
    const c = list[i];
    panel.style.cursor = 'pointer';
    panel.addEventListener('click', e => { if (e.target.closest('button')) return; location.hash = 'klant/' + c.id; });
  });
  const addressField = document.getElementById('crm-add-address');
  if (!addressField) {
    const form = document.getElementById('customer-form-title')?.closest('.job-panel');
    const grid = form && form.querySelector('.job-grid');
    if (grid) {
      const wrap = document.createElement('div'); wrap.className = 'wide';
      wrap.innerHTML = '<label for="crm-add-address">Adres</label><input id="crm-add-address" placeholder="Straat, postcode, plaats">';
      grid.appendChild(wrap);
      const baseSave = document.getElementById('client-save').onclick;
      document.getElementById('client-save').onclick = () => {
        baseSave();
        // Adres apart bewaren: het bestaande save-pad kent dit veld nog niet, dus hier aanvullen.
        const saved = customers();
        const justSaved = saved[0];
        const address = document.getElementById('crm-add-address').value.trim();
        if (justSaved && address) safeSet(CUSTOMER_KEY, [Object.assign({}, justSaved, { address }), ...saved.slice(1)]);
      };
    }
  }
};

/* ==================== Pakket 3 — Overzicht & inzicht (UI) ==================== */

// Fasewissel van een klus die NIET de actief geopende klus is (bv. vanaf het kanban-bord) —
// hergebruikt de (in pakket 1 al gewrapte) setJobFase() zelf, door savedProjectId tijdelijk op
// de doelklus te zetten zodat de automatische-acties-wrap daar aan de juiste klus koppelt.
function crmSetProjectFase(rowId, fase, reason) {
  const list = safeGet(STORE.calculations, []);
  const idx = list.findIndex(x => x.id === rowId);
  if (idx === -1) return false;
  const entry = list[idx];
  const prevSavedProjectId = savedProjectId;
  savedProjectId = rowId;
  const nextJob = setJobFase(entry.data.job || {}, fase, new Date(), reason);
  const nextList = list.slice();
  nextList[idx] = Object.assign({}, entry, { data: Object.assign({}, entry.data, { job: nextJob }) });
  safeSet(STORE.calculations, nextList);
  savedProjectId = prevSavedProjectId;
  return true;
}
function crmNextActionFor(rowId) {
  const open = crmOpenActions(crmActions()).filter(a => a.projectId === rowId).sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
  return open[0] || null;
}

/* ---------- Kanban-bord (desktop ≥ 1024 px) / gefilterde lijst (mobiel) ---------- */
const crmPipelinePage = document.createElement('section');
crmPipelinePage.id = 'crm-pipeline';
crmPipelinePage.className = 'page';
crmPipelinePage.hidden = true;
document.querySelector('.wrap').append(crmPipelinePage);
let crmPipelineFilter = null;

function crmPipelineCardHtml(row, now) {
  const job = row.data.job || {};
  const sale = crmProjectSaleTotal(row.data);
  const rot = crmIsRotting(row, crmActions(), crmLog(), crmSettings(), now);
  const next = crmNextActionFor(row.id);
  const customer = job.customerId ? crmCustomerById(job.customerId) : null;
  return '<div class="crm-kanban-card" draggable="true" data-project="' + esc(row.id) + '">' +
    '<b>' + esc(row.data.project || 'Naamloze klus') + '</b>' +
    (customer ? '<small>' + esc(customer.name) + '</small>' : '') +
    '<strong class="font-mono">' + (sale != null ? euro(sale / 100) : '—') + '</strong>' +
    (rot.rotting ? '<span class="fase-badge" data-tone="danger"><span class="fase-dot"></span>' + rot.days + ' dagen stil</span>' : '') +
    (next ? '<small class="crm-next-action">Volgende: ' + esc(crmDateLabel(next.dueAt)) + '</small>' : '<small class="muted">Geen actie gepland</small>') +
    '</div>';
}
function crmRenderPipeline() {
  const desktop = window.matchMedia('(min-width:1024px)').matches;
  const rows = savedProjects().filter(r => CRM_PIPELINE_FASES.includes((r.data.job && r.data.job.fase) || 'indicatie'));
  const now = new Date();
  let html = '<div class="page-head"><div><h1>Pipeline</h1><p class="sub">Al je klussen per fase.</p></div></div>';
  if (desktop) {
    html += '<div class="crm-kanban">' + CRM_PIPELINE_FASES.map(fase => {
      const colRows = rows.filter(r => (r.data.job.fase || 'indicatie') === fase);
      const total = colRows.reduce((s, r) => s + (crmProjectSaleTotal(r.data) || 0), 0);
      return '<div class="crm-kanban-col" data-fase="' + fase + '"><div class="crm-kanban-col-head">' + esc(faseLabelOnly(fase)) + ' <span class="font-mono">' + colRows.length + ' · ' + euro(total / 100) + '</span></div>' +
        '<div class="crm-kanban-col-body">' + colRows.map(r => crmPipelineCardHtml(r, now)).join('') + '</div></div>';
    }).join('') + '</div>';
  } else {
    html += '<div class="crm-filter-chips">' +
      '<button type="button" class="ghost' + (!crmPipelineFilter ? ' active' : '') + '" data-crm-filter="">Alles · ' + rows.length + '</button>' +
      CRM_PIPELINE_FASES.map(fase => {
        const n = rows.filter(r => (r.data.job.fase || 'indicatie') === fase).length;
        return '<button type="button" class="ghost' + (crmPipelineFilter === fase ? ' active' : '') + '" data-crm-filter="' + fase + '">' + esc(faseLabelOnly(fase)) + ' · ' + n + '</button>';
      }).join('') + '</div>';
    const filtered = crmPipelineFilter ? rows.filter(r => (r.data.job.fase || 'indicatie') === crmPipelineFilter) : rows;
    html += '<div class="crm-list">' + (filtered.length ? filtered.map(row => {
      const job = row.data.job || {};
      const sale = crmProjectSaleTotal(row.data);
      const next = crmNextActionFor(row.id);
      return '<div class="crm-project-row" data-crm-open-project="' + esc(row.id) + '"><span><b>' + esc(row.data.project || 'Naamloze klus') + '</b>' + faseBadgeHtml(job.fase) + (next ? '<small>Volgende: ' + esc(crmDateLabel(next.dueAt)) + '</small>' : '') + '</span><strong class="font-mono">' + (sale != null ? euro(sale / 100) : '—') + '</strong></div>';
    }).join('') : '<p class="muted">Geen klussen in deze fase.</p>') + '</div>';
  }
  crmPipelinePage.innerHTML = html;
  crmBindPipeline(desktop);
}
function crmBindPipeline(desktop) {
  crmPipelinePage.querySelectorAll('[data-crm-open-project]').forEach(el => el.onclick = () => openSavedProject(crmProjectRow(el.dataset.crmOpenProject)));
  if (!desktop) {
    crmPipelinePage.querySelectorAll('[data-crm-filter]').forEach(b => b.onclick = () => { crmPipelineFilter = b.dataset.crmFilter || null; crmRenderPipeline(); });
    return;
  }
  let dragId = null;
  crmPipelinePage.querySelectorAll('.crm-kanban-card').forEach(card => {
    card.addEventListener('dragstart', () => { dragId = card.dataset.project; card.classList.add('dragging'); });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.addEventListener('click', () => openSavedProject(crmProjectRow(card.dataset.project)));
  });
  crmPipelinePage.querySelectorAll('.crm-kanban-col').forEach(col => {
    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drag-over'); });
    col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
    col.addEventListener('drop', e => {
      e.preventDefault(); col.classList.remove('drag-over');
      if (!dragId) return;
      const row = crmProjectRow(dragId);
      const targetFase = col.dataset.fase;
      if (!row || targetFase === row.data.job.fase) return;
      const fromIdx = CRM_PIPELINE_FASES.indexOf(row.data.job.fase || 'indicatie'), toIdx = CRM_PIPELINE_FASES.indexOf(targetFase);
      if (toIdx < fromIdx && !confirm('Terugzetten naar ' + faseLabelOnly(targetFase) + '? Dit is een eerdere fase.')) return;
      crmSetProjectFase(dragId, targetFase);
      crmRenderPipeline();
    });
  });
}
window.matchMedia('(min-width:1024px)').addEventListener?.('change', () => { if (location.hash.slice(1) === 'pipeline') crmRenderPipeline(); });

const crmBaseHidePages3 = hidePages;
hidePages = function () { crmBaseHidePages3(); crmPipelinePage.hidden = true; };
const crmBaseRouteHash3 = routeHash;
routeHash = function () {
  const hash = location.hash.slice(1);
  if (hash === 'pipeline') { hidePages(); crmPipelinePage.hidden = false; crmRenderPipeline(); setNav('klanten'); window.scrollTo({ top: 0 }); return; }
  crmBaseRouteHash3();
};
window.removeEventListener('hashchange', crmBaseRouteHash3);
window.removeEventListener('popstate', crmBaseRouteHash3);
window.addEventListener('hashchange', routeHash);
window.addEventListener('popstate', routeHash);

/* ---------- Dashboard-KPI's (3 nieuwe kaarten, los van de bestaande offerte-KPI's) ---------- */
function crmRenderDashboardKpis() {
  const target = document.getElementById('design-dashboard');
  if (!target) return;
  let el = document.getElementById('crm-kpi-block');
  const rows = savedProjects();
  if (!rows.length) { if (el) el.hidden = true; return; }
  if (!el) {
    el = document.createElement('div'); el.id = 'crm-kpi-block'; el.className = 'crm-kpi-block';
    const anchor = document.getElementById('quote-pipeline') || document.getElementById('projects-kpi');
    if (anchor) anchor.after(el); else target.prepend(el);
  }
  el.hidden = false;
  const conv = crmConversionKpi(rows, new Date(), 90);
  const doorlooptijd1 = crmMedianDaysBetween(rows, 'offerte_verzonden', 'opdracht');
  const doorlooptijd2 = crmMedianDaysBetween(rows, 'opdracht', 'geleverd');
  const outstanding = crmOutstandingKpi(rows);
  el.innerHTML = '<div class="section-heading"><h2>Opvolging</h2><a href="#pipeline">Pipeline ›</a></div><div class="crm-kpi-grid">' +
    '<div class="card"><span class="kpi-label">Conversie (90 d)</span><span class="kpi-number font-mono">' + (conv.pct === null ? '—' : conv.pct + '%') + '</span><span class="intake-price-sub">' + conv.converted + ' van ' + conv.sent + '</span></div>' +
    '<div class="card"><span class="kpi-label">Doorlooptijd</span><span class="kpi-number font-mono">' + (doorlooptijd1 == null ? '—' : fmt(doorlooptijd1, 0) + 'd') + '</span><span class="intake-price-sub">offerte → opdracht · ' + (doorlooptijd2 == null ? '—' : fmt(doorlooptijd2, 0) + 'd') + ' opdracht → geleverd</span></div>' +
    '<div class="card"><span class="kpi-label">Openstaand</span><span class="kpi-number font-mono">' + euro((outstanding.verwachtCents + outstanding.teFacturerenCents) / 100) + '</span><span class="intake-price-sub">' + euro(outstanding.verwachtCents / 100) + ' verwacht · ' + euro(outstanding.teFacturerenCents / 100) + ' te factureren</span></div>' +
    '</div>';
}
const crmBaseDashboard2 = renderDashboard;
renderDashboard = function () { crmBaseDashboard2(); crmRenderDashboardKpis(); };

/* ---------- Agenda-export (.ics) ---------- */
function downloadIcs(filename, content) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const file = new File([blob], filename, { type: 'text/calendar' });
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: filename }).catch(() => downloadBlobFallback(filename, blob));
  } else {
    downloadBlobFallback(filename, blob);
  }
}
function downloadBlobFallback(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function crmActionContextLabel(action) { return crmContextLabel(action); }
function crmExportActionIcs(actionId) {
  const action = crmActions().find(a => a.id === actionId);
  if (!action) return;
  const ics = crmBuildIcs([action], crmActionContextLabel, location.origin + location.pathname);
  downloadIcs('werkbank-actie-' + action.id + '.ics', ics);
}
function crmExportAllOpenIcs() {
  const open = crmOpenActions(crmActions());
  if (!open.length) { showToast('Geen open acties om te exporteren.'); return; }
  const ics = crmBuildIcs(open, crmActionContextLabel, location.origin + location.pathname);
  downloadIcs('werkbank-acties.ics', ics);
}

/* ---------- Cloud-sync voor CRM-acties (zelfde patroon als quotes.js: eigen tabel, gedeeld
   retryHandlers-register, safeSet-hook, pullAndMerge-uitbreiding) ---------- */
async function syncCrmActions() {
  if (!cloudAdapter || !cloudSession) return;
  const list = crmActions();
  const rows = list.map(a => ({ id: a.id, user_id: cloudSession.user.id, project_id: a.projectId || null, customer_id: a.customerId || null, updated_at: a.updatedAt, data: a }));
  setSyncStatus('syncing');
  const r = await cloudAdapter.push('crm_actions', rows);
  if (r.ok) setSyncStatus('synced'); else { setSyncStatus('offline'); queueRetry('crmActions'); }
}
function mergeCrmActionRows(localList, cloudRows) {
  const byId = {};
  for (const a of localList) byId[a.id] = { a, ts: a.updatedAt };
  for (const row of cloudRows) {
    const a = row.data; if (!a || !a.id) continue;
    const existing = byId[a.id];
    if (!existing || new Date(row.updated_at) > new Date(existing.ts)) byId[a.id] = { a, ts: row.updated_at };
  }
  return Object.values(byId).map(x => x.a);
}
function mergeCrmActions(rows) { const merged = mergeCrmActionRows(crmActions(), rows); rawSafeSet(CRM_ACTIONS_KEY, merged); return merged; }

const crmBaseSafeSetSync = safeSet;
safeSet = function (key, value) {
  const ok = crmBaseSafeSetSync(key, value);
  if (ok && key === CRM_ACTIONS_KEY && cloudAdapter && cloudSession) syncCrmActions();
  return ok;
};
// Zelfde gedeelde register als intake.js/quotes.js — var, bewust geen const, want alle lagen
// delen dit object in dezelfde scriptscope.
if (typeof retryHandlers === 'undefined') var retryHandlers = { projects: syncProjects, customers: syncCustomers, settings: syncSettings };
retryHandlers.crmActions = syncCrmActions;

/* ---------- Klant-sync uitbreiden met address/lat/lng ----------
   syncCustomers()/mergeCustomerRows() (cloud.js) kenden alleen name/contact/email/phone — een
   nieuw veld als address werd bij het pushen stilzwijgend niet meegestuurd, en bij het mergen na
   een pull zelfs actief weggegooid (de cloud-rij herbouwt een klant met precies die vier velden).
   Hier beide uitgebreid, zonder de bestaande vier velden aan te raken. */
const crmBaseSyncCustomers = syncCustomers;
syncCustomers = async function () {
  if (!cloudAdapter || !cloudSession) return;
  const list = customers();
  const rows = list.map(c => ({ id: c.id, user_id: cloudSession.user.id, name: c.name, contact: c.contact || '', email: c.email || '', phone: c.phone || '', address: c.address || '', lat: Number.isFinite(c.lat) ? c.lat : null, lng: Number.isFinite(c.lng) ? c.lng : null, updated_at: new Date().toISOString() }));
  setSyncStatus('syncing');
  const r = await cloudAdapter.push('customers', rows);
  if (r.ok) setSyncStatus('synced'); else { setSyncStatus('offline'); queueRetry('customers'); }
};
const crmBaseMergeCustomerRows = mergeCustomerRows;
mergeCustomerRows = function (localList, cloudRows) {
  const merged = crmBaseMergeCustomerRows(localList, cloudRows);
  const cloudById = {}; for (const row of cloudRows) cloudById[row.id] = row;
  return merged.map(c => {
    const row = cloudById[c.id];
    if (!row) return c;
    return Object.assign({}, c, { address: row.address || c.address || '', lat: Number.isFinite(row.lat) ? row.lat : c.lat, lng: Number.isFinite(row.lng) ? row.lng : c.lng });
  });
};

/* ---------- Cloud-sync voor contactlog (pakket 2) — zelfde patroon ---------- */
async function syncCrmLog() {
  if (!cloudAdapter || !cloudSession) return;
  const list = crmLog();
  const rows = list.map(l => ({ id: l.id, user_id: cloudSession.user.id, project_id: l.projectId || null, customer_id: l.customerId || null, updated_at: l.at, data: l }));
  setSyncStatus('syncing');
  const r = await cloudAdapter.push('crm_log', rows);
  if (r.ok) setSyncStatus('synced'); else { setSyncStatus('offline'); queueRetry('crmLog'); }
}
function mergeCrmLogRows(localList, cloudRows) {
  const byId = {};
  for (const l of localList) byId[l.id] = l;
  for (const row of cloudRows) { const l = row.data; if (l && l.id && !byId[l.id]) byId[l.id] = l; } // logregels zijn append-only, nooit bewerkt na aanmaken
  return Object.values(byId);
}
function mergeCrmLog(rows) { const merged = mergeCrmLogRows(crmLog(), rows); rawSafeSet(CRM_LOG_KEY, merged); return merged; }
const crmBaseSafeSetSyncLog = safeSet;
safeSet = function (key, value) {
  const ok = crmBaseSafeSetSyncLog(key, value);
  if (ok && key === CRM_LOG_KEY && cloudAdapter && cloudSession) syncCrmLog();
  return ok;
};
retryHandlers.crmLog = syncCrmLog;
// werkbank.v2.crm.templates is enkelvoudige instellingendata (net als companyProfile) — hoort in
// de bestaande SETTINGS_KEYS-lijst, geen eigen tabel nodig.
if (!SETTINGS_KEYS.includes(CRM_TEMPLATES_KEY)) SETTINGS_KEYS.push(CRM_TEMPLATES_KEY);

const crmBasePullAndMerge = pullAndMerge;
pullAndMerge = async function () {
  await crmBasePullAndMerge();
  if (!cloudAdapter || !cloudSession) return;
  setSyncStatus('syncing');
  try {
    const [a, l] = await Promise.all([cloudAdapter.pullAll('crm_actions'), cloudAdapter.pullAll('crm_log')]);
    if (!a.ok) throw a.error; if (!l.ok) throw l.error;
    mergeCrmActions(a.value);
    mergeCrmLog(l.value);
    await Promise.all([syncCrmActions(), syncCrmLog()]);
    setSyncStatus('synced');
  } catch (e) { setSyncStatus('offline'); }
};
