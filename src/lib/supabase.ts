import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Client-side client (anon key)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side client (service role - bypasses RLS)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export interface Mensagem {
  id: number;
  numero: string;
  nome: string;
  texto: string;
  direcao: "entrada" | "saida";
  timestamp: string;
  lida: boolean;
  wa_message_id?: string;
}

export interface Contato {
  numero: string;
  nome: string;
  ultima_mensagem: string;
  ultimo_timestamp: string;
  nao_lidas: number;
}
