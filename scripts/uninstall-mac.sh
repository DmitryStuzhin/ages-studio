#!/bin/bash
# Останавливает и удаляет фоновые службы Ages Studio. Код и база не трогаются.
for L in com.ages-studio.server com.ages-studio.update; do
  launchctl bootout "gui/$(id -u)/$L" 2>/dev/null || true
  rm -f "$HOME/Library/LaunchAgents/$L.plist"
done
echo "Службы Ages Studio удалены."
