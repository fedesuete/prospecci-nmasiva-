import { insertMessage, updateMessageStatus } from '../../../db/queries/messages.js';
import type { MessageInsert } from '../../../db/types.js';

// Instagram API Oficial (Messenger API) — para responder a quienes ya escribieron
// Este módulo es seguro, sin riesgo de baneo

interface SendIGOfficialOptions {
  leadId: string;
  recipientId: string; // Instagram-scoped user ID
  message: string;
  enrollmentId?: string;
}

export async function sendInstagramOfficialDM(options: SendIGOfficialOptions): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  const accessToken = process.env.FB_ACCESS_TOKEN;
  const pageId = process.env.IG_PAGE_ID;

  if (!accessToken || !pageId) {
    return { success: false, error: 'Instagram API no configurada (FB_ACCESS_TOKEN o IG_PAGE_ID faltante)' };
  }

  // Registrar en DB
  const msgInsert: MessageInsert = {
    lead_id: options.leadId,
    channel_id: 'instagram_oficial',
    direction: 'outbound',
    content_type: 'text',
    content: options.message,
    enrollment_id: options.enrollmentId,
    status: 'queued',
  };
  const msg = await insertMessage(msgInsert);

  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${pageId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          recipient: { id: options.recipientId },
          message: { text: options.message },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Instagram API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json() as { message_id?: string };
    await updateMessageStatus(msg.id, 'sent', result.message_id);
    return { success: true, messageId: msg.id };
  } catch (err) {
    await updateMessageStatus(msg.id, 'failed');
    return { success: false, messageId: msg.id, error: (err as Error).message };
  }
}
