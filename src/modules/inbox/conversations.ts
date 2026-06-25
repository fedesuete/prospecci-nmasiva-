import { query, queryOne } from '../../config/database.js';
import type { Message } from '../../db/types.js';

// allowedLineIds === null  -> admin/servicio (ve todas las líneas)
// allowedLineIds === []    -> agente sin líneas asignadas (no ve nada)
// allowedLineIds === [...]  -> agente con esas líneas
export type LineScope = string[] | null;

export interface ConversationSummary {
  lead_id: string;
  content: string | null;
  direction: string;
  content_type: string;
  created_at: string;
  whatsapp_line_id: string | null;
  line_name: string | null;
  first_name: string;
  last_name: string | null;
  company_name: string | null;
  phone: string;
  pipeline_status: string;
  unread: string; // count viene como string desde pg
}

// Lista de conversaciones (una por lead) con el último mensaje, ordenadas por actividad.
// lineId opcional: filtra a una sola línea (debe estar dentro del alcance del usuario).
export async function listConversations(scope: LineScope, limit = 100, lineId?: string): Promise<ConversationSummary[]> {
  // Resolver alcance efectivo (una línea puntual o el alcance completo)
  let effective: LineScope = scope;
  if (lineId) {
    if (scope !== null && !scope.includes(lineId)) return [];
    effective = [lineId];
  }
  if (effective !== null && effective.length === 0) return [];

  const params: any[] = [];
  let lineFilter = '';
  if (effective !== null) {
    params.push(effective);
    lineFilter = `AND m.whatsapp_line_id = ANY($${params.length})`;
  }
  params.push(limit);
  const limitIdx = params.length;

  return query<ConversationSummary>(
    `SELECT * FROM (
       SELECT DISTINCT ON (m.lead_id)
         m.lead_id, m.content, m.direction, m.content_type, m.created_at, m.whatsapp_line_id,
         wl.display_name AS line_name,
         l.first_name, l.last_name, l.company_name, l.phone, l.pipeline_status,
         (SELECT count(*) FROM messages mm
            WHERE mm.lead_id = m.lead_id AND mm.direction = 'inbound' AND mm.status = 'received') AS unread
       FROM messages m
       JOIN leads l ON l.id = m.lead_id
       LEFT JOIN whatsapp_lines wl ON wl.id = m.whatsapp_line_id
       WHERE m.channel_id = 'whatsapp' ${lineFilter}
       ORDER BY m.lead_id, m.created_at DESC
     ) t
     ORDER BY t.created_at DESC
     LIMIT $${limitIdx}`,
    params
  );
}

// Verifica que el lead esté dentro del alcance del usuario
async function leadInScope(leadId: string, scope: LineScope): Promise<boolean> {
  if (scope === null) return true;
  if (scope.length === 0) return false;
  const row = await queryOne(
    `SELECT 1 FROM messages WHERE lead_id = $1 AND whatsapp_line_id = ANY($2) LIMIT 1`,
    [leadId, scope]
  );
  return !!row;
}

export interface ThreadResult {
  lead: any;
  line_id: string | null;
  messages: Message[];
}

// Hilo completo de una conversación + marca los entrantes como leídos
export async function getThread(leadId: string, scope: LineScope): Promise<ThreadResult | null> {
  if (!(await leadInScope(leadId, scope))) return null;

  const lead = await queryOne(
    `SELECT id, first_name, last_name, company_name, phone, email, pipeline_status, assigned_line_id
     FROM leads WHERE id = $1`,
    [leadId]
  );
  if (!lead) return null;

  const params: any[] = [leadId];
  let lineFilter = '';
  if (scope !== null) {
    params.push(scope);
    lineFilter = `AND (whatsapp_line_id = ANY($2) OR whatsapp_line_id IS NULL)`;
  }

  const messages = await query<Message>(
    `SELECT * FROM messages
     WHERE lead_id = $1 AND channel_id = 'whatsapp' ${lineFilter}
     ORDER BY created_at ASC`,
    params
  );

  // Marcar entrantes como leídos
  await query(
    `UPDATE messages SET status = 'read'
     WHERE lead_id = $1 AND direction = 'inbound' AND status = 'received'`,
    [leadId]
  );

  // Línea de la conversación = línea del último mensaje con línea asignada
  const lineRow = await queryOne<{ whatsapp_line_id: string }>(
    `SELECT whatsapp_line_id FROM messages
     WHERE lead_id = $1 AND whatsapp_line_id IS NOT NULL
     ORDER BY created_at DESC LIMIT 1`,
    [leadId]
  );

  return { lead, line_id: lineRow?.whatsapp_line_id ?? null, messages };
}

// Resuelve la línea por la que debe salir una respuesta a este lead (validando alcance)
export async function resolveReplyLine(leadId: string, scope: LineScope) {
  const lineRow = await queryOne<{ whatsapp_line_id: string }>(
    `SELECT whatsapp_line_id FROM messages
     WHERE lead_id = $1 AND whatsapp_line_id IS NOT NULL
     ORDER BY created_at DESC LIMIT 1`,
    [leadId]
  );
  let lineId = lineRow?.whatsapp_line_id ?? null;

  // Si no hay línea en el historial, usar la línea asignada al lead
  if (!lineId) {
    const lead = await queryOne<{ assigned_line_id: string | null }>(
      'SELECT assigned_line_id FROM leads WHERE id = $1',
      [leadId]
    );
    lineId = lead?.assigned_line_id ?? null;
  }

  if (!lineId) return null;
  if (scope !== null && !scope.includes(lineId)) return null; // fuera de alcance

  return queryOne<{ id: string; instance_name: string; api_url: string; api_key: string }>(
    'SELECT id, instance_name, api_url, api_key FROM whatsapp_lines WHERE id = $1',
    [lineId]
  );
}

export interface LineSummary {
  line_id: string;
  line_name: string;
  sin_responder: string; // conversaciones cuyo último mensaje es del cliente (count viene como string)
  total: string;
}

// Resumen por línea: cuántas conversaciones están SIN RESPONDER (último mensaje entrante).
// Respeta el alcance del usuario (admin: todas; agente: solo sus líneas).
export async function getLineSummary(scope: LineScope): Promise<LineSummary[]> {
  if (scope !== null && scope.length === 0) return [];

  const params: any[] = [];
  let where = '';
  if (scope !== null) {
    params.push(scope);
    where = `WHERE wl.id = ANY($${params.length})`;
  }

  return query<LineSummary>(
    `SELECT wl.id AS line_id, wl.display_name AS line_name,
            COALESCE(s.sin_responder, 0) AS sin_responder,
            COALESCE(s.total, 0) AS total
     FROM whatsapp_lines wl
     LEFT JOIN (
       SELECT lm.whatsapp_line_id AS line_id,
              count(*) FILTER (WHERE lm.direction = 'inbound') AS sin_responder,
              count(*) AS total
       FROM (
         SELECT DISTINCT ON (m.lead_id) m.lead_id, m.direction, m.whatsapp_line_id
         FROM messages m
         WHERE m.channel_id = 'whatsapp'
         ORDER BY m.lead_id, m.created_at DESC
       ) lm
       WHERE lm.whatsapp_line_id IS NOT NULL
       GROUP BY lm.whatsapp_line_id
     ) s ON s.line_id = wl.id
     ${where}
     ORDER BY wl.display_name ASC`,
    params
  );
}
