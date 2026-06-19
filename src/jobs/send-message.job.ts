import { sendWhatsAppMessage } from '../modules/channels/whatsapp/sender.js';
import { sendEmail } from '../modules/channels/email/sender.js';
import { sendInstagramOfficialDM } from '../modules/channels/instagram/official.js';
import { getRandomDelay, isWithinSendingHours, msUntilSendingWindowOpens } from '../modules/channels/whatsapp/anti-block.js';
import { transitionLead } from '../modules/pipeline/transitions.js';
import { findLeadById } from '../db/queries/leads.js';
import { getStepByOrder } from '../db/queries/sequences.js';
import type { ChannelId } from '../db/types.js';

export interface SendMessageJobData {
  leadId: string;
  enrollmentId?: string;
  stepId: string;
  channelId: ChannelId;
  messageTemplate: string;
  useAudio: boolean;
}

export async function processSendMessage(data: SendMessageJobData): Promise<void> {
  // Verificar horario humano — si estamos fuera, esperar
  if (!isWithinSendingHours()) {
    const waitMs = msUntilSendingWindowOpens();
    throw new Error(`Fuera de horario. Reintentar en ${Math.round(waitMs / 60000)} minutos`);
  }

  const lead = await findLeadById(data.leadId);
  if (!lead || lead.do_not_contact) return;

  // Determinar si es primer mensaje del lead (para regla no-links)
  const isFirstMessage = lead.pipeline_status === 'nuevo';

  let success = false;

  switch (data.channelId) {
    case 'whatsapp':
      const waResult = await sendWhatsAppMessage({
        leadId: data.leadId,
        messageTemplate: data.messageTemplate,
        useAudio: data.useAudio,
        enrollmentId: data.enrollmentId,
        isFirstMessage,
      });
      success = waResult.success;
      if (!success) throw new Error(waResult.error);
      break;

    case 'email':
      // Separar subject del body en el template (primera línea = subject)
      const lines = data.messageTemplate.split('\n');
      const subject = lines[0];
      const body = lines.slice(1).join('\n').trim();
      const emailResult = await sendEmail({
        leadId: data.leadId,
        subject,
        bodyTemplate: body,
        enrollmentId: data.enrollmentId,
      });
      success = emailResult.success;
      if (!success) throw new Error(emailResult.error);
      break;

    case 'instagram_oficial':
      // Para IG oficial necesitamos el recipientId — lo sacamos del lead
      const igResult = await sendInstagramOfficialDM({
        leadId: data.leadId,
        recipientId: lead.instagram_handle ?? '',
        message: data.messageTemplate,
        enrollmentId: data.enrollmentId,
      });
      success = igResult.success;
      if (!success) throw new Error(igResult.error);
      break;

    default:
      throw new Error(`Canal ${data.channelId} no implementado`);
  }

  // Si el lead estaba en "nuevo" y se envió el primer mensaje, transicionar a "contactado"
  if (success && lead.pipeline_status === 'nuevo') {
    await transitionLead(data.leadId, 'contactado', {
      changedBy: 'system',
      channelId: data.channelId,
    });
  }
}

// Calcular el delay antes del próximo job (anti-bloqueo WhatsApp)
export function getJobDelay(channelId: ChannelId): number {
  if (channelId === 'whatsapp') {
    return getRandomDelay(); // 40-180 segundos
  }
  // Email e IG pueden ir más rápido pero con algo de delay
  return Math.floor(Math.random() * 10_000) + 5_000; // 5-15 segundos
}
