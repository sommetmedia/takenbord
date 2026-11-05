// Starttaak: de Qbig Packaging-briefing uit de mail.
export function seedTasks() {
  const now = new Date().toISOString();
  const subs = [
    'Vraag: Industrie waarin het gebruikt gaat worden',
    'Vraag: Vulmethode',
    'Vraag: Hoe wordt de liner geleegd?',
    'Vraag: Inhoud (vast / poeder / stroperig / vloeistof)',
    'Vraag: Wel / niet aseptisch',
    'Vraag: Wel / niet ondersteuning tijdens laden / lossen',
    'Vraag: Soort film (materiaal van de liner)',
    'Logica: advies voor soort liner en doppen (MAP fitments / Liquid fitments)',
  ];
  return [
    {
      id: 'task-qbig-1',
      title: 'Configurator maken voor liner-pagina',
      client: 'Qbig Packaging B.V.',
      workType: 'WEB: Webdevelopment',
      hours: 2,
      assignees: ['Pablo'],
      status: 'todo',
      internalDeadline: '',
      externalDeadline: '',
      description:
        "Samen met Claude een configurator maken waarin de klant zijn wensen invult en daarna advies krijgt over het 'soort liner' en welke 'doppen' (MAP fitments / Liquid fitments) passen. Referentie: wat Richelle voor Orange Plastics heeft gemaakt.",
      subtasks: subs.map((text, i) => ({ id: `st-${i + 1}`, text, done: false })),
      comments: [
        { id: 'c-1', author: 'Projectmanager', text: 'Zoals dinsdag besproken. Maximaal 2 uur voor reserveren.', at: now },
      ],
      history: [{ status: 'todo', by: 'Systeem', at: now }],
      createdAt: now,
      updatedAt: now,
    },
  ];
}
