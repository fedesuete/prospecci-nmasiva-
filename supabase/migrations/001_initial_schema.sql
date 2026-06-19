-- ============================================
-- MIGRACIÓN 001: Esquema inicial completo
-- Plataforma de prospección multicanal B2B
-- ============================================

-- Enums
CREATE TYPE lead_temperature AS ENUM ('cold', 'warm');

CREATE TYPE pipeline_status AS ENUM (
  'nuevo', 'contactado', 'respondio', 'calificado',
  'agendado', 'cliente', 'descartado'
);

CREATE TYPE lead_source_type AS ENUM (
  'csv', 'facebook_lead_ads', 'scraping', 'manual', 'webhook'
);

CREATE TYPE whatsapp_line_status AS ENUM (
  'active', 'warming_up', 'paused', 'banned'
);

CREATE TYPE sequence_enrollment_status AS ENUM (
  'active', 'paused', 'completed', 'cancelled', 'replied'
);

CREATE TYPE message_direction AS ENUM ('outbound', 'inbound');

CREATE TYPE message_content_type AS ENUM ('text', 'audio', 'image', 'template');

CREATE TYPE message_status AS ENUM (
  'queued', 'sent', 'delivered', 'read', 'failed', 'received'
);

CREATE TYPE step_condition AS ENUM ('always', 'if_no_reply', 'if_replied');

-- ============================================
-- Tabla: lead_sources
-- Fuentes de captación de leads
-- ============================================
CREATE TABLE lead_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type lead_source_type NOT NULL,
  name TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- Tabla: channels
-- Canales de comunicación disponibles
-- ============================================
CREATE TABLE channels (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- Tabla: leads
-- Corazón del sistema - cada prospecto
-- ============================================
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES lead_sources(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT,
  company_name TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  instagram_handle TEXT,
  linkedin_url TEXT,
  niche TEXT,
  city TEXT,
  rubro TEXT,
  temperature lead_temperature NOT NULL DEFAULT 'cold',
  pipeline_status pipeline_status NOT NULL DEFAULT 'nuevo',
  pipeline_status_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  do_not_contact BOOLEAN NOT NULL DEFAULT false,
  tags TEXT[] DEFAULT '{}',
  raw_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deduplicación primaria por teléfono
CREATE UNIQUE INDEX leads_phone_unique ON leads (phone);

-- Deduplicación secundaria por email (solo si no es null)
CREATE UNIQUE INDEX leads_email_unique ON leads (email) WHERE email IS NOT NULL;

-- Segmentación por nicho, ciudad y estado
CREATE INDEX leads_segmentation_idx ON leads (niche, city, pipeline_status);

-- Pipeline queries
CREATE INDEX leads_pipeline_idx ON leads (pipeline_status);

-- Separar flujos frío/caliente
CREATE INDEX leads_temperature_idx ON leads (temperature);

-- Búsqueda por estado activo (leads disponibles para secuencias)
CREATE INDEX leads_available_idx ON leads (pipeline_status, do_not_contact)
  WHERE do_not_contact = false;

-- ============================================
-- Tabla: whatsapp_lines
-- Instancias de Evolution API (múltiples líneas)
-- ============================================
CREATE TABLE whatsapp_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_name TEXT NOT NULL UNIQUE,
  phone_number TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status whatsapp_line_status NOT NULL DEFAULT 'warming_up',
  daily_limit INT NOT NULL DEFAULT 80,
  sent_today INT NOT NULL DEFAULT 0,
  last_reset_at DATE NOT NULL DEFAULT CURRENT_DATE,
  warmup_start_date DATE,
  warmup_daily_increment INT NOT NULL DEFAULT 5,
  api_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- Tabla: audio_variants
-- Variantes de audio para mensajes de WhatsApp
-- ============================================
CREATE TABLE audio_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  duration_seconds REAL,
  niche TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audio_variants_active_idx ON audio_variants (is_active, niche);

-- ============================================
-- Tabla: sequences
-- Secuencias multicanal de contacto
-- ============================================
CREATE TABLE sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  target_niche TEXT,
  target_city TEXT,
  target_temperature lead_temperature,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- Tabla: sequence_steps
-- Pasos individuales dentro de una secuencia
-- ============================================
CREATE TABLE sequence_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  step_order INT NOT NULL,
  channel_id TEXT NOT NULL REFERENCES channels(id),
  message_template TEXT NOT NULL,
  use_audio BOOLEAN NOT NULL DEFAULT false,
  delay_hours INT NOT NULL DEFAULT 0,
  condition step_condition NOT NULL DEFAULT 'always',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (sequence_id, step_order)
);

CREATE INDEX sequence_steps_sequence_idx ON sequence_steps (sequence_id, step_order);

-- ============================================
-- Tabla: sequence_enrollments
-- Lead inscripto en una secuencia activa
-- Un lead solo puede estar en UNA secuencia activa a la vez
-- ============================================
CREATE TABLE sequence_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  sequence_id UUID NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  current_step_order INT NOT NULL DEFAULT 1,
  status sequence_enrollment_status NOT NULL DEFAULT 'active',
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  next_step_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Anti-doble-secuencia: un lead solo puede tener UNA inscripción activa
CREATE UNIQUE INDEX enrollments_active_lead_idx ON sequence_enrollments (lead_id)
  WHERE status = 'active';

-- Para el scheduler: buscar próximos pasos a ejecutar
CREATE INDEX enrollments_next_step_idx ON sequence_enrollments (next_step_at)
  WHERE status = 'active';

-- ============================================
-- Tabla: messages
-- Registro completo de toda comunicación
-- ============================================
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES channels(id),
  whatsapp_line_id UUID REFERENCES whatsapp_lines(id),
  enrollment_id UUID REFERENCES sequence_enrollments(id) ON DELETE SET NULL,
  direction message_direction NOT NULL,
  content_type message_content_type NOT NULL DEFAULT 'text',
  content TEXT,
  audio_variant_id UUID REFERENCES audio_variants(id),
  audio_hash TEXT,
  external_id TEXT,
  status message_status NOT NULL DEFAULT 'queued',
  error_detail TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Historial del lead
CREATE INDEX messages_lead_history_idx ON messages (lead_id, created_at);

-- Anti-doble-contacto: verificar envíos recientes por lead+canal
CREATE INDEX messages_dedup_idx ON messages (lead_id, channel_id, created_at)
  WHERE direction = 'outbound';

-- Inbox unificado: mensajes entrantes recientes
CREATE INDEX messages_inbox_idx ON messages (created_at DESC)
  WHERE direction = 'inbound';

-- Por línea de WhatsApp (para contadores)
CREATE INDEX messages_whatsapp_line_idx ON messages (whatsapp_line_id, created_at)
  WHERE whatsapp_line_id IS NOT NULL;

-- ============================================
-- Tabla: pipeline_history
-- Log de transiciones de estado del lead
-- ============================================
CREATE TABLE pipeline_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  changed_by TEXT NOT NULL DEFAULT 'system',
  channel_id TEXT REFERENCES channels(id),
  whatsapp_line_id UUID REFERENCES whatsapp_lines(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX pipeline_history_lead_idx ON pipeline_history (lead_id, created_at);

-- ============================================
-- Trigger: updated_at automático
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER whatsapp_lines_updated_at
  BEFORE UPDATE ON whatsapp_lines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER sequences_updated_at
  BEFORE UPDATE ON sequences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- Trigger: log automático de transiciones de pipeline
-- Cada vez que cambia pipeline_status en leads, se registra en pipeline_history
-- ============================================
CREATE OR REPLACE FUNCTION log_pipeline_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.pipeline_status IS DISTINCT FROM NEW.pipeline_status THEN
    NEW.pipeline_status_changed_at = now();
    INSERT INTO pipeline_history (lead_id, from_status, to_status, changed_by)
    VALUES (NEW.id, OLD.pipeline_status::TEXT, NEW.pipeline_status::TEXT, 'system');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leads_pipeline_transition
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION log_pipeline_transition();

-- ============================================
-- Función: reset diario del contador de WhatsApp
-- Ejecutar con pg_cron o desde la app a medianoche
-- ============================================
CREATE OR REPLACE FUNCTION reset_whatsapp_daily_counters()
RETURNS void AS $$
BEGIN
  UPDATE whatsapp_lines
  SET sent_today = 0, last_reset_at = CURRENT_DATE
  WHERE last_reset_at < CURRENT_DATE;

  -- Calentamiento: subir límite gradualmente para líneas en warmup
  UPDATE whatsapp_lines
  SET daily_limit = LEAST(daily_limit + warmup_daily_increment, 100)
  WHERE status = 'warming_up'
    AND last_reset_at < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;
