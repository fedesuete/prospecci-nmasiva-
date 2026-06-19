import { query } from '../../config/database.js';
import {
  findLeadById,
  queryLeads,
  updateLeadStatus,
  markDoNotContact,
  getLeadStats,
  type LeadFilters,
} from '../../db/queries/leads.js';
import { getLeadMessages } from '../../db/queries/messages.js';
import { getActiveEnrollment, cancelEnrollment } from '../../db/queries/sequences.js';
import type { Lead, PipelineStatus } from '../../db/types.js';

export async function getLead(id: string): Promise<Lead | null> {
  return findLeadById(id);
}

export async function listLeads(filters: LeadFilters) {
  return queryLeads(filters);
}

export async function getStats(lineId?: string) {
  return getLeadStats(lineId);
}

export async function getLeadDetail(id: string) {
  const lead = await findLeadById(id);
  if (!lead) return null;

  const [messages, enrollment, history] = await Promise.all([
    getLeadMessages(id),
    getActiveEnrollment(id),
    query(
      'SELECT * FROM pipeline_history WHERE lead_id = $1 ORDER BY created_at ASC',
      [id]
    ),
  ]);

  return { lead, messages, enrollment, history };
}

export async function changeStatus(id: string, newStatus: PipelineStatus): Promise<Lead> {
  if (newStatus === 'respondio') {
    const enrollment = await getActiveEnrollment(id);
    if (enrollment) {
      await cancelEnrollment(enrollment.id, 'replied');
    }
  }

  return updateLeadStatus(id, newStatus);
}

export async function blacklistLead(id: string): Promise<void> {
  const enrollment = await getActiveEnrollment(id);
  if (enrollment) {
    await cancelEnrollment(enrollment.id, 'cancelled');
  }
  await markDoNotContact(id);
}
