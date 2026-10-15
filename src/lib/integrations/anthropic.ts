import "server-only";
import fs from "node:fs";
import path from "node:path";

// Адаптер Claude API. Подключается одной переменной окружения ANTHROPIC_API_KEY.
// Конституция уходит в system с cache_control — повторные вызовы читают её из кеша
// (на Opus 5.5 и Sonnet 5.5 чтение кеша — 5% цены входа).

export type LLMResult = { text: string; inputTokens: number; outputTokens: number; cacheRead: number; model: string };

// Ключ: из окружения или из .env.local платформы, который пишет поле в Настройках.
// Файл читается при каждом вызове — новый ключ работает без перезапуска.
const ENV_FILE = () => path.join(process.cwd(), ".env.local");

function keyFromFile(): string | null {
  try {
    const m = fs.readFileSync(ENV_FILE(), "utf8").match(/^\s*(?:export\s+)?ANTHROPIC_API_KEY\s*=\s*['"]?([^'"\s#]+)/m);
    return m?.[1] || null;
  } catch {
    return null;
  }
}

export function anthropicKey(): { key: string | null; where: "env" | "file" | null } {
  if (process.env.ANTHROPIC_API_KEY) return { key: process.env.ANTHROPIC_API_KEY, where: "env" };
  const k = keyFromFile();
  return k ? { key: k, where: "file" } : { key: null, where: null };
}

export function anthropicConfigured() {
  return Boolean(anthropicKey().key);
}

const API = process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com";

function explain(status: number, body: string) {
  let msg = body.slice(0, 300);
  try { msg = JSON.parse(body).error?.message ?? msg; } catch { /* не JSON */ }
  const hint = status === 401 ? " — ключ не принят. Нужен ключ API из platform.claude.com → API Keys (начинается с sk-ant-api…)."
    : status === 400 && /credit|balance/i.test(msg) ? " — на балансе API не хватает денег." : status === 429 ? " — превышен лимит запросов, подожди минуту." : "";
  return `Claude API ${status}: ${msg}${hint}`;
}

/** Проверка ключа без затрат: список доступных моделей. */
export async function verifyAnthropicKey(key: string) {
  const res = await fetch(`${API}/v1/models?limit=50`, {
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01" }, cache: "no-store", signal: AbortSignal.timeout(20000),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(explain(res.status, body));
  return ((JSON.parse(body).data ?? []) as { id: string; display_name?: string }[]).map((m) => ({ id: m.id, name: m.display_name ?? m.id }));
}

export async function saveAnthropicKey(key: string) {
  const k = key.trim();
  if (!/^sk-ant-[\w-]{20,}$/.test(k)) throw new Error("Ключ Claude API начинается с sk-ant- — проверь, что скопирован целиком.");
  const models = await verifyAnthropicKey(k);
  const file = ENV_FILE();
  const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const line = `ANTHROPIC_API_KEY=${k}`;
  const next = /^\s*(?:export\s+)?ANTHROPIC_API_KEY\s*=.*$/m.test(text)
    ? text.replace(/^\s*(?:export\s+)?ANTHROPIC_API_KEY\s*=.*$/m, line)
    : `${text.replace(/\n*$/, "")}${text ? "\n\n" : ""}# Claude API — сохранено из Настроек\n${line}\n`;
  fs.writeFileSync(file, next, { mode: 0o600 });
  return models;
}

export async function anthropicGenerate(opts: { system: string; user: string; model: string; maxTokens: number }): Promise<LLMResult> {
  const { key } = anthropicKey();
  if (!key) throw new Error("Claude API не подключён: вставь ключ в Настройках → Claude API.");
  const res = await fetch(`${API}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens,
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: opts.user }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(explain(res.status, body));
  }
  const data = (await res.json()) as {
    content: { type: string; text?: string }[];
    usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number };
    model: string;
  };
  return {
    text: data.content.filter((c) => c.type === "text").map((c) => c.text).join("\n"),
    inputTokens: data.usage.input_tokens,
    outputTokens: data.usage.output_tokens,
    cacheRead: data.usage.cache_read_input_tokens ?? 0,
    model: data.model,
  };
}
