import { desc } from "drizzle-orm";
import { PageHeader, Section } from "@/components/ui";
import { getDb, schema } from "@/db/client";
import { LessonList, AddLesson } from "./client";

export const dynamic = "force-dynamic";

export default async function LessonsPage() {
  const db = await getDb();
  const all = await db.select().from(schema.lessons).orderBy(desc(schema.lessons.confirmations), desc(schema.lessons.updatedAt));
  const projects = await db.select({ id: schema.projects.id, title: schema.projects.title }).from(schema.projects);
  const title = (id: number | null) => (id ? projects.find((p) => p.id === id)?.title ?? null : null);
  const map = (l: (typeof all)[number]) => ({ id: l.id, text: l.text, evidence: l.evidence, confirmations: l.confirmations, status: l.status, scope: l.scope, source: title(l.sourceProjectId) });
  const proposed = all.filter((l) => l.status === "proposed").map(map);
  const active = all.filter((l) => l.status === "hypothesis" || l.status === "confirmed").map(map);
  const retired = all.filter((l) => l.status === "retired").map(map);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Уроки канала"
        lead="Выводы из разборов. Активные уроки автоматически подставляются в шаги — не больше 15, сначала подтверждённые. Урок на одном ролике — гипотеза; подтверждённым он становится на втором."
      />
      {proposed.length > 0 && (
        <Section title="Предложены разбором" className="mb-6">
          <p className="mb-3 text-sm text-fog">Пока ты их не примешь, в генерацию они не попадают.</p>
          <LessonList items={proposed} mode="proposed" />
        </Section>
      )}
      <Section title={`Активные · ${active.length}`} className="mb-6">
        <LessonList items={active} mode="active" />
      </Section>
      <Section title="Добавить урок вручную" className="mb-6"><AddLesson /></Section>
      {retired.length > 0 && <Section title="Сняты"><LessonList items={retired} mode="retired" /></Section>}
    </div>
  );
}
