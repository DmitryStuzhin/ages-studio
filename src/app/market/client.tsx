"use client";
import { useRef } from "react";
import { Trash2 } from "lucide-react";
import { useAction } from "@/components/use-action";
import { addMarketAction, deleteMarketAction } from "@/app/actions";

export function MarketForm() {
  const { pending, run } = useAction();
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} className="grid gap-3 md:grid-cols-6" action={(fd) => run(() => addMarketAction(fd), () => form.current?.reset())}>
      <div className="md:col-span-2"><label className="label" htmlFor="k">Тип</label>
        <select id="k" name="kind" className="field" defaultValue="competitor_video">
          <option value="competitor_video">Ролик конкурента</option><option value="query">Поисковый запрос</option>
          <option value="comment_theme">Тема комментариев</option><option value="note">Заметка</option>
        </select></div>
      <div className="md:col-span-4"><label className="label" htmlFor="t">Название или запрос</label><input id="t" name="title" className="field" required /></div>
      <div className="md:col-span-2"><label className="label" htmlFor="c">Канал</label><input id="c" name="channel" className="field" /></div>
      <div className="md:col-span-2"><label className="label" htmlFor="u">Ссылка</label><input id="u" name="url" type="url" className="field" /></div>
      <div><label className="label" htmlFor="v">Просмотры</label><input id="v" name="views" inputMode="numeric" className="field" /></div>
      <div><label className="label" htmlFor="d">Дата</label><input id="d" name="publishedAt" type="date" className="field" /></div>
      <div className="md:col-span-4"><label className="label" htmlFor="a">Угол: чем цепляет, на какой секунде первая угроза</label><input id="a" name="angle" className="field" /></div>
      <div className="md:col-span-2"><label className="label" htmlFor="tg">Роль или эпоха</label><input id="tg" name="tags" className="field" placeholder="gladiator, Rome" /></div>
      <div><button className="btn btn-primary" disabled={pending}>Добавить</button></div>
    </form>
  );
}

export function DeleteMarket({ id }: { id: number }) {
  const { pending, run } = useAction();
  return <button className="btn btn-ghost btn-sm btn-danger" aria-label="Удалить" disabled={pending} onClick={() => run(() => deleteMarketAction(id))}><Trash2 size={14} /></button>;
}
