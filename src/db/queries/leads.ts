import { query, queryOne } from '../../config/database.js';
import type { Lead, LeadInsert, PipelineStatus, LeadTemperature } from '../types.js';

export async function findLeadByPhone(phone: string): Promise<Lead | null> {
  return queryOne<Lead>('SELECT * FROM leads WHERE phone = $1', [phone]);
}

export async function findLeadByEmail(email: string): Promise<Lead | null> {
  return queryOne<Lead>('SELECT * FROM leads WHERE email = $1', [email]);
}

export async function findLeadById(id: string): Promise<Lead | null> {
  return queryOne<Lead>('SELECT * FROM leads WHERE id = $1', [id]);
}

export async function upsertLead(lead: LeadInsert): Promise<Lead> {
  const result = await queryOne<Lead>(
    `INSERT INTO leads (source_id, first_name, last_name, company_name, phone, email,
      instagram_handle, linkedin_url, niche, city, rubro, temperature, pipeline_status,
      do_not_contact, tags, raw_data, assigned_line_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
    ON CONFLICT (phone) DO UPDATE SET
      first_name = COALESCE(NULLIF(EXCLUDED.first_name,''), leads.first_name),
      last_name = COALESCE(EXCLUDED.last_name, leads.last_name),
      company_name = COALESCE(EXCLUDED.company_name, leads.company_name),
      email = COALESCE(EXCLUDED.email, leads.email),
      instagram_handle = COALESCE(EXCLUDED.instagram_handle, leads.instagram_handle),
      linkedin_url = COALESCE(EXCLUDED.linkedin_url, leads.linkedin_url),
      niche = COALESCE(EXCLUDED.niche, leads.niche),
      city = COALESCE(EXCLUDED.city, leads.city),
      rubro = COALESCE(EXCLUDED.rubro, leads.rubro),
      source_id = COALESCE(EXCLUDED.source_id, leads.source_id),
      assigned_line_id = COALESCE(EXCLUDED.assigned_line_id, leads.assigned_line_id),
      raw_data = EXCLUDED.raw_data,
      updated_at = now()
    RETURNING *`,
    [
      lead.source_id ?? null, lead.first_name, lead.last_name ?? null,
      lead.company_name ?? null, lead.phone, lead.email ?? null,
      lead.instagram_handle ?? null, lead.linkedin_url ?? null,
      lead.niche ?? null, lead.city ?? null, lead.rubro ?? null,
      lead.temperature ?? 'cold', lead.pipeline_status ?? 'nuevo',
      lead.do_not_contact ?? false, lead.tags ?? [], lead.raw_data ?? {},
      lead.assigned_line_id ?? null,
    ]
  );
  if (!result) throw new Error('Error upserting lead');
  return result;
}

export async function upsertLeadsBatch(leads: LeadInsert[]): Promise<{ inserted: number; updated: number; errors: string[] }> {
  const results = { inserted: 0, updated: 0, errors: [] as string[] };

  for (const lead of leads) {
    try {
      const existing = await findLeadByPhone(lead.phone);
      await upsertLead(lead);
      if (existing) results.updated++;
      else results.inserted++;
    } catch (err) {
      results.errors.push(`${lead.phone}: ${(err as Error).message}`);
    }
  }

  return results;
}

export async function updateLeadStatus(id: string, status: PipelineStatus): Promise<Lead> {
  const result = await queryOne<Lead>(
    'UPDATE leads SET pipeline_status = $1 WHERE id = $2 RETURNING *',
    [status, id]
  );
  if (!result) throw new Error('Lead no encontrado');
  return result;
}

export async function markDoNotContact(id: string): Promise<void> {
  await query('UPDATE leads SET do_not_contact = true WHERE id = $1', [id]);
}

export interface LeadFilters {
  niche?: string;
  city?: string;
  rubro?: string;
  pipeline_status?: PipelineStatus;
  temperature?: LeadTemperature;
  do_not_contact?: boolean;
  assigned_line_id?: string;
  limit?: number;
  offset?: number;
}

export async function queryLeads(filters: LeadFilters): Promise<{ data: Lead[]; count: number }> {
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIdx = 1;

  if (filters.niche) { conditions.push(`niche = $${paramIdx++}`); params.push(filters.niche); }
  if (filters.city) { conditions.push(`city = $${paramIdx++}`); params.push(filters.city); }
  if (filters.rubro) { conditions.push(`rubro = $${paramIdx++}`); params.push(filters.rubro); }
  if (filters.pipeline_status) { conditions.push(`pipeline_status = $${paramIdx++}`); params.push(filters.pipeline_status); }
  if (filters.temperature) { conditions.push(`temperature = $${paramIdx++}`); params.push(filters.temperature); }
  if (filters.do_not_contact !== undefined) { conditions.push(`do_not_contact = $${paramIdx++}`); params.push(filters.do_not_contact); }
  if (filters.assigned_line_id) { conditions.push(`assigned_line_id = $${paramIdx++}`); params.push(filters.assigned_line_id); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  const [data, countResult] = await Promise.all([
    query<Lead>(`SELECT * FROM leads ${where} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`, params),
    queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM leads ${where}`, params),
  ]);

  return { data, count: parseInt(countResult?.count ?? '0') };
}

export async function getLeadStats(lineId?: string): Promise<Record<PipelineStatus, number>> {
  const whereClause = lineId ? 'WHERE assigned_line_id = $1' : '';
  const params = lineId ? [lineId] : [];
  const rows = await query<{ pipeline_status: PipelineStatus; count: string }>(
    `SELECT pipeline_status, COUNT(*) as count FROM leads ${whereClause} GROUP BY pipeline_status`,
    params
  );

  const stats = {} as Record<PipelineStatus, number>;
  const statuses: PipelineStatus[] = ['nuevo', 'contactado', 'respondio', 'calificado', 'agendado', 'cliente', 'descartado'];
  for (const s of statuses) stats[s] = 0;
  for (const row of rows) stats[row.pipeline_status] = parseInt(row.count);

  return stats;
}
