import { searchBusinesses } from './google-places.js';
import { expandLocalities } from './localities.js';
import { normalizePhone } from '../../utils/phone.js';
import { queryOne } from '../../config/database.js';

export interface GenerateOptions {
  rubro: string;
  zona: string;
  cantidad: number;     // OBJETIVO de leads con teléfono válido
  soloSinWeb: boolean;
  regionCode?: string;  // 'PY' (default) | 'AR' | ...
}

export interface GenerateResult {
  database_id: string;
  name: string;
  encontrados: number;          // total devueltos por Google (todas las zonas)
  sin_web: number;              // cuántos no tenían web
  con_telefono_valido: number;  // = guardados
  guardados: number;
  zonas_buscadas: number;
  objetivo: number;
  alcanzo_objetivo: boolean;
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

// Tope duro de zonas a recorrer por corrida (evita gastos/tiempos excesivos)
const MAX_ZONAS = 30;

// Busca negocios en Google Maps recorriendo varias localidades hasta juntar
// `cantidad` leads con teléfono válido, y crea una entrada en lead_databases.
export async function generateDatabase(opts: GenerateOptions): Promise<GenerateResult> {
  const localities = expandLocalities(opts.zona).slice(0, MAX_ZONAS);

  const seen = new Set<string>();       // dedup por teléfono (global)
  const lines: string[] = ['nombre,telefono,rubro,ciudad'];
  let encontrados = 0;
  let sinWeb = 0;
  let validPhones = 0;
  let zonasBuscadas = 0;

  for (const loc of localities) {
    if (validPhones >= opts.cantidad) break;

    let businesses;
    try {
      businesses = await searchBusinesses({
        query: `${opts.rubro} en ${loc}`,
        max: 60, // Google devuelve hasta ~60 por búsqueda
        regionCode: opts.regionCode ?? 'PY',
      });
    } catch (err) {
      // No cortar todo el lote si una zona falla
      console.error(`[generate] Error en "${loc}": ${(err as Error).message}`);
      continue;
    }

    zonasBuscadas++;
    encontrados += businesses.length;

    for (const b of businesses) {
      const hasWeb = !!b.website;
      if (!hasWeb) sinWeb++;
      if (opts.soloSinWeb && hasWeb) continue;

      const phone = b.phone ? normalizePhone(b.phone) : null;
      if (!phone || seen.has(phone)) continue;
      seen.add(phone);
      validPhones++;
      lines.push([csvCell(b.name), phone, csvCell(opts.rubro), csvCell(opts.zona)].join(','));

      if (validPhones >= opts.cantidad) break;
    }
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
    encontrados,
    sin_web: sinWeb,
    con_telefono_valido: validPhones,
    guardados: totalRows,
    zonas_buscadas: zonasBuscadas,
    objetivo: opts.cantidad,
    alcanzo_objetivo: validPhones >= opts.cantidad,
  };
}
