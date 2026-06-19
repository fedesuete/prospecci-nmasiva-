import { getAvailableLines } from '../../../db/queries/whatsapp-lines.js';
import { getEffectiveLimit } from './anti-block.js';
import type { WhatsAppLine } from '../../../db/types.js';

// Índice de la última línea usada para round-robin
let lastLineIndex = 0;

// Round-robin entre líneas disponibles, respetando límites diarios y calentamiento
export async function getNextAvailableLine(): Promise<WhatsAppLine | null> {
  const lines = await getAvailableLines();

  if (lines.length === 0) return null;

  // Filtrar las que realmente pueden enviar (considerando calentamiento)
  const sendableLines = lines.filter(line => {
    const effectiveLimit = getEffectiveLimit(
      line.daily_limit,
      line.warmup_start_date,
      line.warmup_daily_increment,
      line.status
    );
    return line.sent_today < effectiveLimit;
  });

  if (sendableLines.length === 0) return null;

  // Round-robin: rotar entre las líneas disponibles
  lastLineIndex = (lastLineIndex + 1) % sendableLines.length;
  return sendableLines[lastLineIndex];
}

// Obtener el total de mensajes que se pueden enviar hoy entre todas las líneas
export async function getRemainingCapacity(): Promise<number> {
  const lines = await getAvailableLines();
  return lines.reduce((total, line) => {
    const effectiveLimit = getEffectiveLimit(
      line.daily_limit,
      line.warmup_start_date,
      line.warmup_daily_increment,
      line.status
    );
    return total + Math.max(0, effectiveLimit - line.sent_today);
  }, 0);
}
