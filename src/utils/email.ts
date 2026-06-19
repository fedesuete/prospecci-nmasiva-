// Normalizar email: lowercase, trim, validar formato básico
export function normalizeEmail(raw: string): string | null {
  if (!raw) return null;

  const trimmed = raw.trim().toLowerCase();

  // Validación básica de formato
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return null;
  }

  return trimmed;
}

export function isValidEmail(email: string): boolean {
  return normalizeEmail(email) !== null;
}
