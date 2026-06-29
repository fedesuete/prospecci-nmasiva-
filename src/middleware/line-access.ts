import type { FastifyReply } from 'fastify';
import { getUserLineIds } from '../db/queries/users.js';
import { queryOne } from '../config/database.js';
import type { AuthContext } from './auth.js';

// Líneas que puede ver/usar el usuario: null = todas (admin/servicio), [...] = sus líneas.
export async function resolveScope(auth: AuthContext): Promise<string[] | null> {
  if (auth.role === 'admin' || auth.isService) return null;
  return getUserLineIds(auth.userId!);
}

// ¿El usuario puede operar sobre esta línea (por id)?
export async function canAccessLineId(auth: AuthContext, lineId: string): Promise<boolean> {
  if (auth.role === 'admin' || auth.isService) return true;
  const ids = await getUserLineIds(auth.userId!);
  return ids.includes(lineId);
}

// ¿El usuario puede operar sobre esta línea (por instance_name)?
export async function canAccessInstance(auth: AuthContext, instanceName: string): Promise<boolean> {
  if (auth.role === 'admin' || auth.isService) return true;
  const line = await queryOne<{ id: string }>(
    'SELECT id FROM whatsapp_lines WHERE instance_name = $1',
    [instanceName]
  );
  if (!line) return false;
  return canAccessLineId(auth, line.id);
}

// Guard: corta con 403 si no es admin. Devuelve false si cortó.
export function adminOnly(auth: AuthContext, reply: FastifyReply): boolean {
  if (auth.role === 'admin' || auth.isService) return true;
  reply.status(403).send({ error: 'Acción solo para administradores' });
  return false;
}
