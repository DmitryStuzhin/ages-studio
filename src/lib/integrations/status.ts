import "server-only";
import { anthropicConfigured } from "./anthropic";
import { oauthConfigured } from "./youtube";
import { getGoogleAuth } from "@/lib/server/sync";
import { elevenKey } from "./elevenlabs";
import { getCanon, expandHome } from "@/lib/server/canon";

// Статус интеграций. Пока API не подключены, каждая интеграция имеет ручной режим,
// который платформа поддерживает полностью — подключение API только убирает ручную работу.

export type Integration = {
  key: string;
  name: string;
  connected: boolean;
  state: string;
  env: string[];
  replaces: string;
  manual: string;
};

export async function integrations(): Promise<Integration[]> {
  const google = await getGoogleAuth();
  const yd = Boolean(process.env.YOUTUBE_API_KEY);
  const ya = Boolean(google) && !google?.expiredAt && oauthConfigured();
  const el = await elevenKey(expandHome((await getCanon()).pipelineDir));
  return [
    {
      key: "anthropic", name: "Claude API", connected: anthropicConfigured(), state: anthropicConfigured() ? "подключено" : "ручной режим", env: ["ANTHROPIC_API_KEY"],
      replaces: "Кнопка «Сгенерировать» в каждом шаге: промпт с конституцией (кеш) и контекстом уходит в API.",
      manual: "«Скопировать промпт» → вставить в чат Claude → вставить ответ обратно. Гейты и всё остальное работают так же.",
    },
    {
      key: "youtube_data", name: "YouTube Data API", connected: yd, state: yd ? "подключено" : "ручной режим", env: ["YOUTUBE_API_KEY"],
      replaces: "Каждые 12 часов: подписчики канала, статистика всех роликов, привязка проектов к вышедшим роликам и сводка ниши по запросам (с кешем, ~1 000 из 10 000 единиц квоты в сутки).",
      manual: "Добавлять ролики конкурентов в разделе «Ниша».",
    },
    {
      key: "youtube_analytics", name: "YouTube Analytics API", connected: ya,
      state: ya ? `вход выполнен${google?.channelTitle ? `: ${google.channelTitle}` : ""}` : google?.expiredAt ? "доступ истёк — войди снова" : oauthConfigured() ? "нужен вход" : "ручной режим",
      env: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
      replaces: "Метрики роликов на 2, 7 и 28 день, кривая удержания, источники трафика (главная, рекомендации, Shorts) и часы просмотра за 12 месяцев без Shorts. CTR показов API не отдаёт — его вносишь из Studio.",
      manual: "Внести цифры из YouTube Studio в разделе «Аналитика». OAuth-приложение держи в режиме «В рабочей среде», иначе вход сбрасывается через 7 дней.",
    },
    {
      key: "elevenlabs", name: "ElevenLabs", connected: Boolean(el.key),
      state: el.key ? (el.where === "pipeline" ? "ключ в .env конвейера" : "ключ задан") : "ручной режим", env: ["ELEVENLABS_API_KEY → Настройки → ElevenLabs"],
      replaces: "Кнопка «Озвучить» в шаге «Пакет видео»: текст из storyboard.csv режется на части и сохраняется в audio/voice_01.mp3 … папки ролика; переозвучка куска по номерам кадров. Остаток кредитов виден здесь же.",
      manual: "Озвучить voice_script.txt в ElevenLabs вручную и положить файлы в audio/.",
    },
    {
      key: "drive", name: "Google Drive", connected: Boolean(process.env.GOOGLE_DRIVE_FOLDER_ID), state: process.env.GOOGLE_DRIVE_FOLDER_ID ? "папка задана" : "ручной режим", env: ["GOOGLE_DRIVE_FOLDER_ID"],
      replaces: "Платформа сама видит кадры в папке проекта и проверяет комплектность.",
      manual: "В шаге «Пакет видео» выбрать папку с кадрами — браузер передаёт только имена файлов, проверка комплектности та же.",
    },
  ];
}
