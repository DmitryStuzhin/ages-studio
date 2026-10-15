"use client";
import { Copy, Send, FolderCheck, CircleCheck, Circle } from "lucide-react";
import clsx from "clsx";
import { useAction } from "@/components/use-action";
import { useToast } from "@/components/toast";
import { exportToPipelineAction } from "@/app/actions";
import type { PipelineStatus } from "@/lib/server/pipeline";

function Bar({ label, done, total, tone = "lapis" }: { label: string; done: number; total: number; tone?: "lapis" | "malachite" }) {
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-[0.85rem]"><span className="text-mist">{label}</span><span className="tabular-nums text-bone">{done} / {total}</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-ink">
        <div className={clsx("bar-grow h-full rounded-full", tone === "lapis" ? "bg-lapis" : "bg-malachite")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Связь с локальным конвейером: экспорт раскадровки и прогресс по файлам в папке ролика. */
export function PipelinePanel({ projectId, status }: { projectId: number; status: PipelineStatus }) {
  const { pending, run } = useAction();
  const toast = useToast();
  const v = `videos/${status.slug}`;
  const commands = [
    { label: "Промпты с кнопкой «копировать»", cmd: `python3 tools/make_prompts.py ${v}` },
    { label: "Текст для ElevenLabs", cmd: `python3 tools/voice_script.py ${v}` },
    { label: "Галерея для проверки кадров", cmd: `python3 tools/make_gallery.py ${v}` },
    { label: "Проверка озвучки (Whisper)", cmd: `python3 tools/check_voice.py ${v}` },
    { label: "Превью первой минуты", cmd: `python3 tools/montage.py ${v} --preview 60` },
    { label: "Полный монтаж → final.mp4", cmd: `python3 tools/montage.py ${v}` },
  ];
  const steps = [
    { done: status.exported, label: "Раскадровка в конвейере" },
    { done: status.expectedShots > 0 && status.missingFrames.length === 0, label: "Все кадры на месте" },
    { done: status.expectedAnims === 0 || status.missingAnims.length === 0, label: "Все анимации на месте" },
    { done: status.audio.length > 0, label: "Озвучка положена" },
    { done: status.hasVoiceClean, label: "Озвучка проверена" },
    { done: status.hasFinal, label: "final.mp4 собран" },
  ];

  if (!status.available) {
    return (
      <section className="panel p-5">
        <h3 className="text-[1.25rem]">Локальный конвейер</h3>
        <p className="mt-1 text-sm text-fog">Папка <span className="font-mono">{status.dir}</span> не найдена. Если конвейер лежит в другом месте, укажи путь в Настройках → Канон канала. Пакет .zip ниже работает и без конвейера.</p>
      </section>
    );
  }
  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[1.25rem]">Локальный конвейер</h3>
          <p className="mt-1 text-sm text-fog">
            Папка ролика: <span className="font-mono text-mist">{status.folder.replace(/^\/Users\/[^/]+/, "~")}</span>
            {status.updatedAt && <> · изменена {new Date(status.updatedAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</>}
          </p>
        </div>
        <button className="btn btn-primary" disabled={pending} onClick={() => run(() => exportToPipelineAction(projectId))}>
          <Send size={15} />{status.exported ? "Обновить раскадровку" : "Отправить в конвейер"}
        </button>
      </div>
      <p className="mt-2 text-[0.82rem] text-fog">Пишет storyboard.csv (shot, scene, prompt, voice, anim, anim_prompt, refs, notes), style.md с персонажами и idea.md. Прежние версии сохраняются рядом как *.bak, твои кадры и озвучка не трогаются.</p>

      <ol className="mt-4 grid gap-2 sm:grid-cols-3">
        {steps.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-[0.88rem]">
            {s.done ? <CircleCheck size={17} className="shrink-0 text-malachite" /> : <Circle size={17} className="shrink-0 text-line-2" />}
            <span className={s.done ? "text-bone" : "text-fog"}>{s.label}</span>
          </li>
        ))}
      </ol>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Bar label="Кадры frames/" done={status.expectedShots - status.missingFrames.length} total={status.expectedShots} />
        <Bar label="Анимации anims/" done={status.expectedAnims - status.missingAnims.length} total={status.expectedAnims} />
      </div>
      {status.exported && status.missingFrames.length > 0 && status.missingFrames.length < status.expectedShots && (
        <p className="mt-3 text-[0.82rem] text-fog">Не хватает: <span className="font-mono text-mist">{status.missingFrames.slice(0, 20).join(", ")}{status.missingFrames.length > 20 ? ` и ещё ${status.missingFrames.length - 20}` : ""}</span></p>
      )}
      {status.hasFinal && (
        <p className="mt-3 flex items-center gap-2 text-sm text-malachite"><FolderCheck size={16} />final.mp4 готов{status.finalSize ? ` · ${(status.finalSize / 1048576).toFixed(0)} МБ` : ""}. Посмотри целиком и публикуй.</p>
      )}

      <details className="mt-5">
        <summary className="cursor-pointer text-sm text-mist hover:text-bone">Команды конвейера для этого ролика</summary>
        <ul className="mt-3 space-y-2">
          {commands.map((c) => (
            <li key={c.cmd} className="flex flex-wrap items-center gap-2">
              <span className="w-56 shrink-0 text-[0.82rem] text-fog">{c.label}</span>
              <code className="page min-w-0 flex-1 truncate px-2 py-1 text-[0.78rem]">{c.cmd}</code>
              <button className="btn btn-ghost btn-sm" aria-label="Скопировать команду" onClick={async () => { await navigator.clipboard.writeText(`cd ${status.dir} && ${c.cmd}`); toast("Команда скопирована"); }}><Copy size={14} /></button>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
