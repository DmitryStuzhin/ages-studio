"use client";
import { useEffect, useState } from "react";
import { busyStore } from "./busy";

/** Тонкая бегущая полоса вверху окна, пока идёт любое действие: сохранение, синхронизация, экспорт. */
export function TopProgress() {
  const [n, setN] = useState(0);
  const [show, setShow] = useState(false);
  useEffect(() => busyStore.subscribe(setN), []);
  // Короткие действия (до 150 мс) не мигают полосой.
  useEffect(() => {
    if (n > 0) { const t = setTimeout(() => setShow(true), 150); return () => clearTimeout(t); }
    setShow(false);
  }, [n]);
  return <div className={show ? "top-progress is-on" : "top-progress"} role="progressbar" aria-hidden={!show} aria-label="Идёт загрузка" />;
}
