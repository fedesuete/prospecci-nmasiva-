import type { FastifyInstance } from 'fastify';
import { getUnifiedInbox } from '../modules/inbox/unified.js';
import { listConversations, getThread, resolveReplyLine, type LineScope } from '../modules/inbox/conversations.js';
import { getUserLineIds } from '../db/queries/users.js';
import { insertMessage, updateMessageStatus } from '../db/queries/messages.js';
import { env } from '../config/env.js';
import type { AuthContext } from '../middleware/auth.js';

// Resuelve qué líneas puede ver el usuario: null = todas (admin/servicio)
async function resolveScope(auth: AuthContext): Promise<LineScope> {
  if (auth.role === 'admin' || auth.isService) return null;
  return getUserLineIds(auth.userId!);
}

export async function inboxRoutes(app: FastifyInstance) {
  // Lista de mensajes entrantes (vista legacy) — scopeada
  app.get('/api/inbox', async (request, reply) => {
    const q = request.query as Record<string, string>;
    const scope = await resolveScope(request.auth!);
    const result = await getUnifiedInbox({
      channelId: q.channel,
      lineId: q.line_id,
      allowedLineIds: scope,
      limit: q.limit ? parseInt(q.limit) : 50,
      offset: q.offset ? parseInt(q.offset) : 0,
    });
    return reply.send(result);
  });

  // Lista de conversaciones para la vista de chat (una por lead) — scopeada
  app.get('/api/inbox/conversations', async (request, reply) => {
    const q = request.query as Record<string, string>;
    const scope = await resolveScope(request.auth!);
    const limit = q.limit ? parseInt(q.limit) : 100;
    const conversations = await listConversations(scope, limit);
    return reply.send(conversations);
  });

  // Hilo completo de una conversación — scopeado + marca leídos
  app.get('/api/inbox/thread/:leadId', async (request, reply) => {
    const { leadId } = request.params as { leadId: string };
    const scope = await resolveScope(request.auth!);
    const thread = await getThread(leadId, scope);
    if (!thread) return reply.status(404).send({ error: 'Conversación no encontrada o sin acceso' });
    return reply.send(thread);
  });

  // Responder en una conversación — sale por la línea del chat (validando alcance)
  app.post('/api/inbox/reply', async (request, reply) => {
    const body = request.body as { lead_id?: string; message?: string };
    if (!body.lead_id || !body.message?.trim()) {
      return reply.status(400).send({ error: 'lead_id y message son requeridos' });
    }

    const scope = await resolveScope(request.auth!);
    const line = await resolveReplyLine(body.lead_id, scope);
    if (!line) {
      return reply.status(403).send({ error: 'No tenés una línea disponible para responder esta conversación' });
    }

    const lead = await import('../db/queries/leads.js').then((m) => m.findLeadById(body.lead_id!));
    if (!lead) return reply.status(404).send({ error: 'Lead no encontrado' });

    const phone = lead.phone.replace('+', '');

    const msg = await insertMessage({
      lead_id: lead.id,
      channel_id: 'whatsapp',
      whatsapp_line_id: line.id,
      direction: 'outbound',
      content_type: 'text',
      content: body.message,
      status: 'queued',
    });

    try {
      const baseUrl = (line.api_url || env.EVOLUTION_API_URL).replace(/\/$/, '');
      const response = await fetch(`${baseUrl}/message/sendText/${line.instance_name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: line.api_key || env.EVOLUTION_API_KEY },
        body: JSON.stringify({ number: phone, text: body.message }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        await updateMessageStatus(msg.id, 'failed');
        return reply.send({ success: false, error: `Evolution API: ${errorText.substring(0, 200)}` });
      }

      const result = (await response.json()) as { key?: { id?: string } };
      await updateMessageStatus(msg.id, 'sent', result.key?.id);
      return reply.send({ success: true, messageId: msg.id });
    } catch (err) {
      await updateMessageStatus(msg.id, 'failed');
      return reply.send({ success: false, error: (err as Error).message });
    }
  });
}
