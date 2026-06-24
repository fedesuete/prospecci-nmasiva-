import { query } from '../../config/database.js';

// Rubros B2B locales que suelen NO tener web (buenos prospectos para ofrecerles una)
export const RUBROS = [
  'peluquerías', 'barberías', 'gimnasios', 'centros de estética', 'spa', 'estudios de tatuajes',
  'estudios de uñas', 'depilación', 'ferreterías', 'veterinarias', 'pet shops', 'talleres mecánicos',
  'lavaderos de autos', 'gomerías', 'cerrajerías', 'pinturerías', 'vidrierías', 'carpinterías',
  'herrerías', 'estudios contables', 'estudios jurídicos', 'inmobiliarias', 'escribanías',
  'panaderías', 'carnicerías', 'verdulerías', 'kioscos', 'almacenes', 'rotiserías', 'fiambrerías',
  'farmacias', 'ópticas', 'joyerías', 'relojerías', 'mueblerías', 'colchonerías', 'viveros',
  'florerías', 'librerías', 'jugueterías', 'zapaterías', 'boutiques de ropa', 'lencerías',
  'perfumerías', 'bazares', 'regalerías', 'clínicas dentales', 'consultorios médicos', 'kinesiología',
  'academias de inglés', 'autoescuelas', 'jardines de infantes', 'estudios de pilates', 'estudios de yoga',
  'restaurantes', 'parrillas', 'pizzerías', 'cafeterías', 'heladerías', 'cervecerías', 'bares',
  'fotógrafos', 'imprentas', 'agencias de viajes', 'electricistas', 'plomeros', 'fletes',
];

// Zonas / ciudades objetivo (cada una con su país para la búsqueda)
const ZONAS: Array<{ zona: string; pais: string }> = [
  { zona: 'CABA', pais: 'AR' },
  { zona: 'Gran Buenos Aires', pais: 'AR' },
  { zona: 'Córdoba', pais: 'AR' },
  { zona: 'Rosario', pais: 'AR' },
  { zona: 'La Plata', pais: 'AR' },
  { zona: 'Mar del Plata', pais: 'AR' },
  { zona: 'Mendoza', pais: 'AR' },
  { zona: 'Asunción', pais: 'PY' },
  { zona: 'Gran Asunción', pais: 'PY' },
  { zona: 'Ciudad del Este', pais: 'PY' },
  { zona: 'Encarnación', pais: 'PY' },
];

export interface Suggestion {
  rubro: string;
  zona: string;
  pais: string;
}

// Devuelve combos (rubro + zona) que TODAVÍA no se generaron, mezclados al azar.
export async function getRecommendations(count = 6): Promise<Suggestion[]> {
  const done = await query<{ default_rubro: string | null; default_city: string | null }>(
    `SELECT lower(coalesce(default_rubro, '')) AS default_rubro,
            lower(coalesce(default_city, '')) AS default_city
     FROM lead_databases`
  );
  const doneSet = new Set(done.map((d) => `${d.default_rubro}|${d.default_city}`));

  const candidates: Suggestion[] = [];
  for (const r of RUBROS) {
    for (const z of ZONAS) {
      const key = `${r.toLowerCase()}|${z.zona.toLowerCase()}`;
      if (!doneSet.has(key)) {
        candidates.push({ rubro: r, zona: z.zona, pais: z.pais });
      }
    }
  }

  // Mezclar (Fisher-Yates) para variar las sugerencias en cada pedido
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  return candidates.slice(0, count);
}
