"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mic, RotateCcw, CircleCheck, CircleX, Loader2 } from "lucide-react";
import { useAction } from "@/components/use-action";
import { startVoiceAction, startFragmentAction } from "@/app/actions";
import type { VoicePlan } from "@/lib/server/voice";

const fmt = (n: number) => n.toLocaleString("ru-RU");

/** Озвучка в ElevenLabs прямо из платформы: весь ролик частями или кусок по номерам кадров. */
export function VoiceBlock({ projectId, plan }: { projectId: number; plan: VoicePlan }) {
  const router = useRouter();
  const { pending, run } = useAction();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const job = plan.job;
  const running = Boolean(job && !job.finishedAt);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(t);
  }, [running, router]);

  const left = plan.sub ? Math.max(0, plan.sub.limit - plan.sub.used) : null;
  const enough = left == null || left >= plan.credits;
  const ready = Boolean(plan.keyWhere && plan.voiceId && plan.parts.length);

  return (
    <div className="mt-5 border-t border-line pt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-[1.05rem] text-bone">Озвучка ElevenLabs</h4>
        {plan.sub && (
          <span className="text-[0.82rem] text-fog">
            осталось <span className="tabular-nums text-mist">{fmt(left!)}</span> из {fmt(plan.sub.limit)} кредитов
            {plan.sub.resetAt && <> · обновятся {new Date(plan.sub.resetAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</>}
          </span>
        )}
      </div>

      {!plan.keyWhere || !plan.voiceId ? (
        <p className="mt-2 text-sm text-fog">
          {!plan.keyWhere ? "Ключ ElevenLabs не задан." : "Голос не выбран."} Это делается один раз в{" "}
          <Link href="/settings#elevenlabs" className="text-lapis hover:underline">Настройках → ElevenLabs</Link>. Без этого озвучивай voice_script.txt вручную, как раньше.
        </p>
      ) : (
        <>
          <p className="mt-2 text-[0.88rem] text-mist">
            {plan.shots} кадров → {plan.parts.length} {plan.parts.length === 1 ? "файл" : plan.parts.length < 5 ? "файла" : "файлов"} · {fmt(plan.chars)} символов ≈ <span className="text-bone">{fmt(plan.credits)} кредитов</span> · голос {plan.voiceName} · {plan.model}
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {plan.parts.map((p) => (
              <li key={p.n} className="chip font-mono text-[0.75rem]">voice_{String(p.n).padStart(2, "0")}.mp3 · кадры {p.from}–{p.to} · {fmt(p.chars)}</li>
            ))}
          </ul>
          {plan.subError && <p className="mt-2 text-sm text-ochre">{plan.subError}</p>}
          {!enough && <p className="mt-2 text-sm text-cinnabar">Кредитов не хватит на весь ролик: нужно {fmt(plan.credits)}, осталось {fmt(left!)}.</p>}

          {job && (
            <div className="mt-3 rounded-md border border-line bg-ink/60 p-3 text-sm">
              {running ? (
                <div className="flex items-center gap-2 text-mist">
                  <Loader2 size={15} className="animate-spin" />
                  {job.kind === "full" ? `Озвучиваю: готово ${job.done} из ${job.total}` : "Озвучиваю кусок…"} · можно уйти со страницы, работа идёт на сервере
                </div>
              ) : job.error ? (
                <div className="flex items-start gap-2 text-cinnabar"><CircleX size={16} className="mt-0.5 shrink-0" /><span>{job.error}{job.kind === "full" && " Файлы в audio/ не тронуты."}</span></div>
              ) : (
                <div className="text-malachite">
                  <div className="flex items-center gap-2"><CircleCheck size={16} />Готово: {job.files.join(", ")}</div>
                  <p className="mt-1 text-fog">
                    {job.kind === "full"
                      ? "Прежняя озвучка, если была, лежит в audio/_old/. Дальше — проверка: python3 tools/check_voice.py (команда ниже)."
                      : "Кусок лежит отдельно и в монтаж сам не попадает: послушай и, если лучше, вставь вместо плохого места."}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {plan.existingAudio.length > 0 && !confirmOverwrite ? (
              <button className="btn" disabled={!ready || running || pending} onClick={() => setConfirmOverwrite(true)}>
                <Mic size={15} />Переозвучить весь ролик
              </button>
            ) : (
              <button className="btn btn-primary" disabled={!ready || running || pending || !enough}
                onClick={() => run(() => startVoiceAction(projectId), () => setConfirmOverwrite(false))}>
                <Mic size={15} />{plan.existingAudio.length ? `Да, озвучить заново (≈${fmt(plan.credits)} кр.)` : `Озвучить ролик (≈${fmt(plan.credits)} кр.)`}
              </button>
            )}
            {confirmOverwrite && <button className="btn btn-ghost" onClick={() => setConfirmOverwrite(false)}>Отмена</button>}
          </div>
          {plan.existingAudio.length > 0 && (
            <p className="mt-2 text-[0.8rem] text-fog">В audio/ уже есть: <span className="font-mono">{plan.existingAudio.join(", ")}</span>. При новой озвучке они переедут в audio/_old/.</p>
          )}

          <div className="mt-4">
            <div className="text-[0.85rem] text-mist">Переозвучить кусок — когда voice_report.md нашёл ошибку</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input className="field w-24" inputMode="numeric" placeholder="с кадра" aria-label="С кадра" value={from} onChange={(e) => setFrom(e.target.value.replace(/\D/g, ""))} />
              <span className="text-fog">—</span>
              <input className="field w-24" inputMode="numeric" placeholder="по кадр" aria-label="По кадр" value={to} onChange={(e) => setTo(e.target.value.replace(/\D/g, ""))} />
              <button className="btn" disabled={!ready || running || pending || !from}
                onClick={() => run(() => startFragmentAction(projectId, Number(from), Number(to || from)))}>
                <RotateCcw size={15} />Озвучить кусок
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
