// Minimale package.json voor de server: alles zit al in app.cjs, dus geen npm install nodig.
import fs from 'node:fs';
fs.writeFileSync('build/package.json', JSON.stringify({ name: 'sommet-kanban', private: true, main: 'app.cjs' }, null, 2));
