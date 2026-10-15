import { NextResponse } from "next/server";
import { packageZip } from "@/lib/server/service";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let fileNames: string[] | null = null;
  try {
    const body = (await req.json()) as { fileNames?: string[] };
    fileNames = Array.isArray(body.fileNames) && body.fileNames.length ? body.fileNames : null;
  } catch { /* без тела — без проверки кадров */ }
  try {
    const { zip, name } = await packageZip(Number(id), fileNames);
    return new NextResponse(Buffer.from(zip), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
