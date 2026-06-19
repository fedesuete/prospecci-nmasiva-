import {
  getDueEnrollments,
  getSequenceSteps,
  getStepByOrder,
  advanceEnrollment,
  completeEnrollment,
  cancelEnrollment,
} from '../../db/queries/sequences.js';
import { findLeadById } from '../../db/queries/leads.js';
import { hasLeadReplied, hasRecentOutbound } from '../../db/queries/messages.js';
import { sendMessageQueue } from '../../jobs/queue.js';
import type { SequenceStep } from '../../db/types.js';

// Motor de secuencias: procesa enrollments que tienen su next_step_at vencido
export async function processSequenceEngine(): Promise<{ processed: number; errors: string[] }> {
  const result = { processed: 0, errors: [] as string[] };
  const dueEnrollments = await getDueEnrollments(50);

  for (const enrollment of dueEnrollments) {
    try {
      const lead = await findLeadById(enrollment.lead_id);
      if (!lead || lead.do_not_contact) {
        await cancelEnrollment(enrollment.id, 'cancelled');
        continue;
      }

      // Si el lead respondió, cancelar la secuencia
      const replied = await hasLeadReplied(lead.id);
      if (replied) {
        await cancelEnrollment(enrollment.id, 'replied');
        continue;
      }

      // Obtener el paso actual
      const step = await getStepByOrder(enrollment.sequence_id, enrollment.current_step_order);
      if (!step) {
        await completeEnrollment(enrollment.id);
        continue;
      }

      // Evaluar condición del paso
      const shouldExecute = await evaluateCondition(step, lead.id);
      if (!shouldExecute) {
        // Saltar este paso y avanzar al siguiente
        await advanceToNextStep(enrollment.id, enrollment.sequence_id, enrollment.current_step_order);
        result.processed++;
        continue;
      }

      // Anti-doble-contacto: no enviar si ya se envió por este canal recientemente
      const recentlySent = await hasRecentOutbound(lead.id, step.channel_id, 24);
      if (recentlySent) {
        await advanceToNextStep(enrollment.id, enrollment.sequence_id, enrollment.current_step_order);
        result.processed++;
        continue;
      }

      // Encolar el envío del mensaje
      await sendMessageQueue.add('send-message', {
        leadId: lead.id,
        enrollmentId: enrollment.id,
        stepId: step.id,
        channelId: step.channel_id,
        messageTemplate: step.message_template,
        useAudio: step.use_audio,
      });

      // Avanzar al siguiente paso
      await advanceToNextStep(enrollment.id, enrollment.sequence_id, enrollment.current_step_order);

      result.processed++;
    } catch (err) {
      result.errors.push(`Enrollment ${enrollment.id}: ${(err as Error).message}`);
    }
  }

  return result;
}

async function evaluateCondition(step: SequenceStep, leadId: string): Promise<boolean> {
  switch (step.condition) {
    case 'always':
      return true;
    case 'if_no_reply': {
      const replied = await hasLeadReplied(leadId);
      return !replied;
    }
    case 'if_replied': {
      return hasLeadReplied(leadId);
    }
    default:
      return true;
  }
}

async function advanceToNextStep(
  enrollmentId: string,
  sequenceId: string,
  currentOrder: number
): Promise<void> {
  const nextStep = await getStepByOrder(sequenceId, currentOrder + 1);

  if (!nextStep) {
    // No hay más pasos, secuencia completada
    await completeEnrollment(enrollmentId);
    return;
  }

  // Calcular cuándo se ejecuta el siguiente paso
  const nextStepAt = new Date(Date.now() + nextStep.delay_hours * 60 * 60 * 1000).toISOString();
  await advanceEnrollment(enrollmentId, currentOrder + 1, nextStepAt);
}
