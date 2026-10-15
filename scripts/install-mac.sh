#!/bin/bash
# Устанавливает Ages Studio как фоновую службу macOS:
#  • сервер на http://localhost:3000 — запускается при входе в систему и перезапускается при падении;
#  • автообновление из GitHub — каждые 5 минут.
# Повторный запуск безопасен. Удаление: bash scripts/uninstall-mac.sh
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LA="$HOME/Library/LaunchAgents"
LOG_DIR="$HOME/Library/Logs/ages-studio"
UID_N="$(id -u)"
mkdir -p "$LA" "$LOG_DIR"
chmod +x "$APP_DIR/scripts/"*.sh

if ! command -v node >/dev/null; then echo "Нужен Node.js 20+: brew install node"; exit 1; fi
cd "$APP_DIR"
git remote get-url origin >/dev/null 2>&1 || { echo "Папка не связана с GitHub. Сначала: git clone ... "; exit 1; }

# Освобождаем порт 3000, если там запущен npm run dev из терминала.
if lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Порт 3000 занят — останавливаю процесс (наверное, npm run dev в терминале)."
  lsof -tiTCP:3000 -sTCP:LISTEN | xargs kill 2>/dev/null || true
  sleep 1
fi

[ -d node_modules ] || npm ci --no-audit --no-fund
echo "Сборка…"
npm run build >"$LOG_DIR/build.log" 2>&1 || { echo "Сборка упала, смотри $LOG_DIR/build.log"; exit 1; }

write_plist() { # label, script, extra xml
  cat >"$LA/$1.plist" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$1</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$APP_DIR/scripts/$2</string></array>
  <key>WorkingDirectory</key><string>$APP_DIR</string>
  <key>EnvironmentVariables</key><dict><key>AGES_DIR</key><string>$APP_DIR</string></dict>
  <key>StandardOutPath</key><string>$LOG_DIR/$3.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/$3.log</string>
  $4
</dict></plist>
PL
  launchctl bootout "gui/$UID_N/$1" 2>/dev/null || true
  launchctl bootstrap "gui/$UID_N" "$LA/$1.plist"
}

write_plist com.ages-studio.server ages-server.sh server "<key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>10</integer>"
write_plist com.ages-studio.update ages-update.sh update-launchd "<key>RunAtLoad</key><true/><key>StartInterval</key><integer>300</integer>"

echo
echo "Готово."
echo "  Платформа:   http://localhost:3000 (поднимется через ~5 секунд)"
echo "  Обновления:  каждые 5 минут из GitHub; лог — $LOG_DIR/update.log"
echo "  Обновить сейчас: bash scripts/ages-update.sh --force"
