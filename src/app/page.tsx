"use client";

import { useEffect, useRef, useState } from "react";

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

  return (
    <div className="flex h-screen bg-[#111b21] text-[#e9edef]">
      {/* Sidebar */}
      <div className="w-[380px] flex flex-col border-r border-[#2a3942] bg-[#111b21]">
        <div className="flex items-center justify-between px-4 py-3 bg-[#202c33]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#00a884] flex items-center justify-center text-white font-bold">
              S
            </div>
            <span className="font-semibold text-[#e9edef]">Soneto Pós-venda</span>
          </div>
        </div>

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
                <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/>
              </svg>
              <span>Nenhuma conversa ainda</span>
              <span className="text-xs text-center px-8 opacity-70">As conversas aparecerão aqui quando clientes responderem</span>
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
                <div className="w-12 h-12 rounded-full bg-[#00a884] flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
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
                      <span className="ml-2 bg-[#00a884] text-white text-xs rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">
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
              <div className="w-10 h-10 rounded-full bg-[#00a884] flex items-center justify-center text-white font-bold">
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
                        ? "bg-[#005c4b] rounded-tr-none"
                        : "bg-[#202c33] rounded-tl-none"
                    }`}
                  >
                    <p className="text-[#e9edef] text-sm whitespace-pre-wrap">{m.texto}</p>
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <span className="text-[10px] text-[#8696a0]">{timeLabel(m.timestamp)}</span>
                      {m.direcao === "saida" && (
                        <svg className="w-3.5 h-3.5 text-[#53bdeb]" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z"/>
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
                className="w-10 h-10 rounded-full bg-[#00a884] flex items-center justify-center text-white hover:bg-[#02b997] transition-colors disabled:opacity-50 flex-shrink-0"
              >
                {enviando ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                  </svg>
                )}
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-[#222e35]">
            <div className="mb-6 opacity-20">
              <svg className="w-40 h-40" viewBox="0 0 303 172" fill="none">
                <path d="M229.566 160.229c0 5.697-4.619 10.316-10.315 10.316H15.316C9.619 170.545 5 165.926 5 160.229V11.772C5 6.075 9.619 1.456 15.316 1.456H219.251c5.696 0 10.315 4.619 10.315 10.316v148.457z" fill="#364147"/>
                <path d="M298 160.229c0 5.697-4.619 10.316-10.315 10.316H83.75c-5.697 0-10.316-4.619-10.316-10.316V11.772C73.434 6.075 78.053 1.456 83.75 1.456H287.685C293.381 1.456 298 6.075 298 11.772v148.457z" fill="#202c33"/>
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
  );
}
