import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { enviarTemplateERegistrar } from "@/lib/disparo";

export const runtime = "nodejs";
export const maxDuration = 60;

// Espaçamento entre envios (evita bloqueio por spam da Meta) e teto de envios
// por chamada, para caber no tempo de execução da function.
const DELAY_MS = 500;
const MAX_ENVIOS_POR_TICK = 60;

interface ContatoAgendado {
  nome: string;
  numero: string;
  texto_preview: string;
  status: "pendente" | "ok" | "erro";
  erro?: string;
}

interface AgendamentoRow {
  id: string;
  contatos: ContatoAgendado[];
  template_name: string;
  template_language: string;
}

// POST /api/cron/process-scheduled — chamado periodicamente (GitHub Actions) para
// processar disparos agendados cujo horário já venceu.
export async function POST(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: agendamentos, error } = await supabaseAdmin
    .from("agendamentos")
    .select("*")
    .in("status", ["pendente", "processando"])
    .lte("agendado_para", new Date().toISOString())
    .order("agendado_para", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let enviosRestantes = MAX_ENVIOS_POR_TICK;
  const resumo: { id: string; enviados: number; erros: number; concluido: boolean }[] = [];

  for (const agendamento of (agendamentos ?? []) as AgendamentoRow[]) {
    if (enviosRestantes <= 0) break;

    const contatos = agendamento.contatos;
    let enviados = 0;
    let erros = 0;

    for (let i = 0; i < contatos.length; i++) {
      if (contatos[i].status !== "pendente") {
        if (contatos[i].status === "ok") enviados++;
        if (contatos[i].status === "erro") erros++;
        continue;
      }
      if (enviosRestantes <= 0) break;

      try {
        await enviarTemplateERegistrar({
          numero: contatos[i].numero,
          nome: contatos[i].nome,
          templateName: agendamento.template_name,
          templateLanguage: agendamento.template_language,
          textoPreview: contatos[i].texto_preview,
        });
        contatos[i] = { ...contatos[i], status: "ok" };
        enviados++;
      } catch (e) {
        contatos[i] = { ...contatos[i], status: "erro", erro: String(e) };
        erros++;
      }
      enviosRestantes--;

      // Salva progresso a cada envio para não perder trabalho se a function for interrompida.
      await supabaseAdmin
        .from("agendamentos")
        .update({ contatos, status: "processando" })
        .eq("id", agendamento.id);

      if (enviosRestantes > 0) await new Promise((r) => setTimeout(r, DELAY_MS));
    }

    const concluido = contatos.every((c) => c.status !== "pendente");
    if (concluido) {
      await supabaseAdmin
        .from("agendamentos")
        .update({ status: "concluido", processado_em: new Date().toISOString() })
        .eq("id", agendamento.id);
    }

    resumo.push({ id: agendamento.id, enviados, erros, concluido });
  }

  return NextResponse.json({ ok: true, processados: resumo });
}
