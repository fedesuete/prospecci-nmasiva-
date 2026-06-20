import { parse } from 'csv-parse/sync';
import { findLeadByPhone, upsertLead } from '../../db/queries/leads.js';
import type { LeadInsert, LeadTemperature } from '../../db/types.js';
import { normalizePhone } from '../../utils/phone.js';
import { normalizeEmail } from '../../utils/email.js';
import { normalizeInstagramHandle } from './normalizer.js';

export interface CsvImportOptions {
  sourceId: string;
  temperature?: LeadTemperature;
  defaultNiche?: string;
  defaultCity?: string;
  defaultRubro?: string;
  assignedLineId?: string;
}

export interface CsvImportResult {
  total: number;
  imported: number;
  updated: number;
  skipped: number;
  already_contacted: number; // Leads que ya fueron contactados previamente (NO se les va a enviar de nuevo)
  errors: Array<{ row: number; phone?: string; reasons: string[] }>;
}

export async function importCsvBuffer(
  buffer: Buffer,
  options: CsvImportOptions
): Promise<CsvImportResult> {
  const csvString = buffer.toString('utf-8').replace(/^\uFEFF/, ''); // Remove BOM
  const rows = parseCsvSmart(csvString);
  return processRows(rows, options);
}

export async function importCsvString(
  csvContent: string,
  options: CsvImportOptions
): Promise<CsvImportResult> {
  const rows = parseCsvSmart(csvContent);
  return processRows(rows, options);
}

// Parser inteligente que detecta automáticamente qué columna tiene qué dato
function parseCsvSmart(csvContent: string): SmartRow[] {
  // Parsear como array de arrays (sin usar headers)
  let rawRows: string[][];
  try {
    rawRows = parse(csvContent, {
      skip_empty_lines: true,
      trim: true,
      bom: true,
      relax_column_count: true,
      relax_quotes: true,
    });
  } catch {
    // Si falla, intentar con punto y coma
    rawRows = parse(csvContent, {
      skip_empty_lines: true,
      trim: true,
      bom: true,
      delimiter: ';',
      relax_column_count: true,
      relax_quotes: true,
    });
  }

  if (rawRows.length < 2) return [];

  // Detectar cuál fila es el header real (buscar fila que tenga "nombre", "numero", "telefono", etc.)
  let headerRowIdx = -1;
  let dataStartIdx = 0;

  for (let i = 0; i < Math.min(5, rawRows.length); i++) {
    const row = rawRows[i].map(c => c.toLowerCase().trim());
    const looksLikeHeader = row.some(c =>
      c.includes('nombre') || c.includes('name') || c.includes('telefono') ||
      c.includes('phone') || c.includes('numero') || c.includes('local') ||
      c.includes('empresa') || c.includes('contacto') || c.includes('negocio')
    );
    if (looksLikeHeader) {
      headerRowIdx = i;
      dataStartIdx = i + 1;
      break;
    }
  }

  // Si no encontramos header, auto-detectar columnas por contenido
  if (headerRowIdx === -1) {
    return autoDetectColumns(rawRows);
  }

  // Mapear headers a nuestros campos
  const headers = rawRows[headerRowIdx].map(h => h.trim());
  const columnMap = mapHeaders(headers);

  const result: SmartRow[] = [];
  for (let i = dataStartIdx; i < rawRows.length; i++) {
    const row = rawRows[i];
    result.push(extractRowData(row, columnMap));
  }

  return result;
}

interface ColumnMap {
  name: number;
  phone: number;
  email: number;
  instagram: number;
  rubro: number;
  city: number;
  notes: number;
}

function mapHeaders(headers: string[]): ColumnMap {
  const map: ColumnMap = { name: -1, phone: -1, email: -1, instagram: -1, rubro: -1, city: -1, notes: -1 };

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase().replace(/[^a-záéíóúñ\s]/g, '').trim();

    if (map.name === -1 && (h.includes('nombre') || h.includes('name') || h.includes('local') || h.includes('negocio') || h.includes('contacto'))) {
      map.name = i;
    } else if (map.phone === -1 && (h.includes('numero') || h.includes('telefono') || h.includes('phone') || h.includes('celular') || h.includes('whatsapp') || h.includes('tel') || h.includes('movil'))) {
      map.phone = i;
    } else if (map.email === -1 && (h.includes('email') || h.includes('correo') || h.includes('mail'))) {
      map.email = i;
    } else if (map.rubro === -1 && (h.includes('rubro') || h.includes('categor') || h.includes('tipo') || h.includes('industry'))) {
      map.rubro = i;
    } else if (map.city === -1 && (h.includes('ciudad') || h.includes('city') || h.includes('localidad'))) {
      map.city = i;
    } else if (map.notes === -1 && (h.includes('informe') || h.includes('nota') || h.includes('observ') || h.includes('estado'))) {
      map.notes = i;
    }
  }

  return map;
}

// Auto-detectar columnas analizando el contenido de las primeras filas
function autoDetectColumns(rows: string[][]): SmartRow[] {
  if (rows.length < 2) return [];

  // Analizar las primeras filas de datos para detectar patrones
  const numCols = Math.max(...rows.slice(0, 10).map(r => r.length));
  const colTypes: string[] = new Array(numCols).fill('unknown');

  for (let col = 0; col < numCols; col++) {
    let phoneCount = 0;
    let urlCount = 0;
    let textCount = 0;
    let emptyCount = 0;
    const sampleSize = Math.min(20, rows.length);

    for (let row = 0; row < sampleSize; row++) {
      const val = (rows[row][col] ?? '').trim();
      if (!val) { emptyCount++; continue; }

      if (/^\+?\d[\d\s\-()]{7,}$/.test(val)) phoneCount++;
      else if (val.startsWith('http') || val.includes('.com') || val.includes('.net')) urlCount++;
      else textCount++;
    }

    if (phoneCount > sampleSize * 0.2) colTypes[col] = 'phone';
    else if (urlCount > sampleSize * 0.3) colTypes[col] = 'url';
    else if (textCount > sampleSize * 0.3 && colTypes.indexOf('name') === -1) colTypes[col] = 'name';
    else if (textCount > sampleSize * 0.2) colTypes[col] = 'rubro';
  }

  // Encontrar las columnas detectadas
  const map: ColumnMap = {
    name: colTypes.indexOf('name'),
    phone: colTypes.indexOf('phone'),
    email: -1,
    instagram: -1,
    rubro: colTypes.lastIndexOf('rubro') !== colTypes.indexOf('name') ? colTypes.lastIndexOf('rubro') : -1,
    city: -1,
    notes: -1,
  };

  // Si no detectamos nombre o teléfono, buscar más agresivamente
  if (map.name === -1) map.name = 0; // Primera columna como fallback
  if (map.phone === -1) {
    // Buscar cualquier columna que tenga al menos un teléfono
    for (let col = 0; col < numCols; col++) {
      const hasPhone = rows.some(r => {
        const val = (r[col] ?? '').trim();
        return /^\+?\d[\d\s\-()]{7,}$/.test(val);
      });
      if (hasPhone) { map.phone = col; break; }
    }
  }

  const result: SmartRow[] = [];
  // Saltar la primera fila si parece ser instrucción/header
  const startIdx = rows[0].some(c => c.length > 50) ? 1 : 0;

  for (let i = startIdx; i < rows.length; i++) {
    result.push(extractRowData(rows[i], map));
  }

  return result;
}

interface SmartRow {
  name: string;
  phone: string;
  email: string;
  instagram: string;
  rubro: string;
  city: string;
  notes: string;
  allValues: string[];
}

function extractRowData(row: string[], map: ColumnMap): SmartRow {
  const get = (idx: number) => (idx >= 0 && idx < row.length ? (row[idx] ?? '').trim() : '');

  // Buscar Instagram en CUALQUIER columna que tenga URL de Instagram
  let instagram = get(map.instagram);
  if (!instagram) {
    for (const val of row) {
      if (val && val.includes('instagram.com/')) {
        instagram = val;
        break;
      }
    }
  }

  // Buscar rubro: si no hay columna mapeada, buscar valores tipo categoría
  let rubro = get(map.rubro);
  if (!rubro) {
    for (let i = 0; i < row.length; i++) {
      const val = (row[i] ?? '').trim();
      if (val && !val.startsWith('http') && !val.startsWith('+') &&
          val.length > 3 && val.length < 80 && !val.includes('@') &&
          i !== map.name && i !== map.phone && i !== map.notes &&
          /^(Restaurante|Pizzer|Bar|Helader|Cafeter|Hamburguese|Kiosco|Tienda|Comida|Pizza|Pub)/i.test(val)) {
        rubro = val;
        break;
      }
    }
  }

  return {
    name: get(map.name),
    phone: get(map.phone),
    email: get(map.email),
    instagram,
    rubro,
    city: get(map.city),
    notes: get(map.notes),
    allValues: row,
  };
}

async function processRows(
  rows: SmartRow[],
  options: CsvImportOptions
): Promise<CsvImportResult> {
  const result: CsvImportResult = {
    total: rows.length,
    imported: 0,
    updated: 0,
    skipped: 0,
    already_contacted: 0,
    errors: [],
  };

  const phonesInBatch = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 1;
    const row = rows[i];

    // Saltar filas sin nombre o que parezcan headers/instrucciones
    if (!row.name || row.name.toLowerCase().includes('nombre') || row.name.length > 100) {
      result.skipped++;
      result.errors.push({ row: rowNum, reasons: ['Fila de encabezado o sin nombre'] });
      continue;
    }

    // Normalizar teléfono
    const phone = normalizePhone(row.phone);
    if (!phone) {
      result.skipped++;
      result.errors.push({ row: rowNum, reasons: ['Teléfono inválido o vacío: "' + row.phone + '"'] });
      continue;
    }

    // Dedup dentro del batch
    if (phonesInBatch.has(phone)) {
      result.skipped++;
      result.errors.push({ row: rowNum, phone, reasons: ['Teléfono duplicado en el CSV'] });
      continue;
    }
    phonesInBatch.add(phone);

    // Instagram
    const instagramHandle = normalizeInstagramHandle(row.instagram) ?? undefined;

    // Email
    const email = row.email ? normalizeEmail(row.email) ?? undefined : undefined;

    const leadData: LeadInsert = {
      source_id: options.sourceId,
      first_name: row.name,
      company_name: row.name, // Para negocios, el nombre es la empresa
      phone,
      email,
      instagram_handle: instagramHandle,
      niche: options.defaultNiche || undefined,
      city: options.defaultCity || undefined,
      rubro: row.rubro || options.defaultRubro || undefined,
      temperature: options.temperature ?? 'cold',
      raw_data: { allValues: row.allValues, notes: row.notes },
      assigned_line_id: options.assignedLineId,
    };

    try {
      const existing = await findLeadByPhone(phone);

      // PROTECCION ANTI-REENVIO: si el lead ya existe y ya fue contactado, NO cambiar su estado
      // Solo se importa como "nuevo" si nunca existió antes
      if (existing) {
        // NUNCA resetear pipeline_status de un lead existente
        if (existing.pipeline_status !== 'nuevo') {
          // Ya fue contactado — contar pero NO enviar de nuevo
          result.already_contacted++;
          result.errors.push({ row: rowNum, phone, reasons: [`Ya contactado (estado: ${existing.pipeline_status}) - NO se le va a enviar de nuevo`] });
        } else {
          await upsertLead(leadData);
          result.updated++;
        }
      } else {
        await upsertLead(leadData);
        result.imported++;
      }
    } catch (err) {
      result.skipped++;
      result.errors.push({
        row: rowNum,
        phone,
        reasons: [(err as Error).message],
      });
    }
  }

  return result;
}
