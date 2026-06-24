import { env } from '../../config/env.js';
import { queryOne } from '../../config/database.js';

// Devuelve el subconjunto de teléfonos (E.164 con +) que TIENEN WhatsApp.
// Usa una línea conectada para consultar la existencia (lookup, no envía nada).
// Si no hay línea conectada o falla, no descarta (devuelve todos: mejor incluir que perder).
export async function filterWithWhatsApp(phones: string[]): Promise<string[]> {
  if (phones.length === 0) return [];

  const line = await queryOne<{ instance_name: string; api_url: string | null; api_key: string | null }>(
    "SELECT instance_name, api_url, api_key FROM whatsapp_lines WHERE status = 'active' ORDER BY created_at ASC LIMIT 1"
  );
  if (!line) return phones;

  const base = (line.api_url || env.EVOLUTION_API_URL).replace(/\/$/, '');
  const key = line.api_key || env.EVOLUTION_API_KEY;
  const have = new Set<string>();
  const nums = phones.map((p) => p.replace('+', ''));

  for (let i = 0; i < nums.length; i += 50) {
    const chunk = nums.slice(i, i + 50);
    try {
      const res = await fetch(`${base}/chat/whatsappNumbers/${line.instance_name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: key },
        body: JSON.stringify({ numbers: chunk }),
      });
      const data = (await res.json()) as Array<{ exists?: boolean; number?: string }>;
      if (Array.isArray(data)) {
        for (const d of data) {
          if (d?.exists && d?.number) have.add(String(d.number).replace('+', ''));
        }
      } else {
        // respuesta inesperada: no descartar este chunk
        for (const n of chunk) have.add(n);
      }
    } catch {
      // error de red: no descartar este chunk
      for (const n of chunk) have.add(n);
    }
  }

  return phones.filter((p) => have.has(p.replace('+', '')));
}
