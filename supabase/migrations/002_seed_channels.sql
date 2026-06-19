-- ============================================
-- MIGRACIÓN 002: Seed de canales disponibles
-- ============================================

INSERT INTO channels (id, display_name, is_active, config) VALUES
  ('whatsapp',           'WhatsApp',                    true,  '{"type": "evolution_api"}'),
  ('email',              'Email Frío',                  true,  '{"type": "smtp"}'),
  ('instagram_oficial',  'Instagram (API Oficial)',      false, '{"type": "messenger_api"}'),
  ('instagram_dm_frio',  'Instagram DM Frío',           false, '{"type": "automation", "daily_limit": 40}'),
  ('linkedin',           'LinkedIn',                    false, '{"type": "heyreach"}'),
  ('sms',                'SMS',                         false, '{"type": "twilio"}'),
  ('voz_ai',             'Voz AI (Llamadas)',           false, '{"type": "vapi"}'),
  ('fb_messenger',       'Facebook Messenger',          false, '{"type": "messenger_api"}'),
  ('google_business',    'Google Business Messages',    false, '{"type": "google_api"}')
ON CONFLICT (id) DO NOTHING;
