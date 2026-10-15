"use client";
import { useRef, useState, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { Trash2, Pin, PinOff, EyeOff, Eye, Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useAction } from "@/components/use-action";
import { addMarketAction, deleteMarketAction, setMarketFlagAction } from "@/app/actions";

export function MarketForm() {
  const { pending, run } = useAction();
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} className="grid gap-3 sm:grid-cols-2" action={(fd) => run(() => addMarketAction(fd), () => form.current?.reset())}>
      <div><label className="label" htmlFor="k">Тип</label>
        <select id="k" name="kind" className="field" defaultValue="competitor_video">
          <option value="competitor_video">Ролик конкурента</option><option value="query">Поисковый запрос</option>
          <option value="comment_theme">Тема комментариев</option><option value="note">Заметка</option>
        </select></div>
      <div><label className="label" htmlFor="u">Ссылка на YouTube</label><input id="u" name="url" type="url" className="field" placeholder="https://youtu.be/…" /></div>
      <div className="sm:col-span-2"><label className="label" htmlFor="t">Название или запрос</label><input id="t" name="title" className="field" required /></div>
      <div><label className="label" htmlFor="c">Канал</label><input id="c" name="channel" className="field" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label" htmlFor="v">Просмотры</label><input id="v" name="views" inputMode="numeric" className="field" /></div>
        <div><label className="label" htmlFor="d">Дата</label><input id="d" name="publishedAt" type="date" className="field" /></div>
      </div>
      <div className="sm:col-span-2"><label className="label" htmlFor="a">Угол: чем цепляет, на какой секунде первая угроза</label><input id="a" name="angle" className="field" /></div>
      <input type="hidden" name="tags" value="вручную" />
      <div><button className="btn btn-primary" disabled={pending}>Добавить</button></div>
    </form>
  );
}

export function CardActions({ id, pinned, hidden, manual, inline = false }: { id: number; pinned: boolean; hidden: boolean; manual: boolean; inline?: boolean }) {
  const { pending, run } = useAction();
  const cls = inline ? "btn btn-ghost btn-sm" : "flex h-8 w-8 items-center justify-center rounded-md bg-black/70 text-white backdrop-blur hover:bg-black/90 disabled:opacity-50";
  return (
    <>
      {!hidden && (
        <button className={cls} disabled={pending} title={pinned ? "Открепить" : "Закрепить: всегда попадает в промпты"} aria-label={pinned ? "Открепить" : "Закрепить"}
          onClick={() => run(() => setMarketFlagAction(id, "pinned", !pinned))}>
          {pinned ? <PinOff size={15} /> : <Pin size={15} />}
        </button>
      )}
      {manual ? (
        <button className={clsx(cls, inline && "btn-danger")} disabled={pending} title="Удалить" aria-label="Удалить" onClick={() => run(() => deleteMarketAction(id))}><Trash2 size={15} /></button>
      ) : (
        <button className={cls} disabled={pending} title={hidden ? "Вернуть" : "Скрыть: не по теме, больше не появится"} aria-label={hidden ? "Вернуть" : "Скрыть"}
          onClick={() => run(() => setMarketFlagAction(id, "hidden", !hidden))}>
          {hidden ? <Eye size={15} /> : <EyeOff size={15} />}
        </button>
      )}
    </>
  );
}

/** Панель над списком: вкладки, поиск, фильтр по запросу, сортировка. Состояние — в адресе страницы. */
export function ListToolbar({ tabs, sources, sorts, total }: {
  tabs: { key: string; label: string; count: number }[];
  sources: string[];
  sorts: { key: string; label: string }[];
  total: number;
}) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) (v == null || v === "" ? next.delete(k) : next.set(k, v));
    if (!("page" in patch)) next.delete("page");
    router.replace(`${path}?${next.toString()}`, { scroll: false });
  };
  useEffect(() => {
    const t = setTimeout(() => { if ((sp.get("q") ?? "") !== q) set({ q }); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  const tab = sp.get("show") ?? tabs[0].key;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1 border-b border-line" role="tablist">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => set({ show: t.key === tabs[0].key ? null : t.key })}
            className={clsx("-mb-px border-b-2 px-3 py-2 text-[0.9rem] transition-colors", tab === t.key ? "border-ochre text-bone" : "border-transparent text-fog hover:text-mist")}>
            {t.label} <span className="text-fog">{t.count}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-56 flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fog" />
          <input className="field !pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по названию, каналу, углу" aria-label="Поиск" />
          {q && <button className="absolute right-2 top-1/2 -translate-y-1/2 text-fog hover:text-bone" onClick={() => setQ("")} aria-label="Очистить"><X size={15} /></button>}
        </label>
        {sources.length > 1 && (
          <select className="field !w-auto" value={sp.get("src") ?? ""} onChange={(e) => set({ src: e.target.value || null })} aria-label="Поисковый запрос">
            <option value="">Все запросы</option>
            {sources.map((s) => <option key={s} value={s}>«{s}»</option>)}
          </select>
        )}
        <select className="field !w-auto" value={sp.get("sort") ?? sorts[0].key} onChange={(e) => set({ sort: e.target.value === sorts[0].key ? null : e.target.value })} aria-label="Сортировка">
          {sorts.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <span className="text-sm text-fog">{total} шт.</span>
      </div>
    </div>
  );
}

export function Pager({ page, pages }: { page: number; pages: number }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  if (pages <= 1) return null;
  const go = (p: number) => {
    const next = new URLSearchParams(sp.toString());
    if (p === 1) next.delete("page"); else next.set("page", String(p));
    router.push(`${path}?${next.toString()}`);
  };
  return (
    <nav className="mt-5 flex items-center justify-center gap-2" aria-label="Страницы">
      <button className="btn btn-sm" disabled={page <= 1} onClick={() => go(page - 1)}><ChevronLeft size={15} />Назад</button>
      <span className="px-2 text-sm text-mist">{page} из {pages}</span>
      <button className="btn btn-sm" disabled={page >= pages} onClick={() => go(page + 1)}>Дальше<ChevronRight size={15} /></button>
    </nav>
  );
}
