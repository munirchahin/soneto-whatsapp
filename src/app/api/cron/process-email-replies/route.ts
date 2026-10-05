import { NextRequest, NextResponse } from "next/server";
import { processarRespostasPorEmail } from "@/lib/email-replies";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/cron/process-email-replies — chamado periodicamente (GitHub Actions)
// para enviar no WhatsApp as respostas dadas por email às notificações.
export async function POST(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const processados = await processarRespostasPorEmail();
    return NextResponse.json({ ok: true, processados });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
