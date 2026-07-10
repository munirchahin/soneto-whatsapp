import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getWhatsAppMediaInfo, downloadWhatsAppMedia } from "@/lib/whatsapp";
import { notifyNewMessage } from "@/lib/email";

// GET — verificação do webhook pelo Meta
export async function GET(req: NextRequest) {
  const VERIFY_TOKEN = (process.env.WHATSAPP_VERIFY_TOKEN || "soneto_webhook_2024").trim();
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

// ── Media types supported by WhatsApp Cloud API ───────────────────────────────
type MediaType = "image" | "video" | "audio" | "document" | "sticker";

/** Mime type → file extension */
function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
    "video/mp4": "mp4", "video/3gpp": "3gp",
    "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/aac": "aac",
    "audio/ogg; codecs=opus": "ogg",
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "image/webp; codecs=vp8": "webp", // sticker
  };
  return map[mime] ?? mime.split("/")[1] ?? "bin";
}

/**
 * Encode media as a text marker stored in the `texto` column.
 * Format: __MEDIA__{type}__{url}__{extra}
 * extra = caption for image/video, filename for document, empty otherwise
 */
function encodeMediaTexto(type: string, url: string, extra = ""): string {
  return `__MEDIA__${type}__${url}__${extra}`;
}

/** Upload media buffer to Supabase Storage and return the public URL */
async function uploadMedia(
  buffer: Buffer,
  contentType: string,
  path: string
): Promise<string> {
  const { error } = await supabaseAdmin.storage
    .from("whatsapp-media")
    .upload(path, buffer, { contentType, upsert: true });

  if (error) throw new Error("uploadMedia: " + error.message);

  const { data } = supabaseAdmin.storage
    .from("whatsapp-media")
    .getPublicUrl(path);

  return data.publicUrl;
}

/** Download WhatsApp media and upload to Supabase Storage. Returns public URL. */
async function handleMediaMessage(
  mediaId: string,
  mediaType: MediaType,
  filename?: string
): Promise<string> {
  const { url: cdnUrl, mime_type } = await getWhatsAppMediaInfo(mediaId);
  const { buffer, contentType } = await downloadWhatsAppMedia(cdnUrl);

  const ext = filename ? filename.split(".").pop() : mimeToExt(mime_type || contentType);
  const safeFilename = filename ?? `${mediaId}.${ext}`;
  const path = `${mediaType}/${safeFilename}`;

  return uploadMedia(buffer, contentType, path);
}

// Decodifica o corpo de uma mensagem recebida em texto legível.
// Sempre retorna algo útil — nunca descarta os dados originais, mesmo para
// tipos ainda não mapeados explicitamente.
async function decodeMessageText(msg: Record<string, unknown>): Promise<string> {
  const type = msg.type as string;

  switch (type) {
    case "text":
      return (msg.text as { body?: string })?.body ?? "";

    case "image": {
      try {
        const image = msg.image as { id: string; caption?: string };
        const publicUrl = await handleMediaMessage(image.id, "image");
        return encodeMediaTexto("image", publicUrl, image.caption ?? "");
      } catch (e) {
        return `[Imagem não disponível: ${e}]`;
      }
    }

    case "video": {
      try {
        const video = msg.video as { id: string; caption?: string };
        const publicUrl = await handleMediaMessage(video.id, "video");
        return encodeMediaTexto("video", publicUrl, video.caption ?? "");
      } catch (e) {
        return `[Vídeo não disponível: ${e}]`;
      }
    }

    case "audio": {
      try {
        const audio = msg.audio as { id: string };
        const publicUrl = await handleMediaMessage(audio.id, "audio");
        return encodeMediaTexto("audio", publicUrl, "");
      } catch (e) {
        return `[Áudio não disponível: ${e}]`;
      }
    }

    case "document": {
      try {
        const document = msg.document as { id: string; filename?: string };
        const filename = document.filename ?? `doc_${document.id}`;
        const publicUrl = await handleMediaMessage(document.id, "document", filename);
        return encodeMediaTexto("document", publicUrl, filename);
      } catch (e) {
        return `[Documento não disponível: ${e}]`;
      }
    }

    case "sticker": {
      try {
        const sticker = msg.sticker as { id: string };
        const publicUrl = await handleMediaMessage(sticker.id, "sticker");
        return encodeMediaTexto("sticker", publicUrl, "");
      } catch (e) {
        return `[Sticker não disponível: ${e}]`;
      }
    }

    case "location": {
      const { latitude, longitude, name, address } =
        (msg.location as { latitude?: number; longitude?: number; name?: string; address?: string }) ?? {};
      return `📍 ${name ?? "Localização"}\n${address ?? ""}\nhttps://maps.google.com/?q=${latitude},${longitude}`;
    }

    // ── Reação a uma mensagem (emoji) ───────────────────────
    case "reaction": {
      const reaction = msg.reaction as { emoji?: string; message_id?: string };
      return reaction?.emoji
        ? `${reaction.emoji} (reagiu a uma mensagem)`
        : "(removeu a reação a uma mensagem)";
    }

    // ── Contato compartilhado ────────────────────────────────
    case "contacts": {
      const shared = (msg.contacts as { name?: { formatted_name?: string }; phones?: { phone?: string }[] }[]) ?? [];
      const linhas = shared.map((c) => {
        const nomeContato = c.name?.formatted_name ?? "Contato";
        const telefones = (c.phones ?? []).map((p) => p.phone).filter(Boolean).join(", ");
        return telefones ? `${nomeContato} — ${telefones}` : nomeContato;
      });
      return `📇 Contato compartilhado:\n${linhas.join("\n")}`;
    }

    // ── Clique em botão de template (quick reply) ───────────
    case "button": {
      const button = msg.button as { text?: string; payload?: string };
      return `[Botão] ${button?.text ?? button?.payload ?? ""}`;
    }

    // ── Resposta a mensagem interativa (lista/botão) ────────
    case "interactive": {
      const interactive = msg.interactive as {
        type?: string;
        button_reply?: { title?: string };
        list_reply?: { title?: string; description?: string };
      };
      if (interactive?.type === "button_reply") {
        return `[Botão] ${interactive.button_reply?.title ?? ""}`;
      }
      if (interactive?.type === "list_reply") {
        return `[Lista] ${interactive.list_reply?.title ?? ""}${
          interactive.list_reply?.description ? ` — ${interactive.list_reply.description}` : ""
        }`;
      }
      return `[Interativo: ${JSON.stringify(interactive).slice(0, 200)}]`;
    }

    // ── Pedido via catálogo ──────────────────────────────────
    case "order": {
      const order = msg.order as { product_items?: unknown[] };
      return `🛒 Pedido via catálogo (${order?.product_items?.length ?? 0} item(ns))`;
    }

    // ── Notificação de sistema (ex.: troca de número) ───────
    case "system": {
      const system = msg.system as { body?: string };
      return `ℹ️ ${system?.body ?? "Notificação do sistema"}`;
    }

    // ── Qualquer tipo ainda não mapeado: nunca descartar os
    // dados — preserva um dump legível para investigação manual.
    default:
      return `[Mensagem tipo "${type}" não mapeada: ${JSON.stringify(msg).slice(0, 500)}]`;
  }
}

async function processValue(value: {
  messages?: Record<string, unknown>[];
  contacts?: { wa_id: string; profile?: { name?: string } }[];
  statuses?: { status: string; id: string }[];
}) {
  const messages = value.messages ?? [];
  const contacts = value.contacts ?? [];

  for (const msg of messages) {
    try {
      const numero = msg.from as string;
      const wa_message_id = msg.id as string;
      const timestamp = new Date(parseInt(msg.timestamp as string) * 1000).toISOString();

      const contato = contacts.find((c) => c.wa_id === numero);
      const nome: string = contato?.profile?.name ?? numero;

      const texto = await decodeMessageText(msg);

      await supabaseAdmin.from("mensagens").insert({
        numero,
        nome,
        texto,
        direcao: "entrada",
        wa_message_id,
        timestamp,
      });

      console.log(`📩 ${nome} (${numero}) [${msg.type}]: ${texto.slice(0, 80)}`);

      // Notifica por email (não derruba o webhook se o envio falhar)
      try {
        await notifyNewMessage(nome, numero, texto);
      } catch (e) {
        console.error("Falha ao notificar por email:", e);
      }
    } catch (e) {
      // Uma mensagem malformada não pode derrubar o resto do lote.
      console.error("Falha ao processar mensagem individual do webhook:", e, msg);
    }
  }

  // Status de entrega
  const statuses = value.statuses ?? [];
  for (const status of statuses) {
    console.log(`📬 Status ${status.status} para msg ${status.id}`);
  }
}

// POST — recebe mensagens do WhatsApp
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // A Meta pode enviar múltiplos "entry" e múltiplos "changes" em uma
    // única chamada (ex.: rajada de respostas após um disparo em massa).
    // Processar só entry[0]/changes[0] descartaria o resto silenciosamente.
    const entries = body?.entry ?? [];
    for (const entry of entries) {
      const changes = entry?.changes ?? [];
      for (const change of changes) {
        if (change?.value) await processValue(change.value);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
