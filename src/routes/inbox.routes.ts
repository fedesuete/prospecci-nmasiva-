import type { FastifyInstance } from 'fastify';
import { getUnifiedInbox } from '../modules/inbox/unified.js';
import { listConversations, getThread, resolveReplyLine, getLineSummary, type LineScope } from '../modules/inbox/conversations.js';
import { getUserLineIds } from '../db/queries/users.js';
import { insertMessage, updateMessageStatus } from '../db/queries/messages.js';
import { convertToOgg } from '../modules/channels/whatsapp/convert-audio.js';
import { env } from '../config/env.js';
import type { AuthContext } from '../middleware/auth.js';
import { randomBytes } from 'crypto';

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
    const conversations = await listConversations(scope, limit, q.line_id || undefined);
    return reply.send(conversations);
  });

  // Resumen por línea: cuántas conversaciones sin responder tiene cada una
  app.get('/api/inbox/lines-summary', async (request, reply) => {
    const scope = await resolveScope(request.auth!);
    const summary = await getLineSummary(scope);
    return reply.send(summary);
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

  // Responder con un AUDIO grabado (nota de voz). Multipart: file + lead_id
  app.post('/api/inbox/reply-audio', async (request, reply) => {
    const parts = request.parts();
    let fileBuffer: Buffer | null = null;
    let leadId = '';
    for await (const part of parts) {
      if (part.type === 'file') fileBuffer = await part.toBuffer();
      else if (part.fieldname === 'lead_id') leadId = part.value as string;
    }
    if (!fileBuffer || !leadId) {
      return reply.status(400).send({ error: 'Falta el audio o el lead_id' });
    }

    const scope = await resolveScope(request.auth!);
    const line = await resolveReplyLine(leadId, scope);
    if (!line) return reply.status(403).send({ error: 'No tenés una línea disponible para responder' });

    const lead = await import('../db/queries/leads.js').then((m) => m.findLeadById(leadId));
    if (!lead) return reply.status(404).send({ error: 'Lead no encontrado' });

    const fs = await import('fs');
    const path = await import('path');
    const id = randomBytes(12).toString('hex');
    const dir = path.join(env.AUDIO_STORAGE_PATH, 'inbound');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const inputPath = path.join(dir, `${id}.input`);
    const oggPath = path.join(dir, `${id}.ogg`);

    const msg = await insertMessage({
      lead_id: lead.id,
      channel_id: 'whatsapp',
      whatsapp_line_id: line.id,
      direction: 'outbound',
      content_type: 'audio',
      content: `/api/media/inbound/${id}.ogg`,
      status: 'queued',
    });

    try {
      fs.writeFileSync(inputPath, fileBuffer);
      await convertToOgg(inputPath, oggPath);
      fs.unlinkSync(inputPath);

      const audioBase64 = fs.readFileSync(oggPath).toString('base64');
      const phone = lead.phone.replace('+', '');
      const baseUrl = (line.api_url || env.EVOLUTION_API_URL).replace(/\/$/, '');
      const response = await fetch(`${baseUrl}/message/sendWhatsAppAudio/${line.instance_name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: line.api_key || env.EVOLUTION_API_KEY },
        body: JSON.stringify({ number: phone, audio: audioBase64 }),
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
