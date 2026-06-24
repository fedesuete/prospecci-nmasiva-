// Expande una zona grande (ciudad) en una lista de barrios/localidades para
// buscar en cada una y juntar muchos más resultados (Google da ~60 por búsqueda).

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

// Ciudades conocidas -> lista de localidades de búsqueda (incluyen la ciudad para desambiguar)
const CITY_EXPANSIONS: Array<{ aliases: string[]; localities: string[] }> = [
  {
    aliases: ['caba', 'capital federal', 'ciudad de buenos aires', 'buenos aires', 'bsas', 'capital'],
    localities: [
      'Palermo, Buenos Aires', 'Recoleta, Buenos Aires', 'Belgrano, Buenos Aires',
      'Caballito, Buenos Aires', 'Flores, Buenos Aires', 'Almagro, Buenos Aires',
      'Villa Crespo, Buenos Aires', 'Nuñez, Buenos Aires', 'Villa Urquiza, Buenos Aires',
      'Boedo, Buenos Aires', 'San Telmo, Buenos Aires', 'Barracas, Buenos Aires',
      'Floresta, Buenos Aires', 'Liniers, Buenos Aires', 'Saavedra, Buenos Aires',
      'Villa del Parque, Buenos Aires', 'Villa Devoto, Buenos Aires', 'Mataderos, Buenos Aires',
      'Once, Buenos Aires', 'Balvanera, Buenos Aires', 'Chacarita, Buenos Aires',
      'Colegiales, Buenos Aires', 'Constitucion, Buenos Aires', 'Monserrat, Buenos Aires',
      'Retiro, Buenos Aires', 'Parque Patricios, Buenos Aires',
    ],
  },
  {
    aliases: ['gran buenos aires', 'gba', 'conurbano'],
    localities: [
      'Avellaneda, Buenos Aires', 'Lanus, Buenos Aires', 'Quilmes, Buenos Aires',
      'Lomas de Zamora, Buenos Aires', 'Moron, Buenos Aires', 'San Isidro, Buenos Aires',
      'Vicente Lopez, Buenos Aires', 'Tigre, Buenos Aires', 'San Martin, Buenos Aires',
      'La Matanza, Buenos Aires', 'Berazategui, Buenos Aires', 'Florencio Varela, Buenos Aires',
    ],
  },
  {
    aliases: ['asuncion', 'asunción'],
    localities: [
      'Centro, Asuncion', 'Villa Morra, Asuncion', 'Sajonia, Asuncion', 'Carmelitas, Asuncion',
      'Las Mercedes, Asuncion', 'Recoleta, Asuncion', 'San Roque, Asuncion', 'Trinidad, Asuncion',
      'Mariscal Lopez, Asuncion', 'Barrio Jara, Asuncion', 'Los Laureles, Asuncion',
      'Santa Maria, Asuncion', 'Ycua Sati, Asuncion', 'Mburicao, Asuncion',
    ],
  },
  {
    aliases: ['gran asuncion', 'central'],
    localities: [
      'Lambare', 'Fernando de la Mora', 'San Lorenzo, Paraguay', 'Luque, Paraguay',
      'Mariano Roque Alonso', 'Nemby', 'Capiata', 'Limpio, Paraguay', 'Villa Elisa, Paraguay',
    ],
  },
  {
    aliases: ['cordoba', 'córdoba'],
    localities: [
      'Nueva Cordoba, Cordoba', 'Centro, Cordoba', 'Cerro de las Rosas, Cordoba',
      'Alta Cordoba, Cordoba', 'General Paz, Cordoba', 'Alberdi, Cordoba',
      'Guemes, Cordoba', 'Barrio Jardin, Cordoba',
    ],
  },
  {
    aliases: ['rosario'],
    localities: [
      'Centro, Rosario', 'Pichincha, Rosario', 'Fisherton, Rosario', 'Echesortu, Rosario',
      'Abasto, Rosario', 'Saladillo, Rosario', 'Alberdi, Rosario',
    ],
  },
];

// Devuelve la lista de zonas a buscar.
// - Si el usuario puso comas, respeta esa lista.
// - Si es una ciudad conocida, la expande en barrios.
// - Si no, usa la zona tal cual (una sola búsqueda).
export function expandLocalities(zona: string): string[] {
  if (zona.includes(',')) {
    return zona.split(',').map((s) => s.trim()).filter(Boolean);
  }
  const key = norm(zona);
  for (const city of CITY_EXPANSIONS) {
    if (city.aliases.includes(key)) {
      return city.localities;
    }
  }
  return [zona.trim()];
}
