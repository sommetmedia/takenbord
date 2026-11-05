# Sommet Media takenbord

Kanbanbord voor het team: klant, Simplicate-urensoort, tijdsduur, toegewezen personen,
subtaken, opmerkingen, statusgeschiedenis, interne/externe deadlines en filters.

- Frontend: React + Vite (`src/`)
- Backend: Express (`server.js`) lokaal, PHP (`deploy/php/api.php`) online; taken in `tasks.json`
- Klanten, personen en urensoorten: `src/data.js` en `src/workTypes.json`

## Ontwikkelen (dev)

```bash
npm install
npm run dev
```

Frontend op http://localhost:5173, API op :3001. In Claude Code op het web draait dit in de
cloud-sessie en zie je het in het preview-venster.

## Productie op shared hosting (tasks.sommetmedia.nl)

De hosting heeft geen Node.js, alleen PHP en Apache. Lokaal draait de API in Express (`server.js`),
online in PHP (`deploy/php/api.php`). Beide hebben dezelfde endpoints, de frontend merkt geen verschil.

Branches: `dev` gaat naar tasks-dev.sommetmedia.nl, `main` naar tasks.sommetmedia.nl
(zie `.github/workflows/deploy.yml`). `npm run package` maakt `build/`:

- `build/public/`: frontend, `api.php` en `.htaccess`. Dit is de document root van het subdomein.
- `build/seed.json`: starttaken voor een lege database.

Op de server:

- `~/takenbord/<prod|dev>/public/`: document root
- `~/takenbord/<prod|dev>/.htpasswd`: wachtwoord, gemaakt door de workflow uit secret `APP_PASSWORD`
- `~/takenbord-data/<prod|dev>/tasks.json`: de taken, buiten de deploy-map, dus een deploy overschrijft ze nooit

Eenmalig:

1. **cPanel > Domains**: document root van `tasks.sommetmedia.nl` op `takenbord/prod/public` zetten,
   en van `tasks-dev.sommetmedia.nl` op `takenbord/dev/public`.
2. **SSL/TLS Status**: AutoSSL voor beide subdomeinen.
3. **SSH Access**: sleutel aanmaken en autoriseren. GitHub-secrets: `CPANEL_HOST`, `CPANEL_USER`,
   `CPANEL_SSH_KEY`, `CPANEL_SSH_PASSPHRASE` (cPanel dwingt een wachtwoord op de sleutel af),
   eventueel `CPANEL_SSH_PORT`, en `APP_PASSWORD`.

Inloggen: gebruikersnaam `sommet`, wachtwoord uit `APP_PASSWORD`. Zet het wachtwoord nooit in git.
Dit is tijdelijk tot de Google-login (OAuth) er is.

### Alternatief: eigen server met Docker

```bash
docker build -t sommet-kanban .
docker run -d -p 3001:3001 -e APP_PASSWORD=... -v sommet-kanban-data:/data sommet-kanban
```

In Docker draait de Express-server; zonder `APP_PASSWORD` staat die open.

## Google Workspace

- Google Agenda: in een taak met een deadline staat de link "Zet in Google Agenda". Die werkt al.
- Google Tasks en automatisch synchroniseren: nog niet gebouwd. Dat vraagt een Google Cloud-project
  met OAuth (Calendar API + Tasks API).
