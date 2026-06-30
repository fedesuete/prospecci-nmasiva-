-- ============================================
-- MIGRACIÓN 005: Casillas de email (rotación + límite diario + calentamiento)
-- ============================================
CREATE TABLE email_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  smtp_host TEXT NOT NULL,
  smtp_port INT NOT NULL DEFAULT 587,
  smtp_user TEXT NOT NULL,        -- dirección de email (también el "from")
  smtp_pass TEXT NOT NULL,
  from_name TEXT,
  daily_limit INT NOT NULL DEFAULT 30,
  sent_today INT NOT NULL DEFAULT 0,
  last_reset_at DATE NOT NULL DEFAULT CURRENT_DATE,
  warmup_daily_increment INT NOT NULL DEFAULT 0,  -- sube el límite cada día (0 = fijo)
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX email_accounts_available_idx ON email_accounts (is_active, sent_today);
