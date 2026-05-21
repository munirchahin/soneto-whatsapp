import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendWhatsAppTemplate, formatNumber } from "@/lib/whatsapp";

// POST /api/broadcast
// Body: {
//   numero: string,
//   nome: string,
//   template_name: string,
//   template_language: string,   // e.g. "pt_BR"
//   body_parameters: string[],   // ordered list of {{1}}, {{2}}... values
//   texto_preview: string        // rendered text to save in DB (for Conversas tab)
// }
export async function POST(req: NextRequest) {
  try {
    const { numero, nome, template_name, template_language, body_parameters, texto_preview } =
      await req.json();

    if (!numero || !template_name) {
      return NextResponse.json(
        { error: "numero e template_name são obrigatórios" },
        { status: 400 }
      );
    }

    const numeroFormatado = formatNumber(numero);

    // body_parameters accepts string[] (positional) or {parameter_name,text}[] (named)
    const wa = await sendWhatsAppTemplate(
      numeroFormatado,
      template_name,
      template_language ?? "pt_BR",
      body_parameters ?? []
    );

    // Save as outgoing message so it appears in Conversas
    await supabaseAdmin.from("mensagens").insert({
      numero: numeroFormatado,
      nome: nome ?? numeroFormatado,
      texto: texto_preview ?? `[Template: ${template_name}]`,
      direcao: "saida",
      wa_message_id: wa?.messages?.[0]?.id ?? null,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, wa });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
