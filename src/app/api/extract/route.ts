import { NextRequest, NextResponse } from "next/server";
import { getDocumentProxy } from "unpdf";
import { formatNumber } from "@/lib/whatsapp";

export const runtime = "nodejs";

// Celular no relatório Soneto: "(11) 99530-5521", "(98) 98752-1991", "(11) 9910-1319"
const PHONE_RE = /\((\d{2})\)\s*(\d{4,5})[-\s]?(\d{4})/;

interface TextItem {
  str: string;
  transform: number[];
}

/**
 * POST /api/extract — recebe um PDF (campo "arquivo") no formato do relatório
 * Soneto e devolve os pares Nome + Número extraídos.
 * Resposta: { ok, contatos: [{nome, numero}], texto: "Nome, 55DDDNUM\n..." }
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("arquivo");
    if (!file || typeof file === "string") {
      return NextResponse.json(
        { ok: false, error: "nenhum arquivo enviado" },
        { status: 400 }
      );
    }

    const buffer = new Uint8Array(await file.arrayBuffer());
    const pdf = await getDocumentProxy(buffer);

    // Reconstrói as linhas da tabela agrupando os itens de texto pela posição Y
    const linhas: string[] = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const items = content.items as TextItem[];

      const rows = new Map<number, { x: number; s: string }[]>();
      for (const it of items) {
        if (!it.str || !it.str.trim()) continue;
        const y = Math.round(it.transform[5]);
        const x = it.transform[4];
        if (!rows.has(y)) rows.set(y, []);
        rows.get(y)!.push({ x, s: it.str });
      }

      for (const y of [...rows.keys()].sort((a, b) => b - a)) {
        const linha = rows
          .get(y)!
          .sort((a, b) => a.x - b.x)
          .map((i) => i.s)
          .join(" ");
        linhas.push(linha);
      }
    }

    const seen = new Set<string>();
    const contatos: { nome: string; numero: string }[] = [];
    for (const linha of linhas) {
      const m = PHONE_RE.exec(linha);
      if (!m || m.index === undefined) continue;
      const nome = linha.slice(0, m.index).replace(/\s+/g, " ").trim();
      if (!nome || /^nome$/i.test(nome) || /celular/i.test(nome)) continue;
      const numero = formatNumber(`${m[1]}${m[2]}${m[3]}`);
      const chave = `${nome.toUpperCase()}|${numero}`;
      if (seen.has(chave)) continue;
      seen.add(chave);
      contatos.push({ nome, numero });
    }

    const texto = contatos.map((c) => `${c.nome}, ${c.numero}`).join("\n");
    return NextResponse.json({ ok: true, contatos, texto });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: `falha ao ler o PDF: ${msg}` },
      { status: 400 }
    );
  }
}
