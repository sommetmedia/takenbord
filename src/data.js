import workTypes from './workTypes.json';

export { workTypes };

export const people = ['Pablo', 'Kevin', 'Koen', 'Yade', 'Richelle'];

export const columns = [
  { id: 'todo', title: 'Te doen' },
  { id: 'doing', title: 'Mee bezig' },
  { id: 'review', title: 'Review' },
  { id: 'done', title: 'Klaar' },
];

export const statusTitle = { ...Object.fromEntries(columns.map((c) => [c.id, c.title])), backlog: 'Backlog' };

// De 30 projecten uit Simplicate.
export const clients = [
  { name: '24 Survival', site: '24survival.com' },
  { name: '3dCASE architectenburo', site: '3dcase-architectenburo.nl' },
  { name: 'Barista Bandits', site: 'baristabandits.nl' },
  { name: 'Bengelmedia', site: 'proefpersoon.nl' },
  { name: 'Capital Value', site: 'capitalvalue.nl' },
  { name: 'Coachkwadrant', site: 'coachkwadrant.nl' },
  { name: 'Daeli Productions', site: 'daeliproductions.com' },
  { name: 'De Kracht van de Verschillen', site: 'dekrachtvandeverschillen.nl' },
  { name: 'De Nieuwe Ruimte', site: 'denieuweruimte.com' },
  { name: 'Dozensite', site: 'dozensite.nl' },
  { name: 'Greendex & Verdi Tuinen', site: 'greendex.nl + verdituinen.nl' },
  { name: 'Holland Recycling', site: 'hollandrecycling.nl' },
  { name: 'HR Installatietechniek', site: 'hrinstallatietechniek.com' },
  { name: 'HR Lekdetectie', site: 'hrlekdetectie.nl' },
  { name: 'KDV Jansen en Jansen', site: 'kdvjansenenjansen.nl' },
  { name: 'Kids Lodge B.V.', site: 'kidslodge.nl' },
  { name: 'NKBV (bergsportreizen.nl)', site: 'bergsportreizen.nl' },
  { name: 'NKBV (nkbv.nl)', site: 'nkbv.nl' },
  { name: 'NL Dance', site: 'nldance.nl' },
  { name: 'NL Loodgieters', site: 'nlloodgieters.nl' },
  { name: 'Orange Plastics B.V.', site: 'orangeplastics.com' },
  { name: 'Qbig Packaging B.V.', site: 'qbigpackaging.com' },
  { name: 'Qoets.nl B.V.', site: 'qoets.nl' },
  { name: 'Schuldhulp Utrechtse Heuvelrug', site: 'schuldhulputrechtseheuvelrug.nl' },
  { name: 'Smart Work Lagrouw', site: 'swlcoaching.nl' },
  { name: 'Sommet Media', site: 'sommetmedia.nl' },
  { name: 'Sommet Media (eiwitpoederaanbiedingen.nl)', site: 'eiwitpoederaanbiedingen.nl' },
  { name: 'Start Detailing', site: 'startdetailing.nl' },
  { name: 'Visionplay Dutch Art Reproductions', site: 'dutch-art-reproductions.nl' },
  { name: 'XTNT', site: 'xtnt.nl' },
];

export const deadlineOptions = [
  { id: 'overdue', label: 'Verlopen' },
  { id: 'week', label: 'Binnen 7 dagen' },
  { id: 'month', label: 'Binnen 30 dagen' },
  { id: 'none', label: 'Geen deadline' },
];

export const durationOptions = [
  { id: 'xs', label: 'Tot 1 uur', test: (h) => h > 0 && h <= 1 },
  { id: 's', label: '1 tot 4 uur', test: (h) => h > 1 && h <= 4 },
  { id: 'm', label: '4 tot 8 uur', test: (h) => h > 4 && h <= 8 },
  { id: 'l', label: 'Meer dan 8 uur', test: (h) => h > 8 },
  { id: 'none', label: 'Niet ingeschat', test: (h) => !h },
];

export function workGroup(type) {
  if (!type) return 'other';
  if (type.startsWith('WEB:')) return 'web';
  if (type.startsWith('OM:')) return 'om';
  return 'other';
}
