// Kleine API + statische hosting voor het Sommet takenbord.
// Dev:  draait op :3001, Vite proxyt /api hiernaartoe.
// Prod: serveert ook de gebouwde frontend uit ./dist.
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { seedTasks } from './src/seed.js';

// Map van de app. Lokaal en op cPanel (Passenger) is dat de werkmap.
const ROOT = process.env.APP_ROOT || process.cwd();
const PORT = process.env.PORT || 3001;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'tasks.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

function load() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    const tasks = seedTasks();
    save(tasks);
    return tasks;
  }
}

function save(tasks) {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(tasks, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

let tasks = load();

const app = express();
app.use(express.json({ limit: '1mb' }));

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
app.get('/api/health', (_req, res) => res.json({ ok: true, env: process.env.APP_ENV || 'development', parse: !!ANTHROPIC_API_KEY }));

// Tijdelijke beveiliging tot de Google-login er is: één gedeeld wachtwoord via APP_PASSWORD.
// De browser vraagt het één keer en onthoudt het. Zonder APP_PASSWORD (lokaal ontwikkelen) staat het uit.
const PASSWORD = process.env.APP_PASSWORD || '';
if (PASSWORD) {
  const expected = crypto.createHash('sha256').update(PASSWORD).digest();
  app.use((req, res, next) => {
    const [scheme, encoded] = (req.headers.authorization || '').split(' ');
    if (scheme === 'Basic' && encoded) {
      const decoded = Buffer.from(encoded, 'base64').toString('utf8');
      const given = decoded.slice(decoded.indexOf(':') + 1);
      const hash = crypto.createHash('sha256').update(given).digest();
      if (crypto.timingSafeEqual(hash, expected)) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="Sommet Takenbord", charset="UTF-8"');
    res.status(401).send('Wachtwoord vereist');
  });
} else if (process.env.NODE_ENV === 'production') {
  console.warn('LET OP: APP_PASSWORD is niet gezet. Het takenbord is voor iedereen bereikbaar.');
}

app.get('/api/tasks', (_req, res) => res.json(tasks));

// Taak uit tekst, zelfde gedrag als /api/parse in deploy/php/api.php.
app.post('/api/parse', async (req, res) => {
  if (!ANTHROPIC_API_KEY) return res.status(503).json({ error: 'not_configured' });
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt : '';
  if (!prompt || prompt.length > 200000) return res.status(400).json({ error: 'bad_prompt' });
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2026-10-21',
        'anthropic-beta': 'server-side-fallback-2026-07-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-5-5',
        max_tokens: 8000,
        output_config: { effort: 'low' },
        fallbacks: 'default',
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (r.status === 429 || r.status === 529) return res.status(429).json({ error: 'rate_limited' });
    const data = await r.json();
    if (!r.ok) { console.error('parse: Claude API', r.status, JSON.stringify(data).slice(0, 300)); return res.status(502).json({ error: 'api_error' }); }
    if (data.stop_reason === 'refusal') return res.status(422).json({ error: 'refused' });
    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    res.json(JSON.parse(json));
  } catch (e) {
    res.status(422).json({ error: 'no_json' });
  }
});

// POST naast PUT/DELETE: sommige shared hosts blokkeren PUT en DELETE.
const putTask = (req, res) => {
  const task = { ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
  const i = tasks.findIndex((t) => t.id === task.id);
  if (i === -1) tasks.push(task);
  else tasks[i] = task;
  save(tasks);
  res.json(task);
};
const deleteTask = (req, res) => {
  tasks = tasks.filter((t) => t.id !== req.params.id);
  save(tasks);
  res.status(204).end();
};
app.put('/api/tasks/:id', putTask);
app.post('/api/tasks/:id', putTask);
app.delete('/api/tasks/:id', deleteTask);
app.post('/api/tasks/:id/delete', deleteTask);

if (process.env.NODE_ENV === 'production') {
  const dist = path.join(ROOT, 'dist');
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => console.log(`Sommet takenbord API op http://localhost:${PORT}`));
