"use client";
import { RefreshCw } from "lucide-react";
import clsx from "clsx";
import { useAction } from "./use-action";
import { syncNowAction } from "@/app/actions";

export function SyncButton() {
  const { pending, run } = useAction();
  return (
    <button className="btn btn-sm" disabled={pending} onClick={() => run(() => syncNowAction())}>
      <RefreshCw size={14} className={clsx(pending && "animate-spin")} />
      {pending ? "Обновляю…" : "Обновить данные"}
    </button>
  );
}
