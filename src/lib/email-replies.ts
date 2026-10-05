import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import { supabaseAdmin } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { createTransport, numeroFromReplyAddress } from "@/lib/email";

const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const EMAIL_TO = process.env.EMAIL_TO || "munir@chahinadv.com.br";

// Só olha emails recentes — respostas antigas que não foram processadas
// provavelmente já caíram fora da janela de 24h do WhatsApp.
const JANELA_BUSCA_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * Remove o histórico citado que os clientes de email anexam à resposta
 * ("Em ... escreveu:", linhas com ">", assinatura "-- ").
 */
export function extrairResposta(texto: string): string {
  const linhas = texto.replace(/\r\n/g, "\n").split("\n");
  const saida: string[] = [];
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    const l = linha.trim();
    if (l.startsWith(">")) break;
    if (l === "--" || l === "-- ") break;
    // O cabeçalho da citação pode vir quebrado em até 3 linhas (ex.: Gmail).
    const cabecalho = linhas.slice(i, i + 3).map((x) => x.trim());
    if ([1, 2, 3].some((n) => /^(Em|On)\s.+(escreveu|wrote):?$/i.test(cabecalho.slice(0, n).join(" ")))) break;
    if (/^-{2,}\s*(Mensagem original|Original Message)/i.test(l)) break;
    if (/^De:\s|^From:\s/.test(l) && saida.length > 0) break;
    saida.push(linha);
  }
  return saida.join("\n").trim();
}

/**
 * Confere que o email veio de fato do EMAIL_TO: o Gmail grava em
 * Authentication-Results se o domínio do remetente passou em DKIM/SPF.
 */
function remetenteAutenticado(mail: ParsedMail): boolean {
  const from = mail.from?.value?.[0]?.address?.toLowerCase();
  if (from !== EMAIL_TO.toLowerCase()) return false;

  const dominio = from.split("@")[1];
  const raw = mail.headers.get("authentication-results");
  const results = (Array.isArray(raw) ? raw : [raw]).map(String).join(" ").toLowerCase();
  const dkimOk = new RegExp(`dkim=pass[^;]*header\\.i=[^\\s;]*@${dominio.replace(/\./g, "\\.")}`).test(results);
  const spfOk = new RegExp(`spf=pass[^;]*smtp\\.mailfrom=[^\\s;]*@?${dominio.replace(/\./g, "\\.")}`).test(results);
  return dkimOk || spfOk;
}

function destinatarios(mail: ParsedMail): string[] {
  const campos = [mail.to, mail.cc].flatMap((c) => (c ? (Array.isArray(c) ? c : [c]) : []));
  return campos.flatMap((c) => c.value.map((v) => v.address ?? ""));
}

async function avisarFalha(assunto: string, texto: string) {
  await createTransport().sendMail({
    from: { name: "Soneto WhatsApp", address: SMTP_USER },
    to: EMAIL_TO,
    subject: assunto,
    text: texto,
  });
}

type Resultado = { uid: number; numero: string; status: "enviado" | "erro"; erro?: string };

/**
 * Lê a caixa do SMTP_USER via IMAP, encontra respostas aos emails de
 * notificação e envia o texto da resposta para o contato no WhatsApp.
 */
export async function processarRespostasPorEmail(): Promise<Resultado[]> {
  if (!SMTP_USER || !SMTP_PASS) throw new Error("SMTP não configurado");

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    logger: false,
  });

  const resultados: Resultado[] = [];
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const uids =
      (await client.search({ seen: false, since: new Date(Date.now() - JANELA_BUSCA_MS) }, { uid: true })) || [];
    if (uids.length === 0) return resultados;

    // Filtra pelo envelope antes de baixar o corpo — a caixa pode ter
    // muitos outros emails não lidos que não nos interessam.
    const candidatos: { uid: number; numero: string }[] = [];
    for await (const msg of client.fetch(uids, { envelope: true }, { uid: true })) {
      const enderecos = [...(msg.envelope?.to ?? []), ...(msg.envelope?.cc ?? [])].map((a) => a.address ?? "");
      const numero = enderecos.map(numeroFromReplyAddress).find(Boolean);
      if (numero) candidatos.push({ uid: msg.uid, numero });
    }

    for (const { uid, numero } of candidatos) {
      const fetched = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!fetched || !fetched.source) continue;
      const mail = await simpleParser(fetched.source);

      // Marca como lido já: nunca reenviar a mesma resposta, mesmo se algo falhar abaixo.
      await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });

      if (!destinatarios(mail).some((a) => numeroFromReplyAddress(a) === numero)) continue;
      if (!remetenteAutenticado(mail)) {
        console.warn(`✉️  Resposta por email ignorada (remetente não autenticado): ${mail.from?.text}`);
        continue;
      }

      const texto = extrairResposta(mail.text ?? "");
      if (!texto) continue;

      try {
        const wa = await sendWhatsAppMessage(numero, texto);
        const { data: ultima } = await supabaseAdmin
          .from("mensagens")
          .select("nome")
          .eq("numero", numero)
          .order("timestamp", { ascending: false })
          .limit(1)
          .maybeSingle();
        await supabaseAdmin.from("mensagens").insert({
          numero,
          nome: ultima?.nome ?? numero,
          texto,
          direcao: "saida",
          wa_message_id: wa?.messages?.[0]?.id ?? null,
          timestamp: new Date().toISOString(),
        });
        console.log(`✉️ → 📤 Resposta por email enviada para ${numero}`);
        resultados.push({ uid, numero, status: "enviado" });
      } catch (e) {
        const erro = e instanceof Error ? e.message : String(e);
        console.error(`Falha ao enviar resposta por email para ${numero}:`, erro);
        resultados.push({ uid, numero, status: "erro", erro });
        await avisarFalha(
          `⚠️ Resposta NÃO enviada no WhatsApp — ${numero}`,
          `Sua resposta por email não pôde ser enviada para ${numero} no WhatsApp.\n\n` +
            `Texto:\n${texto}\n\n` +
            `Erro: ${erro}\n\n` +
            `Se passaram mais de 24h desde a última mensagem do cliente, o WhatsApp ` +
            `só permite enviar um template pelo painel.`
        ).catch((err) => console.error("Falha ao avisar erro por email:", err));
      }
    }
  } finally {
    lock.release();
    await client.logout();
  }
  return resultados;
}
