import { useEffect, useMemo, useRef, useState } from 'react';
import {
  allClients, allPeople, applySettings, clients, columns, deadlineOptions, durationOptions, people, statusTitle,
  workGroup, workTypes,
} from './data.js';
import { seedTasks } from './seed.js';
import {
  connect, deleteTask, getMode, getParser, login, logout, saveSettings, saveTask, session, viewerName,
} from './api.js';
import { buildPrompt, normalize } from './parse.js';

const uid = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const emptyFilters = { people: [], client: '', workType: '', internal: [], external: [], duration: [], blocked: false };

// Oude taken met status 'backlog' tellen als vastgelopen in 'Te doen'.
const normalizeTask = (t) => (t.status === 'backlog' ? { ...t, status: 'todo', blocked: true } : t);

function daysUntil(date) {
  if (!date) return null;
  const d = new Date(date + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

function matchDeadline(date, picks) {
  if (!picks.length) return true;
  const n = daysUntil(date);
  return picks.some((p) =>
    p === 'none' ? n === null
      : p === 'overdue' ? n !== null && n < 0
      : p === 'week' ? n !== null && n >= 0 && n <= 7
      : p === 'month' ? n !== null && n >= 0 && n <= 30
      : false);
}

function fmtDate(date) {
  if (!date) return '';
  return new Date(date + 'T00:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

function fmtStamp(iso) {
  return new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function calendarUrl(task, date) {
  const d = date.replaceAll('-', '');
  const next = new Date(date + 'T00:00:00');
  next.setDate(next.getDate() + 1);
  const end = next.toISOString().slice(0, 10).replaceAll('-', '');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${task.client ? task.client + ' | ' : ''}${task.title}`,
    dates: `${d}/${end}`,
    details: `${task.workType || ''}\n${task.description || ''}`,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

function Avatar({ name }) {
  const i = allPeople.findIndex((p) => p.name === name);
  return <span className={`avatar av-${i < 0 ? 0 : i % 5}`} title={name}>{name[0]}</span>;
}

// Bepaalt eerst of er ingelogd moet worden (eigen server) en laadt personen en klanten uit Beheer.
export default function App() {
  const [sess, setSess] = useState(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    session().then((s) => {
      if (s.settings) applySettings(s.settings);
      setSess(s);
    });
  }, [version]);

  if (!sess) return <div className="splash">Takenbord laden…</div>;
  if (sess.kind === 'login') return <Login onDone={() => setVersion((v) => v + 1)} />;
  return (
    <Board
      key={version}
      user={sess.user || null}
      onLogout={async () => { await logout(); setSess(null); setVersion((v) => v + 1); }}
      onSettingsSaved={(saved) => { applySettings(saved); setSess({ ...sess, settings: saved }); }}
    />
  );
}

function Login({ onDone }) {
  const [email, setEmail] = useState(() => {
    try { return localStorage.getItem('sommet-email') || ''; } catch { return ''; }
  });
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const err = await login(email.trim(), password);
    if (err) { setBusy(false); setError(err); return; }
    try { localStorage.setItem('sommet-email', email.trim()); } catch {}
    onDone();
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand"><span className="logo-dot" /> Sommet Media</div>
        <h1>Takenbord</h1>
        <p className="muted">Log in met je e-mailadres van Sommet Media.</p>
        <label className="field">
          <span className="label">E-mailadres</span>
          <input type="email" autoComplete="username" required autoFocus={!email} value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="naam@sommetmedia.nl" />
        </label>
        <label className="field">
          <span className="label">Wachtwoord</span>
          <input type="password" autoComplete="current-password" required autoFocus={!!email} value={password}
            onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <div className="banner error inline">{error}</div>}
        <button className="btn primary login-btn" disabled={busy}>{busy ? 'Bezig…' : 'Inloggen'}</button>
      </form>
    </div>
  );
}

function Board({ user, onLogout, onSettingsSaved }) {
  const [tasks, setTasks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [filters, setFilters] = useState(emptyFilters);
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [status, setStatus] = useState({ mode: 'loading' });
  const [saveError, setSaveError] = useState('');
  const [parser, setParser] = useState(null);
  const [pasteText, setPasteText] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [me, setMe] = useState(() => {
    if (user) return user.name;
    try { return localStorage.getItem('sommet-me') || 'Pablo'; } catch { return 'Pablo'; }
  });
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  useEffect(() => {
    let stop = () => {};
    let alive = true;
    connect(seedTasks, (t) => { setTasks(t.map(normalizeTask)); setLoaded(true); }, setStatus).then((s) => {
      if (alive) stop = s; else s();
    });
    getParser().then((fn) => alive && fn && setParser(() => fn));
    if (!user) viewerName().then((name) => {
      const first = name.split(' ')[0];
      if (alive && people.includes(first)) setMe(first);
    });
    return () => { alive = false; stop(); };
  }, []);

  // Ctrl/Cmd+V ergens op het bord (niet in een invoerveld) opent "Taak uit tekst".
  useEffect(() => {
    if (!parser) return;
    const onPaste = (e) => {
      if (openId || pasteText !== null) return;
      if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
      const text = e.clipboardData?.getData('text') || '';
      if (text.trim().length > 15) { e.preventDefault(); setPasteText(text); }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [parser, openId, pasteText]);

  useEffect(() => { if (!user) try { localStorage.setItem('sommet-me', me); } catch {} }, [me, user]);

  function upsert(task) {
    const all = tasksRef.current.some((t) => t.id === task.id)
      ? tasksRef.current.map((t) => (t.id === task.id ? task : t))
      : [...tasksRef.current, task];
    setTasks(all);
    saveTask(task, all).then(() => setSaveError(''), (e) => setSaveError(writeError(e)));
  }

  function remove(id) {
    const all = tasksRef.current.filter((t) => t.id !== id);
    setTasks(all);
    deleteTask(id, all).then(() => setSaveError(''), (e) => setSaveError(writeError(e)));
  }

  function move(id, status) {
    const t = tasksRef.current.find((x) => x.id === id);
    if (!t || t.status === status) return;
    upsert({ ...t, status, history: [...(t.history || []), { status, by: me, at: new Date().toISOString() }] });
  }

  function newTask(status = 'todo', prefill = null) {
    const now = new Date().toISOString();
    const task = {
      id: uid('task'), title: '', client: '', workType: '', hours: '', assignees: [me], status,
      internalDeadline: '', externalDeadline: '', description: '', subtasks: [], comments: [],
      history: [{ status, by: me, at: now }], createdAt: now,
    };
    if (prefill) {
      const { comment, subtasks, assignees, ...rest } = prefill;
      Object.assign(task, rest);
      if (assignees.length) task.assignees = assignees;
      task.subtasks = subtasks.map((text) => ({ id: uid('st'), text, done: false }));
      if (comment) task.comments = [{ id: uid('c'), author: me, text: comment, at: now }];
      if (prefill.source) task.source = prefill.source;
    }
    setOpenId({ isNew: true, fromText: !!prefill, task });
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) =>
      (!filters.blocked || t.blocked) &&
      (!filters.people.length || t.assignees?.some((p) => filters.people.includes(p))) &&
      (!filters.client || t.client === filters.client) &&
      (!filters.workType || t.workType === filters.workType ||
        (filters.workType.startsWith('group:') && workGroup(t.workType) === filters.workType.slice(6))) &&
      matchDeadline(t.internalDeadline, filters.internal) &&
      matchDeadline(t.externalDeadline, filters.external) &&
      (!filters.duration.length || filters.duration.some((id) => durationOptions.find((o) => o.id === id).test(Number(t.hours)))) &&
      (!q || [t.title, t.client, t.workType, t.description].join(' ').toLowerCase().includes(q)));
  }, [tasks, filters, search]);

  const activeFilterCount =
    filters.people.length + filters.internal.length + filters.external.length + filters.duration.length +
    (filters.client ? 1 : 0) + (filters.workType ? 1 : 0) + (filters.blocked ? 1 : 0);

  const toggle = (key, val) =>
    setFilters((f) => ({ ...f, [key]: f[key].includes(val) ? f[key].filter((v) => v !== val) : [...f[key], val] }));

  const openTask = openId?.isNew ? openId.task : tasks.find((t) => t.id === openId);

  return (
    <div className="app">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="brand">
          <span className="brand-mark">S</span>
          <div>
            <div className="brand-name">Sommet Media</div>
            <div className="brand-sub">Takenbord</div>
          </div>
        </div>

        <div className="filters-head">
          <h3>Filters</h3>
          {activeFilterCount > 0 && (
            <button className="link" onClick={() => setFilters(emptyFilters)}>Wis ({activeFilterCount})</button>
          )}
        </div>

        <FilterGroup title="Status">
          <label className="check">
            <input type="checkbox" checked={filters.blocked} onChange={() => setFilters({ ...filters, blocked: !filters.blocked })} />
            <span className="blocked-dot" /> Alleen vastgelopen
            <span className="count">{tasks.filter((t) => t.blocked && t.status !== 'done').length}</span>
          </label>
        </FilterGroup>

        <FilterGroup title="Personen">
          {people.map((p) => (
            <label key={p} className="check">
              <input type="checkbox" checked={filters.people.includes(p)} onChange={() => toggle('people', p)} />
              <Avatar name={p} /> {p}
              <span className="count">{tasks.filter((t) => t.assignees?.includes(p) && t.status !== 'done').length}</span>
            </label>
          ))}
        </FilterGroup>

        <FilterGroup title="Klant">
          <select value={filters.client} onChange={(e) => setFilters({ ...filters, client: e.target.value })}>
            <option value="">Alle klanten</option>
            {clients.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
        </FilterGroup>

        <FilterGroup title="Type taak">
          <select value={filters.workType} onChange={(e) => setFilters({ ...filters, workType: e.target.value })}>
            <option value="">Alle urensoorten</option>
            <option value="group:web">Alle WEB-werkzaamheden</option>
            <option value="group:om">Alle OM-werkzaamheden</option>
            <option disabled>──────────</option>
            {workTypes.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </FilterGroup>

        <FilterGroup title="Interne deadline">
          {deadlineOptions.map((o) => (
            <label key={o.id} className="check">
              <input type="checkbox" checked={filters.internal.includes(o.id)} onChange={() => toggle('internal', o.id)} /> {o.label}
            </label>
          ))}
        </FilterGroup>

        <FilterGroup title="Externe deadline">
          {deadlineOptions.map((o) => (
            <label key={o.id} className="check">
              <input type="checkbox" checked={filters.external.includes(o.id)} onChange={() => toggle('external', o.id)} /> {o.label}
            </label>
          ))}
        </FilterGroup>

        <FilterGroup title="Tijdsduur">
          {durationOptions.map((o) => (
            <label key={o.id} className="check">
              <input type="checkbox" checked={filters.duration.includes(o.id)} onChange={() => toggle('duration', o.id)} /> {o.label}
            </label>
          ))}
        </FilterGroup>

        <div className="integrations">
          <h3>Google Workspace</h3>
          <div className="integration"><span className="dot dot-amber" /> Google Agenda: deadlines via “Zet in agenda”</div>
          <div className="integration"><span className="dot dot-grey" /> Google Tasks: nog niet gekoppeld</div>
        </div>
      </aside>
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}

      <main className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setMenuOpen(true)} aria-label="Filters">☰</button>
          <h1>Takenbord</h1>
          <input className="search" placeholder="Zoek op taak, klant of urensoort…" value={search} onChange={(e) => setSearch(e.target.value)} />
          {user ? (
            <div className="me">
              <Avatar name={user.name} /> {user.name}
              {user.admin && <button className="btn small" onClick={() => setSettingsOpen(true)}>Beheer</button>}
              <button className="btn small ghost" onClick={onLogout}>Uitloggen</button>
            </div>
          ) : (
            <label className="me">
              Ik ben
              <select value={me} onChange={(e) => setMe(e.target.value)}>
                {people.map((p) => <option key={p}>{p}</option>)}
              </select>
            </label>
          )}
          {parser && (
            <button className="btn" onClick={() => setPasteText('')} title="Of plak gewoon ergens op het bord (Ctrl/Cmd+V)">
              ✨ Taak uit tekst
            </button>
          )}
          <button className="btn primary" onClick={() => newTask()}>+ Nieuwe taak</button>
        </header>
        {status.mode === 'local' && (
          <div className="banner">Geen server bereikbaar: wijzigingen worden alleen in deze browser bewaard.</div>
        )}
        {status.stale && !status.error && (
          <div className="banner">De takenlijst is nog niet bereikbaar. Wat je ziet kan verouderd zijn.</div>
        )}
        {status.error && (
          <div className="banner">De verbinding met de takenlijst is verbroken. Herlaad de pagina om opnieuw te verbinden.</div>
        )}
        {saveError && <div className="banner error">{saveError}</div>}
        {loaded && tasks.length === 0 && (
          <div className="empty">
            <h2>Nog geen taken</h2>
            <p>Maak een taak aan met <strong>+ Nieuwe taak</strong>{parser ? ', of plak een mail of chatbericht op het bord en Claude vult de taak voor je in' : ''}.</p>
          </div>
        )}

        <div className="board">
          {columns.map((col) => {
            const colTasks = visible.filter((t) => t.status === col.id);
            const hours = colTasks.reduce((s, t) => s + (Number(t.hours) || 0), 0);
            return (
              <section
                key={col.id}
                className={`column ${overCol === col.id ? 'over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setOverCol(col.id); }}
                onDragLeave={() => setOverCol(null)}
                onDrop={(e) => { e.preventDefault(); move(dragId, col.id); setDragId(null); setOverCol(null); }}
              >
                <div className="col-head">
                  <h2>{col.title}</h2>
                  <span className="pill">{colTasks.length}</span>
                  {hours > 0 && <span className="col-hours">{hours} u</span>}
                </div>
                <div className="cards">
                  {colTasks.map((t) => (
                    <Card key={t.id} task={t} dragging={dragId === t.id}
                      onOpen={() => setOpenId(t.id)}
                      onDragStart={() => setDragId(t.id)}
                      onDragEnd={() => { setDragId(null); setOverCol(null); }} />
                  ))}
                </div>
                <button className="add-card" onClick={() => newTask(col.id)}>+ Taak toevoegen</button>
              </section>
            );
          })}
        </div>
      </main>

      {openTask && (
        <TaskModal
          key={openTask.id}
          task={openTask}
          isNew={!!openId?.isNew}
          fromText={!!openId?.fromText}
          me={me}
          onClose={() => setOpenId(null)}
          onSave={(t) => { upsert(t); setOpenId(null); }}
          onDelete={() => { remove(openTask.id); setOpenId(null); }}
        />
      )}

      {settingsOpen && user?.admin && (
        <SettingsDialog
          me={user}
          onClose={() => setSettingsOpen(false)}
          onSaved={(saved) => { onSettingsSaved(saved); setSettingsOpen(false); }}
        />
      )}

      {pasteText !== null && parser && (
        <PasteDialog
          initial={pasteText}
          me={me}
          parser={parser}
          onClose={() => setPasteText(null)}
          onResult={(prefill) => { setPasteText(null); newTask('todo', prefill); }}
        />
      )}
    </div>
  );
}

// Beheer: personen en klanten. Bestaande namen liggen vast (taken verwijzen ernaar); archiveren kan wel.
function SettingsDialog({ me, onClose, onSaved }) {
  const [tab, setTab] = useState('people');
  const [peopleList, setPeopleList] = useState(() => allPeople.map((p) => ({ ...p, active: p.active !== false, isNew: false })));
  const [clientList, setClientList] = useState(() => allClients.map((c) => ({ ...c, active: c.active !== false, isNew: false })));
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const editPerson = (i, patch) => setPeopleList((l) => l.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const editClient = (i, patch) => setClientList((l) => l.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const isMe = (p) => p.email.toLowerCase() === me.email.toLowerCase() && !p.isNew;

  async function save() {
    setBusy(true);
    setError('');
    try {
      const clean = (l, keys) => l.filter((x) => x.name.trim()).map((x) => Object.fromEntries(keys.map((k) => [k, x[k]])));
      onSaved(await saveSettings({
        people: clean(peopleList, ['name', 'email', 'admin', 'active']),
        clients: clean(clientList, ['name', 'site', 'active']),
      }));
    } catch (e) {
      setBusy(false);
      setError(e.message);
    }
  }

  const rows = (list) => list.map((x, i) => ({ x, i })).filter(({ x }) => showArchived || x.active || x.isNew);
  const archivedCount = (tab === 'people' ? peopleList : clientList).filter((x) => !x.active).length;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal settings" role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2 className="paste-title">Beheer</h2>
          <button className="icon-btn" onClick={onClose} disabled={busy} aria-label="Sluiten">✕</button>
        </div>
        <div className="settings-tabs">
          <button className={tab === 'people' ? 'active' : ''} onClick={() => setTab('people')}>Personen ({peopleList.filter((p) => p.active).length})</button>
          <button className={tab === 'clients' ? 'active' : ''} onClick={() => setTab('clients')}>Klanten ({clientList.filter((c) => c.active).length})</button>
        </div>
        <div className="settings-body">
          {tab === 'people' ? (
            <>
              <p className="muted">Iedereen in deze lijst logt in met zijn eigen e-mailadres en het gedeelde wachtwoord. Beheerders zien deze knop. Een gearchiveerd persoon kan niet meer inloggen; oude taken blijven op zijn naam staan.</p>
              <table className="settings-table">
                <thead><tr><th>Naam</th><th>E-mailadres</th><th>Beheerder</th><th /></tr></thead>
                <tbody>
                  {rows(peopleList).map(({ x: p, i }) => (
                    <tr key={i} className={p.active ? '' : 'archived'}>
                      <td>{p.isNew ? <input value={p.name} placeholder="Voornaam" onChange={(e) => editPerson(i, { name: e.target.value })} /> : <strong>{p.name}</strong>}</td>
                      <td><input type="email" value={p.email} placeholder="naam@sommetmedia.nl" onChange={(e) => editPerson(i, { email: e.target.value })} /></td>
                      <td className="center"><input type="checkbox" checked={p.admin} disabled={isMe(p)} onChange={(e) => editPerson(i, { admin: e.target.checked })} /></td>
                      <td className="right">
                        {p.isNew ? <button className="btn small ghost" onClick={() => setPeopleList((l) => l.filter((_, j) => j !== i))}>Weg</button>
                          : isMe(p) ? <span className="muted">Jij</span>
                          : <button className="btn small ghost" onClick={() => editPerson(i, { active: !p.active })}>{p.active ? 'Archiveren' : 'Terugzetten'}</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="btn" onClick={() => setPeopleList((l) => [...l, { name: '', email: '', admin: false, active: true, isNew: true }])}>+ Persoon toevoegen</button>
            </>
          ) : (
            <>
              <p className="muted">De klanten in de keuzelijst bij een taak. Een gearchiveerde klant verdwijnt uit de keuzelijst; oude taken houden hun klant.</p>
              <table className="settings-table">
                <thead><tr><th>Klant</th><th>Website</th><th /></tr></thead>
                <tbody>
                  {rows(clientList).map(({ x: c, i }) => (
                    <tr key={i} className={c.active ? '' : 'archived'}>
                      <td>{c.isNew ? <input value={c.name} placeholder="Naam zoals in Simplicate" onChange={(e) => editClient(i, { name: e.target.value })} /> : <strong>{c.name}</strong>}</td>
                      <td><input value={c.site} placeholder="klant.nl" onChange={(e) => editClient(i, { site: e.target.value })} /></td>
                      <td className="right">
                        {c.isNew ? <button className="btn small ghost" onClick={() => setClientList((l) => l.filter((_, j) => j !== i))}>Weg</button>
                          : <button className="btn small ghost" onClick={() => editClient(i, { active: !c.active })}>{c.active ? 'Archiveren' : 'Terugzetten'}</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="btn" onClick={() => setClientList((l) => [...l, { name: '', site: '', active: true, isNew: true }])}>+ Klant toevoegen</button>
            </>
          )}
          {archivedCount > 0 && (
            <label className="check archived-toggle">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Toon gearchiveerd ({archivedCount})
            </label>
          )}
          {error && <div className="banner error inline">{error}</div>}
        </div>
        <div className="modal-foot">
          <span className="spacer" />
          <button className="btn" onClick={onClose} disabled={busy}>Annuleren</button>
          <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Opslaan…' : 'Opslaan'}</button>
        </div>
      </div>
    </div>
  );
}

function writeError(e) {
  if (e?.code === 'invalid_argument' || e?.code === 'not_granted') return 'Je hebt alleen leesrechten op dit bord. Vraag de eigenaar om je als bijdrager toe te voegen.';
  if (e?.code === 'quota_exceeded') return 'Het bord is vol. Verwijder oude taken om nieuwe toe te voegen.';
  return 'Opslaan is niet gelukt. Controleer je verbinding en probeer het opnieuw.';
}

function PasteDialog({ initial, me, parser, onClose, onResult }) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  async function run() {
    setBusy(true);
    setError('');
    try {
      const prefill = normalize(await parser(buildPrompt(text, me)), text);
      if (!prefill.title) throw { code: 'empty' };
      onResult({ ...prefill, source: text.slice(0, 20000) });
    } catch (e) {
      setBusy(false);
      setError(
        e?.code === 'not_granted' ? 'Je hebt Claude geen toestemming gegeven. Maak de taak met de hand aan.'
          : e?.code === 'rate_limited' ? 'Even te veel verzoeken. Probeer het over een minuut opnieuw.'
          : e?.code === 'api_error' || e?.code === 'unreachable' ? 'Claude is nu niet bereikbaar. Probeer het zo opnieuw of maak de taak met de hand aan.'
          : 'Claude kon hier geen taak van maken. Pas de tekst aan of maak de taak met de hand aan.');
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal paste" role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2 className="paste-title">Taak uit tekst</h2>
          <button className="icon-btn" onClick={onClose} disabled={busy} aria-label="Sluiten">✕</button>
        </div>
        <div className="paste-body">
          <p className="muted">Plak een mail, chatbericht of aantekening. Claude haalt er de klant, urensoort, tijdsduur, deadlines en subtaken uit. Je controleert alles voordat de taak wordt aangemaakt.</p>
          <textarea id="paste-text" rows={12} autoFocus value={text} onChange={(e) => setText(e.target.value)}
            placeholder={'Hey Pablo,\n\nZou je voor de liner-pagina een configurator willen maken? …'} />
          {error && <div className="banner error inline">{error}</div>}
        </div>
        <div className="modal-foot">
          <span className="spacer" />
          <button className="btn" onClick={onClose} disabled={busy}>Annuleren</button>
          <button className="btn primary" onClick={run} disabled={busy || text.trim().length < 10}>
            {busy ? 'Claude leest mee…' : 'Maak taak'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterGroup({ title, children }) {
  return (
    <div className="filter-group">
      <h4>{title}</h4>
      {children}
    </div>
  );
}

function DeadlineChip({ label, date, done }) {
  if (!date) return null;
  const n = daysUntil(date);
  const cls = done ? '' : n < 0 ? 'late' : n <= 2 ? 'soon' : '';
  return <span className={`chip deadline ${cls}`} title={`${label} deadline`}>{label === 'Intern' ? '⏱' : '📅'} {label} {fmtDate(date)}</span>;
}

function Card({ task, dragging, onOpen, onDragStart, onDragEnd }) {
  const doneSubs = task.subtasks?.filter((s) => s.done).length || 0;
  const totalSubs = task.subtasks?.length || 0;
  const group = workGroup(task.workType);
  return (
    <article
      className={`card ${dragging ? 'dragging' : ''} ${task.blocked ? 'is-blocked' : ''}`}
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
    >
      {task.blocked && <div className="blocked-badge" title={task.blockedReason || ''}>⛔ Vastgelopen{task.blockedReason ? `: ${task.blockedReason}` : ''}</div>}
      {task.client && <div className="card-client">{task.client}</div>}
      <h3 className="card-title">{task.title || 'Naamloze taak'}</h3>
      {task.workType && <span className={`chip type type-${group}`}>{task.workType}</span>}
      <div className="card-dates">
        <DeadlineChip label="Intern" date={task.internalDeadline} done={task.status === 'done'} />
        <DeadlineChip label="Extern" date={task.externalDeadline} done={task.status === 'done'} />
      </div>
      <div className="card-foot">
        <div className="avatars">{task.assignees?.map((p) => <Avatar key={p} name={p} />)}</div>
        <div className="meta">
          {task.hours ? <span>{task.hours} u</span> : null}
          {totalSubs > 0 && <span className={doneSubs === totalSubs ? 'ok' : ''}>☑ {doneSubs}/{totalSubs}</span>}
          {task.comments?.length > 0 && <span>💬 {task.comments.length}</span>}
        </div>
      </div>
      {totalSubs > 0 && (
        <div className="progress"><div style={{ width: `${(doneSubs / totalSubs) * 100}%` }} /></div>
      )}
    </article>
  );
}

function TaskModal({ task, isNew, fromText, me, onClose, onSave, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [d, setD] = useState(() => structuredClone(task));
  const [newSub, setNewSub] = useState('');
  const [newComment, setNewComment] = useState('');
  const [tab, setTab] = useState('comments');
  const set = (patch) => setD((x) => ({ ...x, ...patch }));

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function setStatus(status) {
    if (status === d.status) return;
    set({ status, history: [...d.history, { status, by: me, at: new Date().toISOString() }] });
  }

  function addSub(e) {
    e.preventDefault();
    if (!newSub.trim()) return;
    set({ subtasks: [...d.subtasks, { id: uid('st'), text: newSub.trim(), done: false }] });
    setNewSub('');
  }

  function addComment(e) {
    e.preventDefault();
    if (!newComment.trim()) return;
    set({ comments: [...d.comments, { id: uid('c'), author: me, text: newComment.trim(), at: new Date().toISOString() }] });
    setNewComment('');
  }

  const doneSubs = d.subtasks.filter((s) => s.done).length;
  const canSave = d.title.trim().length > 0;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <input className="title-input" placeholder="Titel van de taak" value={d.title} autoFocus={isNew}
            onChange={(e) => set({ title: e.target.value })} />
          <button className="icon-btn" onClick={onClose} aria-label="Sluiten">✕</button>
        </div>

        <div className="modal-body">
          <div className="modal-main">
            <div className="grid2">
              <Field label="Klant">
                <select value={d.client} onChange={(e) => set({ client: e.target.value })}>
                  <option value="">Kies een klant…</option>
                  {d.client && !clients.some((c) => c.name === d.client) && <option value={d.client}>{d.client} (gearchiveerd)</option>}
                  {clients.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Soort werk (urensoort)">
                <select value={d.workType} onChange={(e) => set({ workType: e.target.value })}>
                  <option value="">Kies een urensoort…</option>
                  {workTypes.map((w) => <option key={w}>{w}</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select value={d.status} onChange={(e) => setStatus(e.target.value)}>
                  {columns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </Field>
              <Field label="Verwachte tijdsduur (uren)">
                <input type="number" min="0" step="0.25" value={d.hours} placeholder="bijv. 2"
                  onChange={(e) => set({ hours: e.target.value === '' ? '' : Number(e.target.value) })} />
              </Field>
              <Field label="Interne deadline">
                <input type="date" value={d.internalDeadline} onChange={(e) => set({ internalDeadline: e.target.value })} />
                {d.internalDeadline && <a className="cal-link" href={calendarUrl(d, d.internalDeadline)} target="_blank" rel="noreferrer">Zet in Google Agenda</a>}
              </Field>
              <Field label="Externe deadline">
                <input type="date" value={d.externalDeadline} onChange={(e) => set({ externalDeadline: e.target.value })} />
                {d.externalDeadline && <a className="cal-link" href={calendarUrl(d, d.externalDeadline)} target="_blank" rel="noreferrer">Zet in Google Agenda</a>}
              </Field>
            </div>

            <div className={`blocked-box ${d.blocked ? 'on' : ''}`}>
              <label className="check">
                <input type="checkbox" checked={!!d.blocked} onChange={() => {
                  const blocked = !d.blocked;
                  set({ blocked, blockedReason: blocked ? d.blockedReason || '' : '',
                    history: [...d.history, { status: d.status, event: blocked ? 'blocked' : 'unblocked', by: me, at: new Date().toISOString() }] });
                }} />
                <strong>Vastgelopen</strong>
                <span className="muted">De taak kan niet verder, bijvoorbeeld omdat we wachten op de klant.</span>
              </label>
              {d.blocked && (
                <input id="blocked-reason" placeholder="Waarop wachten we? (bijv. content van de klant)" value={d.blockedReason || ''}
                  onChange={(e) => set({ blockedReason: e.target.value })} />
              )}
            </div>

            <Field label="Toegewezen aan" group>
              <div className="people-pick">
                {[...people, ...d.assignees.filter((a) => !people.includes(a))].map((p) => {
                  const on = d.assignees.includes(p);
                  return (
                    <button key={p} type="button" className={`person ${on ? 'on' : ''}`}
                      onClick={() => set({ assignees: on ? d.assignees.filter((x) => x !== p) : [...d.assignees, p] })}>
                      <Avatar name={p} /> {p}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="Omschrijving">
              <textarea rows={4} value={d.description} onChange={(e) => set({ description: e.target.value })}
                placeholder="Briefing, context, links…" />
            </Field>

            <div className="field">
              <div className="label-row">
                <span className="label">Subtaken</span>
                {d.subtasks.length > 0 && <span className="muted">{doneSubs} van {d.subtasks.length} klaar</span>}
              </div>
              {d.subtasks.length > 0 && (
                <div className="progress big"><div style={{ width: `${(doneSubs / d.subtasks.length) * 100}%` }} /></div>
              )}
              <ul className="subtasks">
                {d.subtasks.map((s) => (
                  <li key={s.id} className={s.done ? 'done' : ''}>
                    <label>
                      <input type="checkbox" checked={s.done}
                        onChange={() => set({ subtasks: d.subtasks.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)) })} />
                      <span>{s.text}</span>
                    </label>
                    <button className="icon-btn small" aria-label="Verwijder subtaak"
                      onClick={() => set({ subtasks: d.subtasks.filter((x) => x.id !== s.id) })}>✕</button>
                  </li>
                ))}
              </ul>
              <form className="inline-add" onSubmit={addSub}>
                <input placeholder="Subtaak toevoegen…" value={newSub} onChange={(e) => setNewSub(e.target.value)} />
                <button className="btn" type="submit">Toevoegen</button>
              </form>
            </div>
          </div>

          <div className="modal-side">
            <div className="tabs">
              <button className={tab === 'comments' ? 'on' : ''} onClick={() => setTab('comments')}>Opmerkingen ({d.comments.length})</button>
              <button className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>Statuswijzigingen</button>
            </div>
            {d.source && (
              <details className="source">
                <summary>Oorspronkelijke tekst</summary>
                <pre>{d.source}</pre>
              </details>
            )}
            {tab === 'comments' ? (
              <>
                <form className="comment-form" onSubmit={addComment}>
                  <textarea rows={2} placeholder={`Opmerking als ${me}…`} value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addComment(e); }} />
                  <button className="btn" type="submit">Plaatsen</button>
                </form>
                <ul className="feed">
                  {[...d.comments].reverse().map((c) => (
                    <li key={c.id}>
                      <div className="feed-head"><strong>{c.author}</strong><span>{fmtStamp(c.at)}</span></div>
                      <p>{c.text}</p>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <ul className="timeline">
                {[...d.history].reverse().map((h, i) => (
                  <li key={i}>
                    <span className={`tl-dot st-${h.event || h.status}`} />
                    <div>
                      <div>
                        {h.event === 'blocked' ? <>Gemarkeerd als <strong>vastgelopen</strong></>
                          : h.event === 'unblocked' ? <>Weer <strong>vlotgetrokken</strong></>
                          : <>{i === d.history.length - 1 ? 'Aangemaakt in' : 'Verplaatst naar'} <strong>{statusTitle[h.status] || h.status}</strong></>}
                      </div>
                      <div className="muted">{h.by} · {fmtStamp(h.at)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="modal-foot">
          {!isNew && !confirmDelete && (
            <button className="btn danger" onClick={() => setConfirmDelete(true)}>Verwijderen</button>
          )}
          {confirmDelete && (
            <>
              <span className="confirm-text">Taak definitief verwijderen?</span>
              <button className="btn danger solid" onClick={onDelete}>Ja, verwijderen</button>
              <button className="btn" onClick={() => setConfirmDelete(false)}>Nee</button>
            </>
          )}
          {fromText && (
            <span className="muted">
              Ingevuld door Claude. Controleer de velden.
              {[!d.client && 'klant', !d.internalDeadline && !d.externalDeadline && 'deadline'].filter(Boolean).length > 0 &&
                ` Niet in de tekst gevonden: ${[!d.client && 'klant', !d.internalDeadline && !d.externalDeadline && 'deadline'].filter(Boolean).join(' en ')}.`}
            </span>
          )}
          <span className="spacer" />
          <button className="btn" onClick={onClose}>Annuleren</button>
          <button className="btn primary" disabled={!canSave} onClick={() => onSave(d)}>
            {isNew ? 'Taak aanmaken' : 'Opslaan'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, group = false }) {
  const Tag = group ? 'div' : 'label';
  return (
    <Tag className="field">
      <span className="label">{label}</span>
      {children}
    </Tag>
  );
}
