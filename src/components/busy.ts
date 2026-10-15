"use client";
// Общий счётчик идущих действий: верхняя полоса загрузки горит, пока счётчик больше нуля.
let count = 0;
const subs = new Set<(n: number) => void>();
export const busyStore = {
  inc() { count++; subs.forEach((f) => f(count)); },
  dec() { count = Math.max(0, count - 1); subs.forEach((f) => f(count)); },
  subscribe(f: (n: number) => void) { subs.add(f); return () => { subs.delete(f); }; },
  get: () => count,
};
