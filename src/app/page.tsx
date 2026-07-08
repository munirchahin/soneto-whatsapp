"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

// When embedded in WordPress with admin bar, receive offset via postMessage
// WordPress HTML widget sends: postMessage({ type: 'adminBarHeight', height: 32 }, '*')
function useAdminBarOffset() {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    // If in iframe, apply 32px default (WP admin bar) as safe fallback
    const inIframe = window.self !== window.top;
    if (inIframe) setOffset(32);
    // Listen for precise height from parent
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "adminBarHeight" && typeof e.data.height === "number") {
        setOffset(e.data.height);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);
  return offset;
}

interface Mensagem {
  id: number;
  numero: string;
  nome: string;
  texto: string;
  direcao: "entrada" | "saida";
  timestamp: string;
  lida: boolean;
}

interface Contato {
  numero: string;
  nome: string;
  ultima_mensagem: string;
  ultimo_timestamp: string;
  nao_lidas: number;
}

interface ContatoDisparo {
  nome: string;
  numero: string;
  status: "pendente" | "enviando" | "ok" | "erro";
  erro?: string;
}

interface Agendamento {
  id: string;
  contatos: { nome: string; numero: string; status: "pendente" | "ok" | "erro" }[];
  template_name: string;
  template_language: string;
  agendado_para: string;
  status: "pendente" | "processando" | "concluido" | "cancelado";
}

interface WaTemplate {
  id: string;
  name: string;
  status: "APPROVED" | "PENDING_REVIEW" | "IN_REVIEW" | "REJECTED" | "PAUSED";
  language: string;
  category: string;
  components: { type: string; text?: string; example?: { body_text?: string[][] } }[];
}

type Aba = "conversas" | "disparos";

// ── Media message renderer ────────────────────────────────────────────────────
// Formato: __MEDIA__{type}__{url}__{extra}
function MediaBubble({ texto }: { texto: string }) {
  const match = texto.match(/^__MEDIA__(\w+)__(.+?)__([\s\S]*)$/);
  if (!match) return <p className="text-[#e9edef] text-sm whitespace-pre-wrap">{texto}</p>;

  const [, type, url, extra] = match;

  if (type === "image" || type === "sticker") {
    return (
      <div className="flex flex-col gap-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={extra || "Imagem"}
          className="rounded-lg max-w-[260px] max-h-[300px] object-cover cursor-pointer"
          onClick={() => window.open(url, "_blank")}
        />
        {extra && <p className="text-[#e9edef] text-sm mt-1">{extra}</p>}
      </div>
    );
  }

  if (type === "video") {
    return (
      <div className="flex flex-col gap-1">
        <video
          src={url}
          controls
          className="rounded-lg max-w-[260px] max-h-[300px]"
        />
        {extra && <p className="text-[#e9edef] text-sm mt-1">{extra}</p>}
      </div>
    );
  }

  if (type === "audio") {
    return (
      <div className="flex items-center gap-2 py-1">
        <svg className="w-5 h-5 text-[#FFA300] flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
        </svg>
        <audio controls src={url} className="h-8 max-w-[200px]" style={{ colorScheme: "dark" }} />
      </div>
    );
  }

  if (type === "document") {
    const filename = extra || url.split("/").pop() || "Documento";
    const ext = filename.split(".").pop()?.toUpperCase() ?? "DOC";
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2 hover:bg-white/20 transition-colors no-underline"
      >
        <div className="w-9 h-10 bg-[#FFA300] rounded flex items-center justify-center flex-shrink-0">
          <span className="text-[9px] font-bold text-white">{ext}</span>
        </div>
        <div className="min-w-0">
          <p className="text-[#e9edef] text-sm font-medium truncate max-w-[180px]">{filename}</p>
          <p className="text-[#8696a0] text-xs">Toque para abrir</p>
        </div>
        <svg className="w-4 h-4 text-[#8696a0] flex-shrink-0 ml-1" fill="currentColor" viewBox="0 0 24 24">
          <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
        </svg>
      </a>
    );
  }

  // fallback
  return <p className="text-[#e9edef] text-sm whitespace-pre-wrap">{texto}</p>;
}

function formatarDataBrasilia(iso: string): string {
  return (
    new Date(iso).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }) + " (horário de Brasília)"
  );
}

function timeLabel(ts: string) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000) {
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export default function Home() {
  const adminBarOffset = useAdminBarOffset();
  const [aba, setAba] = useState<Aba>("conversas");

  // ── Conversas ──────────────────────────────────────────────
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [contatoAtivo, setContatoAtivo] = useState<Contato | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [busca, setBusca] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const carregarContatos = async () => {
    try {
      const res = await fetch("/api/contacts");
      const data = await res.json();
      if (Array.isArray(data)) setContatos(data);
    } catch (e) {
      console.error(e);
    }
  };

  const carregarMensagens = async (numero: string) => {
    try {
      const res = await fetch(`/api/messages/${encodeURIComponent(numero)}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setMensagens(data);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    carregarContatos();
  }, []);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      carregarContatos();
      if (contatoAtivo) carregarMensagens(contatoAtivo.numero);
    }, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contatoAtivo]);

  const selecionarContato = (c: Contato) => {
    setContatoAtivo(c);
    carregarMensagens(c.numero);
  };

  const enviarMensagem = async () => {
    if (!contatoAtivo || !texto.trim() || enviando) return;
    setEnviando(true);
    try {
      await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numero: contatoAtivo.numero,
          texto: texto.trim(),
          nome: contatoAtivo.nome,
        }),
      });
      setTexto("");
      await carregarMensagens(contatoAtivo.numero);
    } catch (e) {
      console.error(e);
    } finally {
      setEnviando(false);
    }
  };

  const contatosFiltrados = contatos.filter(
    (c) =>
      c.nome.toLowerCase().includes(busca.toLowerCase()) ||
      c.numero.includes(busca)
  );

  // ── Disparos ───────────────────────────────────────────────
  const [csvTexto, setCsvTexto] = useState("");
  const [contatosDisparo, setContatosDisparo] = useState<ContatoDisparo[]>([]);
  const [disparando, setDisparando] = useState(false);
  const [progresso, setProgresso] = useState(0);

  // Extração de contatos a partir de um relatório PDF (formato Soneto)
  const [extraindo, setExtraindo] = useState(false);
  const [extracaoMsg, setExtracaoMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const extrairPDF = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtraindo(true);
    setExtracaoMsg(`Extraindo de ${file.name}…`);
    try {
      const fd = new FormData();
      fd.append("arquivo", file);
      const res = await fetch("/api/extract", { method: "POST", body: fd });
      const data = await res.json();
      if (data.ok) {
        setCsvTexto((prev) => (prev.trim() ? prev.trim() + "\n" : "") + data.texto);
        setExtracaoMsg(
          `${data.contatos.length} contato${data.contatos.length !== 1 ? "s" : ""} extraído${
            data.contatos.length !== 1 ? "s" : ""
          }. Revise a lista antes de importar.`
        );
      } else {
        setExtracaoMsg(`Erro: ${data.error || "não foi possível extrair"}`);
      }
    } catch {
      setExtracaoMsg("Erro ao processar o arquivo.");
    } finally {
      setExtraindo(false);
      e.target.value = "";
    }
  };

  // Templates
  const [templates, setTemplates] = useState<WaTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateSelecionado, setTemplateSelecionado] = useState<WaTemplate | null>(null);

  const carregarTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const res = await fetch("/api/templates");
      const data = await res.json();
      if (Array.isArray(data)) {
        setTemplates(data);
        // Auto-select first approved template
        const firstApproved = data.find((t: WaTemplate) => t.status === "APPROVED");
        if (firstApproved) setTemplateSelecionado(firstApproved);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingTemplates(false);
    }
  };

  // Load templates when Disparos tab is opened
  useEffect(() => {
    if (aba === "disparos" && templates.length === 0) carregarTemplates();
    if (aba === "disparos") carregarAgendamentos();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba]);

  // ── Agendamento ────────────────────────────────────────────
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [mostrarAgendamento, setMostrarAgendamento] = useState(false);
  const [modoAgendamento, setModoAgendamento] = useState<"horas" | "data">("horas");
  const [horasAgendamento, setHorasAgendamento] = useState("1");
  const [dataHoraAgendamento, setDataHoraAgendamento] = useState("");
  const [agendando, setAgendando] = useState(false);
  const [agendamentoMsg, setAgendamentoMsg] = useState("");

  const carregarAgendamentos = async () => {
    try {
      const res = await fetch("/api/schedule");
      const data = await res.json();
      if (Array.isArray(data)) setAgendamentos(data);
    } catch (e) {
      console.error(e);
    }
  };

  // Interpreta o input como horário de Brasília (America/Sao_Paulo, UTC-3, sem horário de verão)
  const calcularAgendadoPara = (): Date | null => {
    if (modoAgendamento === "horas") {
      const horas = parseFloat(horasAgendamento.replace(",", "."));
      if (!horas || horas <= 0) return null;
      return new Date(Date.now() + horas * 3600 * 1000);
    }
    if (!dataHoraAgendamento) return null;
    const d = new Date(`${dataHoraAgendamento}:00-03:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const agendar = async () => {
    if (!templateSelecionado || templateSelecionado.status !== "APPROVED") return;
    if (contatosDisparo.length === 0 || agendando) return;

    const data = calcularAgendadoPara();
    if (!data || data.getTime() <= Date.now()) {
      setAgendamentoMsg("Escolha um horário no futuro.");
      return;
    }

    setAgendando(true);
    setAgendamentoMsg("");
    try {
      const contatosPayload = contatosDisparo.map((c) => ({
        nome: c.nome,
        numero: c.numero,
        texto_preview: renderTemplate(templateSelecionado, c.nome),
      }));

      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contatos: contatosPayload,
          template_name: templateSelecionado.name,
          template_language: templateSelecionado.language,
          agendado_para: data.toISOString(),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Falha ao agendar");
      }

      setAgendamentoMsg("");
      setMostrarAgendamento(false);
      await carregarAgendamentos();
    } catch (e) {
      setAgendamentoMsg(`Erro: ${String(e)}`);
    } finally {
      setAgendando(false);
    }
  };

  const cancelarAgendamento = async (id: string) => {
    try {
      await fetch(`/api/schedule/${id}`, { method: "DELETE" });
      await carregarAgendamentos();
    } catch (e) {
      console.error(e);
    }
  };

  // Extract body text and parameters from template components
  const getTemplateBody = (t: WaTemplate): string => {
    const body = t.components.find((c) => c.type === "BODY");
    return body?.text ?? "";
  };

  // Render template preview substituting named params {{nome}} and positional {{1}}
  const renderTemplate = (t: WaTemplate, nome: string): string => {
    return getTemplateBody(t)
      .replace(/\{\{nome\}\}/g, nome)        // named param: {{nome}}
      .replace(/\{\{(\d+)\}\}/g, (_, idx) => { // positional: {{1}}, {{2}}...
        if (idx === "1") return nome;
        return `{{${idx}}}`;
      });
  };

  const linhasCSV = csvTexto.trim().split("\n").filter((l) => l.trim()).length;

  const parsearContatos = () => {
    const linhas = csvTexto.trim().split("\n").filter((l) => l.trim());
    const parsed: ContatoDisparo[] = linhas
      .map((linha) => {
        const partes = linha.split(",").map((p) => p.trim());
        return { nome: partes[0] || "", numero: partes[1] || "", status: "pendente" as const };
      })
      .filter((c) => c.nome && c.numero);
    setContatosDisparo(parsed);
  };

  const disparar = async () => {
    if (!templateSelecionado || templateSelecionado.status !== "APPROVED") return;
    if (contatosDisparo.length === 0 || disparando) return;
    setDisparando(true);
    setProgresso(0);

    setContatosDisparo((prev) => prev.map((c) => ({ ...c, status: "pendente" as const, erro: undefined })));

    for (let i = 0; i < contatosDisparo.length; i++) {
      const contato = contatosDisparo[i];
      setContatosDisparo((prev) =>
        prev.map((c, idx) => (idx === i ? { ...c, status: "enviando" } : c))
      );

      const textoPreview = renderTemplate(templateSelecionado, contato.nome);

      try {
        const res = await fetch("/api/broadcast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            numero: contato.numero,
            nome: contato.nome,
            template_name: templateSelecionado.name,
            template_language: templateSelecionado.language,
            // Send named param for {{nome}}; falls back gracefully for {{1}} templates too
            body_parameters: [{ parameter_name: "nome", text: contato.nome }],
            texto_preview: textoPreview,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error || "Falha no envio");
        }

        setContatosDisparo((prev) =>
          prev.map((c, idx) => (idx === i ? { ...c, status: "ok" } : c))
        );
      } catch (e) {
        setContatosDisparo((prev) =>
          prev.map((c, idx) =>
            idx === i ? { ...c, status: "erro", erro: String(e) } : c
          )
        );
      }

      setProgresso(Math.round(((i + 1) / contatosDisparo.length) * 100));
      if (i < contatosDisparo.length - 1) await new Promise((r) => setTimeout(r, 1200));
    }

    setDisparando(false);
    carregarContatos();
  };

  const totalOk = contatosDisparo.filter((c) => c.status === "ok").length;
  const totalErro = contatosDisparo.filter((c) => c.status === "erro").length;
  const jaDisparou = contatosDisparo.some((c) => c.status !== "pendente");
  const preview =
    templateSelecionado && contatosDisparo.length > 0
      ? renderTemplate(templateSelecionado, contatosDisparo[0].nome)
      : templateSelecionado && contatosDisparo.length === 0
      ? renderTemplate(templateSelecionado, "Cliente")
      : null;

  const botoesDesabilitados =
    disparando ||
    !templateSelecionado ||
    templateSelecionado.status !== "APPROVED" ||
    contatosDisparo.length === 0;

  return (
    <div
      className="flex flex-col bg-[#111b21] text-[#e9edef]"
      style={{ height: `calc(100vh - ${adminBarOffset}px)`, marginTop: `${adminBarOffset}px` }}
    >
      {/* ── Tab Header ─────────────────────────────────────── */}
      <div className="flex items-center border-b border-[#2a3942] bg-[#1a1a1a] flex-shrink-0">
        {/* Soneto logo */}
        <div className="flex items-center px-4 py-2 border-r border-[#2a3942] flex-shrink-0">
          <div className="bg-white rounded-md px-2.5 py-1.5 flex items-center">
            <Image
              src="/soneto-logo.png"
              alt="Soneto Móveis e Colchões"
              width={110}
              height={28}
              priority
              style={{ objectFit: "contain" }}
            />
          </div>
        </div>
        <button
          onClick={() => setAba("conversas")}
          className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 ${
            aba === "conversas"
              ? "text-[#FFA300] border-[#FFA300]"
              : "text-[#8696a0] border-transparent hover:text-[#e9edef]"
          }`}
        >
          💬 Conversas
          {contatos.reduce((s, c) => s + c.nao_lidas, 0) > 0 && (
            <span className="ml-1.5 bg-[#FFA300] text-white text-[10px] rounded-full px-1.5 py-0.5">
              {contatos.reduce((s, c) => s + c.nao_lidas, 0)}
            </span>
          )}
        </button>
        <button
          onClick={() => setAba("disparos")}
          className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 ${
            aba === "disparos"
              ? "text-[#FFA300] border-[#FFA300]"
              : "text-[#8696a0] border-transparent hover:text-[#e9edef]"
          }`}
        >
          📣 Disparos
        </button>
      </div>

      {/* ── CONVERSAS ──────────────────────────────────────── */}
      {aba === "conversas" && (
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-[380px] flex flex-col border-r border-[#2a3942] bg-[#111b21]">
            <div className="px-3 py-2 bg-[#111b21]">
              <div className="flex items-center gap-2 bg-[#202c33] rounded-lg px-3 py-2">
                <svg className="w-4 h-4 text-[#8696a0]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  className="bg-transparent text-sm text-[#e9edef] placeholder-[#8696a0] outline-none w-full"
                  placeholder="Pesquisar contatos"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {contatosFiltrados.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-[#8696a0] text-sm gap-2 pb-20">
                  <svg className="w-16 h-16 opacity-30" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
                  </svg>
                  <span>Nenhuma conversa ainda</span>
                  <span className="text-xs text-center px-8 opacity-70">
                    As conversas aparecerão aqui quando clientes responderem
                  </span>
                </div>
              ) : (
                contatosFiltrados.map((c) => (
                  <div
                    key={c.numero}
                    onClick={() => selecionarContato(c)}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[#202c33] transition-colors ${
                      contatoAtivo?.numero === c.numero ? "bg-[#2a3942]" : ""
                    }`}
                  >
                    <div className="w-12 h-12 rounded-full bg-[#FFA300] flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                      {c.nome.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline">
                        <span className="font-medium text-[#e9edef] truncate">{c.nome}</span>
                        <span className="text-xs text-[#8696a0] ml-2 flex-shrink-0">
                          {timeLabel(c.ultimo_timestamp)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center mt-0.5">
                        <span className="text-sm text-[#8696a0] truncate">{c.ultima_mensagem}</span>
                        {c.nao_lidas > 0 && (
                          <span className="ml-2 bg-[#FFA300] text-white text-xs rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">
                            {c.nao_lidas}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Chat */}
          <div className="flex-1 flex flex-col">
            {contatoAtivo ? (
              <>
                <div className="flex items-center gap-3 px-4 py-3 bg-[#202c33] border-b border-[#2a3942]">
                  <div className="w-10 h-10 rounded-full bg-[#FFA300] flex items-center justify-center text-white font-bold">
                    {contatoAtivo.nome.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold text-[#e9edef]">{contatoAtivo.nome}</div>
                    <div className="text-xs text-[#8696a0]">{contatoAtivo.numero}</div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-[5%] py-4 bg-[#0d1418]">
                  {mensagens.map((m) => (
                    <div
                      key={m.id}
                      className={`flex mb-1 ${m.direcao === "saida" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[65%] rounded-lg px-3 py-2 shadow-md ${
                          m.direcao === "saida"
                            ? "bg-[#7A4200] rounded-tr-none"
                            : "bg-[#202c33] rounded-tl-none"
                        }`}
                      >
                        <MediaBubble texto={m.texto} />
                        <div className="flex items-center justify-end gap-1 mt-1">
                          <span className="text-[10px] text-[#8696a0]">{timeLabel(m.timestamp)}</span>
                          {m.direcao === "saida" && (
                            <svg className="w-3.5 h-3.5 text-[#FFA300]" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z" />
                            </svg>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={bottomRef} />
                </div>

                <div className="flex items-end gap-3 px-4 py-3 bg-[#202c33]">
                  <textarea
                    className="flex-1 bg-[#2a3942] text-[#e9edef] placeholder-[#8696a0] rounded-lg px-4 py-2 text-sm outline-none resize-none max-h-32 min-h-[40px]"
                    placeholder="Digite uma mensagem"
                    value={texto}
                    rows={1}
                    onChange={(e) => {
                      setTexto(e.target.value);
                      e.target.style.height = "auto";
                      e.target.style.height = Math.min(e.target.scrollHeight, 128) + "px";
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        enviarMensagem();
                      }
                    }}
                  />
                  <button
                    onClick={enviarMensagem}
                    disabled={enviando || !texto.trim()}
                    className="w-10 h-10 rounded-full bg-[#FFA300] flex items-center justify-center text-white hover:bg-[#FFB020] transition-colors disabled:opacity-50 flex-shrink-0"
                  >
                    {enviando ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                      </svg>
                    )}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center bg-[#222e35]">
                <div className="mb-6 opacity-20">
                  <svg className="w-40 h-40" viewBox="0 0 303 172" fill="none">
                    <path d="M229.566 160.229c0 5.697-4.619 10.316-10.315 10.316H15.316C9.619 170.545 5 165.926 5 160.229V11.772C5 6.075 9.619 1.456 15.316 1.456H219.251c5.696 0 10.315 4.619 10.315 10.316v148.457z" fill="#364147" />
                    <path d="M298 160.229c0 5.697-4.619 10.316-10.315 10.316H83.75c-5.697 0-10.316-4.619-10.316-10.316V11.772C73.434 6.075 78.053 1.456 83.75 1.456H287.685C293.381 1.456 298 6.075 298 11.772v148.457z" fill="#202c33" />
                  </svg>
                </div>
                <h2 className="text-[#e9edef] text-2xl font-light mb-2">Soneto WhatsApp</h2>
                <p className="text-[#8696a0] text-sm text-center max-w-xs">
                  Selecione uma conversa para começar a responder.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── DISPAROS ───────────────────────────────────────── */}
      {aba === "disparos" && (
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Contacts input */}
          <div className="w-[400px] flex flex-col border-r border-[#2a3942] bg-[#111b21]">
            <div className="px-4 py-3 bg-[#202c33] border-b border-[#2a3942]">
              <h2 className="font-semibold text-[#e9edef] mb-0.5">Lista de Contatos</h2>
              <p className="text-xs text-[#8696a0]">
                Cole no formato CSV: <span className="text-[#e9edef] font-mono">Nome, Número</span> — um por linha
              </p>
            </div>

            {contatosDisparo.length === 0 ? (
              <div className="flex-1 flex flex-col p-4 gap-3">
                <textarea
                  className="flex-1 bg-[#202c33] text-[#e9edef] placeholder-[#8696a0] rounded-lg p-3 text-sm outline-none resize-none font-mono leading-relaxed"
                  placeholder={`João Silva, 5511999990001\nMaria Souza, 5511999990002\nCarlos Lima, 5511999990003`}
                  value={csvTexto}
                  onChange={(e) => setCsvTexto(e.target.value)}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={extrairPDF}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={extraindo}
                  className="w-full py-2.5 border border-[#2a3942] text-[#e9edef] rounded-lg text-sm font-medium hover:border-[#FFA300] hover:text-[#FFA300] disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
                >
                  {extraindo ? "Extraindo…" : "📎 Extrair de PDF (relatório Soneto)"}
                </button>
                {extracaoMsg && <p className="text-xs text-[#8696a0]">{extracaoMsg}</p>}
                <div className="text-xs text-[#8696a0] bg-[#202c33] rounded-lg p-3 space-y-1">
                  <p className="font-medium text-[#e9edef]">Formato aceito:</p>
                  <p>• CSV: <span className="font-mono">Nome, DDD+Número</span></p>
                  <p>• Número com código do país: <span className="font-mono">55</span> (Brasil)</p>
                  <p>• Exemplo: <span className="font-mono">João, 5511999990001</span></p>
                </div>
                <button
                  onClick={parsearContatos}
                  disabled={!csvTexto.trim()}
                  className="w-full py-2.5 bg-[#FFA300] text-white rounded-lg text-sm font-medium hover:bg-[#FFB020] disabled:opacity-40 transition-colors"
                >
                  Importar {linhasCSV > 0 ? `${linhasCSV} contato${linhasCSV !== 1 ? "s" : ""}` : "contatos"}
                </button>
              </div>
            ) : (
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="px-4 py-2 bg-[#202c33] border-b border-[#2a3942] flex items-center justify-between flex-shrink-0">
                  <span className="text-sm text-[#e9edef]">
                    {contatosDisparo.length} contato{contatosDisparo.length !== 1 ? "s" : ""}
                  </span>
                  <div className="flex gap-3 text-xs">
                    {totalOk > 0 && <span className="text-[#FFA300]">✓ {totalOk} ok</span>}
                    {totalErro > 0 && <span className="text-red-400">✗ {totalErro} erro</span>}
                    {!disparando && (
                      <button
                        onClick={() => { setContatosDisparo([]); setCsvTexto(""); }}
                        className="text-[#8696a0] hover:text-[#e9edef] transition-colors"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {contatosDisparo.map((c, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-[#1e2c33]">
                      <div className="w-9 h-9 rounded-full bg-[#2a3942] flex items-center justify-center text-[#e9edef] font-bold text-sm flex-shrink-0">
                        {c.nome.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-[#e9edef] truncate">{c.nome}</div>
                        <div className="text-xs text-[#8696a0] font-mono">{c.numero}</div>
                      </div>
                      <div className="flex-shrink-0 w-6 text-center">
                        {c.status === "pendente" && <span className="text-[#8696a0] text-xs">—</span>}
                        {c.status === "enviando" && (
                          <svg className="w-4 h-4 animate-spin text-[#ffcc00] mx-auto" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        )}
                        {c.status === "ok" && (
                          <svg className="w-4 h-4 text-[#FFA300] mx-auto" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                          </svg>
                        )}
                        {c.status === "erro" && (
                          <svg className="w-4 h-4 text-red-400 mx-auto" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                          </svg>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Template selector + send */}
          <div className="flex-1 flex flex-col bg-[#0d1418]">
            <div className="px-4 py-3 bg-[#202c33] border-b border-[#2a3942] flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-[#e9edef] mb-0.5">Template de Mensagem</h2>
                <p className="text-xs text-[#8696a0]">
                  Disparos usam templates aprovados pela Meta — funcionam mesmo sem histórico de conversa
                </p>
              </div>
              <button
                onClick={carregarTemplates}
                disabled={loadingTemplates}
                className="text-xs text-[#8696a0] hover:text-[#e9edef] transition-colors flex-shrink-0"
              >
                {loadingTemplates ? "↻ carregando..." : "↻ atualizar"}
              </button>
            </div>

            <div className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto">

              {/* Template list */}
              {loadingTemplates ? (
                <div className="flex items-center justify-center py-8 text-[#8696a0] text-sm gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Carregando templates…
                </div>
              ) : templates.length === 0 ? (
                <div className="bg-[#202c33] rounded-xl p-4 text-sm text-[#8696a0] text-center">
                  Nenhum template encontrado. Crie um no Meta Business Manager.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {templates.map((t) => {
                    const isApproved = t.status === "APPROVED";
                    const isSelected = templateSelecionado?.id === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => isApproved && setTemplateSelecionado(t)}
                        disabled={!isApproved}
                        className={`text-left rounded-xl border px-4 py-3 transition-all ${
                          isSelected
                            ? "border-[#FFA300] bg-[#FFA30015]"
                            : isApproved
                            ? "border-[#2a3942] bg-[#202c33] hover:border-[#8696a0]"
                            : "border-[#2a3942] bg-[#111b21] opacity-50 cursor-not-allowed"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-[#e9edef] font-mono">{t.name}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            t.status === "APPROVED"
                              ? "bg-[#FFA30025] text-[#FFA300]"
                              : t.status === "PENDING_REVIEW" || t.status === "IN_REVIEW"
                              ? "bg-yellow-900/40 text-yellow-400"
                              : "bg-red-900/40 text-red-400"
                          }`}>
                            {t.status === "APPROVED" ? "✓ Aprovado"
                              : t.status === "PENDING_REVIEW" ? "⏳ Em análise"
                              : t.status === "IN_REVIEW" ? "⏳ Em revisão"
                              : t.status === "PAUSED" ? "⏸ Pausado"
                              : t.status}
                          </span>
                        </div>
                        <p className="text-xs text-[#8696a0] truncate">
                          {getTemplateBody(t).slice(0, 80) || "(sem corpo)"}
                        </p>
                        <p className="text-[10px] text-[#8696a0] mt-1 uppercase tracking-wide">
                          {t.category} · {t.language}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Preview */}
              {preview && templateSelecionado && (
                <div className="bg-[#111b21] rounded-xl p-3 border border-[#2a3942]">
                  <div className="text-xs text-[#8696a0] mb-2 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                    </svg>
                    Preview — {contatosDisparo[0]?.nome || "Cliente"}
                  </div>
                  <div className="flex justify-end">
                    <div className="bg-[#7A4200] rounded-lg rounded-tr-none px-3 py-2 max-w-[85%]">
                      <p className="text-[#e9edef] text-sm whitespace-pre-wrap">{preview}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Progress bar */}
              {disparando && (
                <div className="bg-[#202c33] rounded-xl p-4">
                  <div className="flex justify-between text-xs text-[#8696a0] mb-2">
                    <span>Enviando via template…</span>
                    <span className="text-[#FFA300] font-medium">{progresso}%</span>
                  </div>
                  <div className="w-full bg-[#2a3942] rounded-full h-2">
                    <div
                      className="bg-[#FFA300] h-2 rounded-full transition-all duration-500"
                      style={{ width: `${progresso}%` }}
                    />
                  </div>
                  <div className="mt-2 text-xs text-[#8696a0]">
                    {totalOk + totalErro} de {contatosDisparo.length} processados
                    {totalErro > 0 && <span className="text-red-400 ml-2">· {totalErro} erro{totalErro !== 1 ? "s" : ""}</span>}
                  </div>
                </div>
              )}

              {/* Results */}
              {!disparando && jaDisparou && (
                <div className="bg-[#202c33] rounded-xl p-4 flex items-center gap-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[#FFA300]">{totalOk}</div>
                    <div className="text-xs text-[#8696a0] mt-0.5">enviados</div>
                  </div>
                  {totalErro > 0 && (
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-400">{totalErro}</div>
                      <div className="text-xs text-[#8696a0] mt-0.5">erros</div>
                    </div>
                  )}
                  <div className="flex-1" />
                  <button onClick={() => setAba("conversas")} className="text-sm text-[#FFA300] hover:underline">
                    Ver conversas →
                  </button>
                </div>
              )}

              {/* Info box: window rules */}
              {!disparando && !jaDisparou && (
                <div className="bg-[#202c33] rounded-xl p-3 flex gap-3 text-xs text-[#8696a0]">
                  <span className="text-lg leading-none">💡</span>
                  <div className="space-y-1">
                    <p><span className="text-[#e9edef]">Templates (Disparos):</span> funcionam a qualquer hora, mesmo sem histórico</p>
                    <p><span className="text-[#e9edef]">Texto livre (Conversas):</span> só funciona nas 24h após o cliente enviar uma mensagem</p>
                  </div>
                </div>
              )}

              {/* Agendamentos pendentes */}
              {agendamentos.length > 0 && (
                <div className="bg-[#202c33] rounded-xl p-3 flex flex-col gap-2">
                  <p className="text-xs font-medium text-[#e9edef]">🕒 Agendamentos pendentes</p>
                  {agendamentos.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between gap-3 text-xs bg-[#111b21] rounded-lg px-3 py-2"
                    >
                      <div className="min-w-0">
                        <span className="text-[#e9edef]">{formatarDataBrasilia(a.agendado_para)}</span>
                        <span className="text-[#8696a0] ml-2">
                          {a.contatos.length} contato{a.contatos.length !== 1 ? "s" : ""} · {a.template_name}
                        </span>
                        {a.status === "processando" && (
                          <span className="text-[#FFA300] ml-2">enviando…</span>
                        )}
                      </div>
                      {a.status === "pendente" && (
                        <button
                          onClick={() => cancelarAgendamento(a.id)}
                          className="text-red-400 hover:text-red-300 flex-shrink-0"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Send / Schedule buttons */}
              <div className="flex gap-2">
                <button
                  onClick={disparar}
                  disabled={botoesDesabilitados}
                  className="flex-1 py-3 bg-[#FFA300] text-white rounded-xl font-semibold hover:bg-[#FFB020] disabled:opacity-40 transition-colors text-sm"
                >
                  {disparando ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      Enviando {totalOk + totalErro}/{contatosDisparo.length}…
                    </span>
                  ) : !templateSelecionado ? (
                    "Selecione um template acima"
                  ) : templateSelecionado.status !== "APPROVED" ? (
                    `⏳ Aguardando aprovação do template "${templateSelecionado.name}"`
                  ) : contatosDisparo.length === 0 ? (
                    "Importe os contatos ao lado"
                  ) : (
                    `🚀 Disparar para ${contatosDisparo.length} contato${contatosDisparo.length !== 1 ? "s" : ""}`
                  )}
                </button>
                <button
                  onClick={() => setMostrarAgendamento((v) => !v)}
                  disabled={botoesDesabilitados}
                  className="px-4 py-3 border border-[#2a3942] text-[#e9edef] rounded-xl font-semibold hover:border-[#FFA300] hover:text-[#FFA300] disabled:opacity-40 transition-colors text-sm flex-shrink-0"
                >
                  🕒 Agendar
                </button>
              </div>

              {mostrarAgendamento && (
                <div className="bg-[#202c33] rounded-xl p-4 flex flex-col gap-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setModoAgendamento("horas")}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        modoAgendamento === "horas"
                          ? "bg-[#FFA300] text-white"
                          : "bg-[#111b21] text-[#8696a0] hover:text-[#e9edef]"
                      }`}
                    >
                      Daqui a X horas
                    </button>
                    <button
                      onClick={() => setModoAgendamento("data")}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        modoAgendamento === "data"
                          ? "bg-[#FFA300] text-white"
                          : "bg-[#111b21] text-[#8696a0] hover:text-[#e9edef]"
                      }`}
                    >
                      Data e hora específica
                    </button>
                  </div>

                  {modoAgendamento === "horas" ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0.1"
                        step="0.5"
                        value={horasAgendamento}
                        onChange={(e) => setHorasAgendamento(e.target.value)}
                        className="w-24 bg-[#111b21] text-[#e9edef] rounded-lg px-3 py-2 text-sm outline-none"
                      />
                      <span className="text-xs text-[#8696a0]">hora(s) a partir de agora</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        type="datetime-local"
                        value={dataHoraAgendamento}
                        onChange={(e) => setDataHoraAgendamento(e.target.value)}
                        className="flex-1 bg-[#111b21] text-[#e9edef] rounded-lg px-3 py-2 text-sm outline-none [color-scheme:dark]"
                      />
                      <span className="text-[10px] text-[#8696a0] flex-shrink-0">horário de Brasília</span>
                    </div>
                  )}

                  {agendamentoMsg && <p className="text-xs text-[#8696a0]">{agendamentoMsg}</p>}

                  <button
                    onClick={agendar}
                    disabled={agendando}
                    className="w-full py-2.5 bg-[#FFA300] text-white rounded-lg text-sm font-medium hover:bg-[#FFB020] disabled:opacity-40 transition-colors"
                  >
                    {agendando ? "Agendando…" : "Confirmar agendamento"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
