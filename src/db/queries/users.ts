import { query, queryOne } from '../../config/database.js';
import type { UserRole } from '../../modules/auth/service.js';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Vista pública (sin hash) + líneas asignadas
export interface UserPublic {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  line_ids: string[];
  line_names: string[];
}

export async function findUserByEmail(email: string): Promise<User | null> {
  return queryOne<User>('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
}

export async function findUserById(id: string): Promise<User | null> {
  return queryOne<User>('SELECT * FROM users WHERE id = $1', [id]);
}

export async function listUsers(): Promise<UserPublic[]> {
  return query<UserPublic>(
    `SELECT u.id, u.email, u.name, u.role, u.is_active, u.created_at,
       COALESCE(array_agg(ul.whatsapp_line_id) FILTER (WHERE ul.whatsapp_line_id IS NOT NULL), '{}') AS line_ids,
       COALESCE(array_agg(wl.display_name) FILTER (WHERE wl.id IS NOT NULL), '{}') AS line_names
     FROM users u
     LEFT JOIN user_lines ul ON ul.user_id = u.id
     LEFT JOIN whatsapp_lines wl ON wl.id = ul.whatsapp_line_id
     GROUP BY u.id
     ORDER BY u.created_at ASC`
  );
}

export async function createUser(data: {
  email: string;
  password_hash: string;
  name: string;
  role: UserRole;
}): Promise<User> {
  const user = await queryOne<User>(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [data.email.trim().toLowerCase(), data.password_hash, data.name, data.role]
  );
  if (!user) throw new Error('No se pudo crear el usuario');
  return user;
}

export async function updateUser(
  id: string,
  data: { name?: string; password_hash?: string; is_active?: boolean }
): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];
  let idx = 1;
  if (data.name !== undefined) { fields.push(`name = $${idx++}`); values.push(data.name); }
  if (data.password_hash !== undefined) { fields.push(`password_hash = $${idx++}`); values.push(data.password_hash); }
  if (data.is_active !== undefined) { fields.push(`is_active = $${idx++}`); values.push(data.is_active); }
  if (fields.length === 0) return;
  values.push(id);
  await query(`UPDATE users SET ${fields.join(', ')} WHERE id = $${idx}`, values);
}

export async function deleteUser(id: string): Promise<void> {
  await query('DELETE FROM users WHERE id = $1', [id]);
}

// Reemplaza el set completo de líneas asignadas a un usuario
export async function setUserLines(userId: string, lineIds: string[]): Promise<void> {
  await query('DELETE FROM user_lines WHERE user_id = $1', [userId]);
  if (lineIds.length === 0) return;
  const values: string[] = [];
  const params: any[] = [userId];
  lineIds.forEach((lineId, i) => {
    values.push(`($1, $${i + 2})`);
    params.push(lineId);
  });
  await query(
    `INSERT INTO user_lines (user_id, whatsapp_line_id) VALUES ${values.join(', ')}
     ON CONFLICT DO NOTHING`,
    params
  );
}

// IDs de líneas que puede atender un usuario
export async function getUserLineIds(userId: string): Promise<string[]> {
  const rows = await query<{ whatsapp_line_id: string }>(
    'SELECT whatsapp_line_id FROM user_lines WHERE user_id = $1',
    [userId]
  );
  return rows.map((r) => r.whatsapp_line_id);
}
