// Kleine API + statische hosting voor het Sommet takenbord.
// Dev:  draait op :3001, Vite proxyt /api hiernaartoe.
// Prod: serveert ook de gebouwde frontend uit ./dist.
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedTasks } from './src/seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
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

app.get('/api/health', (_req, res) => res.json({ ok: true, env: process.env.APP_ENV || 'development' }));

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

app.put('/api/tasks/:id', (req, res) => {
  const task = { ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
  const i = tasks.findIndex((t) => t.id === task.id);
  if (i === -1) tasks.push(task);
  else tasks[i] = task;
  save(tasks);
  res.json(task);
});

app.delete('/api/tasks/:id', (req, res) => {
  tasks = tasks.filter((t) => t.id !== req.params.id);
  save(tasks);
  res.status(204).end();
});

if (process.env.NODE_ENV === 'production') {
  const dist = path.join(__dirname, 'dist');
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => console.log(`Sommet takenbord API op http://localhost:${PORT}`));
