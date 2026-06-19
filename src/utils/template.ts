import type { Lead } from '../db/types.js';

// Reemplazar variables {{nombre}} en plantillas de mensaje
// Variables disponibles: first_name, last_name, company_name, niche, city, rubro
export function renderTemplate(template: string, lead: Lead): string {
  const vars: Record<string, string> = {
    first_name: lead.first_name,
    last_name: lead.last_name ?? '',
    company_name: lead.company_name ?? '',
    niche: lead.niche ?? '',
    city: lead.city ?? '',
    rubro: lead.rubro ?? '',
    phone: lead.phone,
  };

  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    return vars[key] ?? '';
  });
}
