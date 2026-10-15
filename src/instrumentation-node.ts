// Раз в 15 минут проверяет, прошло ли 12 часов (настраивается) с последнего удачного обновления.
// Если компьютер был выключен — обновление произойдёт сразу после запуска.
import { maybeSync } from "./lib/server/sync";

const g = globalThis as unknown as { __agesScheduler?: boolean };

if (!g.__agesScheduler && process.env.AGES_DISABLE_SCHEDULER !== "1" && process.env.NEXT_PHASE !== "phase-production-build") {
  g.__agesScheduler = true; // в dev-режиме модуль может перезагружаться — таймер ставим один раз
  const tick = () => maybeSync().catch((e) => console.error("[sync]", e));
  setTimeout(tick, 15_000);
  setInterval(tick, 15 * 60_000);
}
