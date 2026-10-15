import { PageHeader, Section } from "@/components/ui";
import { STRUCTURES, HOOK_TYPES, ROTATION_WINDOW } from "@/lib/prompts/library";
import { listProjects, recentDramaturgy } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const [projects, rec] = await Promise.all([listProjects(), recentDramaturgy()]);
  const used = (key: string, field: "structureKey" | "hookTypeKey") => projects.filter((p) => p.params[field] === key).length;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Драматургия"
        lead={`Каркас серии один — формула названия, часы суток, голос, стиль, счётчик угроз и мостик. Ход событий каждый раз свой: структура и тип хука не повторяются чаще, чем раз в ${ROTATION_WINDOW} ролика. Так канал читается как сериал, а не как шаблон.`}
      />
      <h2 className="mb-3 text-[1.5rem]">Структуры</h2>
      <div className="mb-10 grid gap-4 md:grid-cols-2">
        {STRUCTURES.map((s) => {
          const recent = rec.structures.includes(s.key);
          return (
            <Section key={s.key} title={s.name} aside={<span className={recent ? "chip border-ochre/60 text-ochre" : "chip border-malachite/50 text-malachite"}>{recent ? "была недавно" : "свободна"}</span>}>
              <p className="text-[0.92rem] text-mist">{s.idea}</p>
              <p className="mt-2 text-[0.82rem] text-fog">Подходит: {s.fits}</p>
              <ol className="mt-3 space-y-1 border-l border-line pl-3 text-[0.84rem]">
                {s.beats.map((b) => <li key={b.at} className="flex gap-3"><span className="w-16 shrink-0 tabular-nums text-ochre">{b.at}</span><span className="text-mist">{b.what}</span></li>)}
              </ol>
              <dl className="mt-3 grid gap-1 text-[0.82rem]">
                <div><dt className="inline text-fog">Контракт: </dt><dd className="inline text-mist">{s.contract}</dd></div>
                <div><dt className="inline text-fog">Вердикт: </dt><dd className="inline text-mist">{s.verdict}</dd></div>
                <div><dt className="inline text-fog">Кодовые пороги: </dt><dd className="inline text-mist">⚡ {s.gates.rehook.map((x) => Math.round(x * 100)).join("–")}% · 🔑 ≥{Math.round(s.gates.answerMin * 100)}% · угроз {s.gates.threats.join("–")}{s.gates.falseThreatBreakMax != null ? ` · ✖ ≤${Math.round(s.gates.falseThreatBreakMax * 100)}%` : ""}</dd></div>
                <div><dt className="inline text-fog">Использована: </dt><dd className="inline text-mist">{used(s.key, "structureKey")} раз</dd></div>
              </dl>
            </Section>
          );
        })}
      </div>
      <h2 className="mb-3 text-[1.5rem]">Типы хука</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {HOOK_TYPES.map((h) => {
          const recent = rec.hookTypes.includes(h.key);
          return (
            <Section key={h.key} title={h.name} aside={<span className={recent ? "chip border-ochre/60 text-ochre" : "chip border-malachite/50 text-malachite"}>{recent ? "был недавно" : "свободен"}</span>}>
              <p className="text-[0.9rem] text-mist">{h.how}</p>
              <p className="page mt-3 px-3 py-2 not-italic">{h.example}</p>
              <p className="mt-2 text-[0.82rem] text-fog">Механика, не текст: модель пишет свой хук под роль. Избегать: {h.avoid}</p>
            </Section>
          );
        })}
      </div>
    </div>
  );
}
