// Opslaglaag. Kiest automatisch:
//  1. claude.ai Artifact  -> gedeelde database (db-capability), live voor iedereen
//  2. eigen server        -> /api/tasks (dev en productie)
//  3. niets bereikbaar    -> localStorage in deze browser
const LS_KEY = 'sommet-kanban-tasks';
let mode = 'loading';
let db = null;

function lsRead() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || null; } catch { return null; }
}
function lsWrite(tasks) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(tasks)); } catch {}
}

async function useCap(name) {
  try { return window.claude?.use ? await window.claude.use(name) : null; } catch { return null; }
}

// Roept onTasks(tasks) aan bij elke wijziging en onStatus({mode, stale, error}) bij statuswijziging.
export async function connect(seed, onTasks, onStatus) {
  db = await useCap('db');
  if (db) {
    mode = 'db';
    let timer = setTimeout(() => onStatus({ mode, stale: true }), 10000);
    const unsub = db.collection('tasks').onSnapshot(
      (snap) => {
        onTasks(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
        if (!snap.metadata.fromCache) { clearTimeout(timer); onStatus({ mode, stale: false }); }
      },
      (e) => { clearTimeout(timer); onStatus({ mode, error: e.code }); },
    );
    return () => { clearTimeout(timer); unsub(); };
  }

  const load = async () => {
    try {
      const r = await fetch('/api/tasks');
      if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) throw new Error();
      mode = 'server';
      onTasks(await r.json());
    } catch {
      mode = 'local';
      onTasks(lsRead() || seed());
    }
    onStatus({ mode });
  };
  await load();
  const iv = setInterval(() => { if (!document.hidden && mode === 'server') load(); }, 15000);
  return () => clearInterval(iv);
}

export async function saveTask(task, all) {
  if (mode === 'db') return db.collection('tasks').doc(task.id).set(JSON.parse(JSON.stringify(task)));
  if (mode === 'local') return lsWrite(all);
  const r = await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(task),
  });
  if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { code: `http_${r.status}` });
}

export async function deleteTask(id, all) {
  if (mode === 'db') return db.collection('tasks').doc(id).delete();
  if (mode === 'local') return lsWrite(all);
  const r = await fetch(`/api/tasks/${encodeURIComponent(id)}/delete`, { method: 'POST' });
  if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { code: `http_${r.status}` });
}

export const getMode = () => mode;

// Naam van de ingelogde claude.ai-gebruiker (alleen in de Artifact-versie).
export async function viewerName() {
  const user = await useCap('user');
  if (!user) return '';
  try { return (await user.me()).name || ''; } catch { return ''; }
}

// Tekst (mail, chat) omzetten naar een taak met Claude.
// In claude.ai via de sample-capability, op de eigen server via /api/parse (sleutel staat op de server).
export async function getParser() {
  const sample = await useCap('sample');
  if (sample) return (prompt) => sample.json(prompt, { modelTier: 'default' });
  try {
    const r = await fetch('/api/health');
    if (!r.ok || !(await r.json()).parse) return null;
  } catch { return null; }
  return async (prompt) => {
    const r = await fetch('/api/parse', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw { code: body.error || `http_${r.status}` };
    return body;
  };
}
