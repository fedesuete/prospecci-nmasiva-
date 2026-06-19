import { insertMessage, updateMessageStatus } from '../../../db/queries/messages.js';
import { incrementSentCounter } from '../../../db/queries/whatsapp-lines.js';
import { findLeadById } from '../../../db/queries/leads.js';
import { getNextAvailableLine } from './line-rotator.js';
import { reencodeAudio, selectRandomVariant } from './audio-encoder.js';
import { isWithinSendingHours, sanitizeFirstMessage } from './anti-block.js';
import { renderTemplate } from '../../../utils/template.js';
import { query } from '../../../config/database.js';
import type { WhatsAppLine, AudioVariant, MessageInsert } from '../../../db/types.js';

interface SendWhatsAppOptions {
  leadId: string;
  messageTemplate: string;
  useAudio: boolean;
  enrollmentId?: string;
  isFirstMessage?: boolean;
}

interface SendResult {
  success: boolean;
  messageId?: string;
  lineUsed?: string;
  error?: string;
}

export async function sendWhatsAppMessage(options: SendWhatsAppOptions): Promise<SendResult> {
  if (!isWithinSendingHours()) {
    return { success: false, error: 'Fuera de horario de envío (9-19h Argentina)' };
  }

  const lead = await findLeadById(options.leadId);
  if (!lead) return { success: false, error: 'Lead no encontrado' };
  if (lead.do_not_contact) return { success: false, error: 'Lead en lista de no contactar' };

  // ANTI-DUPLICADO: no enviar si ya tiene un mensaje saliente por WhatsApp
  const { hasRecentOutbound } = await import('../../../db/queries/messages.js');
  const alreadySent = await hasRecentOutbound(options.leadId, 'whatsapp', 720); // 30 dias
  if (alreadySent) return { success: false, error: 'Lead ya fue contactado por WhatsApp' };

  const line = await getNextAvailableLine();
  if (!line) return { success: false, error: 'No hay líneas WhatsApp disponibles' };

  try {
    if (options.useAudio) {
      return await sendAudioMessage(lead, line, options);
    } else {
      return await sendTextMessage(lead, line, options);
    }
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

async function sendTextMessage(
  lead: any,
  line: WhatsAppLine,
  options: SendWhatsAppOptions
): Promise<SendResult> {
  let content = renderTemplate(options.messageTemplate, lead);

  if (options.isFirstMessage) {
    content = sanitizeFirstMessage(content);
  }

  const msgInsert: MessageInsert = {
    lead_id: lead.id,
    channel_id: 'whatsapp',
    whatsapp_line_id: line.id,
    enrollment_id: options.enrollmentId,
    direction: 'outbound',
    content_type: 'text',
    content,
    status: 'queued',
  };
  const msg = await insertMessage(msgInsert);

  const externalId = await callEvolutionAPI(line, lead.phone, { text: content });

  await updateMessageStatus(msg.id, 'sent', externalId);
  await incrementSentCounter(line.id);

  return { success: true, messageId: msg.id, lineUsed: line.display_name };
}

async function sendAudioMessage(
  lead: any,
  line: WhatsAppLine,
  options: SendWhatsAppOptions
): Promise<SendResult> {
  const variants = await query<AudioVariant>(
    `SELECT * FROM audio_variants WHERE is_active = true
     AND (niche IS NULL ${lead.niche ? 'OR niche = $1' : ''})`,
    lead.niche ? [lead.niche] : []
  );

  if (variants.length === 0) {
    return sendTextMessage(lead, line, { ...options, useAudio: false });
  }

  const variant = selectRandomVariant(variants);

  // Intentar recodificar para hash único; si falla, usar original
  let audioPath = variant.file_path;
  let audioHash = 'original';
  try {
    const encoded = await reencodeAudio(variant.file_path);
    audioPath = encoded.outputPath;
    audioHash = encoded.hash;
  } catch (err) {
    console.warn(`[audio] Recodificación falló, usando original: ${(err as Error).message}`);
  }

  const msgInsert: MessageInsert = {
    lead_id: lead.id,
    channel_id: 'whatsapp',
    whatsapp_line_id: line.id,
    enrollment_id: options.enrollmentId,
    direction: 'outbound',
    content_type: 'audio',
    content: audioPath,
    audio_variant_id: variant.id,
    audio_hash: audioHash,
    status: 'queued',
  };
  const msg = await insertMessage(msgInsert);

  const externalId = await callEvolutionAPI(line, lead.phone, { audio: audioPath });

  await updateMessageStatus(msg.id, 'sent', externalId);
  await incrementSentCounter(line.id);

  return { success: true, messageId: msg.id, lineUsed: line.display_name };
}

async function callEvolutionAPI(
  line: WhatsAppLine,
  phone: string,
  payload: { text?: string; audio?: string }
): Promise<string> {
  const baseUrl = line.api_url.replace(/\/$/, '');

  if (payload.text) {
    const response = await fetch(`${baseUrl}/message/sendText/${line.instance_name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: line.api_key },
      body: JSON.stringify({ number: phone, text: payload.text }),
    });
    if (!response.ok) throw new Error(`Evolution API error: ${response.status} - ${await response.text()}`);
    const result = await response.json() as { key?: { id?: string } };
    return result.key?.id ?? '';
  }

  if (payload.audio) {
    // Leer archivo y convertir a base64 para Evolution API
    const fs = await import('fs');
    const audioBuffer = fs.readFileSync(payload.audio);
    // Evolution API acepta base64 PURO, sin prefijo data:
    const audioBase64 = audioBuffer.toString('base64');

    const response = await fetch(`${baseUrl}/message/sendWhatsAppAudio/${line.instance_name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: line.api_key },
      body: JSON.stringify({ number: phone, audio: audioBase64 }),
    });
    if (!response.ok) throw new Error(`Evolution API audio error: ${response.status} - ${await response.text()}`);
    const result = await response.json() as { key?: { id?: string } };
    return result.key?.id ?? '';
  }

  throw new Error('No text or audio payload provided');
}
