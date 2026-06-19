import type { FastifyInstance } from 'fastify';
import { listLeads, getLead, getLeadDetail, changeStatus, blacklistLead, getStats } from '../modules/leads/lead.service.js';
import { importCsvBuffer, type CsvImportOptions } from '../modules/leads/csv-importer.js';
import { query, queryOne } from '../config/database.js';
import type { LeadSourceType, PipelineStatus, LeadTemperature } from '../db/types.js';

export async function leadsRoutes(app: FastifyInstance) {
  app.get('/api/leads', async (request, reply) => {
    const q = request.query as Record<string, string>;
    const result = await listLeads({
      niche: q.niche || undefined,
      city: q.city || undefined,
      rubro: q.rubro || undefined,
      pipeline_status: (q.status as PipelineStatus) || undefined,
      temperature: (q.temperature as LeadTemperature) || undefined,
      assigned_line_id: q.line_id || undefined,
      limit: q.limit ? parseInt(q.limit) : 50,
      offset: q.offset ? parseInt(q.offset) : 0,
    });
    return reply.send(result);
  });

  app.get('/api/leads/stats', async (request, reply) => {
    const q = request.query as Record<string, string>;
    const stats = await getStats(q.line_id || undefined);
    return reply.send(stats);
  });

  app.get('/api/leads/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const detail = await getLeadDetail(id);
    if (!detail) return reply.status(404).send({ error: 'Lead no encontrado' });
    return reply.send(detail);
  });

  app.patch('/api/leads/:id/status', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status } = request.body as { status: PipelineStatus };
    try {
      const lead = await changeStatus(id, status);
      return reply.send(lead);
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  app.post('/api/leads/:id/blacklist', async (request, reply) => {
    const { id } = request.params as { id: string };
    await blacklistLead(id);
    return reply.send({ ok: true });
  });

  app.post('/api/leads/import-csv', async (request, reply) => {
    const parts = request.parts();
    let fileBuffer: Buffer | null = null;
    const fields: Record<string, string> = {};

    for await (const part of parts) {
      if (part.type === 'file') {
        fileBuffer = await part.toBuffer();
      } else {
        fields[part.fieldname] = part.value as string;
      }
    }

    if (!fileBuffer) {
      return reply.status(400).send({ error: 'Archivo CSV requerido' });
    }

    const source = await queryOne<{ id: string }>(
      `INSERT INTO lead_sources (type, name, metadata) VALUES ($1, $2, $3) RETURNING id`,
      ['csv', fields.source_name || `CSV Import ${new Date().toISOString()}`, JSON.stringify({ original_filename: fields.filename })]
    );

    if (!source) {
      return reply.status(500).send({ error: 'Error creando fuente' });
    }

    const options: CsvImportOptions = {
      sourceId: source.id,
      temperature: (fields.temperature as LeadTemperature) || 'cold',
      defaultNiche: fields.niche || undefined,
      defaultCity: fields.city || undefined,
      defaultRubro: fields.rubro || undefined,
      assignedLineId: fields.line_id || undefined,
    };

    const result = await importCsvBuffer(fileBuffer, options);
    return reply.send(result);
  });
}
