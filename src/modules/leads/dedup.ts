import { findLeadByPhone, findLeadByEmail } from '../../db/queries/leads.js';
import type { Lead } from '../../db/types.js';

export interface DedupResult {
  isDuplicate: boolean;
  existingLead: Lead | null;
  matchedBy: 'phone' | 'email' | null;
}

// Verifica si un lead ya existe por teléfono (primario) o email (secundario)
export async function checkDuplicate(phone: string, email?: string): Promise<DedupResult> {
  // Chequeo primario: teléfono
  const byPhone = await findLeadByPhone(phone);
  if (byPhone) {
    return { isDuplicate: true, existingLead: byPhone, matchedBy: 'phone' };
  }

  // Chequeo secundario: email
  if (email) {
    const byEmail = await findLeadByEmail(email);
    if (byEmail) {
      return { isDuplicate: true, existingLead: byEmail, matchedBy: 'email' };
    }
  }

  return { isDuplicate: false, existingLead: null, matchedBy: null };
}
