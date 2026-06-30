import type { FastifyInstance } from 'fastify';
import { query, queryOne } from '../config/database.js';
import { getSequenceSteps, enrollLead, getActiveEnrollment, cancelEnrollment } from '../db/queries/sequences.js';
import { enrollLeadInMatchingSequence } from '../modules/sequences/enrollment.service.js';
import { adminOnly } from '../middleware/line-access.js';
import type { StepCondition, ChannelId } from '../db/types.js';

export async function sequencesRoutes(app: FastifyInstance) {
  app.get('/api/sequences', async (_request, reply) => {
    const data = await query(`
      SELECT s.*,
        (SELECT count(*) FROM sequence_steps st WHERE st.sequence_id = s.id) AS step_count,
        (SELECT count(*) FROM sequence_enrollments e WHERE e.sequence_id = s.id AND e.status = 'active') AS active_count,
        (SELECT count(*) FROM sequence_enrollments e WHERE e.sequence_id = s.id AND e.status = 'completed') AS completed_count,
        (SELECT count(*) FROM sequence_enrollments e WHERE e.sequence_id = s.id AND e.status = 'replied') AS replied_count
      FROM sequences s ORDER BY s.created_at DESC
    `);
    return reply.send(data);
  });

  // Actualizar (reemplaza nombre + pasos) — admin
  app.put('/api/sequences/:id', async (request, reply) => {
    if (!adminOnly(request.auth!, reply)) return;
    const { id } = request.params as { id: string };
    const body = request.body as {
      name: string;
      steps: Array<{ channel_id: ChannelId; message_template: string; use_audio?: boolean; delay_hours: number; condition?: StepCondition }>;
    };
    await query('UPDATE sequences SET name = $1, updated_at = now() WHERE id = $2', [body.name, id]);
    await query('DELETE FROM sequence_steps WHERE sequence_id = $1', [id]);
    if (body.steps?.length) {
      for (let i = 0; i < body.steps.length; i++) {
        const s = body.steps[i];
        await query(
          `INSERT INTO sequence_steps (sequence_id, step_order, channel_id, message_template, use_audio, delay_hours, condition)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [id, i + 1, s.channel_id, s.message_template, s.use_audio ?? false, s.delay_hours, s.condition ?? 'always']
        );
      }
    }
    const sequence = await queryOne('SELECT * FROM sequences WHERE id = $1', [id]);
    const steps = await getSequenceSteps(id);
    return reply.send({ ...sequence, steps });
  });

  // Activar / desactivar — admin
  app.patch('/api/sequences/:id', async (request, reply) => {
    if (!adminOnly(request.auth!, reply)) return;
    const { id } = request.params as { id: string };
    const { is_active } = request.body as { is_active: boolean };
    await query('UPDATE sequences SET is_active = $1, updated_at = now() WHERE id = $2', [is_active, id]);
    return reply.send({ ok: true });
  });

  // Eliminar — admin
  app.delete('/api/sequences/:id', async (request, reply) => {
    if (!adminOnly(request.auth!, reply)) return;
    const { id } = request.params as { id: string };
    await query('DELETE FROM sequences WHERE id = $1', [id]);
    return reply.send({ ok: true });
  });

  // Enrolar en lote por etiqueta — admin
  app.post('/api/sequences/:id/enroll-bulk', async (request, reply) => {
    if (!adminOnly(request.auth!, reply)) return;
    const { id } = request.params as { id: string };
    const body = request.body as { tag?: string; limit?: number };
    if (!body.tag?.trim()) return reply.status(400).send({ error: 'Indicá una etiqueta' });

    const leads = await query<{ id: string }>(
      `SELECT id FROM leads WHERE $1 = ANY(tags) AND do_not_contact = false LIMIT $2`,
      [body.tag.trim(), Math.min(body.limit ?? 500, 2000)]
    );

    let enrolled = 0;
    let skipped = 0;
    for (const lead of leads) {
      try {
        await enrollLead(lead.id, id, new Date(Date.now() + 60 * 1000).toISOString());
        enrolled++;
      } catch {
        skipped++; // ya está en una secuencia activa
      }
    }
    return reply.send({ enrolled, skipped, total: leads.length });
  });

  app.get('/api/sequences/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const sequence = await queryOne('SELECT * FROM sequences WHERE id = $1', [id]);
    if (!sequence) return reply.status(404).send({ error: 'Secuencia no encontrada' });
    const steps = await getSequenceSteps(id);
    return reply.send({ ...sequence, steps });
  });

  app.post('/api/sequences', async (request, reply) => {
    if (!adminOnly(request.auth!, reply)) return;
    const body = request.body as {
      name: string;
      steps?: Array<{
        channel_id: ChannelId;
        message_template: string;
        use_audio?: boolean;
        delay_hours: number;
        condition?: StepCondition;
      }>;
    };
    if (!body.name?.trim()) return reply.status(400).send({ error: 'El nombre es requerido' });

    const sequence = await queryOne(
      `INSERT INTO sequences (name) VALUES ($1) RETURNING *`,
      [body.name.trim()]
    );
    if (!sequence) return reply.status(500).send({ error: 'Error creando secuencia' });

    if (body.steps?.length) {
      for (let i = 0; i < body.steps.length; i++) {
        const step = body.steps[i];
        await query(
          `INSERT INTO sequence_steps (sequence_id, step_order, channel_id, message_template, use_audio, delay_hours, condition)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [sequence.id, i + 1, step.channel_id, step.message_template, step.use_audio ?? false, step.delay_hours, step.condition ?? 'always']
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
