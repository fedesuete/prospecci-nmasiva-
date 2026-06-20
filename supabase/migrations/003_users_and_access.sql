-- ============================================
-- MIGRACIÓN 003: Usuarios y control de acceso por líneas
-- Login de empleados (agentes) con inbox filtrado por líneas asignadas
-- ============================================

-- pgcrypto para hashear la contraseña del admin inicial (compatible con bcrypt)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('admin', 'agent');

-- ============================================
-- Tabla: users
-- Cuentas de acceso al panel (admin = vos, agent = empleados)
-- ============================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'agent',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX users_email_idx ON users (lower(email));

-- ============================================
-- Tabla: user_lines
-- Líneas de WhatsApp que puede atender cada usuario (acceso agrupa 2-3 líneas)
-- ============================================
CREATE TABLE user_lines (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  whatsapp_line_id UUID NOT NULL REFERENCES whatsapp_lines(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, whatsapp_line_id)
);

CREATE INDEX user_lines_user_idx ON user_lines (user_id);

-- updated_at automático (función creada en migración 001)
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- Admin inicial (cambiar la contraseña después del primer login)
-- ============================================
INSERT INTO users (email, password_hash, name, role)
VALUES (
  'federicobogado1997@gmail.com',
  crypt('Prospeccion2026!', gen_salt('bf', 10)),
  'Federico',
  'admin'
)
ON CONFLICT (email) DO NOTHING;
