# Sommet Media takenbord

Kanbanbord voor het team: klant, Simplicate-urensoort, tijdsduur, toegewezen personen,
subtaken, opmerkingen, statusgeschiedenis, interne/externe deadlines en filters.

- Frontend: React + Vite (`src/`)
- Backend: Express (`server.js`), slaat taken op in `DATA_DIR/tasks.json`
- Klanten, personen en urensoorten: `src/data.js` en `src/workTypes.json`

## Ontwikkelen (dev)

```bash
npm install
npm run dev
```

Frontend op http://localhost:5173, API op :3001. In Claude Code op het web draait dit in de
cloud-sessie en zie je het in het preview-venster.

## Productie op cPanel (tasks.sommetmedia.nl)

Branches: `dev` gaat naar tasks-dev.sommetmedia.nl, `main` naar tasks.sommetmedia.nl
(zie `.github/workflows/deploy.yml`). `npm run package` maakt `build/` met `app.cjs` (server met
alles erin), `dist/` (frontend) en een kale `package.json`. Er is op de server geen `npm install` nodig.

Eenmalig in cPanel, per omgeving (prod en dev):

1. **Domains**: subdomein `tasks.sommetmedia.nl` (en `tasks-dev.sommetmedia.nl`).
2. **Setup Node.js App** > Create Application:
   - Node.js version: 20 of hoger
   - Application mode: Production
   - Application root: `takenbord/prod` (dev: `takenbord/dev`)
   - Application URL: `tasks.sommetmedia.nl` (dev: `tasks-dev.sommetmedia.nl`)
   - Application startup file: `app.cjs`
   - Environment variables: `APP_PASSWORD` = het wachtwoord, `DATA_DIR` = `/home/<gebruiker>/takenbord-data/prod`
     (dev: `.../dev`), `APP_ENV` = `production` of `staging`
3. **SSL/TLS Status**: AutoSSL draaien voor beide subdomeinen.
4. **SSH Access**: SSH-sleutel aanmaken of importeren en autoriseren, en de privé-sleutel als
   secret `CPANEL_SSH_KEY` in GitHub zetten (plus `CPANEL_HOST`, `CPANEL_USER`, `CPANEL_SSH_PORT`).

De taken staan in `DATA_DIR`, buiten de app-map, zodat een deploy ze nooit overschrijft.

### Zonder cPanel (Docker)

```bash
docker build -t sommet-kanban .
docker run -d -p 3001:3001 -e APP_PASSWORD=... -v sommet-kanban-data:/data sommet-kanban
```

Beveiliging: zonder `APP_PASSWORD` staat de app open. Zet het wachtwoord nooit in git.
Dit is tijdelijk tot de Google-login (OAuth) er is.

## Google Workspace

- Google Agenda: in een taak met een deadline staat de link "Zet in Google Agenda". Die werkt al.
- Google Tasks en automatisch synchroniseren: nog niet gebouwd. Dat vraagt een Google Cloud-project
  met OAuth (Calendar API + Tasks API).
