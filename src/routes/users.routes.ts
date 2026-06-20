import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  setUserLines,
  findUserByEmail,
  findUserById,
} from '../db/queries/users.js';
import { hashPassword } from '../modules/auth/service.js';
import { requireAdmin } from '../middleware/auth.js';

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  role: z.enum(['admin', 'agent']).default('agent'),
  line_ids: z.array(z.string().uuid()).default([]),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  password: z.string().min(6).optional(),
  is_active: z.boolean().optional(),
  line_ids: z.array(z.string().uuid()).optional(),
});

export async function usersRoutes(app: FastifyInstance) {
  // Todas las rutas de este módulo son solo para admin
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/users')) return;
    requireAdmin(request, reply);
  });

  // GET /api/users — listar accesos con sus líneas
  app.get('/api/users', async (_request, reply) => {
    const users = await listUsers();
    return reply.send(users);
  });

  // POST /api/users — crear acceso (empleado o admin)
  app.post('/api/users', async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Datos inválidos', detail: parsed.error.flatten() });
    }
    const data = parsed.data;

    const existing = await findUserByEmail(data.email);
    if (existing) {
      return reply.status(400).send({ error: 'Ya existe un usuario con ese email' });
    }

    const user = await createUser({
      email: data.email,
      password_hash: await hashPassword(data.password),
      name: data.name,
      role: data.role,
    });

    if (data.line_ids.length > 0) {
      await setUserLines(user.id, data.line_ids);
    }

    return reply.status(201).send({ id: user.id });
  });

  // PATCH /api/users/:id — editar acceso (nombre, contraseña, activo, líneas)
  app.patch('/api/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Datos inválidos' });
    }
    const data = parsed.data;

    const user = await findUserById(id);
    if (!user) return reply.status(404).send({ error: 'Usuario no encontrado' });

    await updateUser(id, {
      name: data.name,
      is_active: data.is_active,
      password_hash: data.password ? await hashPassword(data.password) : undefined,
    });

    if (data.line_ids !== undefined) {
      await setUserLines(id, data.line_ids);
    }

    return reply.send({ ok: true });
  });

  // DELETE /api/users/:id — eliminar acceso
  app.delete('/api/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const auth = request.auth!;
    if (auth.userId === id) {
      return reply.status(400).send({ error: 'No podés eliminar tu propio usuario' });
    }
    await deleteUser(id);
    return reply.send({ ok: true });
  });
}
