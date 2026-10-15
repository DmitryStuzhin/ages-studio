import "server-only";
import { structureByKey, hookByKey, ROTATION_WINDOW, STRUCTURES, HOOK_TYPES } from "@/lib/prompts/library";
import { stepDef, type ContextBlock, type ProjectKind } from "@/lib/pipeline/steps";
import { isolateFinalScript, fmtTime } from "@/lib/pipeline/parse";
import { isHistoryRelevant } from "@/lib/market";
import { effectiveStyle } from "@/lib/canon";
import { getCanon } from "./canon";
import {
  activeLessons, activePrompt, getProject, getSettings, listProjects, marketItems, metricsFor,
  pastScripts, recentDramaturgy, snapshots, stepState,
} from "./repo";

type Project = NonNullable<Awaited<ReturnType<typeof getProject>>>;

function approvedText(state: Awaited<ReturnType<typeof stepState>>, key: string) {
  return state[key]?.approved?.output?.trim() || null;
}

export function finalScriptText(state: Awaited<ReturnType<typeof stepState>>) {
  const audit = approvedText(state, "audit");
  if (audit) return isolateFinalScript(audit);
  return approvedText(state, "script");
}

async function block(name: ContextBlock, project: Project, state: Awaited<ReturnType<typeof stepState>>): Promise<string | null> {
  const p = project.params;
  const settings = await getSettings();
  const canon = await getCanon();
  switch (name) {
    case "params": {
      const s = structureByKey(p.structureKey);
      const h = hookByKey(p.hookTypeKey);
      const lines = [
        project.kind === "long" ? `Роль: ${p.role ?? "—"}` : `Шортс к ролику #${p.parentId ?? "—"}`,
        p.place && `Место: ${p.place}`,
        p.era && `Эпоха/год: ${p.era}`,
        project.kind === "long" && `Целевая длительность: ${p.durationMin ?? settings.defaults.durationMin} мин (${settings.defaults.wordsPerMinute} слов/мин)`,
        `Язык озвучки: ${p.language ?? settings.defaults.language}`,
        s && `Структура: ${s.name} (${s.key})`,
        h && `Тип хука: ${h.name} (${h.key})`,
        p.chosenHook && `Выбранный хук: «${p.chosenHook}»`,
        p.answerWord && `Слово-разгадка (не должно попасть в название и обложку): ${p.answerWord}`,
        p.nextRole && `Следующая роль для мостика: ${p.nextRole}`,
        p.threat && `Угроза шортса: ${p.threat}`,
        p.frameRange && `Диапазон кадров для этого вызова: ${p.frameRange}`,
        p.notes && `Заметки автора: ${p.notes}`,
        `СТРОКА СТИЛЯ (дописывается дословно в конец каждого промпта картинки): ${effectiveStyle(canon, p, project.kind === "short")}`,
        `ШАБЛОН АНИМАЦИИ Veo: ${canon.animTemplate}`,
        `ПРАВИЛО ПЕРСОНАЖЕЙ: ${canon.characterRule}`,
        `ОЗВУЧКА: ${canon.voiceRules}`,
        `МЕТКИ МОНТАЖА: ${canon.notesSyntax}`,
      ].filter(Boolean);
      return lines.join("\n");
    }
    case "structure": {
      const s = structureByKey(p.structureKey);
      if (!s) return "Структура не выбрана.";
      return [
        `${s.name}. ${s.idea}`,
        `Биты:`, ...s.beats.map((b) => `- ${b.at}: ${b.what}`),
        `Контракт: ${s.contract}`,
        `Вердикт: ${s.verdict}`,
        `Пороги: ⚡ ${s.gates.rehook.map((x) => Math.round(x * 100) + "%").join("–")}; 🔑 ≥${Math.round(s.gates.answerMin * 100)}%; угроз ${s.gates.threats.join("–")}` +
          (s.gates.falseThreatBreakMax != null ? `; ✖ ложная угроза ≤${Math.round(s.gates.falseThreatBreakMax * 100)}%` : "; ложной угрозы нет"),
      ].join("\n");
    }
    case "hook": {
      const h = hookByKey(p.hookTypeKey);
      if (!h) return "Тип хука не выбран.";
      return `${h.name}: ${h.how}\nОбразец механики (не копировать): ${h.example}\nИзбегать: ${h.avoid}`;
    }
    case "lessons": {
      const ls = await activeLessons(project.kind as ProjectKind);
      if (!ls.length) return "Уроков пока нет.";
      return ls.map((l) => `- [${l.status === "confirmed" ? "подтверждён" : "гипотеза"}, роликов: ${l.confirmations}] ${l.text} (${l.evidence})`).join("\n");
    }
    case "channel": {
      const all = await listProjects();
      const published = all.filter((x) => x.status === "published" && x.kind === "long");
      const rows: string[] = [];
      for (const pr of published.slice(0, 10)) {
        const ms = await metricsFor(pr.id);
        const m = ms.at(-1);
        rows.push(`- ${pr.title} [${pr.format === "survive24" ? "серия" : "другой формат"}${pr.params.structureKey ? `, ${pr.params.structureKey}` : ""}]: ` +
          (m ? `CTR ${m.ctr ?? "—"}%, ср. просмотр ${m.avgViewPct ?? "—"}%, из главной ${m.browseViews ?? "—"}${m.notes ? ` — ${m.notes}` : ""}` : "метрик нет"));
      }
      const snap = (await snapshots()).at(-1);
      const rec = await recentDramaturgy(project.id);
      return [
        snap ? `Канал на ${snap.day}: ${snap.subscribers} подписчиков, ${snap.watchHours12m ?? "—"} ч за 12 мес.` : "Снимков канала нет.",
        "Ролики:", ...(rows.length ? rows : ["- нет данных"]),
        `Последние ${ROTATION_WINDOW} структуры (не повторять): ${rec.structures.join(", ") || "—"}`,
        `Последние типы хука (не повторять): ${rec.hookTypes.join(", ") || "—"}`,
        `Библиотека структур: ${STRUCTURES.map((s) => `${s.key} — ${s.name}`).join("; ")}`,
        `Типы хуков: ${HOOK_TYPES.map((h) => h.key).join(", ")}`,
      ].join("\n");
    }
    case "market": {
      const all = (await marketItems()).filter((m) => !m.hidden);
      const items = [...all.filter((m) => m.pinned), ...all.filter((m) => !m.pinned && isHistoryRelevant(m))];
      if (!items.length) return "Сводка ниши пуста. Данные о спросе и конкурентах отсутствуют — не выдумывай их.";
      return items.slice(0, 40).map((m) => `- [${m.kind}] ${m.title}${m.channel ? ` · ${m.channel}` : ""}${m.views != null ? ` · ${m.views.toLocaleString("ru")} просм.` : ""}${m.publishedAt ? ` · ${m.publishedAt}` : ""}${m.angle ? ` · угол: ${m.angle}` : ""}`).join("\n");
    }
    case "facts": return approvedText(state, "recon") ?? "База фактов ещё не утверждена.";
    case "angle": return approvedText(state, "angle");
    case "threats": return approvedText(state, "threats");
    case "cast": return approvedText(state, "cast");
    case "script": return finalScriptText(state);
    case "past_scripts": {
      const ps = await pastScripts(project.id);
      if (!ps.length) return "Прошлых сценариев в базе нет.";
      return ps.map((x) => {
        const voice = [...x.text.matchAll(/Озвучка:\s*[«"]?([^»"\n]+)/g)].map((m) => m[1]).join(" ");
        const head = voice.split(/\s+/).slice(0, 120).join(" ");
        const bridge = x.text.match(/МОСТИК:\s*(.+)/)?.[1] ?? "";
        return `«${x.title}»\nНачало: ${head}…\n${bridge ? `Мостик: ${bridge}` : ""}`;
      }).join("\n\n");
    }
    case "metrics": {
      const ms = await metricsFor(project.id);
      if (!ms.length) return "Метрик нет.";
      return ms.map((m) => `День ${m.day}: просмотры ${m.views ?? "—"}, из главной и рекомендаций ${m.browseViews ?? "—"}, CTR ${m.ctr ?? "—"}%, ср. просмотр ${m.avgViewPct ?? "—"}% (${m.avgViewSec != null ? fmtTime(m.avgViewSec) : "—"}), подписок +${m.subsGained ?? "—"}` +
        (m.retention.length ? `\nКривая: ${m.retention.map((r) => `${fmtTime(r.t)} ${r.pct}%`).join(", ")}` : "") + (m.notes ? `\nЗаметки: ${m.notes}` : "")).join("\n\n");
    }
    case "parent": {
      if (!p.parentId) return "Родительский ролик не выбран.";
      const parent = await getProject(p.parentId);
      if (!parent) return "Родительский ролик не найден.";
      const ps = await stepState(parent.id);
      return [
        `Ролик: ${parent.title}`,
        `ЖУРНАЛ УГРОЗ И КАРТА:\n${approvedText(ps, "threats") ?? "нет"}`,
        `ПЕРСОНАЖИ:\n${approvedText(ps, "cast") ?? "нет"}`,
        `ФИНАЛЬНЫЙ СЦЕНАРИЙ:\n${finalScriptText(ps) ?? "нет"}`,
        `СТРОКА СТИЛЯ ШОРТСА: ${effectiveStyle(canon, parent.params, true)}`,
      ].join("\n\n");
    }
  }
}

const TITLES: Record<ContextBlock, string> = {
  params: "Параметры", structure: "Структура", hook: "Тип хука", lessons: "Активные уроки",
  channel: "Сводка канала", market: "Сводка ниши", facts: "База фактов (шаг 2)", angle: "Угол и хук (шаг 3)",
  threats: "Журнал угроз и карта (шаг 4)", cast: "Персонажи (шаг 5)", script: "Финальный сценарий",
  past_scripts: "Прошлые сценарии — не повторять их обороты", metrics: "Метрики", parent: "Родительский ролик",
};

export async function buildPrompt(projectId: number, stepKey: string) {
  const project = await getProject(projectId);
  if (!project) throw new Error("Проект не найден");
  const def = stepDef(project.kind as ProjectKind, stepKey);
  if (!def) throw new Error("Шаг не найден");
  const prompt = await activePrompt();
  const state = await stepState(projectId);
  const stepText = prompt.steps[stepKey] ?? "";
  const parts: string[] = [];
  for (const b of def.context) {
    const text = await block(b, project, state);
    if (text) parts.push(`<${b}>\n## ${TITLES[b]}\n${text}\n</${b}>`);
  }
  const user = `${stepText}\n\n# КОНТЕКСТ\n${parts.join("\n\n")}`;
  const system = prompt.constitution;
  const full = `${system}\n\n---\n\n${user}`;
  return { system, user, full, version: prompt.version, def, tokensIn: Math.round(full.length / 3.2) };
}
