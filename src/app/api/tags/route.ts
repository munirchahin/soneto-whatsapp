import { NextResponse } from "next/server";
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
