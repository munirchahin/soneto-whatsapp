import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// POST /api/schedule
// Body: {
//   contatos: { nome: string, numero: string, texto_preview: string }[],
//   template_name: string,
//   template_language: string,
//   agendado_para: string   // ISO datetime (UTC), deve ser no futuro
// }
export async function POST(req: NextRequest) {
  try {
    const { contatos, template_name, template_language, agendado_para } = await req.json();

    if (!Array.isArray(contatos) || contatos.length === 0 || !template_name || !agendado_para) {
      return NextResponse.json(
        { error: "contatos, template_name e agendado_para são obrigatórios" },
        { status: 400 }
      );
    }

    const agendadoParaDate = new Date(agendado_para);
    if (Number.isNaN(agendadoParaDate.getTime()) || agendadoParaDate.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: "agendado_para deve ser uma data/hora futura" },
        { status: 400 }
      );
    }

    const contatosComStatus = contatos.map((c: { nome: string; numero: string; texto_preview: string }) => ({
      nome: c.nome,
      numero: c.numero,
      texto_preview: c.texto_preview ?? "",
      status: "pendente" as const,
    }));

    const { data, error } = await supabaseAdmin
      .from("agendamentos")
      .insert({
        contatos: contatosComStatus,
        template_name,
        template_language: template_language ?? "pt_BR",
        agendado_para: agendadoParaDate.toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, agendamento: data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET /api/schedule — lista agendamentos pendentes/em andamento
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("agendamentos")
      .select("*")
      .in("status", ["pendente", "processando"])
      .order("agendado_para", { ascending: true });

    if (error) throw error;

    return NextResponse.json(data ?? []);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
