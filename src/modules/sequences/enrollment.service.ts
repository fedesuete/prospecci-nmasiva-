import { getActiveSequences, enrollLead, getActiveEnrollment } from '../../db/queries/sequences.js';
import type { Lead, Sequence } from '../../db/types.js';

// Inscribir un lead en la secuencia que mejor matchee por nicho/ciudad/temperatura
export async function enrollLeadInMatchingSequence(lead: Lead): Promise<void> {
  // No inscribir si ya está en una secuencia activa
  const existing = await getActiveEnrollment(lead.id);
  if (existing) return;

  // No inscribir si está en do_not_contact
  if (lead.do_not_contact) return;

  // No inscribir si ya fue contactado o más avanzado
  if (lead.pipeline_status !== 'nuevo') return;

  // Buscar secuencia que matchee
  const sequences = await getActiveSequences();
  const matching = findBestSequence(sequences, lead);

  if (!matching) return;

  // Inscribir con el primer paso programado para ahora (o con delay mínimo)
  const nextStepAt = new Date(Date.now() + 60 * 1000).toISOString(); // 1 minuto de gracia
  await enrollLead(lead.id, matching.id, nextStepAt);
}

// Encontrar la secuencia que mejor matchea con el lead
function findBestSequence(sequences: Sequence[], lead: Lead): Sequence | null {
  // Prioridad: match por temperatura + nicho + ciudad > temperatura + nicho > temperatura > cualquiera
  let best: Sequence | null = null;
  let bestScore = -1;

  for (const seq of sequences) {
    let score = 0;

    // Filtro de temperatura (obligatorio si está definido en la secuencia)
    if (seq.target_temperature && seq.target_temperature !== lead.temperature) {
      continue; // No matchea
    }
    if (seq.target_temperature === lead.temperature) score += 10;

    // Match por nicho
    if (seq.target_niche) {
      if (lead.niche && lead.niche.toLowerCase() === seq.target_niche.toLowerCase()) {
        score += 5;
      } else {
        continue; // Tiene nicho definido pero no matchea
      }
    }

    // Match por ciudad
    if (seq.target_city) {
      if (lead.city && lead.city.toLowerCase() === seq.target_city.toLowerCase()) {
        score += 3;
      } else {
        continue; // Tiene ciudad definida pero no matchea
      }
    }

    if (score > bestScore) {
      bestScore = score;
      best = seq;
    }
  }

  return best;
}
