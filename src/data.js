import workTypes from './workTypes.json';
import defaults from './defaults.json';

export { workTypes };

// Personen en klanten. Standaard uit defaults.json; op de server komen ze uit Beheer
// (applySettings vult deze lijsten dan opnieuw, op dezelfde plek, zodat alle imports meebewegen).
export const people = [];
export const clients = [];
export const allPeople = [];
export const allClients = [];

export function applySettings(s) {
  const fill = (arr, items) => arr.splice(0, arr.length, ...items);
  fill(allPeople, s.people || []);
  fill(allClients, s.clients || []);
  fill(people, allPeople.filter((p) => p.active !== false).map((p) => p.name));
  fill(clients, allClients.filter((c) => c.active !== false).map(({ name, site }) => ({ name, site: site || '' })));
}
applySettings(defaults);

export const columns = [
  { id: 'todo', title: 'Te doen' },
  { id: 'doing', title: 'Mee bezig' },
  { id: 'review', title: 'Review' },
  { id: 'done', title: 'Klaar' },
];

export const statusTitle = { ...Object.fromEntries(columns.map((c) => [c.id, c.title])), backlog: 'Backlog' };


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
