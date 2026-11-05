// Schrijft de startgegevens voor de server naar een map:
//   seed.json      starttaken (alleen gebruikt bij een lege takenlijst)
//   defaults.json  startlijst personen en klanten (alleen gebruikt zolang Beheer nog niets heeft opgeslagen)
import fs from 'node:fs';
import path from 'node:path';
import { seedTasks } from '../src/seed.js';

export function writeSeeds(dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'seed.json'), JSON.stringify(seedTasks(), null, 2));
  fs.copyFileSync('src/defaults.json', path.join(dir, 'defaults.json'));
}

if (process.argv[2]) writeSeeds(process.argv[2]);
