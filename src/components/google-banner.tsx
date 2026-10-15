import Link from "next/link";
import { TriangleAlert, Clock } from "lucide-react";
import { googleAuthState } from "@/lib/server/sync";
import { oauthConfigured } from "@/lib/integrations/youtube";

/** Плашка о входе в Google: видна на всех страницах, когда доступ истёк или истекает в ближайшие 48 часов. */
export async function GoogleBanner({ showNotConnected = false }: { showNotConnected?: boolean }) {
  if (!oauthConfigured()) return null;
  const st = await googleAuthState();
  if (st.kind === "expired") {
    return (
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-cinnabar/70 bg-cinnabar/10 px-4 py-3 text-sm text-bone" role="alert">
        <TriangleAlert size={18} className="shrink-0 text-cinnabar" />
        <span className="min-w-0 flex-1">Доступ к YouTube Analytics истёк — удержание, трафик и часы не обновляются. Пропущенные снимки досчитаются после входа.</span>
        <a href="/api/auth/google/start" className="btn btn-primary btn-sm">Войти снова</a>
      </div>
    );
  }
  if (st.kind === "expiring") {
    return (
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-ochre/60 bg-ochre/10 px-4 py-3 text-sm text-bone">
        <Clock size={18} className="shrink-0 text-ochre" />
        <span className="min-w-0 flex-1">Вход в Google истечёт примерно через {st.hoursLeft} ч (режим Testing — 7 дней). Войди заново заранее, чтобы не было перерыва.</span>
        <a href="/api/auth/google/start" className="btn btn-sm">Обновить вход</a>
      </div>
    );
  }
  if (st.kind === "none" && showNotConnected) {
    return (
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-lapis/50 bg-lapis/10 px-4 py-3 text-sm text-bone">
        <span className="min-w-0 flex-1">YouTube Analytics не подключён: удержание, источники трафика и часы пока вносятся вручную.</span>
        <a href="/api/auth/google/start" className="btn btn-primary btn-sm">Войти через Google</a>
        <Link href="/settings" className="text-sm text-lapis hover:underline">подробнее</Link>
      </div>
    );
  }
  return null;
}
