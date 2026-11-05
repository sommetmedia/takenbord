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

const jsonPost = (url, body) => fetch(url, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}),
});
const isJson = (r) => (r.headers.get('content-type') || '').includes('json');
let parseEnabled = false;

// Welke omgeving is dit? 'artifact' (claude.ai), 'server' (ingelogd), 'login' (server, niet ingelogd) of 'local'.
export async function session() {
  if (await useCap('db')) return { kind: 'artifact' };
  try {
    const r = await fetch('/api/me');
    if (r.status === 401 && isJson(r)) return { kind: 'login' };
    if (!r.ok || !isJson(r)) return { kind: 'local' };
    const me = await r.json();
    parseEnabled = !!me.parse;
    const s = await fetch('/api/settings');
    return { kind: 'server', user: me.user, settings: s.ok ? await s.json() : null };
  } catch {
    return { kind: 'local' };
  }
}

export async function login(email, password) {
  const r = await jsonPost('/api/login', { email, password });
  if (r.ok) return null;
  return r.status === 429 ? 'Te veel pogingen. Probeer het over een kwartier opnieuw.'
    : r.status === 401 ? 'Dit e-mailadres of wachtwoord klopt niet.'
    : 'Inloggen lukt nu niet. Probeer het zo opnieuw.';
}

export async function logout() {
  await jsonPost('/api/logout');
}

export async function saveSettings(settings) {
  const r = await jsonPost('/api/settings', settings);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || 'Opslaan is niet gelukt.');
  return body;
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
      if (r.status === 401) { window.location.reload(); return; }
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
  const r = await jsonPost(`/api/tasks/${encodeURIComponent(task.id)}`, task);
  if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { code: `http_${r.status}` });
}

export async function deleteTask(id, all) {
  if (mode === 'db') return db.collection('tasks').doc(id).delete();
  if (mode === 'local') return lsWrite(all);
  const r = await jsonPost(`/api/tasks/${encodeURIComponent(id)}/delete`);
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
  if (!parseEnabled) return null;
  return async (prompt) => {
    const r = await jsonPost('/api/parse', { prompt });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw { code: body.error || `http_${r.status}` };
    return body;
  };
}
