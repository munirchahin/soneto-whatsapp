import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  try {
    // Busca o último estado de cada contato
    const { data, error } = await supabaseAdmin.rpc("get_contatos");

    if (error) {
      // Fallback: query manual se a função não existir ainda
      const { data: msgs, error: err2 } = await supabaseAdmin
        .from("mensagens")
        .select("numero, nome, texto, timestamp, lida, direcao")
        .order("timestamp", { ascending: false });

      if (err2) throw err2;

      // Agrupar por número (último de cada)
      const map = new Map<
        string,
        {
          numero: string;
          nome: string;
          ultima_mensagem: string;
          ultimo_timestamp: string;
          nao_lidas: number;
        }
      >();

      for (const m of msgs ?? []) {
        if (!map.has(m.numero)) {
          map.set(m.numero, {
            numero: m.numero,
            nome: m.nome,
            ultima_mensagem: m.texto,
            ultimo_timestamp: m.timestamp,
            nao_lidas: 0,
          });
        }
        if (m.direcao === "entrada" && !m.lida) {
          const c = map.get(m.numero)!;
          c.nao_lidas++;
          map.set(m.numero, c);
        }
      }

      const contatos = Array.from(map.values()).sort(
        (a, b) =>
          new Date(b.ultimo_timestamp).getTime() -
          new Date(a.ultimo_timestamp).getTime()
      );

      return NextResponse.json(contatos);
    }

    return NextResponse.json(data ?? []);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
