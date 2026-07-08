import { NextRequest, NextResponse } from "next/server";
import { enviarTemplateERegistrar } from "@/lib/disparo";

// POST /api/broadcast
// Body: {
//   numero: string,
//   nome: string,
//   template_name: string,
//   template_language: string,   // e.g. "pt_BR"
//   texto_preview: string        // rendered text to save in DB (for Conversas tab)
// }
export async function POST(req: NextRequest) {
  try {
    const { numero, nome, template_name, template_language, texto_preview } =
      await req.json();

    if (!numero || !template_name) {
      return NextResponse.json(
        { error: "numero e template_name são obrigatórios" },
        { status: 400 }
      );
    }

    const wa = await enviarTemplateERegistrar({
      numero,
      nome: nome ?? numero,
      templateName: template_name,
      templateLanguage: template_language ?? "pt_BR",
      textoPreview: texto_preview ?? `[Template: ${template_name}]`,
    });

    return NextResponse.json({ ok: true, wa });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
