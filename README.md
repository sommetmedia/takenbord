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

## Productie (bijv. tasks.sommetmedia.nl)

```bash
docker build -t sommet-kanban .
docker run -d --name sommet-kanban -p 3001:3001 -v sommet-kanban-data:/data --restart unless-stopped sommet-kanban
```

Zet daarna een reverse proxy (nginx/Caddy/Plesk) met HTTPS van `tasks.sommetmedia.nl` naar poort 3001,
en een A-record voor `tasks` naar de server.

Zonder Docker: `npm ci && npm run build && npm start` (Node 20+).

Beveiliging: zet `APP_PASSWORD` (bijv. `docker run ... -e APP_PASSWORD=...` of in
`~/sommet-kanban-main.env` op de server). De browser vraagt dan om een wachtwoord; de gebruikersnaam
maakt niet uit. Dit is tijdelijk tot de Google-login (OAuth) er is. Zet het wachtwoord nooit in git.

## Google Workspace

- Google Agenda: in een taak met een deadline staat de link "Zet in Google Agenda". Die werkt al.
- Google Tasks en automatisch synchroniseren: nog niet gebouwd. Dat vraagt een Google Cloud-project
  met OAuth (Calendar API + Tasks API).
