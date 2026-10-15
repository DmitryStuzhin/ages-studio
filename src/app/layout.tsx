import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";
import { Toaster } from "@/components/toast";
import { GoogleBanner } from "@/components/google-banner";

export const metadata: Metadata = {
  title: "Ages Studio",
  description: "Производство роликов Illustrated Ages: от темы до пакета видео.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Instrument+Sans:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>
        <Toaster>
          <div className="min-h-dvh md:grid md:grid-cols-[232px_1fr]">
            <Nav />
            <main className="min-w-0 px-4 py-6 md:px-9 md:py-8"><GoogleBanner />{children}</main>
          </div>
        </Toaster>
      </body>
    </html>
  );
}
