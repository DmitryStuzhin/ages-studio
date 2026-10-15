// Фоновое расписание синхронизации с YouTube. Код с базой и сетью лежит в instrumentation-node.ts
// и подключается только в Node.js: условие ниже Next.js вырезает из сборки для edge-среды.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
