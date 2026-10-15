import { lastRuns, quotaToday } from "@/lib/server/sync";
import { getSettings } from "@/lib/server/repo";
import { SyncButton } from "./sync-button";

function ago(d: Date) {
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 1) return "только что";
  if (m < 60) return `${m} мин назад`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ч назад`;
  return `${Math.round(h / 24)} дн назад`;
}

/** Статус синхронизации с YouTube: когда обновлялось, когда следующее, журнал последнего запуска. */
export async function SyncStatus({ compact = false }: { compact?: boolean }) {
  const [runs, settings, units] = await Promise.all([lastRuns(5), getSettings(), quotaToday()]);
  const enabled = Boolean(process.env.YOUTUBE_API_KEY) || runs.length > 0;
  const lastOk = runs.find((r) => r.ok);
  const last = runs[0];
  const next = lastOk ? new Date(new Date(lastOk.startedAt).getTime() + settings.sync.intervalHours * 3600000) : null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[0.88rem]">
          <div className="text-mist">
            {lastOk ? <>Данные YouTube обновлены {ago(new Date(lastOk.startedAt))}</> : enabled ? "Данные YouTube ещё не загружались" : "Ключ YouTube не задан"}
          </div>
          {enabled && (
            <div className="text-[0.8rem] text-fog">
              Автообновление каждые {settings.sync.intervalHours} ч{next && <>, следующее ≈ {next.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</>} · квота сегодня {units} из 10 000
            </div>
          )}
        </div>
        {enabled && <SyncButton />}
      </div>
      {!compact && last && (
        <details className="mt-3 text-[0.82rem]" open={last.ok === false}>
          <summary className="cursor-pointer text-fog hover:text-mist">
            Журнал последнего запуска · {new Date(last.startedAt).toLocaleString("ru-RU")} · {last.ok == null ? "идёт" : last.ok ? "успешно" : "с ошибкой"}
          </summary>
          <ul className="mt-2 space-y-1">
            {last.log.map((l, i) => (
              <li key={i} className={l.level === "error" ? "text-cinnabar" : l.level === "warn" ? "text-ochre" : "text-mist"}>{l.text}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
