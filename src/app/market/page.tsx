import { PageHeader, Section, Empty, fmtDate } from "@/components/ui";
import { marketItems } from "@/lib/server/repo";
import { MarketForm, DeleteMarket } from "./client";
import { SyncStatus } from "@/components/sync-status";

export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { competitor_video: "ролик конкурента", query: "поисковый запрос", comment_theme: "тема комментариев", note: "заметка" };

export default async function MarketPage() {
  const items = await marketItems();
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Ниша"
        lead="Сводка рынка, которую видят шаги «Выбор роли», «Разведка» и «Упаковка». Ролики конкурентов подтягиваются по поисковым запросам из Настроек и переиспользуются — ничего не анализируется заново в каждом запросе."
      />
      <section className="panel mb-6 p-5"><SyncStatus /></section>
      <Section title="Добавить" className="mb-6"><MarketForm /></Section>
      <Section title={`Сводка · ${items.length}`}>
        {items.length === 0 ? <Empty title="Сводка пуста">Без неё модель не знает спроса и конкурентов — и честно пишет «нет данных». Добавь 10–20 роликов конкурентов по ролям, которые рассматриваешь.</Empty> : (
          <div className="overflow-x-auto">
            <table className="tbl min-w-[760px]">
              <thead><tr><th>Что</th><th>Канал</th><th>Просмотры</th><th>Дата</th><th>Угол</th><th /></tr></thead>
              <tbody>
                {items.map((m) => (
                  <tr key={m.id}>
                    <td>{m.url ? <a href={m.url} target="_blank" rel="noreferrer" className="text-bone hover:text-lapis">{m.title}</a> : <span className="text-bone">{m.title}</span>}<div className="text-xs text-fog">{m.source === "api" ? "авто" : KIND[m.kind]}{m.tags && ` · ${m.tags}`}</div></td>
                    <td className="text-mist">{m.channel ?? "—"}</td>
                    <td className="tabular-nums">{m.views?.toLocaleString("ru") ?? "—"}</td>
                    <td className="text-fog">{m.publishedAt ? fmtDate(String(m.publishedAt)) : "—"}</td>
                    <td className="max-w-xs text-mist">{m.angle || "—"}</td>
                    <td className="text-right"><DeleteMarket id={m.id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
