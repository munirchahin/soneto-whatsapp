import { NextResponse } from "next/server";
import { getWabaId } from "@/lib/whatsapp";

const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!;

export interface TemplateComponent {
  type: string;
  format?: string;
  text?: string;
  example?: { body_text?: string[][] };
}

export interface WaTemplate {
  id: string;
  name: string;
  status: "APPROVED" | "PENDING_REVIEW" | "IN_REVIEW" | "REJECTED" | "PAUSED";
  language: string;
  category: string;
  components: TemplateComponent[];
}

export async function GET() {
  try {
    // Prefer explicit env var; fallback to dynamic lookup from phone number
    const wabaId = process.env.WHATSAPP_WABA_ID || await getWabaId();

    const res = await fetch(
      `https://graph.facebook.com/v20.0/${wabaId}/message_templates` +
        `?fields=id,name,status,language,category,components&limit=100`,
      { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
    );

    const data = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(data));

    const templates: WaTemplate[] = (data.data ?? []).filter(
      (t: WaTemplate) => t.status !== "REJECTED"
    );

    return NextResponse.json(templates);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
