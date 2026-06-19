import { query, queryOne } from '../../config/database.js';

export interface InboxFilters {
  channelId?: string;
  lineId?: string;
  limit?: number;
  offset?: number;
}

export async function getUnifiedInbox(filters: InboxFilters = {}) {
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  const conditions = ["m.direction = 'inbound'"];
  const params: any[] = [];
  let paramIdx = 1;

  if (filters.channelId) {
    conditions.push(`m.channel_id = $${paramIdx++}`);
    params.push(filters.channelId);
  }

  if (filters.lineId) {
    conditions.push(`l.assigned_line_id = $${paramIdx++}`);
    params.push(filters.lineId);
  }

  const where = conditions.join(' AND ');

  const [messages, countResult] = await Promise.all([
    query(
      `SELECT m.*, json_build_object(
        'id', l.id, 'first_name', l.first_name, 'last_name', l.last_name,
        'company_name', l.company_name, 'phone', l.phone, 'email', l.email,
        'pipeline_status', l.pipeline_status, 'assigned_line_id', l.assigned_line_id
      ) as lead
      FROM messages m JOIN leads l ON m.lead_id = l.id
      WHERE ${where}
      ORDER BY m.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      params
    ),
    queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM messages m JOIN leads l ON m.lead_id = l.id WHERE ${where}`,
      params
    ),
  ]);

  return { messages, total: parseInt(countResult?.count ?? '0') };
}

export async function getConversations(limit: number = 50) {
  return query(
    `SELECT DISTINCT ON (m.lead_id) m.*,
      json_build_object('id', l.id, 'first_name', l.first_name, 'last_name', l.last_name,
        'company_name', l.company_name, 'phone', l.phone, 'pipeline_status', l.pipeline_status
      ) as lead
    FROM messages m JOIN leads l ON m.lead_id = l.id
    WHERE m.direction = 'inbound'
    ORDER BY m.lead_id, m.created_at DESC
    LIMIT $1`,
    [limit]
  );
}
