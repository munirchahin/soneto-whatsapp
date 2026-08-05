import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// POST /api/contacts/[numero]/block — bloqueia o número (descarta mensagens recebidas dele)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ numero: string }> }
) {
  try {
    const { numero } = await params;
    const { error } = await supabaseAdmin
      .from("numeros_bloqueados")
      .upsert({ numero }, { onConflict: "numero" });

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/contacts/[numero]/block — desbloqueia o número
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ numero: string }> }
) {
  try {
    const { numero } = await params;
    const { error } = await supabaseAdmin
      .from("numeros_bloqueados")
      .delete()
      .eq("numero", numero);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
