/**
 * Script CLI para generar una base de datos de leads desde Google Maps (Places API).
 *
 * Uso:
 *   tsx src/jobs/generate-leads.ts --rubro="peluquerias" --zona="Asuncion" --max=50 --solo-sin-web
 *   tsx src/jobs/generate-leads.ts --rubro="restaurantes" --zona="Encarnacion" --max=30 --pais=PY
 */
import { generateDatabase } from '../modules/sources/generate-database.js';
import { pool } from '../config/database.js';

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const rubro = getArg('rubro');
  const zona = getArg('zona');
  const max = parseInt(getArg('max') ?? '50', 10);
  const pais = getArg('pais') ?? 'PY';
  const soloSinWeb = hasFlag('solo-sin-web');

  if (!rubro || !zona) {
    console.error('Faltan argumentos. Ejemplo:');
    console.error('  tsx src/jobs/generate-leads.ts --rubro="peluquerias" --zona="Asuncion" --max=50 --solo-sin-web');
    process.exit(1);
  }

  console.log(`\nGenerando base: "${rubro}" en "${zona}" (max ${max}, pais ${pais}, soloSinWeb=${soloSinWeb})...\n`);

  try {
    const result = await generateDatabase({ rubro, zona, cantidad: max, soloSinWeb, regionCode: pais });
    console.log('=== Resultado ===');
    console.log(`  Negocios encontrados:      ${result.encontrados}`);
    console.log(`  Sin web:                   ${result.sin_web}`);
    console.log(`  Con telefono valido:       ${result.con_telefono_valido}`);
    console.log(`  Guardados en la base:      ${result.guardados}`);
    console.log(`  Base creada:               "${result.name}" (id ${result.database_id})`);
    console.log('\nAhora asignala a una linea desde el panel (seccion Bases de Datos).');
  } catch (err) {
    console.error('ERROR:', (err as Error).message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
