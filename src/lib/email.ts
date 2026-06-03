import nodemailer from "nodemailer";

const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const EMAIL_TO = process.env.EMAIL_TO || "munir@chahinadv.com.br";
const PAINEL_URL = "https://sonetomoveis.com.br/whatsapp-pos-venda/";

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

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  await transporter.sendMail({
    from: { name: `Soneto - ${nome}`, address: SMTP_USER },
    to: EMAIL_TO,
    subject: `Nova mensagem WhatsApp — ${nome}`,
    text:
      `${nome} (${numero}) enviou uma mensagem no WhatsApp:\n\n` +
      `${corpoLegivel(texto)}\n\n` +
      `Responder no painel:\n${PAINEL_URL}`,
  });

  console.log(`✉️  Notificação enviada para ${EMAIL_TO}`);
}
