"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gauge, Clapperboard, ScrollText, Shapes, Lightbulb, LineChart, Telescope, Settings2 } from "lucide-react";
import clsx from "clsx";

const ITEMS = [
  { href: "/", label: "Пульт", icon: Gauge },
  { href: "/projects", label: "Ролики и шортсы", icon: Clapperboard },
  { href: "/prompt", label: "Мастер-промпт", icon: ScrollText },
  { href: "/library", label: "Драматургия", icon: Shapes },
  { href: "/lessons", label: "Уроки", icon: Lightbulb },
  { href: "/analytics", label: "Аналитика", icon: LineChart },
  { href: "/market", label: "Ниша", icon: Telescope },
  { href: "/settings", label: "Настройки", icon: Settings2 },
];

export function Nav() {
  const path = usePathname();
  return (
    <aside className="border-b border-line bg-ink-2/60 md:sticky md:top-0 md:h-dvh md:border-b-0 md:border-r">
      <div className="flex items-center justify-between px-4 py-4 md:block md:px-5 md:py-6">
        <Link href="/" className="block">
          <div className="font-display text-[1.2rem] leading-none text-bone">Illustrated Ages</div>
          <div className="mt-1 text-[0.78rem] text-fog">студия производства</div>
        </Link>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:px-3" aria-label="Разделы">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-[0.9rem] transition-colors",
                active ? "bg-ink-3 text-bone shadow-[inset_2px_0_0_var(--color-ochre)]" : "text-mist hover:bg-ink-3/60 hover:text-bone",
              )}
            >
              <Icon size={17} strokeWidth={1.7} className={active ? "text-ochre" : "text-fog"} />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
