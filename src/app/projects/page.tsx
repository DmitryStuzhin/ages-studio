import Link from "next/link";
import { PageHeader, Section, ProjectStatus, KindBadge, Empty, fmtDate } from "@/components/ui";
import { listProjects, stepState, currentStepKey } from "@/lib/server/repo";
import { finalScriptText } from "@/lib/server/context";
import { stepDef, stepsFor, type ProjectKind } from "@/lib/pipeline/steps";
import { createProjectAction } from "../actions";
import { structureByKey } from "@/lib/prompts/library";
import { Thumb } from "@/components/video-card";
import { SubmitButton } from "@/components/submit-button";
import { videoIdOf } from "@/lib/market";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ new?: string; role?: string }> }) {
  const sp = await searchParams;
  const projects = await listProjects();
  const rows = await Promise.all(projects.map(async (p) => {
    const st = await stepState(p.id);
    const key = currentStepKey(p.kind as ProjectKind, st, p.params, p.status);
    const steps = stepsFor(p.kind as ProjectKind);
    const done = steps.filter((s) => st[s.key]?.approved || (s.mode === "export" && p.status === "published")).length;
    return { p, step: stepDef(p.kind as ProjectKind, key), done, total: steps.length, hasScript: Boolean(finalScriptText(st)) };
  }));
  const parents = rows.filter((r) => r.p.kind === "long" && r.hasScript);
  const work = rows.filter((r) => !r.p.legacy);
  const legacy = rows.filter((r) => r.p.legacy);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Ролики и шортсы" lead="Каждый проект проходит конвейер шагов. Утверждённый шаг становится входом для следующего." />

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Section title="Новый ролик" className={sp.new === "long" ? "ring-1 ring-lapis" : undefined}>
          <form action={createProjectAction} className="space-y-3">
            <input type="hidden" name="kind" value="long" />
            <div>
              <label className="label" htmlFor="role">Роль, если уже выбрана</label>
              <input id="role" name="role" className="field" placeholder="Например: Victorian Chimney Sweep" autoFocus={sp.new === "long"} defaultValue={sp.role ? sp.role.replace(/\b\w/g, (c) => c.toUpperCase()) : undefined} />
              <p className="mt-1.5 text-xs text-fog">Оставь пустым — шаг 0 предложит 5 ролей по сводке ниши и канала.</p>
            </div>
            <SubmitButton pendingText="Создаю ролик…">Создать ролик</SubmitButton>
          </form>
        </Section>
        <Section title="Новый шортс" className={sp.new === "short" ? "ring-1 ring-lapis" : undefined}>
          {parents.length ? (
            <form action={createProjectAction} className="space-y-3">
              <input type="hidden" name="kind" value="short" />
              <div>
                <label className="label" htmlFor="parentId">Длинный ролик, который рекламирует шортс</label>
                <select id="parentId" name="parentId" className="field">
                  {parents.map((r) => <option key={r.p.id} value={r.p.id}>{r.p.title}</option>)}
                </select>
              </div>
              <SubmitButton pendingText="Создаю шортс…">Создать шортс</SubmitButton>
            </form>
          ) : (
            <p className="text-sm text-fog">Шортс собирается из утверждённого сценария длинного ролика. Сначала доведи ролик до шага 6.</p>
          )}
        </Section>
      </div>

      <Section title="В производстве">
        {work.length === 0 ? <Empty title="Пока пусто">Создай первый ролик выше.</Empty> : (
          <div className="overflow-x-auto">
            <table className="tbl min-w-[720px]">
              <thead><tr><th>Проект</th><th>Тип</th><th>Шаг</th><th>Прогресс</th><th>Статус</th><th>Обновлён</th></tr></thead>
              <tbody>
                {work.map(({ p, step, done, total }) => (
                  <tr key={p.id}>
                    <td><div className="flex items-center gap-3"><Thumb videoId={videoIdOf(p.youtubeUrl)} vertical={p.kind === "short"} />
                      <div className="min-w-0"><Link href={`/projects/${p.id}`} className="text-bone hover:text-lapis">{p.title}</Link>
                      {p.params.structureKey && <div className="text-xs text-fog">{structureByKey(p.params.structureKey)?.name}</div>}</div></div></td>
                    <td><KindBadge kind={p.kind} /></td>
                    <td className="text-mist">{step?.label}. {step?.title}</td>
                    <td><div className="h-1.5 w-28 rounded bg-ink"><div className="h-1.5 rounded bg-lapis" style={{ width: `${(done / total) * 100}%` }} /></div><div className="mt-1 text-xs text-fog">{done} из {total}</div></td>
                    <td><ProjectStatus status={p.status} /></td>
                    <td className="text-fog">{fmtDate(p.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {legacy.length > 0 && (
        <Section title="Вышли до платформы" className="mt-6">
          <p className="mb-3 text-sm text-fog">Хранят метрики и уроки. Из них берутся данные для разборов и правило чередования.</p>
          <ul className="divide-y divide-line/70">
            {legacy.map(({ p }) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <Link href={`/projects/${p.id}`} className="flex min-w-0 items-center gap-3 text-mist hover:text-bone"><Thumb videoId={videoIdOf(p.youtubeUrl)} /><span className="truncate">{p.title}</span></Link>
                <span className="chip">{p.format === "survive24" ? "серия «24 часа»" : "другой формат"}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
