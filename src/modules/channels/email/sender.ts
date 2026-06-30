import { createTransport } from 'nodemailer';
import { resolveMx } from 'dns/promises';
import { query, queryOne } from '../../../config/database.js';
import { insertMessage, updateMessageStatus } from '../../../db/queries/messages.js';
import { findLeadById } from '../../../db/queries/leads.js';
import { renderTemplate } from '../../../utils/template.js';
import type { MessageInsert } from '../../../db/types.js';

interface EmailAccount {
  id: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  from_name: string | null;
}

// Verificación de email: sintaxis + que el dominio tenga servidores de correo (MX)
export async function verifyEmail(email: string): Promise<boolean> {
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return false;
  const domain = email.split('@')[1];
  try {
    const mx = await resolveMx(domain);
    return Array.isArray(mx) && mx.length > 0;
  } catch {
    return false;
  }
}

// Resetea contadores diarios y aplica calentamiento (sube el límite de a poco)
async function resetIfNewDay(): Promise<void> {
  await query(`
    UPDATE email_accounts
    SET sent_today = 0,
        last_reset_at = CURRENT_DATE,
        daily_limit = LEAST(daily_limit + warmup_daily_increment, 200)
    WHERE last_reset_at < CURRENT_DATE
  `);
}

// Elige la casilla disponible menos usada hoy (rotación + respeta el límite diario)
async function getAvailableAccount(): Promise<EmailAccount | null> {
  await resetIfNewDay();
  return queryOne<EmailAccount>(`
    SELECT id, smtp_host, smtp_port, smtp_user, smtp_pass, from_name
    FROM email_accounts
    WHERE is_active = true AND sent_today < daily_limit
    ORDER BY sent_today ASC, created_at ASC
    LIMIT 1
  `);
}

interface SendEmailOptions {
  leadId: string;
  subject: string;
  bodyTemplate: string;
  enrollmentId?: string;
}

interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const lead = await findLeadById(options.leadId);
  if (!lead) return { success: false, error: 'Lead no encontrado' };
  if (!lead.email) return { success: false, error: 'Lead sin email' };
  if (lead.do_not_contact) return { success: false, error: 'Lead en lista de no contactar' };

  // Verificar el email antes de enviar (evita rebotes que queman la reputación)
  if (!(await verifyEmail(lead.email))) {
    return { success: false, error: `Email inválido o sin servidor de correo: ${lead.email}` };
  }

  // Elegir casilla disponible (rotación + límite diario)
  const account = await getAvailableAccount();
  if (!account) {
    return { success: false, error: 'No hay casillas de email disponibles (límite diario alcanzado o ninguna configurada)' };
  }

  const body = renderTemplate(options.bodyTemplate, lead);
  const subject = renderTemplate(options.subject, lead);

  const msgInsert: MessageInsert = {
    lead_id: lead.id,
    channel_id: 'email',
    direction: 'outbound',
    content_type: 'text',
    content: `Subject: ${subject}\n\n${body}`,
    enrollment_id: options.enrollmentId,
    status: 'queued',
  };
  const msg = await insertMessage(msgInsert);

  try {
    const transport = createTransport({
      host: account.smtp_host,
      port: account.smtp_port,
      secure: account.smtp_port === 465,
      auth: { user: account.smtp_user, pass: account.smtp_pass },
    });

    const result = await transport.sendMail({
      from: `"${account.from_name ?? 'Prospección'}" <${account.smtp_user}>`,
      to: lead.email,
      subject,
      text: body,
      html: body.replace(/\n/g, '<br>'),
    });

    await updateMessageStatus(msg.id, 'sent', result.messageId);
    await query('UPDATE email_accounts SET sent_today = sent_today + 1 WHERE id = $1', [account.id]);
    return { success: true, messageId: msg.id };
  } catch (err) {
    await updateMessageStatus(msg.id, 'failed');
    return { success: false, messageId: msg.id, error: (err as Error).message };
  }
}
