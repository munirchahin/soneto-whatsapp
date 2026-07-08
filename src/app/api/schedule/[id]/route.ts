import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// DELETE /api/schedule/[id] — cancela um agendamento (só é possível enquanto "pendente")
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { data, error } = await supabaseAdmin
      .from("agendamentos")
      .update({ status: "cancelado" })
      .eq("id", id)
      .eq("status", "pendente")
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { error: "agendamento não encontrado ou já está em andamento/concluído" },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
