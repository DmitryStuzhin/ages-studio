import "server-only";
import fs from "node:fs";
import path from "node:path";

// Адаптер Claude API. Подключается одной переменной окружения ANTHROPIC_API_KEY.
// Конституция уходит в system с cache_control — повторные вызовы читают её из кеша
// (на Opus 5.5 и Sonnet 5.5 чтение кеша — 5% цены входа).

export type LLMResult = { text: string; inputTokens: number; outputTokens: number; cacheRead: number; model: string; thinkingTokens?: number; stop?: string | null };
export type Effort = "low" | "medium" | "high";
type GenOpts = { system: string; user: string; model: string; maxTokens: number; effort?: Effort };

// Модели 5.5 перед ответом размышляют (adaptive thinking). Размышления не видны, но тратят тот же лимит
// max_tokens и оплачиваются как выход. Глубину задаёт effort; лимит шага поднят на запас под размышления.
const body = (o: GenOpts, stream: boolean) => JSON.stringify({
  model: o.model, max_tokens: o.maxTokens, ...(stream ? { stream: true } : {}),
  thinking: { type: "adaptive" }, output_config: { effort: o.effort ?? "medium" },
  system: [{ type: "text", text: o.system, cache_control: { type: "ephemeral" } }],
  messages: [{ role: "user", content: o.user }],
});
const CUT = "\n\n[Ответ оборван лимитом длины — нажми «Сгенерировать» ещё раз или допиши вручную.]";

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

export async function anthropicGenerate(opts: GenOpts): Promise<LLMResult> {
  const { key } = anthropicKey();
  if (!key) throw new Error("Claude API не подключён: вставь ключ в Настройках → Claude API.");
  const res = await fetch(`${API}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: body(opts, false),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(explain(res.status, body));
  }
  const data = (await res.json()) as {
    content: { type: string; text?: string }[];
    usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; output_tokens_details?: { thinking_tokens?: number } };
    model: string; stop_reason?: string;
  };
  return {
    text: data.content.filter((c) => c.type === "text").map((c) => c.text).join("\n") + (data.stop_reason === "max_tokens" ? CUT : ""),
    thinkingTokens: data.usage.output_tokens_details?.thinking_tokens ?? 0, stop: data.stop_reason ?? null,
    inputTokens: data.usage.input_tokens,
    outputTokens: data.usage.output_tokens,
    cacheRead: data.usage.cache_read_input_tokens ?? 0,
    model: data.model,
  };
}

/** То же, что anthropicGenerate, но ответ приходит по кускам: onText вызывается на каждый фрагмент текста. */
export async function anthropicStream(
  opts: GenOpts,
  on: { text: (t: string) => void; usage?: (u: { input?: number; output?: number }) => void; phase?: (p: "thinking" | "writing") => void },
): Promise<LLMResult> {
  const { key } = anthropicKey();
  if (!key) throw new Error("Claude API не подключён: вставь ключ в Настройках → Claude API.");
  const res = await fetch(`${API}/v1/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: body(opts, true),
  });
  if (!res.ok || !res.body) throw new Error(explain(res.status, await res.text()));
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", text = "", model = opts.model, input = 0, output = 0, cacheRead = 0, thinking = 0, stop: string | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const data = chunk.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
      if (!data) continue;
      let ev: { type: string; content_block?: { type?: string }; delta?: { type?: string; text?: string; stop_reason?: string }; usage?: { output_tokens?: number; output_tokens_details?: { thinking_tokens?: number } }; message?: { model?: string; usage?: { input_tokens?: number; cache_read_input_tokens?: number; output_tokens?: number } }; error?: { message?: string } };
      try { ev = JSON.parse(data); } catch { continue; }
      if (ev.type === "message_start" && ev.message) {
        model = ev.message.model ?? model;
        input = ev.message.usage?.input_tokens ?? 0;
        cacheRead = ev.message.usage?.cache_read_input_tokens ?? 0;
        on.usage?.({ input: input + cacheRead });
      } else if (ev.type === "content_block_start") {
        on.phase?.(ev.content_block?.type === "thinking" || ev.content_block?.type === "redacted_thinking" ? "thinking" : "writing");
      } else if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) {
        text += ev.delta.text;
        on.text(ev.delta.text);
      } else if (ev.type === "message_delta") {
        output = ev.usage?.output_tokens ?? output;
        thinking = ev.usage?.output_tokens_details?.thinking_tokens ?? thinking;
        stop = ev.delta?.stop_reason ?? stop;
        on.usage?.({ output });
      } else if (ev.type === "error") {
        throw new Error(`Claude API: ${ev.error?.message ?? "ошибка потока"}`);
      }
    }
  }
  if (stop === "max_tokens") text += CUT;
  return { text, inputTokens: input, outputTokens: output, cacheRead, model, thinkingTokens: thinking, stop };
}
