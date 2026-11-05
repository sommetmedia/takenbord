// Pakt de build in voor shared hosting (PHP + Apache):
//   build/public/      -> document root: frontend, api.php en .htaccess
//   build/seed.json    -> starttaken voor een lege database
//   build/defaults.json -> startlijst personen en klanten
import fs from 'node:fs';
import { writeSeeds } from './seeds.mjs';

fs.rmSync('build', { recursive: true, force: true });
fs.cpSync('dist', 'build/public', { recursive: true });
fs.copyFileSync('deploy/php/api.php', 'build/public/api.php');
fs.copyFileSync('deploy/php/.htaccess', 'build/public/.htaccess');
writeSeeds('build');
console.log('build/ klaar voor deploy');
