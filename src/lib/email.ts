import { createHmac, timingSafeEqual } from "crypto";
import nodemailer from "nodemailer";

const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const EMAIL_TO = process.env.EMAIL_TO || "munir@chahinadv.com.br";
const PAINEL_URL = "https://sonetomoveis.com.br/whatsapp-pos-venda/";

// Respostas ao email de notificação voltam para um endereço "plus" do próprio
// SMTP_USER (ex.: fulano+wa-5511999999999-1a2b3c4d5e6f@gmail.com). O número do
// contato vai no endereço e o HMAC impede que alguém forje um envio só por
// conhecer o formato.
const REPLY_TAG = /\+wa-(\d{8,15})-([0-9a-f]{12})@/i;

function replyToken(numero: string): string {
  return createHmac("sha256", SMTP_PASS).update(numero).digest("hex").slice(0, 12);
}

export function replyAddress(numero: string): string {
  const [local, domain] = SMTP_USER.split("@");
  return `${local}+wa-${numero}-${replyToken(numero)}@${domain}`;
}

/** Extrai e valida o número do contato a partir do endereço de resposta. */
export function numeroFromReplyAddress(address: string): string | null {
  const m = address.match(REPLY_TAG);
  if (!m) return null;
  const [, numero, token] = m;
  const esperado = Buffer.from(replyToken(numero));
  const recebido = Buffer.from(token.toLowerCase());
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido) ? numero : null;
}

export function createTransport() {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

/** Turn the stored `texto` (which may be a __MEDIA__ marker) into a human label. */
function corpoLegivel(texto: string): string {
  const m = texto.match(/^__MEDIA__(\w+)__(.+?)__([\s\S]*)$/);
  if (!m) return texto;
  const [, type, , extra] = m;
  const labels: Record<string, string> = {
    image: "📷 Imagem",
    video: "🎥 Vídeo",
    audio: "🎤 Áudio",
    document: "📄 Documento",
    sticker: "💟 Figurinha",
  };
  const base = labels[type] ?? `[${type}]`;
  return extra ? `${base} — ${extra}` : base;
}

/**
 * Notifica por email que uma nova mensagem foi recebida no WhatsApp.
 * O remetente aparece como "Soneto - {nome do cliente}".
 * Silencioso (apenas loga) se o SMTP não estiver configurado ou falhar.
 */
export async function notifyNewMessage(
  nome: string,
  numero: string,
  texto: string
): Promise<void> {
  if (!SMTP_USER || !SMTP_PASS) {
    console.warn("SMTP não configurado — email de notificação ignorado.");
    return;
  }

  await createTransport().sendMail({
    from: { name: `Soneto - ${nome}`, address: SMTP_USER },
    to: EMAIL_TO,
    replyTo: { name: `Soneto - ${nome}`, address: replyAddress(numero) },
    subject: `Nova mensagem WhatsApp — ${nome}`,
    text:
      `${nome} (${numero}) enviou uma mensagem no WhatsApp:\n\n` +
      `${corpoLegivel(texto)}\n\n` +
      `Responda este email para enviar sua resposta ao cliente pelo WhatsApp,\n` +
      `ou responda no painel:\n${PAINEL_URL}`,
  });

  console.log(`✉️  Notificação enviada para ${EMAIL_TO}`);
}
