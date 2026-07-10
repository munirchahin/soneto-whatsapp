import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// GET /api/tags — lista todas as tags disponíveis
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("tags")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/tags — cria uma nova tag. Body: { nome: string, cor: string }
export async function POST(req: NextRequest) {
  try {
    const { nome, cor } = await req.json();
    if (!nome?.trim()) {
      return NextResponse.json({ error: "nome é obrigatório" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("tags")
      .insert({ nome: nome.trim(), cor: cor?.trim() || "#FFA300" })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "Já existe uma tag com esse nome" }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
