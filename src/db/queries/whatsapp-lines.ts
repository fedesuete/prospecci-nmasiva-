import { query, queryOne } from '../../config/database.js';
import type { WhatsAppLine } from '../types.js';

export async function getAvailableLines(): Promise<WhatsAppLine[]> {
  return query<WhatsAppLine>(
    `SELECT * FROM whatsapp_lines
     WHERE status IN ('active', 'warming_up') AND sent_today < daily_limit
     ORDER BY sent_today ASC`
  );
}

export async function getAllLines(): Promise<WhatsAppLine[]> {
  return query<WhatsAppLine>('SELECT * FROM whatsapp_lines ORDER BY created_at ASC');
}

export async function incrementSentCounter(lineId: string): Promise<void> {
  // Reset si cambió el día, o incrementar
  await query(
    `UPDATE whatsapp_lines SET
      sent_today = CASE WHEN last_reset_at < CURRENT_DATE THEN 1 ELSE sent_today + 1 END,
      last_reset_at = CURRENT_DATE
     WHERE id = $1`,
    [lineId]
  );
}

export async function getLineById(id: string): Promise<WhatsAppLine | null> {
  return queryOne<WhatsAppLine>('SELECT * FROM whatsapp_lines WHERE id = $1', [id]);
}

export async function resetDailyCounters(): Promise<number> {
  const result = await query(
    `UPDATE whatsapp_lines SET sent_today = 0, last_reset_at = CURRENT_DATE
     WHERE last_reset_at < CURRENT_DATE RETURNING id`
  );
  return result.length;
}
