import { queryOne } from '../../config/database.js';
import { upsertLead } from '../../db/queries/leads.js';
import { normalizePhone } from '../../utils/phone.js';
import { normalizeEmail } from '../../utils/email.js';
import { normalizeInstagramHandle } from '../leads/normalizer.js';
import type { LeadInsert } from '../../db/types.js';
import { enrollLeadInMatchingSequence } from '../sequences/enrollment.service.js';

interface FBLeadAdsEntry {
  id: string;
  time: number;
  changes: Array<{
    field: string;
    value: {
      form_id: string;
      leadgen_id: string;
      created_time: number;
      page_id: string;
    };
  }>;
}

interface FBLeadData {
  id: string;
  created_time: string;
  field_data: Array<{
    name: string;
    values: string[];
  }>;
}

export async function processFacebookWebhook(body: { object: string; entry: FBLeadAdsEntry[] }): Promise<{
  processed: number;
  errors: string[];
}> {
  const result = { processed: 0, errors: [] as string[] };

  if (body.object !== 'page') return result;

  for (const entry of body.entry) {
    for (const change of entry.changes) {
      if (change.field !== 'leadgen') continue;
      try {
        await processLeadgenEvent(change.value.leadgen_id, change.value.form_id);
        result.processed++;
      } catch (err) {
        result.errors.push(`Lead ${change.value.leadgen_id}: ${(err as Error).message}`);
      }
    }
  }

  return result;
}

async function processLeadgenEvent(leadgenId: string, formId: string): Promise<void> {
  const leadData = await fetchLeadFromFacebook(leadgenId);
  if (!leadData) throw new Error('No se pudo obtener datos del lead desde Facebook');

  // Crear o obtener fuente
  let source = await queryOne<{ id: string }>(
    "SELECT id FROM lead_sources WHERE type = 'facebook_lead_ads' AND name = $1",
    [`Facebook Form ${formId}`]
  );

  if (!source) {
    source = await queryOne<{ id: string }>(
      `INSERT INTO lead_sources (type, name, metadata) VALUES ('facebook_lead_ads', $1, $2) RETURNING id`,
      [`Facebook Form ${formId}`, JSON.stringify({ form_id: formId, leadgen_id: leadgenId })]
    );
  }

  const fields = extractFBFields(leadData.field_data);

  const phone = normalizePhone(fields.phone ?? '');
  if (!phone) throw new Error(`Teléfono inválido en lead de Facebook: "${fields.phone}"`);

  const leadInsert: LeadInsert = {
    source_id: source?.id,
    first_name: fields.first_name || fields.full_name?.split(' ')[0] || 'Sin nombre',
    last_name: fields.last_name || fields.full_name?.split(' ').slice(1).join(' ') || undefined,
    company_name: fields.company_name || undefined,
    phone,
    email: fields.email ? (normalizeEmail(fields.email) ?? undefined) : undefined,
    instagram_handle: fields.instagram ? (normalizeInstagramHandle(fields.instagram) ?? undefined) : undefined,
    niche: fields.niche || undefined,
    city: fields.city || undefined,
    rubro: fields.rubro || undefined,
    temperature: 'warm',
    raw_data: leadData as unknown as Record<string, unknown>,
  };

  const lead = await upsertLead(leadInsert);
  await enrollLeadInMatchingSequence(lead);
}

function extractFBFields(fieldData: FBLeadData['field_data']): Record<string, string | undefined> {
  const fields: Record<string, string | undefined> = {};

  for (const field of fieldData) {
    const value = field.values[0];
    switch (field.name.toLowerCase()) {
      case 'full_name': case 'nombre_completo': fields.full_name = value; break;
      case 'first_name': case 'nombre': fields.first_name = value; break;
      case 'last_name': case 'apellido': fields.last_name = value; break;
      case 'phone_number': case 'telefono': case 'whatsapp': case 'celular': fields.phone = value; break;
      case 'email': case 'correo': fields.email = value; break;
      case 'company_name': case 'empresa': fields.company_name = value; break;
      case 'city': case 'ciudad': fields.city = value; break;
      case 'instagram': case 'ig': fields.instagram = value; break;
      default: fields[field.name] = value;
    }
  }

  return fields;
}

async function fetchLeadFromFacebook(leadgenId: string): Promise<FBLeadData | null> {
  const accessToken = process.env.FB_ACCESS_TOKEN;
  if (!accessToken) throw new Error('FB_ACCESS_TOKEN no configurado');

  const url = `https://graph.facebook.com/v19.0/${leadgenId}?access_token=${accessToken}`;
  const response = await fetch(url);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error de Facebook API: ${response.status} - ${errorText}`);
  }

  return response.json() as Promise<FBLeadData>;
}
