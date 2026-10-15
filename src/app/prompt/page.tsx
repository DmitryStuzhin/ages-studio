import { desc } from "drizzle-orm";
import { PageHeader, Section, fmtDate } from "@/components/ui";
import { getDb, schema } from "@/db/client";
import { activePrompt } from "@/lib/server/repo";
import { LONG_STEPS, SHORT_STEPS } from "@/lib/pipeline/steps";
import { PromptEditor, VersionList, ProposalList } from "./client";

export const dynamic = "force-dynamic";

export default async function PromptPage() {
  const db = await getDb();
  const active = await activePrompt();
  const versions = await db.select().from(schema.promptVersions).orderBy(desc(schema.promptVersions.id));
  const proposals = await db.select().from(schema.promptProposals).orderBy(desc(schema.promptProposals.id));
  const titles: Record<string, string> = {};
  for (const s of LONG_STEPS) titles[s.key] = `Ролик · ${s.label}. ${s.title}`;
  for (const s of SHORT_STEPS) if (!titles[s.key]) titles[s.key] = `Шортс · ${s.title}`;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Мастер-промпт"
        lead={<>Активна версия <span className="text-bone">{active.version}</span> от {fmtDate(active.createdAt)}. Конституция уходит в каждый вызов и кешируется; у каждого шага своя инструкция. Любая правка — новая версия: старые остаются, к ним можно вернуться.</>}
      />
      {proposals.some((p) => p.status === "pending") && (
        <Section title="Правки из разборов" className="mb-6">
          <p className="mb-3 text-sm text-fog">Предложены моделью на шаге «Разбор после публикации». Сами в промпт не попадают — только после твоего решения.</p>
          <ProposalList items={proposals.filter((p) => p.status === "pending").map((p) => ({ id: p.id, text: p.text, project: p.sourceProjectId }))} />
        </Section>
      )}
      <PromptEditor constitution={active.constitution} steps={active.steps} titles={titles} />
      <Section title="История версий" className="mt-6">
        <VersionList items={versions.map((v) => ({ id: v.id, version: v.version, status: v.status, changelog: v.changelog, date: fmtDate(v.createdAt) }))} />
      </Section>
    </div>
  );
}
