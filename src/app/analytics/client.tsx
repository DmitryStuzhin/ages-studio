"use client";
import { useRef } from "react";
import { Trash2 } from "lucide-react";
import { useAction } from "@/components/use-action";
import { addSnapshotAction, deleteSnapshotAction } from "@/app/actions";

export function SnapshotForm() {
  const { pending, run } = useAction();
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} className="grid gap-3 sm:grid-cols-2" action={(fd) => run(() => addSnapshotAction(fd), () => form.current?.reset())}>
      <div><label className="label" htmlFor="s-day">Дата</label><input id="s-day" name="day" type="date" className="field" defaultValue={new Date().toISOString().slice(0, 10)} /></div>
      <div><label className="label" htmlFor="s-subs">Подписчики</label><input id="s-subs" name="subscribers" inputMode="numeric" className="field" required /></div>
      <div><label className="label" htmlFor="s-h">Часы за 12 мес. (публичные длинные)</label><input id="s-h" name="watchHours" inputMode="decimal" className="field" /></div>
      <div><label className="label" htmlFor="s-sh">Просмотры Shorts за 90 дней</label><input id="s-sh" name="shortsViews" inputMode="numeric" className="field" /></div>
      <div className="sm:col-span-2"><button className="btn btn-primary" disabled={pending}>Сохранить снимок</button></div>
    </form>
  );
}

export function SnapshotList({ items }: { items: { id: number; day: string; subs: number; hours: number | null; shorts: number | null }[] }) {
  const { pending, run } = useAction();
  return (
    <table className="tbl">
      <thead><tr><th>Дата</th><th>Подписчики</th><th>Часы</th><th>Shorts 90д</th><th /></tr></thead>
      <tbody>
        {items.map((s) => (
          <tr key={s.id}>
            <td className="text-fog">{s.day}</td><td className="tabular-nums">{s.subs}</td><td className="tabular-nums">{s.hours ?? "—"}</td><td className="tabular-nums">{s.shorts?.toLocaleString("ru") ?? "—"}</td>
            <td className="text-right"><button className="btn btn-ghost btn-sm btn-danger" aria-label="Удалить" disabled={pending} onClick={() => run(() => deleteSnapshotAction(s.id))}><Trash2 size={14} /></button></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
