import { clients, people, workTypes } from './data.js';

export function buildPrompt(text, me) {
  const today = new Date().toISOString().slice(0, 10);
  return `Je zet een mail, chatbericht of notitie om in één taak voor het takenbord van marketingbureau Sommet Media.
Vandaag is het ${today}. De persoon die de tekst plakt is ${me}.

Kies de klant EXACT uit deze lijst, of "" als geen enkele past:
${clients.map((c) => `- ${c.name} (${c.site})`).join('\n')}

Kies de urensoort EXACT uit deze lijst, of "" als het onduidelijk is:
${workTypes.map((w) => `- ${w}`).join('\n')}

Toewijzen kan alleen aan: ${people.join(', ')}. Als de tekst iemand aanspreekt ("Hey Pablo"), wijs die persoon toe.

Antwoord met alleen JSON in deze vorm:
{"title":"korte titel in het Nederlands","client":"","workType":"","hours":2,"assignees":["Pablo"],"internalDeadline":"YYYY-MM-DD of leeg","externalDeadline":"YYYY-MM-DD of leeg","description":"korte samenvatting van de opdracht","subtasks":["concrete stap"],"comment":"afspraken of context uit de tekst, of leeg"}

Regels: hours is een getal of null als er niets over tijd staat. Zet relatieve datums ("vrijdag", "volgende week") om naar een datum. Een deadline van de klant is extern, een interne afspraak is intern. Verzin niets dat niet in de tekst staat.

De tekst:
"""
${text}
"""`;
}

// Maakt van het antwoord van Claude een veilige, geldige taak-aanzet.
export function normalize(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(str(v)) ? str(v) : '');
  const hours = Number(r.hours);
  return {
    title: str(r.title).slice(0, 200),
    client: clients.some((c) => c.name === r.client) ? r.client : '',
    workType: workTypes.includes(r.workType) ? r.workType : '',
    hours: Number.isFinite(hours) && hours > 0 ? hours : '',
    assignees: Array.isArray(r.assignees) ? r.assignees.filter((p) => people.includes(p)) : [],
    internalDeadline: date(r.internalDeadline),
    externalDeadline: date(r.externalDeadline),
    description: str(r.description),
    subtasks: Array.isArray(r.subtasks) ? r.subtasks.map(str).filter(Boolean).slice(0, 30) : [],
    comment: str(r.comment),
  };
}
