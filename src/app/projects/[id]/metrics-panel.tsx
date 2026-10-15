"use client";
import { useRef } from "react";
import { Trash2 } from "lucide-react";
import { useAction } from "@/components/use-action";
import { addMetricsAction, deleteMetricsAction } from "@/app/actions";
import { fmtTime } from "@/lib/pipeline/parse";
import { RetentionChart } from "@/components/retention-chart";

type M = {
  id: number; day: number; views: number | null; browseViews: number | null; ctr: number | null; avgViewPct: number | null;
  avgViewSec: number | null; subsGained: number | null; watchHours: number | null; engagedPct: number | null;
  retention: { t: number; pct: number }[]; notes: string;
};

export function MetricsPanel({ projectId, metrics, kind, analytics = false }: { projectId: number; metrics: M[]; kind: "long" | "short"; analytics?: boolean }) {
  const { pending, run } = useAction();
  const form = useRef<HTMLFormElement>(null);
  const withCurve = metrics.filter((m) => m.retention.length > 1).at(-1);

  return (
    <section className="panel p-5">
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-[1.3rem]">Метрики</h3>
        <span className="text-xs text-fog">{analytics ? "Снимки 2/7/28 дня приходят из YouTube Analytics; CTR — из Studio вручную" : "YouTube Analytics не подключён — вносятся из YouTube Studio"}</span>
      </div>
      <p className="mb-4 text-sm text-fog">Снимки на 2, 7 и 28 день. Выводы об удержании делаются только при 100+ просмотрах из главной и рекомендаций — зрители из шортсов и со страницы канала не в счёт.</p>

      {metrics.length > 0 && (
        <div className="mb-5 grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="overflow-x-auto">
            <table className="tbl min-w-[520px]">
              <thead><tr><th>День</th><th>Просмотры</th><th>Из главной</th><th>CTR</th><th>Ср. просмотр</th><th>Подписки</th><th /></tr></thead>
              <tbody>
                {metrics.map((m) => (
                  <tr key={m.id}>
                    <td className="tabular-nums">{m.day}</td>
                    <td className="tabular-nums">{m.views ?? "—"}</td>
                    <td className={m.browseViews != null && m.browseViews >= 100 ? "tabular-nums text-malachite" : "tabular-nums text-fog"}>{m.browseViews ?? "—"}</td>
                    <td className="tabular-nums">{m.ctr != null ? `${m.ctr}%` : "—"}</td>
                    <td className="tabular-nums">{m.avgViewPct != null ? `${m.avgViewPct}%` : "—"}{m.avgViewSec != null && <span className="text-fog"> · {fmtTime(m.avgViewSec)}</span>}</td>
                    <td className="tabular-nums">{m.subsGained != null ? `+${m.subsGained}` : "—"}</td>
                    <td className="text-right"><button className="btn btn-ghost btn-sm btn-danger" aria-label="Удалить снимок" disabled={pending} onClick={() => run(() => deleteMetricsAction(m.id))}><Trash2 size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {metrics.filter((m) => m.notes).map((m) => <p key={m.id} className="mt-2 text-[0.82rem] text-fog">День {m.day}: {m.notes}</p>)}
          </div>
          {withCurve && <RetentionChart points={withCurve.retention} />}
        </div>
      )}

      <form
        ref={form}
        className="grid gap-3 sm:grid-cols-4"
        action={(fd) => run(() => addMetricsAction(projectId, fd), () => form.current?.reset())}
      >
        <Field name="day" label="День снимка" placeholder="7" required />
        <Field name="views" label="Просмотры" />
        <Field name="browseViews" label="Из главной и рекомендаций" />
        <Field name="ctr" label="CTR показов, %" />
        <Field name="avgViewPct" label="Ср. % просмотра" />
        <Field name="avgViewSec" label="Ср. просмотр, сек" />
        <Field name="subsGained" label="Подписки" />
        {kind === "short" ? <Field name="engagedPct" label="Продолжили смотреть, %" /> : <Field name="watchHours" label="Часы просмотра" />}
        <div className="sm:col-span-4">
          <label className="label" htmlFor="retention">Кривая удержания: «м:сс процент» через запятую</label>
          <input id="retention" name="retention" className="field font-mono text-[0.84rem]" placeholder="0:10 60, 0:25 33, 0:50 28, 7:35 24" />
        </div>
        <div className="sm:col-span-3">
          <label className="label" htmlFor="mnotes">Заметки</label>
          <input id="mnotes" name="notes" className="field" placeholder="Например: 40% трафика со страницы канала" />
        </div>
        <div className="flex items-end"><button className="btn btn-primary w-full justify-center" disabled={pending}>Добавить снимок</button></div>
      </form>
    </section>
  );
}

function Field({ name, label, placeholder, required }: { name: string; label: string; placeholder?: string; required?: boolean }) {
  return (
    <div>
      <label className="label" htmlFor={`m-${name}`}>{label}</label>
      <input id={`m-${name}`} name={name} className="field tabular-nums" inputMode="decimal" placeholder={placeholder} required={required} />
    </div>
  );
}
