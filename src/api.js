// Praat met de server; valt terug op localStorage als er geen API is
// (bijv. als je alleen de statische build ergens neerzet).
const LS_KEY = 'sommet-kanban-tasks';
let offline = false;

function lsRead() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || null;
  } catch {
    return null;
  }
}
function lsWrite(tasks) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(tasks));
  } catch {}
}

export async function fetchTasks(seed) {
  try {
    const r = await fetch('/api/tasks');
    if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) throw new Error();
    offline = false;
    return await r.json();
  } catch {
    offline = true;
    return lsRead() || seed();
  }
}

export async function saveTask(task, all) {
  if (offline) return lsWrite(all);
  await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(task),
  });
}

export async function deleteTask(id, all) {
  if (offline) return lsWrite(all);
  await fetch(`/api/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export const isOffline = () => offline;
