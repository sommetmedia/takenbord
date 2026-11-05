# Sommet Media takenbord

Kanbanbord voor het team: klant, Simplicate-urensoort, tijdsduur, toegewezen personen,
subtaken, opmerkingen, statusgeschiedenis, interne/externe deadlines en filters.

- Frontend: React + Vite (`src/`)
- Backend: PHP (`deploy/php/api.php`), lokaal én online; taken in `tasks.json`
- Personen en klanten: in de app via **Beheer** (startlijst: `src/defaults.json`); urensoorten: `src/workTypes.json`

## Ontwikkelen (dev)

```bash
npm install
npm run dev
```

Frontend op http://localhost:5173, PHP-API op :3001 (`php -S`, dezelfde `api.php` als online).
Lokaal inloggen: een e-mailadres uit `src/defaults.json` met wachtwoord `sommet` (of zet `APP_PASSWORD`).
Lokale gegevens staan in `.dev/`.

## Inloggen en Beheer

- Iedereen logt in met zijn eigen e-mailadres en het gedeelde wachtwoord (`APP_PASSWORD`). Sessie: 30 dagen.
- Wie in Beheer op actief staat, kan inloggen. Archiveren blokkeert het inloggen direct.
- Beheer (personen en klanten) is alleen voor beheerders; standaard Pablo en Kevin.
- Na 10 mislukte pogingen per kwartier blokkeert de login voor dat IP-adres.
- Wachtwoord wijzigen: secret `APP_PASSWORD` aanpassen en de deploy draaien. Iedereen moet dan opnieuw inloggen.

## Productie op shared hosting (tasks.sommetmedia.nl)

De hosting heeft geen Node.js, alleen PHP en Apache. De API is één PHP-bestand (`deploy/php/api.php`),
lokaal en online hetzelfde.

Branches: `dev` gaat naar tasks-dev.sommetmedia.nl, `main` naar tasks.sommetmedia.nl
(zie `.github/workflows/deploy.yml`). `npm run package` maakt `build/`:

- `build/public/`: frontend, `api.php` en `.htaccess`. Dit is de document root van het subdomein.
- `build/seed.json`: starttaken voor een lege database.

Op de server:

- `~/takenbord/<prod|dev>/public/`: document root
- `~/takenbord/<prod|dev>/password.sha256`: hash van het wachtwoord, gemaakt door de workflow uit secret `APP_PASSWORD`
- `~/takenbord-data/<prod|dev>/`: taken, personen en klanten (Beheer) en de sessiesleutel. Buiten de deploy-map,
  dus een deploy overschrijft ze nooit

Eenmalig:

1. **cPanel > Domains**: document root van `tasks.sommetmedia.nl` op `takenbord/prod/public` zetten,
   en van `tasks-dev.sommetmedia.nl` op `takenbord/dev/public`.
2. **SSL/TLS Status**: AutoSSL voor beide subdomeinen.
3. **SSH Access**: sleutel aanmaken en autoriseren. GitHub-secrets: `CPANEL_HOST`, `CPANEL_USER`,
   `CPANEL_SSH_KEY`, `CPANEL_SSH_PASSPHRASE` (cPanel dwingt een wachtwoord op de sleutel af),
   eventueel `CPANEL_SSH_PORT`, en `APP_PASSWORD`.
4. **Taak uit tekst** (optioneel): secret `ANTHROPIC_API_KEY` met een Claude API-sleutel. De deploy zet die in
   `~/takenbord/<prod|dev>/anthropic.key` (buiten de document root); `api.php` roept daarmee Claude aan.
   Zonder sleutel verdwijnt de knop vanzelf.

Zet het wachtwoord nooit in git.

## Google Workspace

- Google Agenda: in een taak met een deadline staat de link "Zet in Google Agenda". Die werkt al.
- Google Tasks en automatisch synchroniseren: nog niet gebouwd. Dat vraagt een Google Cloud-project
  met OAuth (Calendar API + Tasks API).
