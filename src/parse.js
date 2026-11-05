import { clients, people, workTypes } from './data.js';

const DAYS = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Kalender van de komende 3 weken, zodat "vrijdag" of "volgende week dinsdag" goed wordt omgerekend.
function calendar() {
  const out = [];
  const d = new Date();
  for (let i = 0; i < 21; i++) {
    out.push(`${DAYS[d.getDay()]} ${iso(d)}${i === 0 ? ' (vandaag)' : ''}`);
    d.setDate(d.getDate() + 1);
  }
  return out.join('\n');
}

export function buildPrompt(text, me) {
  return `Je zet een mail, chatbericht of notitie om in één taak voor het takenbord van marketingbureau Sommet Media.
De persoon die de tekst plakt is ${me}.

KALENDER (gebruik deze om datums te bepalen):
${calendar()}

KLANTEN. Kies de klant die in de tekst genoemd wordt of waar het duidelijk over gaat (naam, website, merk of product). Geef de naam precies zoals hieronder geschreven. Alleen "" als er echt geen klant uit de tekst af te leiden is.
${clients.map((c) => `- ${c.name} (${c.site})`).join('\n')}

URENSOORTEN. Kies precies één uit deze lijst, of "":
${workTypes.map((w) => `- ${w}`).join('\n')}

PERSONEN. Toewijzen kan alleen aan: ${people.join(', ')}. Als de tekst iemand aanspreekt ("Hey Pablo") of vraagt om iets te doen, wijs die persoon toe.

DEADLINES.
- externalDeadline: wanneer de klant of opdrachtgever het uiterlijk wil hebben (live, opgeleverd, "voor de klant", "uiterlijk", "deadline").
- internalDeadline: een interne afspraak (intern klaar, review, "bij mij aanleveren", "voor het overleg").
- Wordt maar één datum genoemd en is niet duidelijk welke soort: zet die in internalDeadline.
- Zet relatieve datums ("vrijdag", "eind volgende week", "over 2 weken", "voor 1 december") om met de kalender hierboven. "Eind van de week" is vrijdag. "Eind van de maand" is de laatste dag van de maand.
- Schrijf datums altijd als YYYY-MM-DD. Leeg ("") als er niets over een datum staat.

Antwoord met alleen JSON in precies deze vorm:
{"title":"korte titel in het Nederlands","client":"","workType":"","hours":null,"assignees":[],"internalDeadline":"","externalDeadline":"","description":"korte samenvatting van de opdracht","subtasks":["concrete stap"],"comment":"afspraken of context uit de tekst, of leeg"}

hours is een getal (bijv. "max 2 uur" wordt 2, "een halve dag" wordt 4) of null. Verzin niets dat niet in de tekst staat.

De tekst:
"""
${text}
"""`;
}

// ---- Klant herkennen -------------------------------------------------------

const SUFFIX = /\b(b\.?v\.?|bv|n\.?v\.?|vof|v\.o\.f\.)\s*$/i;
const clean = (s) => s.toLowerCase().replace(/\(.*?\)/g, ' ').replace(SUFFIX, '').replace(/[^a-z0-9]+/g, ' ').trim();
const siteRoot = (site) => site.split(/\s*\+\s*/).map((s) => s.replace(/^www\./, '').split('.')[0].toLowerCase());

// Woorden die bij precies één klant horen, bruikbaar om die klant in vrije tekst te herkennen.
const uniqueWordsFor = () => {
  const count = {};
  const per = clients.map((c) => {
    const words = new Set(clean(c.name).split(' ').filter((w) => w.length >= 4));
    words.forEach((w) => (count[w] = (count[w] || 0) + 1));
    return words;
  });
  const generic = new Set(['media', 'productions', 'tuinen', 'reproductions', 'dutch', 'work', 'smart', 'start', 'lodge', 'value', 'kracht', 'verschillen', 'nieuwe', 'ruimte', 'jansen']);
  return per.map((words) => [...words].filter((w) => count[w] === 1 && !generic.has(w)));
};

export function matchClient(value) {
  if (!value || typeof value !== 'string') return '';
  const exact = clients.find((c) => c.name === value);
  if (exact) return exact.name;
  const v = clean(value);
  if (!v) return '';
  const flat = value.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  const one = (list) => (list.length === 1 ? list[0].name : '');
  return (
    one(clients.filter((c) => clean(c.name) === v)) ||
    one(clients.filter((c) => c.site.toLowerCase().split(/\s*\+\s*/).includes(flat))) ||
    one(clients.filter((c) => siteRoot(c.site).includes(v.replace(/ /g, '')))) ||
    one(clients.filter((c) => clean(c.name).startsWith(v) || v.startsWith(clean(c.name))))
  );
}

// Zoekt een klant direct in de tekst: website, volledige naam of een unieke naamwoord.
export function findClientInText(text) {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9.]+/g, ' ')} `;
  const flat = text.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const uniqueWords = uniqueWordsFor();
  const scores = clients.map((c, i) => {
    let score = 0;
    if (c.site.split(/\s*\+\s*/).some((s) => t.includes(s.toLowerCase()))) score += 3;
    const name = clean(c.name).replace(/ /g, '');
    if (name.length >= 5 && flat.includes(name)) score += 2;
    if (uniqueWords[i].some((w) => t.includes(` ${w} `))) score += 1;
    if (siteRoot(c.site).some((r) => r.length >= 5 && flat.includes(r))) score += 1;
    return score;
  });
  const best = Math.max(...scores);
  if (best === 0) return '';
  const winners = clients.filter((_, i) => scores[i] === best);
  return winners.length === 1 ? winners[0].name : '';
}

// ---- Datums ----------------------------------------------------------------

const MONTHS = { jan: 1, feb: 2, mrt: 3, maa: 3, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, dec: 12 };

export function toIsoDate(v) {
  if (typeof v !== 'string' && typeof v !== 'number') return '';
  const s = String(v).trim().toLowerCase();
  let y, m, d;
  let r;
  if ((r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) [, y, m, d] = r;
  else if ((r = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/))) [, d, m, y] = r;
  else if ((r = s.match(/^(\d{1,2})\s+([a-z]{3})[a-z]*\.?\s*(\d{4})?/)) && MONTHS[r[2]]) {
    d = r[1]; m = MONTHS[r[2]]; y = r[3];
    if (!y) {
      const now = new Date();
      y = now.getFullYear();
      if (new Date(y, m - 1, d) < new Date(now.getFullYear(), now.getMonth(), now.getDate())) y += 1;
    }
  } else return '';
  y = Number(y); m = Number(m); d = Number(d);
  if (y < 100) y += 2000;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return '';
  return iso(date);
}

// ---- Antwoord van Claude opschonen ----------------------------------------

export function normalize(raw, text = '') {
  const r = raw && typeof raw === 'object' ? raw : {};
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const hours = Number(r.hours);
  const pick = (...keys) => keys.map((k) => r[k]).find((v) => v);
  const workType = workTypes.includes(r.workType) ? r.workType
    : workTypes.find((w) => w.toLowerCase() === str(r.workType).toLowerCase()) || '';
  return {
    title: str(r.title).slice(0, 200),
    client: matchClient(pick('client', 'klant')) || findClientInText(text),
    workType,
    hours: Number.isFinite(hours) && hours > 0 ? hours : '',
    assignees: Array.isArray(r.assignees)
      ? r.assignees.map((p) => people.find((x) => x.toLowerCase() === String(p).trim().toLowerCase())).filter(Boolean)
      : [],
    internalDeadline: toIsoDate(pick('internalDeadline', 'interneDeadline', 'internal_deadline')),
    externalDeadline: toIsoDate(pick('externalDeadline', 'externeDeadline', 'external_deadline', 'deadline')),
    description: str(r.description),
    subtasks: Array.isArray(r.subtasks) ? r.subtasks.map(str).filter(Boolean).slice(0, 30) : [],
    comment: str(r.comment),
  };
}
