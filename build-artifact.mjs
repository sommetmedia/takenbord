// Bouwt de app als één HTML-pagina voor een claude.ai Artifact (artifact/index.html).
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';

const out = await build({
  plugins: [react()],
  logLevel: 'warn',
  build: { write: false, cssCodeSplit: false, modulePreload: false, assetsInlineLimit: 100000 },
});
const files = (Array.isArray(out) ? out[0] : out).output;
const js = files.filter((f) => f.type === 'chunk').map((f) => f.code).join('\n').replaceAll('</script', '<\\/script');
const css = files.filter((f) => f.fileName.endsWith('.css')).map((f) => f.source).join('\n');

const html = `<title>Sommet Media - Takenbord</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&family=Poppins:wght@400;500;600&display=swap" rel="stylesheet">
<style>${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`;
fs.mkdirSync('artifact', { recursive: true });
fs.writeFileSync('artifact/index.html', html);
console.log('artifact/index.html', (html.length / 1024).toFixed(0), 'KB');
