const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!;
const API_URL = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;

// ── Free-form message (only works within 24h customer-service window) ─────────
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

// ── Template message (works for outbound / outside 24h window) ────────────────
// bodyParameters accepts either positional strings ["value1", "value2"]
// or named param objects [{ parameter_name: "nome", text: "João" }]
type BodyParam = string | { parameter_name: string; text: string };

export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  languageCode: string,
  bodyParameters: BodyParam[] = []
) {
  const components =
    bodyParameters.length > 0
      ? [
          {
            type: "body",
            parameters: bodyParameters.map((p) =>
              typeof p === "string"
                ? { type: "text", text: p }
                : { type: "text", parameter_name: p.parameter_name, text: p.text }
            ),
          },
        ]
      : [];

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components.length > 0 && { components }),
    },
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

// ── Fetch WABA ID from phone number ──────────────────────────────────────────
export async function getWabaId(): Promise<string> {
  const res = await fetch(
    `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}?fields=whatsapp_business_account`,
    { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
  );
  const data = await res.json();
  if (!res.ok || !data.whatsapp_business_account?.id) {
    throw new Error("Could not resolve WABA ID: " + JSON.stringify(data));
  }
  return data.whatsapp_business_account.id;
}

export function formatNumber(numero: string): string {
  const digits = numero.replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
}
