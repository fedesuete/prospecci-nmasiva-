import { query, queryOne } from '../../config/database.js';
import type { Sequence, SequenceStep, SequenceEnrollment } from '../types.js';

export async function getActiveSequences(): Promise<Sequence[]> {
  return query<Sequence>('SELECT * FROM sequences WHERE is_active = true');
}

export async function getSequenceById(id: string): Promise<Sequence | null> {
  return queryOne<Sequence>('SELECT * FROM sequences WHERE id = $1', [id]);
}

export async function getSequenceSteps(sequenceId: string): Promise<SequenceStep[]> {
  return query<SequenceStep>(
    'SELECT * FROM sequence_steps WHERE sequence_id = $1 ORDER BY step_order ASC',
    [sequenceId]
  );
}

export async function getStepByOrder(sequenceId: string, stepOrder: number): Promise<SequenceStep | null> {
  return queryOne<SequenceStep>(
    'SELECT * FROM sequence_steps WHERE sequence_id = $1 AND step_order = $2',
    [sequenceId, stepOrder]
  );
}

export async function enrollLead(leadId: string, sequenceId: string, nextStepAt: string): Promise<SequenceEnrollment> {
  try {
    const result = await queryOne<SequenceEnrollment>(
      `INSERT INTO sequence_enrollments (lead_id, sequence_id, current_step_order, status, next_step_at)
       VALUES ($1, $2, 1, 'active', $3) RETURNING *`,
      [leadId, sequenceId, nextStepAt]
    );
    if (!result) throw new Error('Error enrolling lead');
    return result;
  } catch (err: any) {
    if (err.code === '23505') {
      throw new Error(`Lead ${leadId} ya está inscripto en una secuencia activa`);
    }
    throw err;
  }
}

export async function getActiveEnrollment(leadId: string): Promise<SequenceEnrollment | null> {
  return queryOne<SequenceEnrollment>(
    "SELECT * FROM sequence_enrollments WHERE lead_id = $1 AND status = 'active'",
    [leadId]
  );
}

export async function advanceEnrollment(enrollmentId: string, nextStepOrder: number, nextStepAt: string): Promise<void> {
  await query(
    'UPDATE sequence_enrollments SET current_step_order = $1, next_step_at = $2 WHERE id = $3',
    [nextStepOrder, nextStepAt, enrollmentId]
  );
}

export async function completeEnrollment(enrollmentId: string): Promise<void> {
  await query(
    "UPDATE sequence_enrollments SET status = 'completed', completed_at = now(), next_step_at = NULL WHERE id = $1",
    [enrollmentId]
  );
}

export async function cancelEnrollment(enrollmentId: string, reason: 'cancelled' | 'replied' = 'cancelled'): Promise<void> {
  await query(
    'UPDATE sequence_enrollments SET status = $1, next_step_at = NULL WHERE id = $2',
    [reason, enrollmentId]
  );
}

export async function getDueEnrollments(limit: number = 50) {
  return query(
    `SELECT se.*, row_to_json(s) as sequence
     FROM sequence_enrollments se
     JOIN sequences s ON se.sequence_id = s.id
     WHERE se.status = 'active' AND se.next_step_at <= now()
     ORDER BY se.next_step_at ASC LIMIT $1`,
    [limit]
  );
}
