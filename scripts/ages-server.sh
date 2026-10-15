#!/bin/bash
# Запуск собранной платформы на http://localhost:3000. Управляется launchd: сам поднимается после
# перезагрузки Mac и после падения. Лог: ~/Library/Logs/ages-studio/server.log
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.volta/bin:$PATH"
if [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh" >/dev/null; fi
cd "${AGES_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
[ -d .next ] || npm run build
exec npx next start -p 3000
