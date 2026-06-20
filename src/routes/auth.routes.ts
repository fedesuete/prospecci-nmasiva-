import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  findUserByEmail,
  findUserById,
  updateUser,
} from '../db/queries/users.js';
import {
  verifyPassword,
  hashPassword,
  signToken,
} from '../modules/auth/service.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance) {
  // POST /api/auth/login — pública (exenta del middleware en index.ts)
  app.post('/api/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Email o contraseña inválidos' });
    }

    const { email, password } = parsed.data;
    const user = await findUserByEmail(email);
    if (!user || !user.is_active) {
      return reply.status(401).send({ error: 'Credenciales incorrectas' });
    }

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      return reply.status(401).send({ error: 'Credenciales incorrectas' });
    }

    const token = signToken({
      sub: user.id,
      role: user.role,
      email: user.email,
      name: user.name,
    });

    return reply.send({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  });

  // GET /api/auth/me — datos del usuario autenticado
  app.get('/api/auth/me', async (request, reply) => {
    const auth = request.auth!;
    if (auth.isService) {
      return reply.send({ id: null, email: 'service', name: 'Servicio', role: 'admin' });
    }
    const user = await findUserById(auth.userId!);
    if (!user) return reply.status(404).send({ error: 'Usuario no encontrado' });
    return reply.send({ id: user.id, email: user.email, name: user.name, role: user.role });
  });

  // POST /api/auth/change-password — cambiar la propia contraseña
  app.post('/api/auth/change-password', async (request, reply) => {
    const auth = request.auth!;
    if (auth.isService || !auth.userId) {
      return reply.status(400).send({ error: 'No aplica para este acceso' });
    }
    const body = request.body as { current_password?: string; new_password?: string };
    if (!body.new_password || body.new_password.length < 6) {
      return reply.status(400).send({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
    }
    const user = await findUserById(auth.userId);
    if (!user) return reply.status(404).send({ error: 'Usuario no encontrado' });

    const ok = await verifyPassword(body.current_password ?? '', user.password_hash);
    if (!ok) return reply.status(401).send({ error: 'La contraseña actual es incorrecta' });

    await updateUser(user.id, { password_hash: await hashPassword(body.new_password) });
    return reply.send({ ok: true });
  });
}
