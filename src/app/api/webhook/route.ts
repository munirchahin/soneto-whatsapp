import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getWhatsAppMediaInfo, downloadWhatsAppMedia } from "@/lib/whatsapp";

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

// POST — recebe mensagens do WhatsApp
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value) return NextResponse.json({ ok: true });

    const messages = value.messages ?? [];
    const contacts = value.contacts ?? [];

    for (const msg of messages) {
      const numero: string = msg.from;
      const wa_message_id: string = msg.id;
      const timestamp = new Date(parseInt(msg.timestamp) * 1000).toISOString();

      const contato = contacts.find((c: { wa_id: string }) => c.wa_id === numero);
      const nome: string = contato?.profile?.name ?? numero;

      let texto = "";

      // ── Text ───────────────────────────────────────────────
      if (msg.type === "text") {
        texto = msg.text?.body ?? "";

      // ── Image ──────────────────────────────────────────────
      } else if (msg.type === "image") {
        try {
          const publicUrl = await handleMediaMessage(msg.image.id, "image");
          const caption = msg.image?.caption ?? "";
          texto = encodeMediaTexto("image", publicUrl, caption);
        } catch (e) {
          texto = `[Imagem não disponível: ${e}]`;
        }

      // ── Video ──────────────────────────────────────────────
      } else if (msg.type === "video") {
        try {
          const publicUrl = await handleMediaMessage(msg.video.id, "video");
          const caption = msg.video?.caption ?? "";
          texto = encodeMediaTexto("video", publicUrl, caption);
        } catch (e) {
          texto = `[Vídeo não disponível: ${e}]`;
        }

      // ── Audio / Voice ──────────────────────────────────────
      } else if (msg.type === "audio") {
        try {
          const publicUrl = await handleMediaMessage(msg.audio.id, "audio");
          texto = encodeMediaTexto("audio", publicUrl, "");
        } catch (e) {
          texto = `[Áudio não disponível: ${e}]`;
        }

      // ── Document ───────────────────────────────────────────
      } else if (msg.type === "document") {
        try {
          const filename = msg.document?.filename ?? `doc_${msg.document.id}`;
          const publicUrl = await handleMediaMessage(msg.document.id, "document", filename);
          texto = encodeMediaTexto("document", publicUrl, filename);
        } catch (e) {
          texto = `[Documento não disponível: ${e}]`;
        }

      // ── Sticker ────────────────────────────────────────────
      } else if (msg.type === "sticker") {
        try {
          const publicUrl = await handleMediaMessage(msg.sticker.id, "sticker");
          texto = encodeMediaTexto("sticker", publicUrl, "");
        } catch (e) {
          texto = `[Sticker não disponível: ${e}]`;
        }

      // ── Location ───────────────────────────────────────────
      } else if (msg.type === "location") {
        const { latitude, longitude, name, address } = msg.location ?? {};
        texto = `📍 ${name ?? "Localização"}\n${address ?? ""}\nhttps://maps.google.com/?q=${latitude},${longitude}`;

      // ── Unsupported ────────────────────────────────────────
      } else {
        texto = `[Tipo de mensagem não suportado: ${msg.type}]`;
      }

      await supabaseAdmin.from("mensagens").insert({
        numero,
        nome,
        texto,
        direcao: "entrada",
        wa_message_id,
        timestamp,
      });

      console.log(`📩 ${nome} (${numero}) [${msg.type}]: ${texto.slice(0, 80)}`);
    }

    // Status de entrega
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
