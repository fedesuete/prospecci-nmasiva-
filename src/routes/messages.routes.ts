import type { FastifyInstance } from 'fastify';
import { getLeadMessages, insertMessage, updateMessageStatus } from '../db/queries/messages.js';
import { findLeadById } from '../db/queries/leads.js';
import { query, queryOne } from '../config/database.js';
import { env } from '../config/env.js';

export async function messagesRoutes(app: FastifyInstance) {
  app.get('/api/leads/:id/messages', async (request, reply) => {
    const { id } = request.params as { id: string };
    const messages = await getLeadMessages(id);
    return reply.send(messages);
  });

  // Envío manual de WhatsApp — respuesta directa, sin anti-duplicado
  app.post('/api/messages/send-whatsapp', async (request, reply) => {
    const body = request.body as {
      lead_id: string;
      message: string;
      use_audio?: boolean;
    };

    try {
      const lead = await findLeadById(body.lead_id);
      if (!lead) return reply.status(404).send({ error: 'Lead no encontrado' });

      // Buscar la línea asignada al lead, o cualquier línea activa
      let line = null as any;
      if (lead.assigned_line_id) {
        line = await queryOne('SELECT * FROM whatsapp_lines WHERE id = $1', [lead.assigned_line_id]);
      }
      if (!line) {
        line = await queryOne("SELECT * FROM whatsapp_lines WHERE status IN ('active', 'warming_up') LIMIT 1");
      }
      if (!line) return reply.send({ success: false, error: 'No hay lineas WhatsApp disponibles' });

      const phone = lead.phone.replace('+', '');

      // Registrar mensaje
      const msg = await insertMessage({
        lead_id: lead.id,
        channel_id: 'whatsapp',
        whatsapp_line_id: line.id,
        direction: 'outbound',
        content_type: 'text',
        content: body.message,
        status: 'queued',
      });

      // Enviar via Evolution API
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

      const result = await response.json() as { key?: { id?: string } };
      await updateMessageStatus(msg.id, 'sent', result.key?.id);

      return reply.send({ success: true, messageId: msg.id });
    } catch (err) {
      return reply.send({ success: false, error: (err as Error).message });
    }
  });

  // Envío manual de email
  app.post('/api/messages/send-email', async (request, reply) => {
    const { sendEmail } = await import('../modules/channels/email/sender.js');
    const body = request.body as {
      lead_id: string;
      subject: string;
      body: string;
    };

    const result = await sendEmail({
      leadId: body.lead_id,
      subject: body.subject,
      bodyTemplate: body.body,
    });

    return reply.send(result);
  });
}
