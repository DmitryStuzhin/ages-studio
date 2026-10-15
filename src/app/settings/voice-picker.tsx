"use client";
import { useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Play, Square, Search, Check, Copy, Hash, Users, Sparkles, X, Loader2, CircleAlert } from "lucide-react";
import { useAction } from "@/components/use-action";
import { useToast } from "@/components/toast";
import { lookupVoiceAction, saveVoiceAction, testVoiceAction } from "@/app/actions";
import type { Voice } from "@/lib/integrations/elevenlabs";

const MODELS = [
  { id: "eleven_v3", name: "Eleven v3", note: "Понимает теги [whispers], [tense], паузы — под твой сценарий" },
  { id: "eleven_multilingual_v2", name: "Multilingual v2", note: "Ровнее, но без тегов: прочитает их вслух" },
];
const SAMPLE = "[calm] It is the year 1347. [short pause] And the rats... are already inside the walls.";
const CATEGORY: Record<string, string> = { premade: "стандартный", cloned: "мой клон", generated: "сгенерирован", professional: "профессиональный", "по ID": "по ID" };

// Цвет аватара — от ID голоса, чтобы у каждого голоса был свой и не менялся.
function hue(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

function Avatar({ v, size = 40, playing }: { v: Pick<Voice, "id" | "name">; size?: number; playing?: boolean }) {
  const h = hue(v.id);
  return (
    <div className="relative grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.4, background: `linear-gradient(135deg, hsl(${h} 55% 48%), hsl(${(h + 50) % 360} 60% 32%))` }}>
      {playing ? <span className="eq" aria-hidden><span /><span /><span /></span> : v.name.trim().charAt(0).toUpperCase()}
    </div>
  );
}

function usePlayer() {
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const stop = () => { audio.current?.pause(); audio.current = null; setPlayingKey(null); };
  const play = (key: string, src: string) => {
    if (playingKey === key) { stop(); return; }
    stop();
    const a = new Audio(src);
    audio.current = a;
    a.onended = () => setPlayingKey((k) => (k === key ? null : k));
    a.play().then(() => setPlayingKey(key)).catch(() => setPlayingKey(null));
  };
  return { playingKey, play, stop };
}

function VoiceTile({ v, selected, playing, onSelect, onPlay }: { v: Voice; selected: boolean; playing: boolean; onSelect: () => void; onPlay: () => void }) {
  return (
    <div role="radio" aria-checked={selected} tabIndex={0} onClick={onSelect} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect())}
      className={clsx("group relative flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all",
        selected ? "border-lapis bg-lapis/10 shadow-[0_0_0_1px_var(--color-lapis)]" : "border-line bg-ink-2 hover:border-line-2 hover:bg-ink-3/60")}>
      <Avatar v={v} playing={playing} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[0.92rem] text-bone">{v.name}</span>
          {selected && <Check size={14} className="shrink-0 text-lapis" />}
        </div>
        <div className="truncate text-[0.75rem] text-fog">{[CATEGORY[v.category] ?? v.category, ...v.tags.slice(0, 3)].filter(Boolean).join(" · ")}</div>
      </div>
      <button type="button" disabled={!v.preview} onClick={(e) => { e.stopPropagation(); onPlay(); }}
        className={clsx("grid h-8 w-8 shrink-0 place-items-center rounded-full border transition-colors disabled:opacity-30",
          playing ? "border-lapis bg-lapis text-white" : "border-line-2 text-mist hover:border-lapis hover:text-bone")}
        aria-label={playing ? `Остановить ${v.name}` : `Послушать ${v.name}`} title={v.preview ? undefined : "У голоса нет примера"}>
        {playing ? <Square size={12} /> : <Play size={13} className="translate-x-px" />}
      </button>
    </div>
  );
}

export function VoicePicker({ voices, current, model, credits }: { voices: Voice[]; current: Voice | null; model: string; credits: number | null }) {
  const toast = useToast();
  const { pending, run } = useAction();
  const player = usePlayer();
  const [tab, setTab] = useState<"mine" | "id">(current && !voices.some((v) => v.id === current.id) ? "id" : "mine");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Voice | null>(current);
  const [mdl, setMdl] = useState(model || "eleven_v3");
  const [idInput, setIdInput] = useState(current && !voices.some((v) => v.id === current.id) ? current.id : "");
  const [found, setFound] = useState<{ id: string; voice: Voice | null } | null>(null);
  const [looking, setLooking] = useState(false);
  const [sample, setSample] = useState(SAMPLE);
  const [testing, setTesting] = useState(false);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? voices.filter((v) => `${v.name} ${v.labels} ${v.description} ${v.id}`.toLowerCase().includes(s)) : voices;
  }, [voices, q]);
  const dirty = (sel?.id ?? "") !== (current?.id ?? "") || mdl !== model;

  const lookup = async () => {
    setLooking(true);
    setFound(null);
    const r = await lookupVoiceAction(idInput);
    setLooking(false);
    if (!r.ok) { toast(r.error, "error"); return; }
    setFound({ id: r.id, voice: r.voice });
    setSel(r.voice ?? { id: r.id, name: `Голос ${r.id.slice(0, 6)}…`, category: "по ID", labels: "", tags: [], description: "", preview: null });
  };

  const test = async () => {
    if (!sel) return;
    setTesting(true);
    const r = await testVoiceAction(sel.id, mdl, sample);
    setTesting(false);
    if (!r.ok) { toast(r.error, "error"); return; }
    player.play(`test-${sel.id}-${mdl}`, r.audio);
    toast(`Пробная фраза: ${r.chars} кредитов`);
  };

  return (
    <div className="space-y-5">
      {/* Выбранный голос */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-gradient-to-br from-ink-3/70 to-ink-2 p-4">
        {sel ? <Avatar v={sel} size={56} playing={player.playingKey === `pv-${sel.id}` || player.playingKey?.startsWith(`test-${sel.id}`)} /> : <div className="grid h-14 w-14 place-items-center rounded-full border border-dashed border-line-2 text-fog"><Users size={20} /></div>}
        <div className="min-w-0 flex-1">
          <div className="text-[0.75rem] uppercase tracking-wide text-fog">Голос канала</div>
          <div className="truncate text-[1.15rem] text-bone">{sel?.name ?? "не выбран"}</div>
          {sel && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {sel.tags.slice(0, 4).map((t) => <span key={t} className="rounded-full bg-ink px-2 py-0.5 text-[0.72rem] text-mist">{t}</span>)}
              <button type="button" className="inline-flex items-center gap-1 rounded-full bg-ink px-2 py-0.5 font-mono text-[0.72rem] text-fog hover:text-bone"
                onClick={async () => { await navigator.clipboard.writeText(sel.id); toast("ID голоса скопирован"); }} title="Скопировать ID">
                {sel.id}<Copy size={11} />
              </button>
            </div>
          )}
        </div>
        {sel?.preview && (
          <button type="button" className="btn" onClick={() => player.play(`pv-${sel.id}`, sel.preview!)}>
            {player.playingKey === `pv-${sel.id}` ? <Square size={14} /> : <Play size={14} />}Пример ElevenLabs
          </button>
        )}
      </div>

      {/* Выбор: свои голоса или по ID */}
      <div>
        <div className="inline-flex rounded-lg border border-line bg-ink p-1" role="tablist">
          {([["mine", <Users key="i" size={14} />, `Мои голоса · ${voices.length}`], ["id", <Hash key="i" size={14} />, "По ID из ElevenLabs"]] as const).map(([k, icon, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={clsx("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[0.85rem] transition-colors", tab === k ? "bg-ink-3 text-bone shadow" : "text-fog hover:text-mist")}>
              {icon}{label}
            </button>
          ))}
        </div>

        {tab === "mine" ? (
          <div className="mt-3">
            {voices.length > 6 && (
              <label className="relative mb-3 block max-w-sm">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fog" />
                <input className="field !pl-9" placeholder="Имя, акцент, характер" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Поиск голоса" />
                {q && <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-fog hover:text-bone" onClick={() => setQ("")} aria-label="Очистить"><X size={15} /></button>}
              </label>
            )}
            <div role="radiogroup" aria-label="Голоса" className="grid max-h-[420px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((v) => (
                <VoiceTile key={v.id} v={v} selected={sel?.id === v.id} playing={player.playingKey === `pv-${v.id}`}
                  onSelect={() => setSel(v)} onPlay={() => v.preview && player.play(`pv-${v.id}`, v.preview)} />
              ))}
              {list.length === 0 && <p className="text-sm text-fog">Ничего не нашлось.</p>}
            </div>
          </div>
        ) : (
          <div className="mt-3 max-w-xl">
            <p className="text-[0.85rem] text-fog">В ElevenLabs открой голос → «⋯» → Copy voice ID. Можно вставить и ссылку целиком. Голос из библиотеки сначала добавь в My Voices — так API точно сможет им озвучивать.</p>
            <div className="mt-2 flex gap-2">
              <input className="field min-w-0 flex-1 font-mono text-[0.88rem]" placeholder="например 21m00Tcm4TlvDq8ikWAM" value={idInput}
                onChange={(e) => setIdInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && idInput.trim() && lookup()} aria-label="ID голоса" />
              <button type="button" className="btn" disabled={looking || !idInput.trim()} onClick={lookup}>
                {looking ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}Найти
              </button>
            </div>
            {found && (found.voice ? (
              <div className="mt-3">
                <VoiceTile v={found.voice} selected={sel?.id === found.voice.id} playing={player.playingKey === `pv-${found.voice.id}`}
                  onSelect={() => setSel(found.voice)} onPlay={() => found.voice?.preview && player.play(`pv-${found.voice.id}`, found.voice.preview)} />
              </div>
            ) : (
              <p className="mt-3 flex items-start gap-2 text-[0.85rem] text-ochre">
                <CircleAlert size={16} className="mt-0.5 shrink-0" />
                ElevenLabs не показывает этот голос твоему ключу. Его всё равно можно выбрать — проверь пробной фразой ниже: если зазвучит, озвучка роликов тоже пойдёт.
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Модель */}
      <div>
        <div className="label">Модель</div>
        <div role="radiogroup" aria-label="Модель" className="grid gap-2 sm:grid-cols-2">
          {MODELS.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={mdl === m.id} onClick={() => setMdl(m.id)}
              className={clsx("rounded-lg border p-3 text-left transition-all", mdl === m.id ? "border-lapis bg-lapis/10 shadow-[0_0_0_1px_var(--color-lapis)]" : "border-line bg-ink-2 hover:border-line-2")}>
              <div className="flex items-center gap-2 text-bone">{m.name}{mdl === m.id && <Check size={14} className="text-lapis" />}{m.id === "eleven_v3" && <span className="rounded-full bg-malachite/15 px-2 text-[0.7rem] text-malachite">для канала</span>}</div>
              <div className="mt-0.5 text-[0.8rem] text-fog">{m.note}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Пробная фраза */}
      <div>
        <label className="label" htmlFor="sample">Пробная фраза — услышать голос с этой моделью и тегами</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input id="sample" className="field min-w-0 flex-1" value={sample} maxLength={300} onChange={(e) => setSample(e.target.value)} />
          <button type="button" className="btn shrink-0" disabled={!sel || testing || !sample.trim()} onClick={test}>
            {testing ? <Loader2 size={15} className="animate-spin" /> : player.playingKey?.startsWith("test-") ? <Square size={14} /> : <Sparkles size={15} />}
            Послушать · {sample.trim().length} кр.
          </button>
        </div>
        {credits != null && <div className="mt-1 text-[0.78rem] text-fog">Осталось {credits.toLocaleString("ru")} кредитов</div>}
      </div>

      <div className={clsx("flex flex-wrap items-center gap-3 transition-opacity", dirty ? "opacity-100" : "opacity-60")}>
        <button type="button" className="btn btn-primary" disabled={pending || !sel || !dirty} onClick={() => sel && run(() => saveVoiceAction(sel.id, sel.name, mdl))}>
          <Check size={15} />Сохранить голос и модель
        </button>
        {dirty && <span className="text-[0.82rem] text-ochre">Есть несохранённые изменения</span>}
      </div>
    </div>
  );
}
