import { env } from '../../../config/env.js';

// ============================================
// Reglas anti-bloqueo para WhatsApp
// Estas reglas son CRÍTICAS para evitar baneo de líneas
// ============================================

// Horario humano permitido para envíos (Argentina UTC-3)
const SEND_HOUR_START = 9;  // 9:00 AM
const SEND_HOUR_END = 19;   // 7:00 PM

// Delays aleatorios entre mensajes (en milisegundos)
const MIN_DELAY_MS = 40_000;  // 40 segundos mínimo
const MAX_DELAY_MS = 180_000; // 3 minutos máximo

// Verificar si estamos dentro del horario humano permitido
export function isWithinSendingHours(): boolean {
  const now = new Date();
  // Convertir a hora Argentina
  const argentinaTime = new Date(
    now.toLocaleString('en-US', { timeZone: env.TIMEZONE })
  );
  const hour = argentinaTime.getHours();
  return hour >= SEND_HOUR_START && hour < SEND_HOUR_END;
}

// Calcular delay aleatorio entre mensajes para simular comportamiento humano
export function getRandomDelay(): number {
  return Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS)) + MIN_DELAY_MS;
}

// Calcular cuántos milisegundos faltan para que abra la ventana de envío
export function msUntilSendingWindowOpens(): number {
  const now = new Date();
  const argentinaTime = new Date(
    now.toLocaleString('en-US', { timeZone: env.TIMEZONE })
  );

  const hour = argentinaTime.getHours();

  if (hour >= SEND_HOUR_START && hour < SEND_HOUR_END) {
    return 0; // Ya estamos en horario
  }

  // Calcular próxima apertura
  const nextOpen = new Date(argentinaTime);
  if (hour >= SEND_HOUR_END) {
    // Ya pasó, esperar al día siguiente
    nextOpen.setDate(nextOpen.getDate() + 1);
  }
  nextOpen.setHours(SEND_HOUR_START, 0, 0, 0);

  return nextOpen.getTime() - argentinaTime.getTime();
}

// Calcular el límite efectivo de una línea considerando calentamiento
export function getEffectiveLimit(
  dailyLimit: number,
  warmupStartDate: string | null,
  warmupIncrement: number,
  status: string
): number {
  if (status !== 'warming_up' || !warmupStartDate) {
    return dailyLimit;
  }

  // Calcular días desde el inicio del calentamiento
  const startDate = new Date(warmupStartDate);
  const now = new Date();
  const daysActive = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

  // Límite gradual: empieza bajo y sube cada día
  const warmupLimit = Math.min(warmupIncrement * (daysActive + 1), dailyLimit);
  return warmupLimit;
}

// Verificar si una línea puede enviar más mensajes hoy
export function canLinesSendMore(sentToday: number, effectiveLimit: number): boolean {
  return sentToday < effectiveLimit;
}

// No incluir links en el primer mensaje (regla anti-spam)
export function sanitizeFirstMessage(content: string): string {
  // Remover URLs del primer mensaje — los links van en el paso 2+
  return content.replace(/https?:\/\/[^\s]+/g, '[link removido]');
}
