import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ number: string }> }
) {
  try {
    const { number } = await params;
    const { data, error } = await supabaseAdmin
      .from("mensagens")
      .select("*")
      .eq("numero", number)
      .order("timestamp", { ascending: true });

    if (error) throw error;

    // Marcar mensagens de entrada como lidas
    await supabaseAdmin
      .from("mensagens")
      .update({ lida: true })
      .eq("numero", number)
      .eq("direcao", "entrada")
      .eq("lida", false);

    return NextResponse.json(data ?? []);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
