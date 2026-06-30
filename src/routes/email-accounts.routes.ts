import type { FastifyInstance } from 'fastify';
import { createTransport } from 'nodemailer';
import { query, queryOne } from '../config/database.js';
import { adminOnly } from '../middleware/line-access.js';

export async function emailAccountsRoutes(app: FastifyInstance) {
  // Listar casillas (sin la contraseña)
  app.get('/api/email-accounts', async (request, reply) => {
    if (!adminOnly(request.auth!, reply)) return;
    const data = await query(`
      SELECT id, name, smtp_host, smtp_port, smtp_user, from_name,
             daily_limit, sent_today, warmup_daily_increment, is_active, created_at
      FROM email_accounts ORDER BY created_at ASC
    `);
    return reply.send(data);
  });

  // Crear casilla
  app.post('/api/email-accounts', async (request, reply) => {
    if (!adminOnly(request.auth!, reply)) return;
    const b = request.body as Record<string, any>;
    if (!b.name?.trim() || !b.smtp_host?.trim() || !b.smtp_user?.trim() || !b.smtp_pass?.trim()) {
      return reply.status(400).send({ error: 'Faltan datos (nombre, host, usuario, contraseña)' });
    }
    const row = await queryOne(
      `INSERT INTO email_accounts (name, smtp_host, smtp_port, smtp_user, smtp_pass, from_name, daily_limit, warmup_daily_increment)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, name, smtp_host, smtp_port, smtp_user, from_name, daily_limit, sent_today, warmup_daily_increment, is_active`,
      [
        b.name.trim(), b.smtp_host.trim(), b.smtp_port || 587, b.smtp_user.trim(), b.smtp_pass,
        b.from_name || null, b.daily_limit || 30, b.warmup_daily_increment || 0,
      ]
    );
    return reply.status(201).send(row);
  });

  // Editar casilla
  app.patch('/api/email-accounts/:id', async (request, reply) => {
    if (!adminOnly(request.auth!, reply)) return;
    const { id } = request.params as { id: string };
    const b = request.body as Record<string, any>;
    const fields: string[] = [];
    const vals: any[] = [];
    let i = 1;
    for (const k of ['name', 'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'from_name', 'daily_limit', 'warmup_daily_increment', 'is_active']) {
      if (b[k] !== undefined && b[k] !== '') { fields.push(`${k} = $${i++}`); vals.push(b[k]); }
    }
    if (fields.length === 0) return reply.status(400).send({ error: 'Nada para actualizar' });
    vals.push(id);
    await query(`UPDATE email_accounts SET ${fields.join(', ')} WHERE id = $${i}`, vals);
    return reply.send({ ok: true });
  });

  // Eliminar casilla
  app.delete('/api/email-accounts/:id', async (request, reply) => {
    if (!adminOnly(request.auth!, reply)) return;
    const { id } = request.params as { id: string };
    await query('DELETE FROM email_accounts WHERE id = $1', [id]);
    return reply.send({ ok: true });
  });

  // Probar la casilla (envía un email de prueba a sí misma)
  app.post('/api/email-accounts/:id/test', async (request, reply) => {
    if (!adminOnly(request.auth!, reply)) return;
    const { id } = request.params as { id: string };
    const acc = await queryOne<any>('SELECT * FROM email_accounts WHERE id = $1', [id]);
    if (!acc) return reply.status(404).send({ error: 'Casilla no encontrada' });
    const to = (request.body as { to?: string })?.to || acc.smtp_user;
    try {
      const transport = createTransport({
        host: acc.smtp_host,
        port: acc.smtp_port,
        secure: acc.smtp_port === 465,
        auth: { user: acc.smtp_user, pass: acc.smtp_pass },
      });
      await transport.sendMail({
        from: `"${acc.from_name ?? 'Prospección'}" <${acc.smtp_user}>`,
        to,
        subject: 'Prueba de casilla - Prospección',
        text: 'Esta es una prueba. Si la recibiste, la casilla está bien configurada ✅',
      });
      return reply.send({ ok: true, to });
    } catch (err) {
      return reply.status(400).send({ ok: false, error: (err as Error).message });
    }
  });
}
