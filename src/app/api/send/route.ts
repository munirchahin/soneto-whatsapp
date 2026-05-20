import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendWhatsAppMessage, formatNumber } from "@/lib/whatsapp";

export async function POST(req: NextRequest) {
  try {
    const { numero, texto, nome } = await req.json();
    if (!numero || !texto) {
      return NextResponse.json(
        { error: "numero e texto são obrigatórios" },
        { status: 400 }
      );
    }

    const numeroFormatado = formatNumber(numero);
    const wa = await sendWhatsAppMessage(numeroFormatado, texto);

    await supabaseAdmin.from("mensagens").insert({
      numero: numeroFormatado,
      nome: nome ?? numeroFormatado,
      texto,
      direcao: "saida",
      wa_message_id: wa?.messages?.[0]?.id ?? null,
    });

    return NextResponse.json({ ok: true, wa });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
