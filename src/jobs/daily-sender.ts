import pg from 'pg';
import { readFileSync } from 'fs';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:b395dd333e170341efb7@testfederico_evolution-api-db:5432/prospeccion',
});

const EVO_URL = process.env.EVOLUTION_API_URL || 'http://testfederico_evolution-api:8080';
const EVO_KEY = process.env.EVOLUTION_API_KEY || '429683C4C977415CAAFCCE10F7D57E11';

// Delay entre mensajes: 3.5 a 4.5 minutos
function randomDelay(): number {
  return Math.floor(Math.random() * 60000) + 210000;
}

// Verificar horario humano (9-19h Argentina)
function isWithinHours(): boolean {
  const now = new Date();
  const argTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
  const hour = argTime.getHours();
  return hour >= 9 && hour < 19;
}

async function dailySend() {
  console.log(`[${new Date().toISOString()}] === INICIO PROSPECCION DIARIA ===`);

  // Resetear contadores si es un nuevo dia
  await pool.query(`
    UPDATE whatsapp_lines SET sent_today = 0, last_reset_at = CURRENT_DATE
    WHERE last_reset_at < CURRENT_DATE
  `);

  // Obtener lineas activas
  const { rows: lines } = await pool.query(
    "SELECT * FROM whatsapp_lines WHERE status IN ('active', 'warming_up')"
  );

  if (lines.length === 0) {
    console.log('[fin] No hay lineas activas');
    return;
  }

  console.log(`Lineas activas: ${lines.map(l => l.display_name).join(', ')}`);

  for (const line of lines) {
    console.log(`\n=== LINEA: ${line.display_name} (${line.instance_name}) ===`);

    // Verificar conexion en Evolution API
    try {
      const statusRes = await fetch(`${EVO_URL}/instance/connectionState/${line.instance_name}`, {
        headers: { apikey: line.api_key || EVO_KEY },
      });
      const statusData = await statusRes.json() as any;
      const state = statusData.instance?.state || statusData.state || 'unknown';
      if (state !== 'open') {
        console.log(`  Linea desconectada (${state}), saltando`);
        await pool.query("UPDATE whatsapp_lines SET status = 'paused' WHERE id = $1", [line.id]);
        continue;
      }
    } catch {
      console.log('  Error verificando conexion, saltando');
      continue;
    }

    // Obtener leads nuevos asignados a esta linea que NO fueron contactados
    const { rows: leads } = await pool.query(`
      SELECT l.* FROM leads l
      WHERE l.assigned_line_id = $1
        AND l.pipeline_status = 'nuevo'
        AND l.do_not_contact = false
        AND NOT EXISTS (
          SELECT 1 FROM messages m
          WHERE m.lead_id = l.id AND m.direction = 'outbound' AND m.channel_id = 'whatsapp'
        )
      ORDER BY l.created_at ASC
    `, [line.id]);

    if (leads.length === 0) {
      console.log('  Sin leads nuevos para contactar');
      continue;
    }

    console.log(`  ${leads.length} leads pendientes`);

    // Obtener audios de esta linea
    const { rows: audios } = await pool.query(
      "SELECT * FROM audio_variants WHERE is_active = true AND whatsapp_line_id = $1",
      [line.id]
    );

    if (audios.length === 0) {
      console.log('  Sin audios configurados, saltando');
      continue;
    }

    // Pre-cargar audios
    const audioCache: Array<{ id: string; name: string; b64: string }> = [];
    for (const a of audios) {
      try {
        audioCache.push({
          id: a.id,
          name: a.name,
          b64: readFileSync(a.file_path).toString('base64'),
        });
      } catch {
        console.log(`  Error leyendo audio ${a.name}, saltando`);
      }
    }

    if (audioCache.length === 0) {
      console.log('  No se pudieron cargar audios, saltando');
      continue;
    }

    let sent = 0;
    let failed = 0;

    for (let i = 0; i < leads.length; i++) {
      // Verificar horario
      if (!isWithinHours()) {
        console.log('  Fuera de horario (9-19h Argentina), parando');
        break;
      }

      // Verificar limite diario
      const { rows: [lineStatus] } = await pool.query(
        "SELECT sent_today, daily_limit FROM whatsapp_lines WHERE id = $1",
        [line.id]
      );
      if (lineStatus.sent_today >= lineStatus.daily_limit) {
        console.log(`  Limite diario alcanzado (${lineStatus.sent_today}/${lineStatus.daily_limit})`);
        break;
      }

      const lead = leads[i];

      // ANTI-DUPLICADO: verificar de nuevo antes de enviar
      const { rows: [existing] } = await pool.query(
        "SELECT id FROM messages WHERE lead_id = $1 AND direction = 'outbound' AND channel_id = 'whatsapp' LIMIT 1",
        [lead.id]
      );
      if (existing) {
        await pool.query("UPDATE leads SET pipeline_status = 'contactado' WHERE id = $1 AND pipeline_status = 'nuevo'", [lead.id]);
        continue;
      }

      const audio = audioCache[Math.floor(Math.random() * audioCache.length)];
      const phone = lead.phone.replace('+', '');

      console.log(`  [${sent + 1}] ${lead.first_name} (${lead.phone})`);

      try {
        const res = await fetch(`${EVO_URL}/message/sendWhatsAppAudio/${line.instance_name}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: line.api_key || EVO_KEY },
          body: JSON.stringify({ number: phone, audio: audio.b64 }),
        });

        const result = await res.json() as any;

        if (res.ok) {
          sent++;
          await pool.query(
            `INSERT INTO messages (lead_id, channel_id, whatsapp_line_id, direction, content_type, audio_variant_id, status, sent_at)
             VALUES ($1, 'whatsapp', $2, 'outbound', 'audio', $3, 'sent', now())`,
            [lead.id, line.id, audio.id]
          );
          await pool.query("UPDATE leads SET pipeline_status = 'contactado' WHERE id = $1", [lead.id]);
          await pool.query("UPDATE whatsapp_lines SET sent_today = sent_today + 1 WHERE id = $1", [line.id]);
          console.log('    OK');
        } else {
          failed++;
          const reason = result.response?.message?.[0]?.exists === false ? 'no tiene WhatsApp' : 'error';
          console.log(`    FAIL: ${reason}`);
          // Marcar como contactado igualmente para no reintentar
          await pool.query("UPDATE leads SET pipeline_status = 'contactado' WHERE id = $1", [lead.id]);
        }
      } catch (err) {
        failed++;
        console.log(`    ERROR: ${(err as Error).message}`);
      }

      // Delay anti-bloqueo
      if (i < leads.length - 1 && isWithinHours()) {
        const delay = randomDelay();
        console.log(`    espera ${Math.round(delay / 1000)}s...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }

    console.log(`  Linea ${line.display_name}: enviados=${sent} errores=${failed}`);
  }

  console.log(`\n[${new Date().toISOString()}] === FIN PROSPECCION DIARIA ===`);
}

// Loop: correr cada dia, verificando horario
async function main() {
  console.log('Motor de prospeccion iniciado. Corre automaticamente de 9 a 19h Argentina.');

  while (true) {
    if (isWithinHours()) {
      // Verificar si hay leads pendientes
      const { rows: [{ count }] } = await pool.query(`
        SELECT COUNT(*) FROM leads l
        WHERE l.pipeline_status = 'nuevo'
          AND l.do_not_contact = false
          AND l.assigned_line_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM messages m
            WHERE m.lead_id = l.id AND m.direction = 'outbound' AND m.channel_id = 'whatsapp'
          )
      `);

      if (parseInt(count) > 0) {
        console.log(`\n${count} leads pendientes, arrancando...`);
        await dailySend();
      }
    }

    // Esperar 10 minutos antes de volver a chequear
    await new Promise(r => setTimeout(r, 10 * 60 * 1000));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
