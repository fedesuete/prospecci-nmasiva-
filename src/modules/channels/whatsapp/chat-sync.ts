import { env } from '../../../config/env.js';
import { query, queryOne } from '../../../config/database.js';
import { normalizePhone } from '../../../utils/phone.js';

// Sincronizar chats existentes de Evolution API para saber a quién ya se le habló
export async function syncExistingChats(instanceName: string): Promise<{
  synced: number;
  alreadyInDb: number;
  invalid: number;
}> {
  const result = { synced: 0, alreadyInDb: 0, invalid: 0 };

  // Obtener chats de Evolution API
  const baseUrl = env.EVOLUTION_API_URL.replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/chat/findChats/${instanceName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.EVOLUTION_API_KEY,
    },
    body: '{}',
  });

  if (!response.ok) {
    throw new Error(`Error fetching chats: ${response.status}`);
  }

  const chats = await response.json() as Array<{ remoteJid: string; pushName?: string; name?: string }>;

  // Filtrar solo chats individuales (no grupos)
  const individual = chats.filter(c => c.remoteJid?.includes('@s.whatsapp.net'));

  for (const chat of individual) {
    const rawPhone = chat.remoteJid.split('@')[0];
    const phone = normalizePhone(rawPhone);

    if (!phone) {
      result.invalid++;
      continue;
    }

    // Verificar si ya existe en nuestra DB
    const existing = await queryOne('SELECT id FROM leads WHERE phone = $1', [phone]);

    if (existing) {
      result.alreadyInDb++;
      continue;
    }

    // Insertar como lead ya contactado
    const name = chat.pushName || chat.name || 'Contacto WA';
    await query(
      `INSERT INTO leads (first_name, phone, temperature, pipeline_status, tags)
       VALUES ($1, $2, 'cold', 'contactado', ARRAY['historial-wa', 'sync-evolution'])
       ON CONFLICT (phone) DO NOTHING`,
      [name, phone]
    );

    result.synced++;
  }

  return result;
}

// Verificar si un número ya tiene historial de chat en Evolution API
export async function hasExistingChat(instanceName: string, phone: string): Promise<boolean> {
  // Primero chequeamos nuestra DB (más rápido)
  const existing = await queryOne(
    `SELECT id FROM messages WHERE lead_id = (SELECT id FROM leads WHERE phone = $1)
     AND channel_id = 'whatsapp' LIMIT 1`,
    [phone]
  );

  if (existing) return true;

  // Si no hay registro local, verificar en leads con tag historial-wa
  const tagged = await queryOne(
    "SELECT id FROM leads WHERE phone = $1 AND 'historial-wa' = ANY(tags)",
    [phone]
  );

  return !!tagged;
}
