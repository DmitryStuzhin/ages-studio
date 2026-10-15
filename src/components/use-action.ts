"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import { busyStore } from "./busy";
import { useToast } from "./toast";
import type { ActionResult } from "@/app/actions";

/** Вызов server action с тостом результата и обновлением страницы. */
export function useAction() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  // Кнопка, которой запустили действие, получает aria-busy: в ней крутится индикатор (см. globals.css).
  const btn = useRef<HTMLElement | null>(null);
  const counted = useRef(false);
  useEffect(() => {
    if (pending) return;
    btn.current?.removeAttribute("aria-busy");
    btn.current = null;
    if (counted.current) { counted.current = false; busyStore.dec(); }
  }, [pending]);
  useEffect(() => () => { if (counted.current) busyStore.dec(); }, []);
  const run = (fn: () => Promise<ActionResult | void>, after?: () => void) => {
    const el = typeof document !== "undefined" ? document.activeElement : null;
    if (el instanceof HTMLButtonElement) { btn.current = el; el.setAttribute("aria-busy", "true"); }
    if (!counted.current) { counted.current = true; busyStore.inc(); }
    start(async () => {
      const r = await fn();
      if (r && !r.ok) toast(r.error, "error");
      else {
        if (r && r.message) toast(r.message);
        after?.();
        router.refresh();
      }
    });
  };
  return { pending, run };
}
