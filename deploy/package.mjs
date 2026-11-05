// Pakt de build in voor shared hosting (PHP + Apache):
//   build/public/   -> document root: frontend, api.php en .htaccess
//   build/seed.json -> starttaken voor een lege database
import fs from 'node:fs';
import { seedTasks } from '../src/seed.js';

fs.rmSync('build', { recursive: true, force: true });
fs.cpSync('dist', 'build/public', { recursive: true });
fs.copyFileSync('deploy/php/api.php', 'build/public/api.php');
fs.copyFileSync('deploy/php/.htaccess', 'build/public/.htaccess');
fs.writeFileSync('build/seed.json', JSON.stringify(seedTasks(), null, 2));
console.log('build/ klaar voor deploy');
