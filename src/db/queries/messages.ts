import { query, queryOne } from '../../config/database.js';
import type { Message, MessageInsert, ChannelId } from '../types.js';

export async function insertMessage(msg: MessageInsert): Promise<Message> {
  const result = await queryOne<Message>(
    `INSERT INTO messages (lead_id, channel_id, whatsapp_line_id, enrollment_id, direction,
      content_type, content, audio_variant_id, audio_hash, external_id, status, error_detail, sent_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [
      msg.lead_id, msg.channel_id, msg.whatsapp_line_id ?? null,
      msg.enrollment_id ?? null, msg.direction, msg.content_type ?? 'text',
      msg.content ?? null, msg.audio_variant_id ?? null, msg.audio_hash ?? null,
      msg.external_id ?? null, msg.status ?? 'queued', msg.error_detail ?? null,
      msg.sent_at ?? null,
    ]
  );
  if (!result) throw new Error('Error inserting message');
  return result;
}

export async function updateMessageStatus(id: string, status: Message['status'], externalId?: string): Promise<void> {
  if (status === 'sent') {
    await query(
      'UPDATE messages SET status = $1, external_id = COALESCE($2, external_id), sent_at = now() WHERE id = $3',
      [status, externalId ?? null, id]
    );
  } else {
    await query(
      'UPDATE messages SET status = $1, external_id = COALESCE($2, external_id) WHERE id = $3',
      [status, externalId ?? null, id]
    );
  }
}

export async function hasRecentOutbound(leadId: string, channelId: ChannelId, hoursAgo: number = 24): Promise<boolean> {
  const result = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM messages
     WHERE lead_id = $1 AND channel_id = $2 AND direction = 'outbound'
     AND created_at >= now() - interval '1 hour' * $3`,
    [leadId, channelId, hoursAgo]
  );
  return parseInt(result?.count ?? '0') > 0;
}

export async function hasLeadReplied(leadId: string): Promise<boolean> {
  const result = await queryOne<{ count: string }>(
    "SELECT COUNT(*) as count FROM messages WHERE lead_id = $1 AND direction = 'inbound'",
    [leadId]
  );
  return parseInt(result?.count ?? '0') > 0;
}

export async function getInboxMessages(limit: number = 50, offset: number = 0) {
  return query(
    `SELECT m.*, json_build_object('first_name', l.first_name, 'company_name', l.company_name, 'phone', l.phone, 'pipeline_status', l.pipeline_status) as lead
     FROM messages m JOIN leads l ON m.lead_id = l.id
     WHERE m.direction = 'inbound'
     ORDER BY m.created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
}

export async function getLeadMessages(leadId: string): Promise<Message[]> {
  return query<Message>(
    'SELECT * FROM messages WHERE lead_id = $1 ORDER BY created_at ASC',
    [leadId]
  );
}
