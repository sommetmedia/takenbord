import { useEffect, useMemo, useRef, useState } from 'react';
import {
  clients, columns, deadlineOptions, durationOptions, people, statusTitle, workGroup, workTypes,
} from './data.js';
import { seedTasks } from './seed.js';
import { deleteTask, fetchTasks, isOffline, saveTask } from './api.js';

const uid = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const emptyFilters = { people: [], client: '', workType: '', internal: [], external: [], duration: [] };

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
  return <span className={`avatar av-${people.indexOf(name)}`} title={name}>{name[0]}</span>;
}

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [filters, setFilters] = useState(emptyFilters);
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [me, setMe] = useState(() => {
    try { return localStorage.getItem('sommet-me') || 'Pablo'; } catch { return 'Pablo'; }
  });
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  useEffect(() => {
    const load = () => fetchTasks(seedTasks).then((t) => { setTasks(t); setLoaded(true); });
    load();
    const iv = setInterval(() => { if (!document.hidden && !isOffline()) load(); }, 15000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => { try { localStorage.setItem('sommet-me', me); } catch {} }, [me]);

  function upsert(task) {
    const all = tasksRef.current.some((t) => t.id === task.id)
      ? tasksRef.current.map((t) => (t.id === task.id ? task : t))
      : [...tasksRef.current, task];
    setTasks(all);
    saveTask(task, all);
  }

  function remove(id) {
    const all = tasksRef.current.filter((t) => t.id !== id);
    setTasks(all);
    deleteTask(id, all);
  }

  function move(id, status) {
    const t = tasksRef.current.find((x) => x.id === id);
    if (!t || t.status === status) return;
    upsert({ ...t, status, history: [...(t.history || []), { status, by: me, at: new Date().toISOString() }] });
  }

  function newTask(status = 'todo') {
    const now = new Date().toISOString();
    setOpenId({
      isNew: true,
      task: {
        id: uid('task'), title: '', client: '', workType: '', hours: '', assignees: [me], status,
        internalDeadline: '', externalDeadline: '', description: '', subtasks: [], comments: [],
        history: [{ status, by: me, at: now }], createdAt: now,
      },
    });
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) =>
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
    (filters.client ? 1 : 0) + (filters.workType ? 1 : 0);

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
          <label className="me">
            Ik ben
            <select value={me} onChange={(e) => setMe(e.target.value)}>
              {people.map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
          <button className="btn primary" onClick={() => newTask()}>+ Nieuwe taak</button>
        </header>
        {loaded && isOffline() && (
          <div className="banner">Geen server bereikbaar: wijzigingen worden alleen in deze browser bewaard.</div>
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
          me={me}
          onClose={() => setOpenId(null)}
          onSave={(t) => { upsert(t); setOpenId(null); }}
          onDelete={() => { remove(openTask.id); setOpenId(null); }}
        />
      )}
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
      className={`card ${dragging ? 'dragging' : ''}`}
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
    >
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

function TaskModal({ task, isNew, me, onClose, onSave, onDelete }) {
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

            <Field label="Toegewezen aan" group>
              <div className="people-pick">
                {people.map((p) => {
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
                    <span className={`tl-dot st-${h.status}`} />
                    <div>
                      <div>{i === d.history.length - 1 ? 'Aangemaakt in' : 'Verplaatst naar'} <strong>{statusTitle[h.status]}</strong></div>
                      <div className="muted">{h.by} · {fmtStamp(h.at)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="modal-foot">
          {!isNew && (
            <button className="btn danger" onClick={() => { if (confirm('Deze taak verwijderen?')) onDelete(); }}>Verwijderen</button>
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
