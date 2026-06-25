import type { FastifyInstance } from 'fastify';
import { processFacebookWebhook } from '../modules/webhooks/facebook-leads.js';
import { env } from '../config/env.js';
import { query, queryOne } from '../config/database.js';
import { transitionLead } from '../modules/pipeline/transitions.js';
import { insertMessage } from '../db/queries/messages.js';
import { findLeadByPhone } from '../db/queries/leads.js';
import { normalizePhone } from '../utils/phone.js';

// Helper para llamar a Evolution API
async function evolutionFetch(path: string, options: RequestInit = {}) {
  const baseUrl = env.EVOLUTION_API_URL.replace(/\/$/, '');
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      apikey: env.EVOLUTION_API_KEY,
      ...options.headers,
    },
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

// Descarga un media entrante (audio/imagen) desde Evolution y lo guarda en disco.
// Devuelve true si lo guardó.
async function saveInboundMedia(instance: string, key: any, id: string, ext: string): Promise<boolean> {
  try {
    const result = await evolutionFetch(`/chat/getBase64FromMediaMessage/${instance}`, {
      method: 'POST',
      body: JSON.stringify({ message: { key }, convertToMp4: false }),
    });
    const b64 = (result as any)?.base64;
    if (!b64 || typeof b64 !== 'string') return false;
    const fs = await import('fs');
    const path = await import('path');
    const dir = path.join(env.AUDIO_STORAGE_PATH, 'inbound');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${id}.${ext}`), Buffer.from(b64, 'base64'));
    return true;
  } catch (err) {
    console.error('[webhook] media error:', (err as Error).message);
    return false;
  }
}

export async function webhooksRoutes(app: FastifyInstance) {
  // ============================================
  // Facebook Lead Ads
  // ============================================

  app.get('/api/webhooks/facebook', async (request, reply) => {
    const q = request.query as Record<string, string>;
    if (q['hub.mode'] === 'subscribe' && q['hub.verify_token'] === env.FB_VERIFY_TOKEN) {
      return reply.send(q['hub.challenge']);
    }
    return reply.status(403).send('Token inválido');
  });

  app.post('/api/webhooks/facebook', async (request, reply) => {
    try {
      const result = await processFacebookWebhook(request.body as any);
      return reply.send(result);
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message });
    }
  });

  // ============================================
  // Evolution API — Mensajes entrantes WhatsApp
  // ============================================

  app.post('/api/webhooks/evolution', async (request, reply) => {
    const body = request.body as any;

    // Log todo lo que llega para debug
    const event = body.event || body.action || 'unknown';
    const instance = body.instance || body.instanceName || body.data?.instance || '';

    // Extraer key del mensaje — Evolution API v2 puede enviar en diferentes formatos
    const data = body.data || body;
    const key = data.key || {};
    const fromMe = key.fromMe ?? data.fromMe ?? true;
    const remoteJid = key.remoteJid || data.remoteJid || '';

    console.log(`[webhook] event=${event} fromMe=${fromMe} jid=${remoteJid} instance=${instance}`);

    // Detectar cambios de conexión — actualizar estado de la línea automáticamente
    if (event === 'connection.update' || event === 'CONNECTION_UPDATE') {
      const state = data.state || data.status || data.connection || '';
      const statusCode = data.statusCode || data.lastDisconnect?.error?.output?.statusCode || 0;
      console.log(`[webhook] Conexion ${instance}: state=${state} code=${statusCode}`);

      if (instance) {
        let newStatus = '';
        if (state === 'open' || state === 'connected') {
          newStatus = 'active';
        } else if (state === 'close' || state === 'disconnected') {
          // 401 = device_removed (ban/restricción), 408 = timeout, 515 = restart
          newStatus = statusCode === 401 ? 'banned' : 'paused';
        }

        if (newStatus) {
          await query(
            'UPDATE whatsapp_lines SET status = $1, updated_at = now() WHERE instance_name = $2',
            [newStatus, instance]
          );
          console.log(`[webhook] Linea ${instance} -> ${newStatus}`);
        }
      }

      return reply.send({ ok: true });
    }

    // Solo procesar mensajes entrantes (no grupos, no propios)
    const isMessageEvent = event === 'messages.upsert' || event === 'MESSAGES_UPSERT' || event === 'messages.update';
    const isGroup = remoteJid.includes('@g.us') || remoteJid.includes('@broadcast');

    if (!isMessageEvent || fromMe || isGroup || !remoteJid) {
      return reply.send({ ok: true, skipped: event });
    }

    try {
      const rawPhone = remoteJid.split('@')[0];
      const phone = normalizePhone(rawPhone);
      if (!phone) {
        console.log(`[webhook] Phone invalido: ${rawPhone}`);
        return reply.send({ ok: true, skipped: 'phone invalido' });
      }

      // Si el lead no existe, crearlo como nuevo para no perder respuestas
      let lead = await findLeadByPhone(phone);
      if (!lead) {
        // Guardar igualmente el mensaje — puede ser alguien que nos escribió sin estar en la base
        console.log(`[webhook] Lead no encontrado para ${phone}, creando nuevo`);
        const { upsertLead } = await import('../db/queries/leads.js');
        lead = await upsertLead({
          first_name: data.pushName || 'Contacto WA',
          phone,
          temperature: 'warm',
          pipeline_status: 'respondio',
        });
      }

      const message = data.message || {};
      const mediaId: string = body.data?.key?.id || data.key?.id || '';

      // Detectar tipo de mensaje y, si es audio/imagen, descargar el media
      let contentType: 'text' | 'audio' | 'image' = 'text';
      let content: string;
      if ((message.audioMessage || message.pttMessage) && mediaId) {
        contentType = 'audio';
        const ok = await saveInboundMedia(instance, data.key, mediaId, 'ogg');
        content = ok ? `/api/media/inbound/${mediaId}.ogg` : '[audio]';
      } else if (message.imageMessage && mediaId) {
        contentType = 'image';
        const ok = await saveInboundMedia(instance, data.key, mediaId, 'jpg');
        content = ok ? `/api/media/inbound/${mediaId}.jpg` : (message.imageMessage.caption || '[imagen]');
      } else {
        content =
          message.conversation ??
          message.extendedTextMessage?.text ??
          message.imageMessage?.caption ??
          `[${data.messageType || body.messageType || 'media'}]`;
      }

      // Buscar linea por instance_name
      const line = await queryOne<{ id: string }>(
        'SELECT id FROM whatsapp_lines WHERE instance_name = $1',
        [instance]
      );

      await insertMessage({
        lead_id: lead.id,
        channel_id: 'whatsapp',
        whatsapp_line_id: line?.id,
        direction: 'inbound',
        content_type: contentType,
        content,
        external_id: mediaId,
        status: 'received',
      });

      if (lead.pipeline_status === 'contactado') {
        await transitionLead(lead.id, 'respondio', {
          changedBy: 'webhook',
          channelId: 'whatsapp',
          whatsappLineId: line?.id,
        });
      }

      console.log(`[webhook] WA entrante de ${phone}: "${content.substring(0, 50)}"`);
      return reply.send({ ok: true, lead_id: lead.id });
    } catch (err) {
      console.error('[webhook] Error Evolution:', err);
      return reply.status(500).send({ error: (err as Error).message });
    }
  });

  // ============================================
  // Servir media entrante (audios/imágenes de clientes) — pública (sin auth)
  // ============================================
  app.get('/api/media/inbound/:file', async (request, reply) => {
    const { file } = request.params as { file: string };
    if (!/^[A-Za-z0-9._-]+$/.test(file)) return reply.status(400).send({ error: 'nombre inválido' });

    const fs = await import('fs');
    const path = await import('path');
    const fp = path.join(env.AUDIO_STORAGE_PATH, 'inbound', file);
    if (!fs.existsSync(fp)) return reply.status(404).send({ error: 'no encontrado' });

    const ext = file.split('.').pop()?.toLowerCase();
    const mime =
      ext === 'ogg' ? 'audio/ogg'
      : ext === 'mp3' ? 'audio/mpeg'
      : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
      : ext === 'png' ? 'image/png'
      : 'application/octet-stream';

    reply.header('Content-Type', mime);
    reply.header('Cache-Control', 'public, max-age=86400');
    return reply.send(fs.createReadStream(fp));
  });

  // ============================================
  // Gestión de WhatsApp Lines + Evolution API
  // ============================================

  // Listar lineas de nuestra DB
  app.get('/api/whatsapp-lines', async (_request, reply) => {
    const data = await query('SELECT * FROM whatsapp_lines ORDER BY created_at ASC');
    return reply.send(data);
  });

  // Listar instancias directamente desde Evolution API
  // Toggle prospeccion ON/OFF
  app.post('/api/whatsapp-lines/:id/toggle-prospecting', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = await queryOne(
      `UPDATE whatsapp_lines SET prospecting_active = NOT prospecting_active, updated_at = now()
       WHERE id = $1 RETURNING id, display_name, prospecting_active`,
      [id]
    );
    if (!data) return reply.status(404).send({ error: 'Linea no encontrada' });
    console.log(`[prospeccion] ${data.display_name}: ${data.prospecting_active ? 'ACTIVADA' : 'DESACTIVADA'}`);
    return reply.send(data);
  });

  // Estado de prospeccion de todas las lineas
  app.get('/api/whatsapp-lines/prospecting-status', async (_request, reply) => {
    const lines = await query(`
      SELECT wl.id, wl.display_name, wl.instance_name, wl.phone_number, wl.status,
             wl.prospecting_active, wl.sent_today, wl.daily_limit,
             wl.send_hour_start, wl.send_hour_end, wl.send_days,
             (SELECT COUNT(*) FROM leads l WHERE l.assigned_line_id = wl.id AND l.pipeline_status = 'nuevo'
              AND l.do_not_contact = false
              AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.lead_id = l.id AND m.direction = 'outbound' AND m.channel_id = 'whatsapp')
             ) as leads_pendientes,
             (SELECT COUNT(*) FROM audio_variants av WHERE av.whatsapp_line_id = wl.id AND av.is_active = true
             ) as audios_count
      FROM whatsapp_lines wl
      ORDER BY wl.created_at ASC
    `);
    return reply.send(lines);
  });

  // Editar configuracion de una linea
  app.patch('/api/whatsapp-lines/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      display_name?: string;
      daily_limit?: number;
      status?: string;
      send_hour_start?: number;
      send_hour_end?: number;
      send_days?: string[];
      delay_min_seconds?: number;
      delay_max_seconds?: number;
    };

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (body.display_name !== undefined) { fields.push(`display_name = $${idx++}`); values.push(body.display_name); }
    if (body.daily_limit !== undefined) { fields.push(`daily_limit = $${idx++}`); values.push(body.daily_limit); }
    if (body.status !== undefined) { fields.push(`status = $${idx++}`); values.push(body.status); }
    if (body.send_hour_start !== undefined) { fields.push(`send_hour_start = $${idx++}`); values.push(body.send_hour_start); }
    if (body.send_hour_end !== undefined) { fields.push(`send_hour_end = $${idx++}`); values.push(body.send_hour_end); }
    if (body.send_days !== undefined) { fields.push(`send_days = $${idx++}`); values.push(body.send_days); }
    if (body.delay_min_seconds !== undefined) { fields.push(`delay_min_seconds = $${idx++}`); values.push(body.delay_min_seconds); }
    if (body.delay_max_seconds !== undefined) { fields.push(`delay_max_seconds = $${idx++}`); values.push(body.delay_max_seconds); }

    if (fields.length === 0) return reply.status(400).send({ error: 'Nada para actualizar' });

    values.push(id);
    const data = await queryOne(
      `UPDATE whatsapp_lines SET ${fields.join(', ')}, updated_at = now() WHERE id = $${idx} RETURNING *`,
      values
    );

    return reply.send(data);
  });

  app.get('/api/evolution/instances', async (_request, reply) => {
    try {
      const instances = await evolutionFetch('/instance/fetchInstances');
      return reply.send(instances);
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message });
    }
  });

  // Crear nueva instancia en Evolution API + registrar en nuestra DB
  app.post('/api/whatsapp-lines/create', async (request, reply) => {
    const body = request.body as {
      instance_name: string;
      display_name: string;
      daily_limit?: number;
    };

    try {
      // 1. Crear instancia en Evolution API
      const evoResult = await evolutionFetch('/instance/create', {
        method: 'POST',
        body: JSON.stringify({
          instanceName: body.instance_name,
          integration: 'WHATSAPP-BAILEYS',
          qrcode: true,
          webhook: {
            url: `http://prospeccion-api:3001/api/webhooks/evolution`,
            byEvents: false,
            base64: false,
            events: [
              'MESSAGES_UPSERT',
              'CONNECTION_UPDATE',
            ],
          },
        }),
      });

      if (evoResult.error) {
        return reply.status(400).send({ error: evoResult.error || 'Error creando instancia en Evolution API' });
      }

      // 2. Registrar en nuestra DB
      const line = await queryOne(
        `INSERT INTO whatsapp_lines (instance_name, phone_number, display_name, api_url, api_key, daily_limit, status, warmup_start_date)
         VALUES ($1, $2, $3, $4, $5, $6, 'warming_up', CURRENT_DATE) RETURNING *`,
        [
          body.instance_name,
          '',  // Se actualiza cuando se conecta
          body.display_name || body.instance_name,
          env.EVOLUTION_API_URL,
          env.EVOLUTION_API_KEY,
          body.daily_limit ?? 80,
        ]
      );

      return reply.status(201).send({
        line,
        evolution: evoResult,
        qrcode: evoResult.qrcode?.base64 ?? null,
      });
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message });
    }
  });

  // Conectar instancia existente (genera QR code)
  app.get('/api/whatsapp-lines/:instanceName/connect', async (request, reply) => {
    const { instanceName } = request.params as { instanceName: string };
    try {
      const result = await evolutionFetch(`/instance/connect/${instanceName}`);
      return reply.send({
        qrcode: result.base64 ?? null,
        pairingCode: result.pairingCode ?? null,
        code: result.code ?? null,
      });
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message });
    }
  });

  // Ver estado de conexión de una instancia
  app.get('/api/whatsapp-lines/:instanceName/status', async (request, reply) => {
    const { instanceName } = request.params as { instanceName: string };
    try {
      const result = await evolutionFetch(`/instance/connectionState/${instanceName}`);
      const state = result.state || result.instance?.state || 'unknown';

      // Sincronizar nuestra DB con el estado real de Evolution (en ambos sentidos)
      if (state === 'open') {
        const instances = await evolutionFetch('/instance/fetchInstances');
        const instance = Array.isArray(instances)
          ? instances.find((i: any) => i.name === instanceName)
          : null;
        await query(
          `UPDATE whatsapp_lines SET
            phone_number = COALESCE(NULLIF($1, ''), phone_number),
            status = 'active'
           WHERE instance_name = $2`,
          [instance?.ownerJid?.split('@')[0] ?? '', instanceName]
        );
      } else if (state === 'close') {
        // Línea caída: detectar si fue baneada (401) o solo desconectada
        const instances = await evolutionFetch('/instance/fetchInstances');
        const instance = Array.isArray(instances)
          ? instances.find((i: any) => i.name === instanceName)
          : null;
        const newStatus = instance?.disconnectionReasonCode === 401 ? 'banned' : 'paused';
        // No degradar una línea ya marcada como baneada
        await query(
          `UPDATE whatsapp_lines SET status = CASE WHEN status = 'banned' THEN 'banned' ELSE $1 END
           WHERE instance_name = $2`,
          [newStatus, instanceName]
        );
      }
      // 'connecting' / 'unknown': estado transitorio, no tocar

      return reply.send({ ...result, state });
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message });
    }
  });

  // Desconectar/cerrar instancia
  app.post('/api/whatsapp-lines/:instanceName/disconnect', async (request, reply) => {
    const { instanceName } = request.params as { instanceName: string };
    try {
      const result = await evolutionFetch(`/instance/logout/${instanceName}`, { method: 'DELETE' });
      await query(
        "UPDATE whatsapp_lines SET status = 'paused' WHERE instance_name = $1",
        [instanceName]
      );
      return reply.send(result);
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message });
    }
  });

  // Eliminar instancia
  app.delete('/api/whatsapp-lines/:instanceName', async (request, reply) => {
    const { instanceName } = request.params as { instanceName: string };
    try {
      await evolutionFetch(`/instance/delete/${instanceName}`, { method: 'DELETE' });
      await query('DELETE FROM whatsapp_lines WHERE instance_name = $1', [instanceName]);
      return reply.send({ ok: true });
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message });
    }
  });

  // Configurar webhook de una instancia existente
  app.post('/api/whatsapp-lines/:instanceName/webhook', async (request, reply) => {
    const { instanceName } = request.params as { instanceName: string };
    try {
      const result = await evolutionFetch(`/webhook/set/${instanceName}`, {
        method: 'POST',
        body: JSON.stringify({
          webhook: {
            enabled: true,
            url: `http://prospeccion-api:3001/api/webhooks/evolution`,
            webhookByEvents: false,
            webhookBase64: false,
            events: [
              'MESSAGES_UPSERT',
              'CONNECTION_UPDATE',
            ],
          },
        }),
      });
      return reply.send(result);
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message });
    }
  });

  // Importar instancia existente de Evolution API a nuestra DB
  app.post('/api/whatsapp-lines/import', async (request, reply) => {
    const body = request.body as {
      instance_name: string;
      display_name?: string;
      daily_limit?: number;
    };

    try {
      // Verificar que existe en Evolution API
      const instances = await evolutionFetch('/instance/fetchInstances');
      const instance = Array.isArray(instances)
        ? instances.find((i: any) => i.name === body.instance_name)
        : null;

      if (!instance) {
        return reply.status(404).send({ error: `Instancia "${body.instance_name}" no encontrada en Evolution API` });
      }

      // Verificar que no esté ya registrada
      const existing = await queryOne(
        'SELECT id FROM whatsapp_lines WHERE instance_name = $1',
        [body.instance_name]
      );
      if (existing) {
        return reply.status(400).send({ error: 'Esta instancia ya está registrada' });
      }

      const phoneNumber = instance.ownerJid?.split('@')[0] ?? '';
      const isConnected = instance.connectionStatus === 'open';

      // Registrar + configurar webhook
      const line = await queryOne(
        `INSERT INTO whatsapp_lines (instance_name, phone_number, display_name, api_url, api_key, daily_limit, status, warmup_start_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE) RETURNING *`,
        [
          body.instance_name,
          phoneNumber,
          body.display_name || instance.profileName || body.instance_name,
          env.EVOLUTION_API_URL,
          env.EVOLUTION_API_KEY,
          body.daily_limit ?? 80,
          isConnected ? 'active' : 'paused',
        ]
      );

      // Configurar webhook automáticamente
      await evolutionFetch(`/webhook/set/${body.instance_name}`, {
        method: 'POST',
        body: JSON.stringify({
          webhook: {
            enabled: true,
            url: `http://prospeccion-api:3001/api/webhooks/evolution`,
            webhookByEvents: false,
            webhookBase64: false,
            events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
          },
        }),
      });

      return reply.status(201).send({ line, instance_status: instance.connectionStatus });
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message });
    }
  });

  // ============================================
  // Sincronizar chats existentes de Evolution API
  // ============================================

  app.post('/api/whatsapp-lines/:instanceName/sync-chats', async (request, reply) => {
    const { instanceName } = request.params as { instanceName: string };
    try {
      const { syncExistingChats } = await import('../modules/channels/whatsapp/chat-sync.js');
      const result = await syncExistingChats(instanceName);
      return reply.send(result);
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message });
    }
  });

  // ============================================
  // Gestión de audios
  // ============================================

  // Audios filtrados por linea
  app.get('/api/audio-variants', async (request, reply) => {
    const q = request.query as Record<string, string>;
    if (q.line_id) {
      const data = await query('SELECT * FROM audio_variants WHERE whatsapp_line_id = $1 ORDER BY created_at DESC', [q.line_id]);
      return reply.send(data);
    }
    const data = await query('SELECT av.*, wl.display_name as line_name FROM audio_variants av LEFT JOIN whatsapp_lines wl ON av.whatsapp_line_id = wl.id ORDER BY av.created_at DESC');
    return reply.send(data);
  });

  app.post('/api/audio-variants', async (request, reply) => {
    const parts = request.parts();
    let fileBuffer: Buffer | null = null;
    let fileName = '';
    const fields: Record<string, string> = {};

    for await (const part of parts) {
      if (part.type === 'file') {
        fileBuffer = await part.toBuffer();
        fileName = part.filename;
      } else {
        fields[part.fieldname] = part.value as string;
      }
    }

    if (!fileBuffer) {
      return reply.status(400).send({ error: 'Archivo de audio requerido' });
    }

    if (!fields.line_id) {
      return reply.status(400).send({ error: 'Linea WhatsApp requerida' });
    }

    const fs = await import('fs');
    const path = await import('path');
    const audioDir = env.AUDIO_STORAGE_PATH;
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }

    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = path.join(audioDir, `${Date.now()}_${safeName}`);
    fs.writeFileSync(filePath, fileBuffer);

    const audio = await queryOne(
      `INSERT INTO audio_variants (name, file_path, niche, is_active, whatsapp_line_id)
       VALUES ($1, $2, $3, true, $4) RETURNING *`,
      [fields.name || fileName, filePath, fields.niche || null, fields.line_id]
    );

    return reply.status(201).send(audio);
  });

  app.delete('/api/audio-variants/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await query('DELETE FROM audio_variants WHERE id = $1', [id]);
    return reply.send({ ok: true });
  });

  // ============================================
  // Monitor de líneas — chequea estado real contra Evolution API
  // ============================================

  app.get('/api/whatsapp-lines/health', async (_request, reply) => {
    try {
      const lines = await query('SELECT * FROM whatsapp_lines ORDER BY created_at ASC');
      const instances = await evolutionFetch('/instance/fetchInstances') as any[];
      const instanceMap = new Map(
        Array.isArray(instances) ? instances.map((i: any) => [i.name, i]) : []
      );

      const health = lines.map((line: any) => {
        const evo = instanceMap.get(line.instance_name);
        const evoStatus = evo?.connectionStatus ?? 'not_found';
        const dbStatus = line.status;

        // Detectar desincronización
        let alert = null as string | null;
        if (evoStatus === 'close' && dbStatus === 'active') {
          alert = 'Linea caida - Evolution dice desconectada pero DB dice activa';
        } else if (evoStatus === 'open' && dbStatus === 'banned') {
          alert = 'Linea recuperada - Evolution dice conectada pero DB dice baneada';
        } else if (evoStatus === 'close' && dbStatus !== 'banned' && dbStatus !== 'paused') {
          alert = 'Linea desconectada';
        }

        // Actualizar DB si hay desincronización
        if (evoStatus === 'close' && dbStatus === 'active') {
          const discCode = evo?.disconnectionReasonCode;
          const newStatus = discCode === 401 ? 'banned' : 'paused';
          query('UPDATE whatsapp_lines SET status = $1 WHERE id = $2', [newStatus, line.id]);
        }
        if (evoStatus === 'open' && (dbStatus === 'paused' || dbStatus === 'banned')) {
          query("UPDATE whatsapp_lines SET status = 'active' WHERE id = $1", [line.id]);
        }

        return {
          id: line.id,
          instance_name: line.instance_name,
          display_name: line.display_name,
          phone_number: line.phone_number,
          db_status: dbStatus,
          evo_status: evoStatus,
          sent_today: line.sent_today,
          daily_limit: line.daily_limit,
          alert,
        };
      });

      const alerts = health.filter((h: any) => h.alert);

      return reply.send({ lines: health, alerts, checked_at: new Date().toISOString() });
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message });
    }
  });
}
