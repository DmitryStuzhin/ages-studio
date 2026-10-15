import Link from "next/link";
import { Plus, Film } from "lucide-react";
import { PageHeader, Section, HourRuler, ProjectStatus, KindBadge, Empty, fmtDate } from "@/components/ui";
import { getSettings, listProjects, snapshots, stepState, currentStepKey, recentDramaturgy, activePrompt } from "@/lib/server/repo";
import { stepDef, type ProjectKind } from "@/lib/pipeline/steps";
import { STRUCTURES, HOOK_TYPES } from "@/lib/prompts/library";
import { integrations } from "@/lib/integrations/status";
import { SyncStatus } from "@/components/sync-status";
import { getDb, schema } from "@/db/client";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

function daysBetween(a: Date, b: Date) {
  return Math.ceil((b.getTime() - a.getTime()) / 86400000);
}

export default async function Dashboard() {
  const [settings, projects, snaps, rec, prompt] = await Promise.all([getSettings(), listProjects(), snapshots(), recentDramaturgy(), activePrompt()]);
  const db = await getDb();
  const proposedLessons = await db.select().from(schema.lessons).where(eq(schema.lessons.status, "proposed"));
  const proposals = await db.select().from(schema.promptProposals).where(eq(schema.promptProposals.status, "pending"));
  const snap = snaps.at(-1);
  const goal = settings.goal;
  const today = new Date();
  const deadline = new Date(goal.deadline);
  const daysLeft = daysBetween(today, deadline);
  const active = projects.filter((p) => !p.legacy && (p.status === "in_progress" || p.status === "draft" || p.status === "ready"));
  const activeWithStep = await Promise.all(active.slice(0, 8).map(async (p) => {
    const st = await stepState(p.id);
    const key = currentStepKey(p.kind as ProjectKind, st, p.params, p.status);
    return { p, step: stepDef(p.kind as ProjectKind, key) };
  }));
  const freeStructures = STRUCTURES.filter((s) => !rec.structures.includes(s.key));
  const freeHooks = HOOK_TYPES.filter((h) => !rec.hookTypes.includes(h.key));
  const apis = await integrations();

  const nextCheckpoint = goal.checkpoints.find((c) => new Date(c.date) >= today);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Пульт" lead={`${settings.channel.name} · мастер-промпт ${prompt.version}`}>
        <Link href="/projects?new=long" className="btn btn-primary"><Plus size={16} />Новый ролик</Link>
        <Link href="/projects?new=short" className="btn"><Film size={16} />Новый шортс</Link>
      </PageHeader>

      <section className="panel mb-6 overflow-hidden">
        <div className="grid gap-6 p-6 md:grid-cols-[240px_1fr]">
          <div>
            <div className="text-sm text-fog">До подачи заявки в YPP</div>
            <div className="font-display text-[3.6rem] leading-none text-bone">{daysLeft > 0 ? daysLeft : 0}</div>
            <div className="text-sm text-mist">{daysLeft === 1 ? "день" : daysLeft < 5 ? "дня" : "дней"} · до {fmtDate(deadline)}</div>
            <p className="mt-4 text-[0.82rem] leading-relaxed text-fog">{goal.note}</p>
          </div>
          <div className="space-y-6">
            <div>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-mist">Подписчики</span>
                <span className="font-display text-2xl">{snap?.subscribers ?? "—"} <span className="text-base text-fog">/ {goal.subscribers}</span></span>
              </div>
              <HourRuler value={snap?.subscribers ?? 0} max={goal.subscribers} marks={goal.checkpoints.map((c) => ({ at: c.subscribers, label: fmtDate(c.date).replace(/ \d{4}.*/, "") }))} />
            </div>
            <div>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-mist">Часы просмотра за 12 мес.</span>
                <span className="font-display text-2xl">{snap?.watchHours12m ?? "—"} <span className="text-base text-fog">/ {goal.watchHours}</span></span>
              </div>
              <HourRuler value={snap?.watchHours12m ?? 0} max={goal.watchHours} marks={goal.checkpoints.map((c) => ({ at: c.watchHours, label: fmtDate(c.date).replace(/ \d{4}.*/, "") }))} />
            </div>
            <div className="text-[0.85rem] text-fog">
              {snap ? <>Последний снимок канала — {fmtDate(snap.day)} </> : <>Снимков канала ещё нет — внеси цифры из YouTube Studio в <Link className="text-lapis underline-offset-2 hover:underline" href="/analytics">Аналитике</Link>. </>}
              {nextCheckpoint && <>· Ближайшая точка — {fmtDate(nextCheckpoint.date)}: {nextCheckpoint.watchHours} ч и {nextCheckpoint.subscribers} подписчиков. {nextCheckpoint.fallback}</>}
            </div>
          </div>
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Section title="В работе" aside={<Link href="/projects" className="text-sm text-lapis hover:underline">все</Link>}>
          {activeWithStep.length === 0 ? (
            <Empty title="Нет роликов в работе">Начни новый ролик: платформа сама подставит уроки, сводку ниши и свободную структуру.</Empty>
          ) : (
            <ul className="divide-y divide-line/70">
              {activeWithStep.map(({ p, step }) => (
                <li key={p.id}>
                  <Link href={`/projects/${p.id}`} className="-mx-2 flex items-center gap-3 rounded-md px-2 py-3 hover:bg-ink-3/60">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-bone">{p.title}</div>
                      <div className="mt-0.5 text-[0.82rem] text-fog">Шаг {step?.label}: {step?.title}</div>
                    </div>
                    <KindBadge kind={p.kind} />
                    <ProjectStatus status={p.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <div className="space-y-6">
          <Section title="Свободно для следующего ролика">
            <p className="mb-3 text-[0.85rem] text-fog">Последние ролики: {rec.projects.map((x) => x.title.replace("Why You Wouldn't Survive 24 Hours as ", "")).join(", ") || "—"}.</p>
            <div className="mb-2 text-sm text-mist">Структуры</div>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {STRUCTURES.map((s) => (
                <span key={s.key} className={freeStructures.includes(s) ? "chip border-malachite/50 text-bone" : "chip text-fog line-through decoration-fog/60"}>{s.name}</span>
              ))}
            </div>
            <div className="mb-2 text-sm text-mist">Типы хука</div>
            <div className="flex flex-wrap gap-1.5">
              {HOOK_TYPES.map((h) => (
                <span key={h.key} className={freeHooks.includes(h) ? "chip border-malachite/50 text-bone" : "chip text-fog line-through decoration-fog/60"}>{h.name}</span>
              ))}
            </div>
          </Section>

          <Section title="Ждёт твоего решения">
            <ul className="space-y-2 text-[0.92rem]">
              <li className="flex justify-between"><Link href="/lessons" className="text-mist hover:text-bone">Предложенные уроки из разборов</Link><span className={proposedLessons.length ? "text-ochre" : "text-fog"}>{proposedLessons.length}</span></li>
              <li className="flex justify-between"><Link href="/prompt" className="text-mist hover:text-bone">Правки мастер-промпта</Link><span className={proposals.length ? "text-ochre" : "text-fog"}>{proposals.length}</span></li>
            </ul>
          </Section>

          <Section title="Интеграции">
            <ul className="space-y-1.5 text-[0.9rem]">
              {apis.map((a) => (
                <li key={a.key} className="flex items-center justify-between">
                  <span className="text-mist">{a.name}</span>
                  <span className={a.connected ? "text-malachite" : "text-fog"}>{a.state}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 border-t border-line pt-4"><SyncStatus compact /></div>
            <Link href="/settings" className="mt-3 inline-block text-sm text-lapis hover:underline">Что даёт подключение</Link>
          </Section>
        </div>
      </div>
    </div>
  );
}
