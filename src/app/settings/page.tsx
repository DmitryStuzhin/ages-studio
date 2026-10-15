import { PageHeader, Section } from "@/components/ui";
import { getSettings } from "@/lib/server/repo";
import { integrations } from "@/lib/integrations/status";
import { MODEL_PRICES, LONG_STEPS } from "@/lib/pipeline/steps";
import { SettingsForm, GoogleConnect } from "./client";
import { oauthConfigured } from "@/lib/integrations/youtube";
import { googleAuthState } from "@/lib/server/sync";
import { SyncStatus } from "@/components/sync-status";

export const dynamic = "force-dynamic";

const GOOGLE_MSG: Record<string, string> = {
  connected: "Вход выполнен — первая загрузка данных уже запущена.",
  denied: "Вход отменён на экране Google.",
  bad_state: "Сессия входа устарела. Нажми «Войти через Google» ещё раз.",
  no_refresh: "Google не выдал постоянный доступ. Удали доступ Ages Studio на myaccount.google.com/permissions и войди снова.",
  error: "Не удалось завершить вход — подробности в консоли сервера.",
  not_configured: "Сначала впиши GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET в .env.local и перезапусти платформу.",
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  const sp = await searchParams;
  const settings = await getSettings();
  const apis = await integrations();
  const gst = await googleAuthState();
  const google = gst.auth;
  const tiers = (["opus", "sonnet", "haiku"] as const).map((t) => ({ t, ...MODEL_PRICES[t], steps: LONG_STEPS.filter((s) => s.tier === t && (s.mode === "llm" || s.mode === "review")).map((s) => s.title) }));
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Настройки" lead="Значения по умолчанию для новых роликов, цель монетизации и интеграции." />

      <Section title="Интеграции" className="mb-6">
        <p className="mb-4 text-sm text-fog">Ключи задаются в файле <span className="font-mono">.env.local</span> и подхватываются после перезапуска. Без них всё работает в ручном режиме.</p>
        <ul className="divide-y divide-line/70">
          {apis.map((a) => (
            <li key={a.key} className="grid gap-2 py-3.5 md:grid-cols-[200px_1fr]">
              <div>
                <div className="text-bone">{a.name}</div>
                <div className={a.connected ? "text-sm text-malachite" : "text-sm text-fog"}>{a.state}</div>
              </div>
              <div className="text-[0.88rem]">
                <p className="text-mist">{a.replaces}</p>
                <p className="mt-1 text-fog">Сейчас: {a.manual}</p>
                <p className="mt-1 font-mono text-[0.78rem] text-fog">{a.env.join(" · ")}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="YouTube" className="mb-6">
        {sp.google && GOOGLE_MSG[sp.google] && (
          <p className={sp.google === "connected" ? "mb-4 text-sm text-malachite" : "mb-4 text-sm text-ochre"}>{GOOGLE_MSG[sp.google]}</p>
        )}
        <GoogleConnect configured={oauthConfigured()} channel={google ? google.channelTitle ?? "канал без названия" : null} since={google?.connectedAt ?? null} state={gst.kind} hoursLeft={gst.hoursLeft} />
        <div className="mt-5 border-t border-line pt-5"><SyncStatus /></div>
      </Section>

      <Section title="Модели и стоимость" className="mb-6">
        <div className="overflow-x-auto">
          <table className="tbl min-w-[640px]">
            <thead><tr><th>Модель</th><th>Вход / выход за 1M</th><th>Чтение кеша</th><th>Шаги</th></tr></thead>
            <tbody>
              {tiers.map((x) => (
                <tr key={x.t}><td className="text-bone">{x.name}</td><td className="tabular-nums">${x.input} / ${x.output}</td><td className="tabular-nums">${x.cacheRead}</td><td className="text-mist">{x.steps.join(", ")}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-fog">Сценарий и разбор — на Opus: это и есть оригинальность для модерации. Раскадровка и промпты — Sonnet. Цены — platform.claude.com, октябрь 2026; оценка стоимости каждого шага видна прямо в шаге.</p>
      </Section>

      <SettingsForm initial={settings} />
    </div>
  );
}
