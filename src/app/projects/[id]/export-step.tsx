"use client";
import { useRef, useState } from "react";
import { FolderOpen, Download, Upload, CircleCheck, CircleX } from "lucide-react";
import { useAction } from "@/components/use-action";
import { useToast } from "@/components/toast";
import { framesCheckAction, markPublishedAction } from "@/app/actions";
import type { FrameCheck } from "@/lib/pipeline/package";
import { fmtTime } from "@/lib/pipeline/parse";

const FILES = [
  ["manifest.json", "сцены по порядку: кадр, анимация, тайминг, озвучка, оверлеи"],
  ["timeline.fcpxml", "таймлайн для DaVinci Resolve, Final Cut или Premiere"],
  ["brief.md", "инструкция для Claude Code: собрать ролик по манифесту"],
  ["subtitles.srt", "субтитры по репликам"],
  ["voiceover_text.txt", "чистый текст для ElevenLabs"],
  ["prompts.txt", "все промпты кадров и анимаций подряд"],
  ["packaging.md", "название, описание с источниками, теги"],
  ["frames_check.json", "проверка комплектности кадров, если выбрана папка"],
];

export function ExportStep(props: {
  projectId: number; ready: boolean; scenes: number; duration: number; animated: number;
  hasVoiceText: boolean; hasPackaging: boolean; status: string; youtubeUrl: string | null; aspect: string;
}) {
  const toast = useToast();
  const { pending, run } = useAction();
  const input = useRef<HTMLInputElement>(null);
  const [names, setNames] = useState<string[] | null>(null);
  const [check, setCheck] = useState<FrameCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState(props.youtubeUrl ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const pick = async (files: FileList | null) => {
    if (!files) return;
    const list = Array.from(files).map((f) => f.webkitRelativePath || f.name);
    setNames(list);
    const r = await framesCheckAction(props.projectId, list);
    setCheck(r.check);
  };

  const download = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${props.projectId}/package`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileNames: names ?? [] }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Не удалось собрать пакет");
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") ?? "";
      const name = decodeURIComponent(cd.match(/filename\*=UTF-8''(.+)$/)?.[1] ?? "package.zip");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
      toast("Пакет собран");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  if (!props.ready) {
    return <div className="panel p-6 text-mist">Пакет собирается из утверждённых кадров. Вернись к шагу «Кадры», утверди его — и здесь появится сборка.</div>;
  }

  return (
    <div className="space-y-5">
      <section className="panel p-5">
        <div className="grid gap-4 sm:grid-cols-4">
          <Stat label="Сцен" value={String(props.scenes)} />
          <Stat label="Длительность (оценка)" value={fmtTime(props.duration)} />
          <Stat label="Анимаций Veo" value={String(props.animated)} />
          <Stat label="Формат" value={props.aspect} />
        </div>
        {(!props.hasVoiceText || !props.hasPackaging) && (
          <p className="mt-4 text-sm text-ochre">
            {!props.hasVoiceText && "Нет утверждённого чистого текста для ElevenLabs — в пакет пойдёт склейка реплик. "}
            {!props.hasPackaging && "Упаковка не утверждена — packaging.md не попадёт в архив."}
          </p>
        )}
      </section>

      <section className="panel p-5">
        <h3 className="text-[1.25rem]">Кадры из Flow</h3>
        <p className="mt-1 text-sm text-fog">Выбери папку с кадрами — в браузере читаются только имена файлов, сами картинки никуда не загружаются. Платформа сверит их со сценарием: shot_NNN.png для каждого кадра и shot_NNN.mp4 для анимаций.</p>
        <input ref={input} type="file" className="hidden" multiple onChange={(e) => pick(e.target.files)} {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} />
        <button className="btn mt-3" onClick={() => input.current?.click()}><FolderOpen size={16} />Выбрать папку с кадрами</button>
        {check && (
          <div className="mt-4 space-y-2 text-sm">
            <div className={check.ok ? "flex items-center gap-2 text-malachite" : "flex items-center gap-2 text-cinnabar"}>
              {check.ok ? <CircleCheck size={17} /> : <CircleX size={17} />}
              {check.ok ? `Все ${check.expected.length} кадров на месте` : "Кадров не хватает или имена не по правилу"}
            </div>
            {check.missing.length > 0 && <Row label="Нет кадров" items={check.missing} />}
            {check.missingAnimations.length > 0 && <Row label="Нет анимаций (будет картинка)" items={check.missingAnimations} />}
            {check.badNames.length > 0 && <Row label="Имена не по правилу shot_NNN" items={check.badNames} />}
            {check.extra.length > 0 && <Row label="Лишние" items={check.extra} />}
          </div>
        )}
      </section>

      <section className="panel p-5">
        <h3 className="text-[1.25rem]">Пакет видео</h3>
        <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          {FILES.map(([f, d]) => <li key={f}><span className="font-mono text-[0.82rem] text-mist">{f}</span> <span className="text-fog">— {d}</span></li>)}
        </ul>
        <button className="btn btn-primary mt-4" disabled={busy} onClick={download}><Download size={16} />{busy ? "Собираю…" : "Скачать пакет .zip"}</button>
        <p className="mt-3 text-sm text-fog">Дальше: положи кадры в папку <span className="font-mono">frames/</span> и озвучку как <span className="font-mono">voiceover.mp3</span>, затем открой <span className="font-mono">timeline.fcpxml</span> в монтажке или отдай папку Claude Code с файлом <span className="font-mono">brief.md</span>. Ролик смотришь целиком и публикуешь сам.</p>
      </section>

      <section className="panel p-5">
        <h3 className="text-[1.25rem]">После публикации</h3>
        <p className="mt-1 text-sm text-fog">Отметь выход ролика — тогда откроется разбор, а структура и тип хука попадут в правило чередования.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_180px_auto]">
          <input className="field" placeholder="Ссылка на YouTube" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Ссылка на YouTube" />
          <input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Дата публикации" />
          <button className="btn btn-approve" disabled={pending} onClick={() => run(() => markPublishedAction(props.projectId, url, date))}><Upload size={15} />{props.status === "published" ? "Обновить" : "Опубликован"}</button>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[0.8rem] text-fog">{label}</div><div className="font-display text-[1.9rem] leading-tight">{value}</div></div>;
}
function Row({ label, items }: { label: string; items: string[] }) {
  return <div><span className="text-fog">{label}: </span><span className="font-mono text-[0.8rem] text-mist">{items.slice(0, 30).join(", ")}{items.length > 30 ? ` и ещё ${items.length - 30}` : ""}</span></div>;
}
