import type { FastifyInstance } from 'fastify';
import { query, queryOne } from '../config/database.js';

export async function quickRepliesRoutes(app: FastifyInstance) {
  // Listar plantillas
  app.get('/api/quick-replies', async (_request, reply) => {
    const data = await query('SELECT id, title, text, created_at FROM quick_replies ORDER BY created_at ASC');
    return reply.send(data);
  });

  // Crear plantilla
  app.post('/api/quick-replies', async (request, reply) => {
    const body = request.body as { title?: string; text?: string };
    if (!body.title?.trim() || !body.text?.trim()) {
      return reply.status(400).send({ error: 'Título y texto son requeridos' });
    }
    const row = await queryOne(
      'INSERT INTO quick_replies (title, text) VALUES ($1, $2) RETURNING id, title, text, created_at',
      [body.title.trim(), body.text.trim()]
    );
    return reply.status(201).send(row);
  });

  // Eliminar plantilla
  app.delete('/api/quick-replies/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await query('DELETE FROM quick_replies WHERE id = $1', [id]);
    return reply.send({ ok: true });
  });
}
