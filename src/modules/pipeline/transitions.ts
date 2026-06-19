import { query, queryOne } from '../../config/database.js';
import { updateLeadStatus } from '../../db/queries/leads.js';
import { cancelEnrollment, getActiveEnrollment } from '../../db/queries/sequences.js';
import type { PipelineStatus, ChannelId } from '../../db/types.js';

const VALID_TRANSITIONS: Record<PipelineStatus, PipelineStatus[]> = {
  nuevo: ['contactado', 'descartado'],
  contactado: ['respondio', 'descartado'],
  respondio: ['calificado', 'descartado'],
  calificado: ['agendado', 'descartado'],
  agendado: ['cliente', 'descartado'],
  cliente: ['descartado'],
  descartado: ['nuevo'],
};

export async function transitionLead(
  leadId: string,
  newStatus: PipelineStatus,
  options?: {
    changedBy?: string;
    channelId?: ChannelId;
    whatsappLineId?: string;
    notes?: string;
  }
): Promise<void> {
  const lead = await queryOne<{ pipeline_status: string }>(
    'SELECT pipeline_status FROM leads WHERE id = $1',
    [leadId]
  );

  if (!lead) throw new Error('Lead no encontrado');

  const currentStatus = lead.pipeline_status as PipelineStatus;
  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed?.includes(newStatus)) {
    throw new Error(`Transición inválida: ${currentStatus} → ${newStatus}`);
  }

  if (newStatus === 'respondio' || newStatus === 'descartado') {
    const enrollment = await getActiveEnrollment(leadId);
    if (enrollment) {
      await cancelEnrollment(enrollment.id, newStatus === 'respondio' ? 'replied' : 'cancelled');
    }
  }

  // El trigger en DB registra automáticamente en pipeline_history
  await updateLeadStatus(leadId, newStatus);

  // Actualizar datos adicionales en el último registro de historia
  if (options?.channelId || options?.notes || options?.changedBy !== 'system') {
    await query(
      `UPDATE pipeline_history SET changed_by = $1, channel_id = $2, whatsapp_line_id = $3, notes = $4
       WHERE id = (SELECT id FROM pipeline_history WHERE lead_id = $5 AND to_status = $6 ORDER BY created_at DESC LIMIT 1)`,
      [
        options?.changedBy ?? 'system',
        options?.channelId ?? null,
        options?.whatsappLineId ?? null,
        options?.notes ?? null,
        leadId,
        newStatus,
      ]
    );
  }
}
