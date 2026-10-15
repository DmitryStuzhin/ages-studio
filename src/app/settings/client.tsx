"use client";
import clsx from "clsx";
import { useState } from "react";
import type { AppSettings } from "@/db/seed";
import { Section } from "@/components/ui";
import { useAction } from "@/components/use-action";
import { disconnectGoogleAction, saveSettingsAction, saveCanonAction, importCanonAction, saveElevenKeyAction, saveVoiceAction } from "@/app/actions";
import type { ElevenState } from "@/lib/server/voice";
import { Play, Square } from "lucide-react";
import type { Canon } from "@/lib/canon";

export function SettingsForm({ initial }: { initial: AppSettings }) {
  const { pending, run } = useAction();
  const [s, setS] = useState<AppSettings>(initial);
  const upd = <K extends keyof AppSettings>(k: K, patch: Partial<AppSettings[K]>) => setS((x) => ({ ...x, [k]: { ...x[k], ...patch } }));

  const charsPerVideo = Math.round(s.defaults.durationMin * s.defaults.wordsPerMinute * 6);
  const creditsPerVideo = Math.round(charsPerVideo * s.elevenlabs.creditsPerChar);
  const videosPerMonth = creditsPerVideo ? s.elevenlabs.monthlyCredits / creditsPerVideo : 0;
  const queries = s.sync.nicheQueries.filter((q) => q.trim()).length + (s.sync.addProjectRoles ? 3 : 0);
  const quota = Math.min(10, queries) * 101 + 8;
  const runs = Math.max(1, Math.floor(24 / Math.max(1, s.sync.intervalHours)));

  return (
    <div className="space-y-6">
      <Section title="По умолчанию для новых роликов">
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label className="label" htmlFor="dur">Длительность, мин</label><input id="dur" type="number" className="field" value={s.defaults.durationMin} onChange={(e) => upd("defaults", { durationMin: Number(e.target.value) })} /></div>
          <div><label className="label" htmlFor="wpm">Темп озвучки, слов/мин</label><input id="wpm" type="number" className="field" value={s.defaults.wordsPerMinute} onChange={(e) => upd("defaults", { wordsPerMinute: Number(e.target.value) })} /></div>
          <div><label className="label" htmlFor="lang">Язык озвучки</label><input id="lang" className="field" value={s.defaults.language} onChange={(e) => upd("defaults", { language: e.target.value })} /></div>
        </div>
      </Section>

      <Section title="Цель монетизации">
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label className="label" htmlFor="gs">Подписчики</label><input id="gs" type="number" className="field" value={s.goal.subscribers} onChange={(e) => upd("goal", { subscribers: Number(e.target.value) })} /></div>
          <div><label className="label" htmlFor="gh">Часы за 12 мес.</label><input id="gh" type="number" className="field" value={s.goal.watchHours} onChange={(e) => upd("goal", { watchHours: Number(e.target.value) })} /></div>
          <div><label className="label" htmlFor="gd">Подать заявку до</label><input id="gd" type="date" className="field" value={s.goal.deadline} onChange={(e) => upd("goal", { deadline: e.target.value })} /></div>
        </div>
        <p className="mt-3 text-sm text-fog">С 1 февраля 2027 порог для новых заявок — 8000 часов. Если к 6 декабря меньше 700 часов, поменяй цель здесь: всё набранное остаётся в зачёте.</p>
      </Section>

      <Section title="Расчёт кредитов ElevenLabs">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label" htmlFor="ec">Кредитов в месяц по тарифу</label><input id="ec" type="number" className="field" value={s.elevenlabs.monthlyCredits} onChange={(e) => upd("elevenlabs", { monthlyCredits: Number(e.target.value) })} /></div>
          <div><label className="label" htmlFor="ep">Кредитов на символ (модель v2 — 1, Flash/Turbo — 0,5)</label><input id="ep" type="number" step={0.1} className="field" value={s.elevenlabs.creditsPerChar} onChange={(e) => upd("elevenlabs", { creditsPerChar: Number(e.target.value) })} /></div>
        </div>
        <p className="mt-3 text-[0.92rem] text-mist">
          Ролик на {s.defaults.durationMin} мин ≈ {charsPerVideo.toLocaleString("ru")} символов ≈ {creditsPerVideo.toLocaleString("ru")} кредитов.
          Тарифа хватит примерно на <span className="font-display text-xl text-bone">{videosPerMonth.toFixed(1)}</span> ролика в месяц без перегенераций; план «3 в неделю» — это около {(creditsPerVideo * 13).toLocaleString("ru")} кредитов.
        </p>
      </Section>

      <Section title="Сводка ниши и расписание">
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label className="label" htmlFor="si">Обновлять каждые, ч</label><input id="si" type="number" min={1} max={168} className="field" value={s.sync.intervalHours} onChange={(e) => upd("sync", { intervalHours: Number(e.target.value) })} /></div>
          <div><label className="label" htmlFor="sr">Роликов на запрос</label><input id="sr" type="number" min={5} max={50} className="field" value={s.sync.resultsPerQuery} onChange={(e) => upd("sync", { resultsPerQuery: Number(e.target.value) })} /></div>
          <div><label className="label" htmlFor="sd">Ролики не старше, дней</label><input id="sd" type="number" min={30} className="field" value={s.sync.publishedWithinDays} onChange={(e) => upd("sync", { publishedWithinDays: Number(e.target.value) })} /></div>
          <div className="sm:col-span-3">
            <label className="label" htmlFor="sq">Поисковые запросы — по одному на строку</label>
            <textarea id="sq" className="field min-h-32 font-mono text-[0.84rem]" value={s.sync.nicheQueries.join("\n")} onChange={(e) => upd("sync", { nicheQueries: e.target.value.split("\n") })} />
          </div>
          <label className="flex gap-2 text-sm text-mist sm:col-span-3">
            <input type="checkbox" className="mt-1 accent-[var(--color-lapis)]" checked={s.google.testingMode} onChange={(e) => upd("google", { testingMode: e.target.checked })} />
            OAuth-приложение в режиме Testing — предупреждать за 48 часов до истечения входа (7 дней)
          </label>
          <label className="flex gap-2 text-sm text-mist sm:col-span-3">
            <input type="checkbox" className="mt-1 accent-[var(--color-lapis)]" checked={s.sync.addProjectRoles} onChange={(e) => upd("sync", { addProjectRoles: e.target.checked })} />
            Добавлять запрос по роли каждого ролика в работе (до трёх)
          </label>
        </div>
        <p className="mt-3 text-[0.92rem] text-mist">
          Один запуск ≈ {quota.toLocaleString("ru")} единиц квоты, в сутки ≈ <span className="font-display text-xl text-bone">{(quota * runs).toLocaleString("ru")}</span> из 10 000.
          {quota * runs > 9000 && <span className="text-cinnabar"> Это близко к лимиту — сократи запросы или реже обновляй.</span>}
        </p>
      </Section>

      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={pending} onClick={() => run(() => saveSettingsAction({ ...s, sync: { ...s.sync, nicheQueries: s.sync.nicheQueries.map((q) => q.trim()).filter(Boolean) } }))}>Сохранить настройки</button>
        <button className="btn btn-ghost" onClick={() => setS(initial)}>Сбросить</button>
      </div>
    </div>
  );
}

export function GoogleConnect({ configured, channel, since, state, hoursLeft }: { configured: boolean; channel: string | null; since: string | null; state: "none" | "ok" | "expiring" | "expired"; hoursLeft: number | null }) {
  const { pending, run } = useAction();
  if (!configured) {
    return (
      <p className="text-sm text-fog">
        Для удержания, источников трафика и часов просмотра впиши <span className="font-mono">GOOGLE_CLIENT_ID</span> и <span className="font-mono">GOOGLE_CLIENT_SECRET</span> в <span className="font-mono">.env.local</span> и перезапусти платформу. Тогда здесь появится кнопка входа.
      </p>
    );
  }
  if (channel && state === "expired") {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-[0.92rem]"><span className="text-cinnabar">Доступ истёк</span> <span className="text-mist">· {channel}</span></div>
        <a href="/api/auth/google/start" className="btn btn-primary btn-sm">Войти снова</a>
      </div>
    );
  }
  if (channel) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-[0.92rem]">
          <span className="text-malachite">YouTube Analytics подключён</span> <span className="text-mist">· {channel}</span>
          {since && <span className="text-fog"> · вход {new Date(since).toLocaleDateString("ru-RU")}</span>}
          {hoursLeft != null && <span className={state === "expiring" ? "text-ochre" : "text-fog"}> · истечёт через {hoursLeft >= 48 ? `${Math.round(hoursLeft / 24)} дн` : `${hoursLeft} ч`}</span>}
        </div>
        <a href="/api/auth/google/start" className="btn btn-sm">Обновить вход</a>
        <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => run(() => disconnectGoogleAction())}>Отключить</button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <a href="/api/auth/google/start" className="btn btn-primary">Войти через Google</a>
      <span className="text-sm text-fog">Входи в аккаунт, которому принадлежит канал. Предупреждение «приложение не проверено» — нормально: «Дополнительно» → «Перейти».</span>
    </div>
  );
}

const CANON_FIELDS: { key: keyof Canon; label: string; hint: string; rows: number; mono?: boolean }[] = [
  { key: "styleLine", label: "Строка стиля", hint: "Дописывается дословно в конец каждого промпта картинки. Уже содержит 16:9 и запрет текста.", rows: 3, mono: true },
  { key: "styleLineVertical", label: "Строка стиля шортсов (9:16)", hint: "То же для вертикальных кадров.", rows: 3, mono: true },
  { key: "animTemplate", label: "Шаблон анимации Veo", hint: "<MOTION> заменяется конкретным движением кадра.", rows: 3, mono: true },
  { key: "characterRule", label: "Правило персонажей", hint: "Как описания из шага 5 вписываются в промпт.", rows: 3 },
  { key: "voiceRules", label: "Озвучка Eleven v3", hint: "Теги, пунктуация, числа словами.", rows: 5 },
  { key: "notesSyntax", label: "Метки монтажа", hint: "Их читает tools/montage.py конвейера.", rows: 8, mono: true },
];

export function CanonForm({ initial }: { initial: Canon }) {
  const { pending, run } = useAction();
  const [c, setC] = useState<Canon>(initial);
  const dirty = JSON.stringify(c) !== JSON.stringify(initial);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={pending} onClick={() => run(() => importCanonAction())}>Подтянуть из конвейера</button>
        <span className="text-sm text-fog">
          {initial.source.importedFrom ? <>Последний импорт: {initial.source.importedFrom}{initial.source.importedAt && `, ${new Date(initial.source.importedAt).toLocaleString("ru-RU")}`}</> : "Значения по умолчанию взяты из style.md и CLAUDE.md конвейера."}
        </span>
      </div>
      <div>
        <label className="label" htmlFor="c-dir">Папка конвейера на Mac</label>
        <input id="c-dir" className="field font-mono text-[0.84rem]" value={c.pipelineDir} onChange={(e) => setC({ ...c, pipelineDir: e.target.value })} />
      </div>
      {CANON_FIELDS.map((f) => (
        <div key={f.key}>
          <label className="label" htmlFor={`c-${f.key}`}>{f.label} <span className="text-fog/80">— {f.hint}</span></label>
          <textarea id={`c-${f.key}`} rows={f.rows} className={clsx("field", f.mono && "font-mono text-[0.82rem]")} value={String(c[f.key] ?? "")}
            onChange={(e) => setC({ ...c, [f.key]: e.target.value })} />
        </div>
      ))}
      <div className="flex gap-2">
        <button className="btn btn-approve" disabled={!dirty || pending} onClick={() => run(() => saveCanonAction(c))}>Сохранить канон</button>
        {dirty && <button className="btn btn-ghost" onClick={() => setC(initial)}>Сбросить</button>}
      </div>
    </div>
  );
}

const MODELS = [
  { id: "eleven_v3", name: "Eleven v3 — понимает теги [whispers], [tense], паузы (нужна для твоего сценария)" },
  { id: "eleven_multilingual_v2", name: "Multilingual v2 — без тегов: прочитает их вслух" },
];

export function ElevenConnect({ state, voiceId, model }: { state: ElevenState; voiceId: string; model: string }) {
  const { pending, run } = useAction();
  const [key, setKey] = useState("");
  const [vid, setVid] = useState(voiceId);
  const [mdl, setMdl] = useState(model || "eleven_v3");
  const [playing, setPlaying] = useState<HTMLAudioElement | null>(null);
  const voice = state.voices.find((v) => v.id === vid);
  const left = state.sub ? Math.max(0, state.sub.limit - state.sub.used) : null;

  const preview = (url: string | null) => {
    playing?.pause();
    if (!url || playing) { setPlaying(null); return; }
    const a = new Audio(url);
    a.onended = () => setPlaying(null);
    a.play().catch(() => setPlaying(null));
    setPlaying(a);
  };

  return (
    <div className="space-y-5">
      <div>
        <div className={state.keyWhere && !state.error ? "text-sm text-malachite" : state.error ? "text-sm text-cinnabar" : "text-sm text-fog"}>
          {state.error ? state.error : state.keyWhere ? `Ключ работает${state.sub ? ` · тариф ${state.sub.tier}` : ""}` : "Ключ не задан — озвучка в ручном режиме"}
        </div>
        {state.sub && (
          <div className="mt-2 max-w-md">
            <div className="mb-1 flex justify-between text-[0.85rem]"><span className="text-mist">Осталось кредитов</span><span className="tabular-nums text-bone">{left!.toLocaleString("ru")} / {state.sub.limit.toLocaleString("ru")}</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-ink"><div className="bar-grow h-full rounded-full bg-lapis" style={{ width: `${state.sub.limit ? Math.round((left! / state.sub.limit) * 100) : 0}%` }} /></div>
            {state.sub.resetAt && <div className="mt-1 text-[0.8rem] text-fog">Обновятся {new Date(state.sub.resetAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</div>}
          </div>
        )}
        <p className="mt-2 text-[0.82rem] text-fog">Ключ хранится в <span className="font-mono">{state.pipelineEnv.replace(/^\/Users\/[^/]+/, "~")}</span> — его же берут check_voice.py и voice.py конвейера.</p>
        <div className="mt-3 flex max-w-xl flex-wrap gap-2">
          <input className="field min-w-0 flex-1 font-mono text-[0.85rem]" type="password" autoComplete="off" placeholder={state.keyWhere ? "Новый ключ sk_… (чтобы заменить)" : "Ключ sk_…"} value={key} onChange={(e) => setKey(e.target.value)} aria-label="Ключ ElevenLabs" />
          <button className="btn" disabled={pending || !key.trim()} onClick={() => run(() => saveElevenKeyAction(key), () => setKey(""))}>Проверить и сохранить</button>
        </div>
      </div>

      {state.voices.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="voice">Голос</label>
            <div className="flex gap-2">
              <select id="voice" className="field min-w-0 flex-1" value={vid} onChange={(e) => { setVid(e.target.value); playing?.pause(); setPlaying(null); }}>
                <option value="">— выбери голос —</option>
                {state.voices.map((v) => <option key={v.id} value={v.id}>{v.name}{v.category && v.category !== "premade" ? " · мой" : ""}{v.labels ? ` — ${v.labels}` : ""}</option>)}
              </select>
              <button className="btn btn-ghost" disabled={!voice?.preview} onClick={() => preview(voice?.preview ?? null)} aria-label={playing ? "Остановить пример" : "Послушать пример"}>
                {playing ? <Square size={15} /> : <Play size={15} />}
              </button>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="model">Модель</label>
            <select id="model" className="field" value={mdl} onChange={(e) => setMdl(e.target.value)}>
              {MODELS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <button className="btn btn-primary" disabled={pending || !vid || (vid === voiceId && mdl === model)} onClick={() => run(() => saveVoiceAction(vid, voice?.name ?? vid, mdl))}>Сохранить голос и модель</button>
          </div>
        </div>
      )}
    </div>
  );
}
