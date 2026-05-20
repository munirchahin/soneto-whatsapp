const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!;
const API_URL = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;

export async function sendWhatsAppMessage(to: string, text: string) {
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text },
  };

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

export function formatNumber(numero: string): string {
  const digits = numero.replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
}
