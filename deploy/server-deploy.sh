#!/usr/bin/env bash
# Staat op de server als ~/sommet-kanban-deploy.sh. Wordt aangeroepen door GitHub Actions.
# main -> container "kanban-prod" op poort 3001 (tasks.sommetmedia.nl)
# dev  -> container "kanban-dev"  op poort 3002 (tasks-dev.sommetmedia.nl)
set -euo pipefail
BRANCH="$1"; SHA="$2"
REPO_DIR="$HOME/sommet-kanban"
REPO_URL="git@github.com:sommetmedia/takenbord.git"   # pas aan naar de echte repo

case "$BRANCH" in
  main) NAME=kanban-prod; PORT=3001; ENVNAME=production ;;
  dev)  NAME=kanban-dev;  PORT=3002; ENVNAME=staging ;;
  *) echo "Onbekende branch $BRANCH"; exit 1 ;;
esac

[ -d "$REPO_DIR/$BRANCH" ] || git clone -b "$BRANCH" "$REPO_URL" "$REPO_DIR/$BRANCH"
cd "$REPO_DIR/$BRANCH"
git fetch origin "$BRANCH" && git checkout -q "$SHA"

docker build -t "sommet-kanban:$BRANCH" .
docker rm -f "$NAME" 2>/dev/null || true
# Wachtwoord en andere geheimen staan in ~/sommet-kanban-<branch>.env (niet in git), bijv.:
#   APP_PASSWORD=...
ENV_FILE="$HOME/sommet-kanban-$BRANCH.env"
[ -f "$ENV_FILE" ] || { echo "Maak eerst $ENV_FILE aan met APP_PASSWORD=..."; exit 1; }

docker run -d --name "$NAME" --restart unless-stopped \
  -p "127.0.0.1:$PORT:3001" -e APP_ENV="$ENVNAME" --env-file "$ENV_FILE" \
  -v "$NAME-data:/data" "sommet-kanban:$BRANCH"
echo "$NAME draait op $SHA"
