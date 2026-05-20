import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// GET — verificação do webhook pelo Meta
export async function GET(req: NextRequest) {
  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN ?? "soneto_webhook_2024";
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

// POST — recebe mensagens do WhatsApp
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value) return NextResponse.json({ ok: true });

    // Processar mensagens recebidas
    const messages = value.messages ?? [];
    const contacts = value.contacts ?? [];

    for (const msg of messages) {
      if (msg.type !== "text") continue;

      const numero = msg.from;
      const texto = msg.text?.body ?? "";
      const wa_message_id = msg.id;

      // Buscar nome do contato
      const contato = contacts.find(
        (c: { wa_id: string }) => c.wa_id === numero
      );
      const nome = contato?.profile?.name ?? numero;

      await supabaseAdmin.from("mensagens").insert({
        numero,
        nome,
        texto,
        direcao: "entrada",
        wa_message_id,
        timestamp: new Date(parseInt(msg.timestamp) * 1000).toISOString(),
      });

      console.log(`📩 Nova mensagem de ${nome} (${numero}): ${texto}`);
    }

    // Processar status de entrega (apenas logar)
    const statuses = value.statuses ?? [];
    for (const status of statuses) {
      console.log(`📬 Status ${status.status} para msg ${status.id}`);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
