import { parsePhoneNumberFromString, type PhoneNumber } from 'libphonenumber-js';

// Normaliza un teléfono a formato E.164
// Soporta Argentina (+54) y Paraguay (+595) como países principales
export function normalizePhone(raw: string): string | null {
  if (!raw) return null;

  // Limpiar caracteres no numéricos excepto el +
  let cleaned = raw.replace(/[^\d+]/g, '');

  if (!cleaned || cleaned.length < 6) return null;

  // Si ya tiene +, intentar parsear directo
  if (cleaned.startsWith('+')) {
    return tryParse(cleaned);
  }

  // Sin + : detectar código de país por prefijo
  if (cleaned.startsWith('595')) {
    return tryParse('+' + cleaned);
  }
  if (cleaned.startsWith('54')) {
    return tryParse('+' + cleaned) ?? tryParseAR('+' + cleaned);
  }
  // Si empieza con 0, asumir Argentina (formato local 011-xxxx)
  if (cleaned.startsWith('0')) {
    return tryParseAR('+54' + cleaned.slice(1));
  }

  // Sin código de país: probar Paraguay primero, luego Argentina
  return tryParse('+595' + cleaned) ?? tryParseAR('+54' + cleaned) ?? tryParse('+' + cleaned);
}

function tryParse(phone: string): string | null {
  // Detectar país por prefijo
  let country: 'PY' | 'AR' | 'US' | undefined;
  if (phone.startsWith('+595')) country = 'PY';
  else if (phone.startsWith('+54')) country = 'AR';

  const parsed = parsePhoneNumberFromString(phone, country);
  if (parsed && parsed.isValid()) {
    return parsed.format('E.164');
  }
  return null;
}

function tryParseAR(phone: string): string | null {
  let cleaned = phone;
  // Normalización Argentina: celulares llevan 9 después del código de área
  if (cleaned.startsWith('+54') && !cleaned.startsWith('+549')) {
    const withoutPrefix = cleaned.slice(3);
    if (withoutPrefix.length === 10) {
      cleaned = '+549' + withoutPrefix;
    }
  }
  const parsed = parsePhoneNumberFromString(cleaned, 'AR');
  if (parsed && parsed.isValid()) {
    return parsed.format('E.164');
  }
  return null;
}

export function isValidPhone(phone: string): boolean {
  return normalizePhone(phone) !== null;
}

export function formatPhoneDisplay(e164: string): string {
  const parsed = parsePhoneNumberFromString(e164);
  if (!parsed) return e164;
  return parsed.formatInternational();
}
