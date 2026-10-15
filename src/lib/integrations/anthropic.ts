import "server-only";

// Адаптер Claude API. Подключается одной переменной окружения ANTHROPIC_API_KEY.
// Конституция уходит в system с cache_control — повторные вызовы читают её из кеша
// (на Opus 5.5 и Sonnet 5.5 чтение кеша — 5% цены входа).

export type LLMResult = { text: string; inputTokens: number; outputTokens: number; cacheRead: number; model: string };

export function anthropicConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function anthropicGenerate(opts: { system: string; user: string; model: string; maxTokens: number }): Promise<LLMResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("Claude API не подключён: задай ANTHROPIC_API_KEY в .env.local");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
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
    throw new Error(`Claude API ${res.status}: ${body.slice(0, 400)}`);
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
