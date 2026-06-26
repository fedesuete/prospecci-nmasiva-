-- ============================================
-- MIGRACIÓN 004: Respuestas rápidas (plantillas de texto pregrabadas para el Inbox)
-- ============================================
CREATE TABLE quick_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO quick_replies (title, text) VALUES
  ('Saludo', 'Hola! ¿Cómo estás? Te escribo de parte de nuestro equipo 😊'),
  ('Más info', '¡Genial! Te paso más información sobre lo que ofrecemos.'),
  ('Precios', 'Te comparto los precios y opciones que tenemos disponibles.'),
  ('Agradecimiento', '¡Muchas gracias por tu respuesta! Quedo a disposición para lo que necesites.'),
  ('Agendar', '¿Te parece si coordinamos una llamada? Decime qué horario te queda cómodo.');
