import type { FastifyInstance } from 'fastify';
import { query, queryOne } from '../config/database.js';
import { getSequenceSteps, enrollLead, getActiveEnrollment, cancelEnrollment } from '../db/queries/sequences.js';
import { enrollLeadInMatchingSequence } from '../modules/sequences/enrollment.service.js';
import type { LeadTemperature, StepCondition, ChannelId } from '../db/types.js';

export async function sequencesRoutes(app: FastifyInstance) {
  app.get('/api/sequences', async (request, reply) => {
    const q = request.query as Record<string, string>;
    if (q.line_id) {
      const data = await query(
        'SELECT s.*, wl.display_name as line_name FROM sequences s LEFT JOIN whatsapp_lines wl ON s.whatsapp_line_id = wl.id WHERE s.whatsapp_line_id = $1 ORDER BY s.created_at DESC',
        [q.line_id]
      );
      return reply.send(data);
    }
    const data = await query('SELECT s.*, wl.display_name as line_name FROM sequences s LEFT JOIN whatsapp_lines wl ON s.whatsapp_line_id = wl.id ORDER BY s.created_at DESC');
    return reply.send(data);
  });

  app.get('/api/sequences/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const sequence = await queryOne('SELECT * FROM sequences WHERE id = $1', [id]);
    if (!sequence) return reply.status(404).send({ error: 'Secuencia no encontrada' });
    const steps = await getSequenceSteps(id);
    return reply.send({ ...sequence, steps });
  });

  app.post('/api/sequences', async (request, reply) => {
    const body = request.body as {
      name: string;
      target_niche?: string;
      target_city?: string;
      target_temperature?: LeadTemperature;
      whatsapp_line_id?: string;
      steps: Array<{
        step_order: number;
        channel_id: ChannelId;
        message_template: string;
        use_audio?: boolean;
        delay_hours: number;
        condition?: StepCondition;
      }>;
    };

    const sequence = await queryOne(
      `INSERT INTO sequences (name, target_niche, target_city, target_temperature, whatsapp_line_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [body.name, body.target_niche ?? null, body.target_city ?? null, body.target_temperature ?? null, body.whatsapp_line_id ?? null]
    );

    if (!sequence) return reply.status(500).send({ error: 'Error creando secuencia' });

    if (body.steps?.length) {
      for (const step of body.steps) {
        await query(
          `INSERT INTO sequence_steps (sequence_id, step_order, channel_id, message_template, use_audio, delay_hours, condition)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [sequence.id, step.step_order, step.channel_id, step.message_template, step.use_audio ?? false, step.delay_hours, step.condition ?? 'always']
        );
      }
    }

    const steps = await getSequenceSteps(sequence.id);
    return reply.status(201).send({ ...sequence, steps });
  });

  app.post('/api/sequences/:id/enroll', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { lead_id } = request.body as { lead_id: string };
    try {
      const nextStepAt = new Date(Date.now() + 60 * 1000).toISOString();
      const enrollment = await enrollLead(lead_id, id, nextStepAt);
      return reply.status(201).send(enrollment);
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  app.post('/api/sequences/auto-enroll', async (request, reply) => {
    const { lead_id } = request.body as { lead_id: string };
    const lead = await queryOne('SELECT * FROM leads WHERE id = $1', [lead_id]);
    if (!lead) return reply.status(404).send({ error: 'Lead no encontrado' });
    await enrollLeadInMatchingSequence(lead as any);
    const enrollment = await getActiveEnrollment(lead_id);
    return reply.send(enrollment ?? { message: 'No se encontró secuencia que matchee' });
  });

  app.delete('/api/enrollments/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await cancelEnrollment(id);
    return reply.send({ ok: true });
  });
}
