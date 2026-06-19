import { normalizePhone } from '../../utils/phone.js';
import { normalizeEmail } from '../../utils/email.js';

// Normaliza un handle de Instagram: quita @, espacios, lowercase
export function normalizeInstagramHandle(raw: string | undefined): string | null {
  if (!raw) return null;
  let handle = raw.trim().toLowerCase();
  if (handle.startsWith('@')) handle = handle.slice(1);
  if (handle.includes('instagram.com/')) {
    handle = handle.split('instagram.com/').pop()?.split('/')[0]?.split('?')[0] ?? '';
  }
  if (!/^[\w.]+$/.test(handle) || handle.length === 0) return null;
  return handle;
}

// Extraer handle de Instagram de cualquier URL o texto
function extractInstagram(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.includes('instagram.com/') || value.includes('instagram.com\\')) {
    return normalizeInstagramHandle(value) ?? undefined;
  }
  return undefined;
}

export interface RawLeadData {
  [key: string]: string | undefined;
}

export interface NormalizedLead {
  first_name: string;
  last_name?: string;
  company_name?: string;
  phone: string;
  email?: string;
  instagram_handle?: string;
  linkedin_url?: string;
  niche?: string;
  city?: string;
  rubro?: string;
}

// Busca un valor probando múltiples nombres de columna (case-insensitive)
function findField(raw: RawLeadData, ...candidates: string[]): string {
  // Primero intentar match exacto
  for (const key of candidates) {
    if (raw[key] !== undefined && raw[key] !== '') return raw[key]!;
  }
  // Luego match case-insensitive y parcial
  const rawKeys = Object.keys(raw);
  for (const candidate of candidates) {
    const lower = candidate.toLowerCase();
    for (const key of rawKeys) {
      const keyLower = key.toLowerCase().trim();
      if (keyLower === lower || keyLower.includes(lower) || lower.includes(keyLower)) {
        if (raw[key] !== undefined && raw[key] !== '') return raw[key]!;
      }
    }
  }
  return '';
}

// Normaliza un lead crudo (CSV, webhook, etc.) a formato limpio
// Soporta múltiples formatos de CSV: columnas en español, inglés, scrapeados de Google Maps, etc.
export function normalizeLead(raw: RawLeadData): { lead: NormalizedLead | null; errors: string[] } {
  const errors: string[] = [];

  // Nombre — buscar en múltiples columnas posibles
  const firstName = findField(raw,
    'first_name', 'nombre', 'name',
    'NOMBRE DEL LOCAL', 'nombre del local', 'local',
    'NOMBRE', 'nombre_local', 'negocio', 'business_name',
    'razon_social', 'razon social', 'title', 'titulo',
  ).trim();

  if (!firstName || firstName.startsWith('En informe')) {
    // Saltar filas de encabezado/instrucciones
    errors.push('Falta nombre o fila de encabezado');
    return { lead: null, errors };
  }

  // Teléfono — buscar en múltiples columnas
  const rawPhone = findField(raw,
    'phone', 'telefono', 'tel', 'celular', 'whatsapp',
    'NUMERO', 'numero', 'phone_number', 'fono', 'movil',
    'mobile', 'cell', 'wa', 'nro', 'nº',
  ).trim();

  const phone = normalizePhone(rawPhone);
  if (!phone) {
    errors.push(`Teléfono inválido: "${rawPhone}"`);
    return { lead: null, errors };
  }

  // Email
  const rawEmail = findField(raw, 'email', 'correo', 'mail', 'e-mail', 'EMAIL');
  const email = rawEmail ? normalizeEmail(rawEmail) : undefined;

  // Instagram — buscar en columnas de IG o en cualquier columna con URL de Instagram
  let instagramHandle: string | undefined;
  const rawIg = findField(raw, 'instagram', 'ig', 'instagram_handle', 'INSTAGRAM');
  if (rawIg) {
    instagramHandle = normalizeInstagramHandle(rawIg) ?? undefined;
  }
  // Si no encontramos por nombre de columna, buscar URLs de Instagram en cualquier valor
  if (!instagramHandle) {
    for (const value of Object.values(raw)) {
      if (value && value.includes('instagram.com/')) {
        instagramHandle = extractInstagram(value);
        if (instagramHandle) break;
      }
    }
  }

  // Rubro — buscar en múltiples columnas
  const rubro = findField(raw,
    'rubro', 'categoria', 'category', 'type', 'tipo',
    'industry', 'industria', 'giro',
  ).trim() || undefined;

  // Si no hay rubro por nombre de columna, buscar columnas sin header que contengan categorías
  // (en CSVs scrapeados de Google Maps, el rubro suele estar en una columna sin nombre)
  let rubroFromUnnamed = rubro;
  if (!rubroFromUnnamed) {
    for (const [key, value] of Object.entries(raw)) {
      if (value && !value.startsWith('http') && !value.startsWith('+') &&
          value.length > 3 && value.length < 60 &&
          !value.includes('@') && !value.includes('instagram') &&
          key !== findField(raw, 'NOMBRE DEL LOCAL', 'nombre', 'first_name') &&
          /^(Restaurante|Pizzería|Bar|Heladería|Cafetería|Hamburguesería|Kiosco|Tienda)/i.test(value)) {
        rubroFromUnnamed = value;
        break;
      }
    }
  }

  return {
    lead: {
      first_name: firstName,
      last_name: findField(raw, 'last_name', 'apellido', 'APELLIDO').trim() || undefined,
      company_name: firstName, // Para negocios scrapeados, el nombre ES la empresa
      phone,
      email: email ?? undefined,
      instagram_handle: instagramHandle,
      linkedin_url: findField(raw, 'linkedin_url', 'linkedin', 'LINKEDIN').trim() || undefined,
      niche: findField(raw, 'niche', 'nicho', 'NICHO').trim() || undefined,
      city: findField(raw, 'city', 'ciudad', 'CIUDAD', 'localidad').trim() || undefined,
      rubro: rubroFromUnnamed,
    },
    errors,
  };
}
