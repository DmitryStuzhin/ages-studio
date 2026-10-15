#!/bin/bash
# Автообновление Ages Studio: проверяет GitHub, при новых коммитах подтягивает их,
# ставит зависимости (если менялся package-lock.json), пересобирает и перезапускает сервер.
# Запускается launchd каждые 5 минут. Лог: ~/Library/Logs/ages-studio/update.log
set -euo pipefail

APP_DIR="${AGES_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
LOG_DIR="$HOME/Library/Logs/ages-studio"
LOCK="/tmp/ages-studio-update.lock"
mkdir -p "$LOG_DIR"
exec >>"$LOG_DIR/update.log" 2>&1

# launchd запускает с пустым PATH — добавляем Homebrew и nvm/volta, если они есть.
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.volta/bin:$PATH"
if [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh" >/dev/null; fi

# Не запускаемся дважды.
if ! mkdir "$LOCK" 2>/dev/null; then
  # Замок старше 30 минут — остался от упавшего запуска.
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +30 2>/dev/null)" ]; then rm -rf "$LOCK"; mkdir "$LOCK"; else exit 0; fi
fi
trap 'rm -rf "$LOCK"' EXIT

cd "$APP_DIR"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git fetch --quiet origin "$BRANCH" || { echo "$(date '+%F %T') fetch не удался (нет сети?)"; exit 0; }

LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/$BRANCH")"
FORCE="${1:-}"
if [ "$LOCAL" = "$REMOTE" ] && [ "$FORCE" != "--force" ]; then exit 0; fi

echo "$(date '+%F %T') обновление ${LOCAL:0:7} → ${REMOTE:0:7}"
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "  есть локальные правки в коде — откладываю их в git stash"
  git stash push --include-untracked -m "ages-autoupdate $(date '+%F %T')" -- . ':!.env.local' ':!.data' >/dev/null || true
fi
CHANGED="$(git diff --name-only "$LOCAL" "$REMOTE")"
git merge --ff-only --quiet "origin/$BRANCH"

if echo "$CHANGED" | grep -qE '^(package\.json|package-lock\.json)$' || [ ! -d node_modules ]; then
  echo "  npm ci"
  npm ci --no-audit --no-fund
fi

echo "  сборка"
if npm run build >"$LOG_DIR/build.log" 2>&1; then
  echo "  сборка ок — перезапускаю сервер"
  launchctl kickstart -k "gui/$(id -u)/com.ages-studio.server" || true
  echo "$(date '+%F %T') готово: $(git log -1 --pretty='%h %s')"
else
  echo "  СБОРКА УПАЛА — сервер не трогаю, смотри $LOG_DIR/build.log. Откат на ${LOCAL:0:7}."
  git reset --hard --quiet "$LOCAL"
  npm run build >"$LOG_DIR/build-rollback.log" 2>&1 || true
  launchctl kickstart -k "gui/$(id -u)/com.ages-studio.server" || true
fi
