import { NextResponse } from "next/server";
import { liveJob, startLive, type LiveJob } from "@/lib/server/live";

export const dynamic = "force-dynamic";

function view(j: LiveJob | null) {
  if (!j) return { state: "idle" as const };
  const now = j.finishedAt ?? Date.now();
  return {
    state: j.error ? "error" as const : j.finishedAt ? "done" as const : j.firstTokenAt ? "writing" as const : "thinking" as const,
    text: j.text, model: j.model, elapsed: now - j.startedAt, waitFirst: (j.firstTokenAt ?? now) - j.startedAt,
    inTokens: j.inTokens, outTokens: j.outTokens, expectedOut: j.expectedOut, maxOut: j.maxOut, error: j.error,
    cost: (j.inTokens * j.priceIn + j.outTokens * j.priceOut) / 1e6,
  };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const step = new URL(req.url).searchParams.get("step") ?? "";
  return NextResponse.json(view(liveJob(Number(id), step)), { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { step } = (await req.json()) as { step: string };
  try {
    return NextResponse.json(view(await startLive(Number(id), step)));
  } catch (e) {
    return NextResponse.json({ state: "error", error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
