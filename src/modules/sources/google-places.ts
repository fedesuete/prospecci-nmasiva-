import { env } from '../../config/env.js';

// Un negocio devuelto por Google Places API (New)
export interface PlaceBusiness {
  place_id: string;
  name: string;
  phone: string | null;     // teléfono crudo de Google (sin normalizar)
  website: string | null;
  rating: number | null;
  reviews: number | null;
  address: string | null;
  maps_uri: string | null;
}

const ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.rating',
  'places.userRatingCount',
  'places.googleMapsUri',
  'nextPageToken',
].join(',');

export interface SearchOptions {
  query: string;          // ej: "peluquerias en Asuncion"
  max: number;            // cantidad de resultados deseada
  regionCode?: string;    // ej: 'PY', 'AR'
  languageCode?: string;
}

// Busca negocios en Google Maps por texto, paginando hasta juntar `max`.
export async function searchBusinesses(opts: SearchOptions): Promise<PlaceBusiness[]> {
  if (!env.GOOGLE_PLACES_API_KEY) {
    throw new Error('Falta GOOGLE_PLACES_API_KEY en el entorno');
  }

  const results: PlaceBusiness[] = [];
  let pageToken: string | undefined;

  while (results.length < opts.max) {
    const body: Record<string, unknown> = {
      textQuery: opts.query,
      languageCode: opts.languageCode ?? 'es',
      regionCode: opts.regionCode ?? 'PY',
      maxResultCount: Math.min(20, opts.max - results.length),
    };
    if (pageToken) body.pageToken = pageToken;

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': env.GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google Places ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = (await res.json()) as {
      places?: Array<Record<string, any>>;
      nextPageToken?: string;
    };

    const places = data.places ?? [];
    for (const p of places) {
      results.push({
        place_id: p.id,
        name: p.displayName?.text ?? '',
        phone: p.nationalPhoneNumber ?? p.internationalPhoneNumber ?? null,
        website: p.websiteUri ?? null,
        rating: p.rating ?? null,
        reviews: p.userRatingCount ?? null,
        address: p.formattedAddress ?? null,
        maps_uri: p.googleMapsUri ?? null,
      });
    }

    pageToken = data.nextPageToken;
    if (!pageToken || places.length === 0) break;

    // Breve espera antes de usar el nextPageToken
    await new Promise((r) => setTimeout(r, 300));
  }

  return results.slice(0, opts.max);
}
