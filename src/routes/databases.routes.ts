import type { FastifyInstance } from 'fastify';
import { query, queryOne } from '../config/database.js';
import { importCsvBuffer, type CsvImportOptions } from '../modules/leads/csv-importer.js';
import { parse } from 'csv-parse/sync';
import { normalizePhone } from '../utils/phone.js';
import type { LeadTemperature } from '../db/types.js';

export async function databasesRoutes(app: FastifyInstance) {
  // Listar todas las bases de datos
  app.get('/api/databases', async (_request, reply) => {
    const data = await query(
      `SELECT db.id, db.name, db.file_name, db.total_rows, db.valid_phones,
              db.default_niche, db.default_city, db.default_rubro, db.temperature,
              db.assigned_line_id, db.imported_at, db.import_result, db.created_at,
              wl.display_name as line_name
       FROM lead_databases db
       LEFT JOIN whatsapp_lines wl ON db.assigned_line_id = wl.id
       ORDER BY db.created_at DESC`
    );
    return reply.send(data);
  });

  // Subir nueva base de datos (solo guardar, no importar)
  app.post('/api/databases', async (request, reply) => {
    const parts = request.parts();
    let fileBuffer: Buffer | null = null;
    let fileName = '';
    const fields: Record<string, string> = {};

    for await (const part of parts) {
      if (part.type === 'file') {
        fileBuffer = await part.toBuffer();
        fileName = part.filename;
      } else {
        fields[part.fieldname] = part.value as string;
      }
    }

    if (!fileBuffer) {
      return reply.status(400).send({ error: 'Archivo CSV requerido' });
    }

    // Analizar el CSV para contar filas y teléfonos válidos
    const csvString = fileBuffer.toString('utf-8').replace(/^\uFEFF/, '');
    let totalRows = 0;
    let validPhones = 0;

    try {
      const rawRows = parse(csvString, {
        skip_empty_lines: true,
        trim: true,
        bom: true,
        relax_column_count: true,
        relax_quotes: true,
      });

      totalRows = Math.max(0, rawRows.length - 1); // -1 por header

      // Contar teléfonos válidos
      for (const row of rawRows) {
        for (const cell of row) {
          const val = (cell ?? '').trim();
          if (/^\+?\d[\d\s\-()]{7,}$/.test(val)) {
            const phone = normalizePhone(val);
            if (phone) { validPhones++; break; }
          }
        }
      }
    } catch { /* CSV parsing failed, save anyway */ }

    const db = await queryOne(
      `INSERT INTO lead_databases (name, file_name, file_data, total_rows, valid_phones,
        default_niche, default_city, default_rubro, temperature)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING
        id, name, file_name, total_rows, valid_phones, default_niche, default_city,
        default_rubro, temperature, assigned_line_id, imported_at, created_at`,
      [
        fields.name || fileName.replace(/\.[^.]+$/, ''),
        fileName,
        fileBuffer,
        totalRows,
        validPhones,
        fields.niche || null,
        fields.city || null,
        fields.rubro || null,
        fields.temperature || 'cold',
      ]
    );

    return reply.status(201).send(db);
  });

  // Asignar base de datos a una línea e importar leads
  app.post('/api/databases/:id/assign', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { line_id: string };

    // Obtener la base de datos con el archivo
    const db = await queryOne<any>(
      'SELECT * FROM lead_databases WHERE id = $1',
      [id]
    );

    if (!db) return reply.status(404).send({ error: 'Base de datos no encontrada' });
    if (db.imported_at) return reply.status(400).send({ error: 'Esta base ya fue importada' });

    // Crear lead_source
    const source = await queryOne<{ id: string }>(
      `INSERT INTO lead_sources (type, name, metadata) VALUES ('csv', $1, $2) RETURNING id`,
      [db.name, JSON.stringify({ database_id: id, file_name: db.file_name })]
    );

    if (!source) return reply.status(500).send({ error: 'Error creando fuente' });

    // Importar leads con la línea asignada
    const options: CsvImportOptions = {
      sourceId: source.id,
      temperature: (db.temperature as LeadTemperature) || 'cold',
      defaultNiche: db.default_niche || undefined,
      defaultCity: db.default_city || undefined,
      defaultRubro: db.default_rubro || undefined,
      assignedLineId: body.line_id,
    };

    const result = await importCsvBuffer(Buffer.from(db.file_data), options);

    // Actualizar la base de datos con el resultado
    await query(
      `UPDATE lead_databases SET assigned_line_id = $1, imported_at = now(), import_result = $2
       WHERE id = $3`,
      [body.line_id, JSON.stringify(result), id]
    );

    return reply.send(result);
  });

  // Eliminar base de datos
  app.delete('/api/databases/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await query('DELETE FROM lead_databases WHERE id = $1', [id]);
    return reply.send({ ok: true });
  });
}
