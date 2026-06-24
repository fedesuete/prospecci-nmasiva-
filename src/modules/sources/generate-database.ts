import { searchBusinesses } from './google-places.js';
import { normalizePhone } from '../../utils/phone.js';
import { queryOne } from '../../config/database.js';

export interface GenerateOptions {
  rubro: string;
  zona: string;
  cantidad: number;
  soloSinWeb: boolean;
  regionCode?: string; // 'PY' (default) | 'AR' | ...
}

export interface GenerateResult {
  database_id: string;
  name: string;
  encontrados: number;        // total devueltos por Google
  sin_web: number;            // cuántos no tenían web
  con_telefono_valido: number;
  guardados: number;          // filas finales en la base
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

// Busca negocios en Google Maps y crea una entrada en lead_databases
// (mismo formato que un CSV subido, para reusar el flujo "asignar a línea").
export async function generateDatabase(opts: GenerateOptions): Promise<GenerateResult> {
  const query = `${opts.rubro} en ${opts.zona}`;
  const businesses = await searchBusinesses({
    query,
    max: opts.cantidad,
    regionCode: opts.regionCode ?? 'PY',
  });

  const sinWeb = businesses.filter((b) => !b.website);
  const pool = opts.soloSinWeb ? sinWeb : businesses;

  // Armar CSV en memoria, normalizando teléfonos y deduplicando
  const seen = new Set<string>();
  const lines: string[] = ['nombre,telefono,rubro,ciudad'];
  let validPhones = 0;

  for (const b of pool) {
    const phone = b.phone ? normalizePhone(b.phone) : null;
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    validPhones++;
    lines.push([csvCell(b.name), phone, csvCell(opts.rubro), csvCell(opts.zona)].join(','));
  }

  const csv = lines.join('\n');
  const totalRows = lines.length - 1;

  const name = `${opts.rubro} - ${opts.zona}${opts.soloSinWeb ? ' (sin web)' : ''}`;

  const db = await queryOne<{ id: string }>(
    `INSERT INTO lead_databases
       (name, file_name, file_data, total_rows, valid_phones, default_rubro, default_city, temperature)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'cold')
     RETURNING id`,
    [name, `${name}.csv`, Buffer.from(csv, 'utf-8'), totalRows, validPhones, opts.rubro, opts.zona]
  );

  if (!db) throw new Error('No se pudo guardar la base de datos generada');

  return {
    database_id: db.id,
    name,
    encontrados: businesses.length,
    sin_web: sinWeb.length,
    con_telefono_valido: validPhones,
    guardados: totalRows,
  };
}
