import { supabaseAdmin } from "@/lib/supabase";
import { sendWhatsAppTemplate, formatNumber } from "@/lib/whatsapp";

/** Envia um template WhatsApp para um contato e registra a mensagem enviada (aparece em Conversas). */
export async function enviarTemplateERegistrar(params: {
  numero: string;
  nome: string;
  templateName: string;
  templateLanguage: string;
  textoPreview: string;
}) {
  const numeroFormatado = formatNumber(params.numero);

  const wa = await sendWhatsAppTemplate(
    numeroFormatado,
    params.templateName,
    params.templateLanguage,
    [{ parameter_name: "nome", text: params.nome }]
  );

  await supabaseAdmin.from("mensagens").insert({
    numero: numeroFormatado,
    nome: params.nome || numeroFormatado,
    texto: params.textoPreview,
    direcao: "saida",
    wa_message_id: wa?.messages?.[0]?.id ?? null,
    timestamp: new Date().toISOString(),
  });

  return wa;
}
