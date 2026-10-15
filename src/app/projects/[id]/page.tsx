import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { Check, CircleDot, Circle, PencilLine } from "lucide-react";
import { ProjectStatus, KindBadge, Section, fmtDate } from "@/components/ui";
import { getProject, stepState, currentStepKey, listProjects, recentDramaturgy, metricsFor, getSettings } from "@/lib/server/repo";
import { buildPrompt, finalScriptText } from "@/lib/server/context";
import { costEstimate, packageData } from "@/lib/server/service";
import { stepsFor, type ProjectKind } from "@/lib/pipeline/steps";
import { parseAngle } from "@/lib/pipeline/parse";
import { structureByKey, hookByKey, STRUCTURES, HOOK_TYPES } from "@/lib/prompts/library";
import { anthropicConfigured } from "@/lib/integrations/anthropic";
import { LlmStep } from "./llm-step";
import { ParamsForm } from "./params-form";
import { ExportStep } from "./export-step";
import { MetricsPanel } from "./metrics-panel";
import { ProjectMenu } from "./project-menu";
import { getGoogleAuth } from "@/lib/server/sync";
import { Thumb } from "@/components/video-card";
import { videoIdOf } from "@/lib/market";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ step?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const project = await getProject(Number(id));
  if (!project) notFound();
  const kind = project.kind as ProjectKind;
  const metrics = await metricsFor(project.id);
  const analytics = Boolean(await getGoogleAuth());

  if (project.legacy) {
    return (
      <div className="mx-auto max-w-5xl">
        <Link href="/projects" className="text-sm text-fog hover:text-mist">← Ролики</Link>
        <div className="mt-2 flex items-center gap-4">
          {videoIdOf(project.youtubeUrl) && <a href={project.youtubeUrl!} target="_blank" rel="noreferrer"><Thumb videoId={videoIdOf(project.youtubeUrl)} /></a>}
          <h1 className="text-[1.75rem] leading-tight">{project.title}</h1>
        </div>
        <p className="mt-1 text-mist">Ролик вышел до платформы: здесь хранятся его метрики. Они попадают в сводку канала и разборы.</p>
        <div className="mt-6"><MetricsPanel projectId={project.id} metrics={metrics} kind={kind} analytics={analytics} /></div>
      </div>
    );
  }

  const steps = stepsFor(kind);
  const state = await stepState(project.id);
  const current = currentStepKey(kind, state, project.params, project.status);
  const activeKey = steps.some((s) => s.key === sp.step) ? sp.step! : current;
  const def = steps.find((s) => s.key === activeKey)!;
  const settings = await getSettings();
  const structure = structureByKey(project.params.structureKey);
  const hook = hookByKey(project.params.hookTypeKey);
  const parent = project.params.parentId ? await getProject(project.params.parentId) : null;

  const run = state[activeKey]?.latest ?? null;
  const approvedRun = state[activeKey]?.approved ?? null;
  const prev = steps[steps.findIndex((s) => s.key === activeKey) - 1];
  const prevReady = !prev || Boolean(state[prev.key]?.approved) || (prev.mode === "export" && project.status === "published");

  let body: React.ReactNode = null;
  if (def.mode === "form") {
    const rec = await recentDramaturgy(project.id);
    const all = await listProjects();
    const parents = [];
    for (const p of all.filter((x) => x.kind === "long" && !x.legacy)) {
      if (finalScriptText(await stepState(p.id))) parents.push({ id: p.id, title: p.title });
    }
    body = (
      <ParamsForm
        projectId={project.id}
        kind={kind}
        params={project.params}
        defaults={settings.defaults}
        structures={STRUCTURES.map((s) => ({ key: s.key, name: s.name, idea: s.idea, fits: s.fits, recent: rec.structures.includes(s.key) }))}
        hooks={HOOK_TYPES.map((h) => ({ key: h.key, name: h.name, how: h.how, recent: rec.hookTypes.includes(h.key) }))}
        recent={rec.projects}
        parents={parents}
        approved={Boolean(approvedRun)}
      />
    );
  } else if (def.mode === "export") {
    const pd = await packageData(project.id, null);
    body = (
      <ExportStep
        projectId={project.id}
        ready={pd.ready}
        scenes={pd.manifest.scenes.length}
        duration={pd.manifest.durationSec}
        animated={pd.manifest.scenes.filter((s) => s.animation).length}
        hasVoiceText={Boolean(pd.voiceText)}
        hasPackaging={Boolean(pd.packaging)}
        status={project.status}
        youtubeUrl={project.youtubeUrl}
        aspect={pd.manifest.format.aspectRatio}
      />
    );
  } else {
    const prompt = await buildPrompt(project.id, activeKey);
    const cost = await costEstimate(project.id, activeKey);
    const hooks = activeKey === "angle" && run ? parseAngle(run.output).hooks : [];
    body = (
      <>
        {def.mode === "review" && (
          <div className="mb-6"><MetricsPanel projectId={project.id} metrics={metrics} kind={kind} analytics={analytics} /></div>
        )}
        <LlmStep
          key={`${activeKey}-${run?.id ?? 0}`}
          projectId={project.id}
          step={{ key: def.key, title: def.title, tier: def.tier, authorAction: def.authorAction ?? null, hasGates: Boolean(def.gates) }}
          prompt={prompt.full}
          promptVersion={prompt.version}
          run={run ? { id: run.id, output: run.output, gates: run.gates, approved: run.approved, source: run.source, attempt: run.attempt, model: run.model } : null}
          approvedId={approvedRun?.id ?? null}
          attempts={state[activeKey]?.attempts ?? 0}
          apiConnected={anthropicConfigured()}
          cost={cost}
          hooks={hooks}
          chosenHook={project.params.chosenHook ?? null}
          prevReady={prevReady}
          prevTitle={prev?.mode === "export" ? "ролик не отмечен опубликованным" : prev?.title ?? null}
          reviewNeedsData={def.mode === "review" && !metrics.some((m) => (m.browseViews ?? 0) >= 100)}
        />
      </>
    );
  }

  return (
    <div className="mx-auto max-w-[1280px]">
      <div className="mb-6">
        <Link href="/projects" className="text-sm text-fog hover:text-mist">← Ролики и шортсы</Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[1.75rem] leading-[1.2] text-bone">{project.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <KindBadge kind={project.kind} />
              <ProjectStatus status={project.status} />
              {structure && <span className="chip" title={structure.idea}>{structure.name}</span>}
              {hook && <span className="chip" title={hook.how}>хук: {hook.name}</span>}
              {parent && <Link href={`/projects/${parent.id}`} className="chip hover:text-bone">к ролику: {parent.title.replace("Why You Wouldn't Survive 24 Hours as ", "")}</Link>}
              {project.publishedAt && <span className="chip">вышел {fmtDate(project.publishedAt)}</span>}
            </div>
          </div>
          <ProjectMenu projectId={project.id} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[250px_1fr]">
        <nav aria-label="Шаги конвейера" className="min-w-0 lg:sticky lg:top-6 lg:self-start">
          <ol className="panel flex gap-1 overflow-x-auto p-2 lg:block lg:overflow-hidden">
            {steps.map((s) => {
              const st = state[s.key];
              const done = Boolean(st?.approved) || (s.mode === "export" && project.status === "published");
              const draft = !done && Boolean(st?.latest);
              const isActive = s.key === activeKey;
              const isCurrent = s.key === current;
              const skipped = s.key === "role" && !st && Boolean(project.params.role);
              return (
                <li key={s.key} className="shrink-0">
                  <Link
                    href={`/projects/${project.id}?step=${s.key}`}
                    aria-current={isActive ? "step" : undefined}
                    className={clsx("flex items-start gap-2.5 rounded-md px-2.5 py-2", isActive ? "bg-ink-3" : "hover:bg-ink-3/50")}
                  >
                    <span className="mt-0.5 shrink-0">
                      {done ? <Check size={16} className="text-malachite" /> : draft ? <PencilLine size={16} className="text-ochre" /> : isCurrent ? <CircleDot size={16} className="text-lapis" /> : <Circle size={16} className="text-line-2" />}
                    </span>
                    <span className="min-w-0">
                      <span className={clsx("block whitespace-nowrap text-[0.88rem] leading-snug lg:whitespace-normal", isActive ? "text-bone" : done ? "text-mist" : "text-fog", skipped && "line-through decoration-fog/50")}>
                        <span className="tabular-nums text-fog">{s.label}.</span> {s.title}
                      </span>
                      {isActive && <span className="mt-0.5 hidden text-[0.76rem] leading-snug text-fog lg:block">{s.summary}</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="min-w-0">
          <div className="mb-4">
            <h2 className="text-[1.6rem] leading-tight">{def.label}. {def.title}</h2>
            <p className="mt-1 text-mist">{def.summary}</p>
          </div>
          {body}
          {def.mode !== "form" && def.mode !== "export" && structure && (activeKey === "threats" || activeKey === "script") && (
            <Section title={`Биты структуры «${structure.name}»`} className="mt-6">
              <ul className="grid gap-1.5 text-[0.88rem] sm:grid-cols-2">
                {structure.beats.map((b) => <li key={b.at} className="flex gap-3"><span className="w-16 shrink-0 tabular-nums text-ochre">{b.at}</span><span className="text-mist">{b.what}</span></li>)}
              </ul>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
