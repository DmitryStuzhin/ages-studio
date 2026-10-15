"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useToast } from "./toast";
import type { ActionResult } from "@/app/actions";

/** Вызов server action с тостом результата и обновлением страницы. */
export function useAction() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult | void>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r && !r.ok) toast(r.error, "error");
      else {
        if (r && r.message) toast(r.message);
        after?.();
        router.refresh();
      }
    });
  return { pending, run };
}
