import { createTransport, type Transporter } from 'nodemailer';
import { env } from '../../../config/env.js';
import { insertMessage, updateMessageStatus } from '../../../db/queries/messages.js';
import { findLeadById } from '../../../db/queries/leads.js';
import { renderTemplate } from '../../../utils/template.js';
import type { MessageInsert } from '../../../db/types.js';

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

interface SendEmailOptions {
  leadId: string;
  subject: string;
  bodyTemplate: string;
  enrollmentId?: string;
  fromName?: string;
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

  // Renderizar plantilla
  const body = renderTemplate(options.bodyTemplate, lead);
  const subject = renderTemplate(options.subject, lead);

  // Registrar en DB como queued
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
    const transport = getTransporter();
    const result = await transport.sendMail({
      from: `"${options.fromName ?? 'Prospección'}" <${env.SMTP_USER}>`,
      to: lead.email,
      subject,
      text: body,
      html: body.replace(/\n/g, '<br>'),
    });

    await updateMessageStatus(msg.id, 'sent', result.messageId);
    return { success: true, messageId: msg.id };
  } catch (err) {
    await updateMessageStatus(msg.id, 'failed');
    return { success: false, messageId: msg.id, error: (err as Error).message };
  }
}
