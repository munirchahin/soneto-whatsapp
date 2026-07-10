import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// POST /api/contacts/[numero]/tags — Body: { tag_id: string }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ numero: string }> }
) {
  try {
    const { numero } = await params;
    const { tag_id } = await req.json();
    if (!tag_id) {
      return NextResponse.json({ error: "tag_id é obrigatório" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("contato_tags")
      .upsert({ numero, tag_id }, { onConflict: "numero,tag_id" });

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/contacts/[numero]/tags — Body: { tag_id: string }
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ numero: string }> }
) {
  try {
    const { numero } = await params;
    const { tag_id } = await req.json();
    if (!tag_id) {
      return NextResponse.json({ error: "tag_id é obrigatório" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("contato_tags")
      .delete()
      .eq("numero", numero)
      .eq("tag_id", tag_id);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
