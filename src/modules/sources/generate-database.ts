import { searchBusinesses, geocodeZone } from './google-places.js';
import { expandLocalities } from './localities.js';
import { RUBROS } from './recommendations.js';
import { filterWithWhatsApp } from './whatsapp-check.js';
import { extractEmailFromSite, mapLimit } from './email-scraper.js';
import { normalizePhone } from '../../utils/phone.js';
import { queryOne } from '../../config/database.js';

export interface GenerateOptions {
  rubro: string;
  zona: string;
  cantidad: number;        // OBJETIVO de leads con WhatsApp
  soloSinWeb: boolean;
  todosLosRubros?: boolean; // barrer todos los rubros de la zona
  soloConWhatsApp?: boolean; // verificar y dejar solo números con WhatsApp (default true)
  radioKm?: number;         // si se da, barre un radio en km alrededor de la zona (grilla)
  regionCode?: string;      // 'PY' (default) | 'AR' | ...
  modoEmail?: boolean;      // base para EMAIL: trae negocios CON web y extrae el email del sitio
}

// Grilla de puntos (circular) alrededor de un centro para barrer un radio.
function generateGrid(
  center: { lat: number; lng: number },
  radioKm: number,
  cellKm: number
): Array<{ lat: number; lng: number }> {
  const points: Array<{ lat: number; lng: number }> = [];
  const latStep = cellKm / 111;
  const lngStep = cellKm / (111 * Math.cos((center.lat * Math.PI) / 180));
  const steps = Math.max(1, Math.floor(radioKm / cellKm));
  for (let i = -steps; i <= steps; i++) {
    for (let j = -steps; j <= steps; j++) {
      if (Math.sqrt((i * cellKm) ** 2 + (j * cellKm) ** 2) > radioKm) continue;
      points.push({ lat: center.lat + i * latStep, lng: center.lng + j * lngStep });
    }
  }
  return points;
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
  modo_email: boolean;          // true si se generó una base de emails
  con_web: number;              // cuántos tenían web (útil en modo email)
  emails_encontrados: number;   // cuántos emails se lograron extraer
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

// Tope duro de búsquedas por corrida (evita gastos/tiempos excesivos)
const MAX_SEARCHES = 30;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Busca negocios en Google Maps hasta juntar `cantidad` leads con teléfono válido,
// y crea una entrada en lead_databases.
//  - modo rubro único: recorre barrios de la zona buscando ese rubro.
//  - modo "todos los comercios": barre muchos rubros sobre la zona.
export async function generateDatabase(opts: GenerateOptions): Promise<GenerateResult> {
  // Definir el plan de búsquedas
  type Step = { rubro: string; loc: string; center?: { lat: number; lng: number }; radiusM?: number };
  const plan: Step[] = [];
  const cellKm = 2.5;

  if (opts.radioKm && opts.radioKm > 0) {
    // Modo RADIO: geocodificar la zona y barrer una grilla de puntos en ese radio
    const center = await geocodeZone(opts.zona, opts.regionCode ?? 'PY');
    if (!center) throw new Error(`No pude ubicar "${opts.zona}" en el mapa. Probá con otra forma de escribirla.`);
    const grid = generateGrid(center, opts.radioKm, cellKm).slice(0, MAX_SEARCHES);
    const rubros = opts.todosLosRubros ? shuffle(RUBROS).slice(0, 4) : [opts.rubro];
    for (const p of grid) {
      for (const r of rubros) plan.push({ rubro: r, loc: opts.zona, center: p, radiusM: cellKm * 1300 });
    }
  } else if (opts.todosLosRubros) {
    // Barrer muchos rubros sobre la zona tal cual (sin expandir a barrios, para acotar costo)
    for (const r of shuffle(RUBROS)) plan.push({ rubro: r, loc: opts.zona });
  } else {
    // Un rubro, recorriendo los barrios de la zona
    for (const loc of expandLocalities(opts.zona)) plan.push({ rubro: opts.rubro, loc });
  }

  const seen = new Set<string>();       // dedup por teléfono (global)
  const header = opts.modoEmail ? 'nombre,telefono,email,rubro,ciudad' : 'nombre,telefono,rubro,ciudad';
  const lines: string[] = [header];
  let encontrados = 0;
  let sinWeb = 0;
  let conWeb = 0;
  let emailsEncontrados = 0;
  let validPhones = 0;
  let busquedas = 0;

  for (const step of plan) {
    if (validPhones >= opts.cantidad || busquedas >= MAX_SEARCHES) break;

    // Con center, la geografía la da el sesgo de ubicación → la query es solo el rubro
    const query = step.center ? step.rubro : `${step.rubro} en ${step.loc}`;

    let businesses;
    try {
      businesses = await searchBusinesses({
        query,
        max: 60, // Google devuelve hasta ~60 por búsqueda
        regionCode: opts.regionCode ?? 'PY',
        center: step.center,
        radiusM: step.radiusM,
      });
    } catch (err) {
      console.error(`[generate] Error en "${query}": ${(err as Error).message}`);
      continue;
    }

    busquedas++;
    encontrados += businesses.length;

    // Recolectar candidatos nuevos de este lote (rubro, filtro web, teléfono válido, no duplicado)
    const batch: Array<{ name: string; phone: string; rubro: string; website: string | null; email?: string }> = [];
    for (const b of businesses) {
      const hasWeb = !!b.website;
      if (hasWeb) conWeb++; else sinWeb++;

      if (opts.modoEmail) {
        // Modo EMAIL: solo negocios CON web (de ahí se saca el correo)
        if (!hasWeb) continue;
      } else if (opts.soloSinWeb && hasWeb) {
        continue;
      }

      const phone = b.phone ? normalizePhone(b.phone) : null;
      if (!phone || seen.has(phone)) continue;
      seen.add(phone);
      batch.push({ name: b.name, phone, rubro: step.rubro, website: b.website });
    }

    let validos = batch;
    if (opts.modoEmail) {
      // Scrapear el email de cada web (gratis) y quedarse con los que tengan email
      const scraped = await mapLimit(batch, 6, async (x) => {
        const email = x.website ? await extractEmailFromSite(x.website) : null;
        return { ...x, email: email ?? undefined };
      });
      validos = scraped.filter((x) => x.email);
      emailsEncontrados += validos.length;
    } else if (opts.soloConWhatsApp !== false && batch.length > 0) {
      // Verificar WhatsApp y quedarse solo con los que tienen (salvo que se desactive)
      const conWa = new Set(await filterWithWhatsApp(batch.map((x) => x.phone)));
      validos = batch.filter((x) => conWa.has(x.phone));
    }

    for (const x of validos) {
      const row = opts.modoEmail
        ? [csvCell(x.name), x.phone, csvCell(x.email ?? ''), csvCell(x.rubro), csvCell(opts.zona)]
        : [csvCell(x.name), x.phone, csvCell(x.rubro), csvCell(opts.zona)];
      lines.push(row.join(','));
      validPhones++;
      if (validPhones >= opts.cantidad) break;
    }
  }

  const csv = lines.join('\n');
  const totalRows = lines.length - 1;
  const rubroLabel = opts.todosLosRubros ? 'Todos los comercios' : opts.rubro;
  const name = opts.modoEmail
    ? `${rubroLabel} - ${opts.zona} (emails)`
    : `${rubroLabel} - ${opts.zona}${opts.soloSinWeb ? ' (sin web)' : ''}`;

  const db = await queryOne<{ id: string }>(
    `INSERT INTO lead_databases
       (name, file_name, file_data, total_rows, valid_phones, default_rubro, default_city, temperature)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'cold')
     RETURNING id`,
    [name, `${name}.csv`, Buffer.from(csv, 'utf-8'), totalRows, validPhones, opts.todosLosRubros ? null : opts.rubro, opts.zona]
  );

  if (!db) throw new Error('No se pudo guardar la base de datos generada');

  return {
    database_id: db.id,
    name,
    encontrados,
    sin_web: sinWeb,
    con_telefono_valido: validPhones,
    guardados: totalRows,
    zonas_buscadas: busquedas,
    objetivo: opts.cantidad,
    alcanzo_objetivo: validPhones >= opts.cantidad,
    modo_email: !!opts.modoEmail,
    con_web: conWeb,
    emails_encontrados: emailsEncontrados,
  };
}
