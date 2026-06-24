import pg from 'pg';
import { readFileSync } from 'fs';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:b395dd333e170341efb7@testfederico_evolution-api-db:5432/prospeccion',
});

const EVO_URL = process.env.EVOLUTION_API_URL || 'http://testfederico_evolution-api:8080';
const EVO_KEY = process.env.EVOLUTION_API_KEY || '429683C4C977415CAAFCCE10F7D57E11';

const DAY_MAP: Record<number, string> = { 0: 'dom', 1: 'lun', 2: 'mar', 3: 'mie', 4: 'jue', 5: 'vie', 6: 'sab' };

function getArgentinaTime(): Date {
  // Argentina = UTC-3 siempre (no tiene horario de verano)
  const now = new Date();
  return new Date(now.getTime() - 3 * 60 * 60 * 1000);
}

function isWithinSchedule(line: any): boolean {
  const now = getArgentinaTime();
  const hour = now.getHours();
  const dayKey = DAY_MAP[now.getDay()];

  const start = line.send_hour_start ?? 9;
  const end = line.send_hour_end ?? 18;
  const days: string[] = line.send_days ?? ['lun', 'mar', 'mie', 'jue', 'vie'];

  if (!days.includes(dayKey)) return false;
  if (hour < start || hour >= end) return false;
  return true;
}

function getDelay(line: any): number {
  const min = line.delay_min_seconds ?? 210;
  const max = line.delay_max_seconds ?? 270;
  return (Math.floor(Math.random() * (max - min)) + min) * 1000;
}

async function processLine(line: any) {
  console.log(`\n=== ${line.display_name} (${line.instance_name}) ===`);

  // Verificar que prospeccion está activada
  if (!line.prospecting_active) {
    console.log('  Prospeccion DESACTIVADA, saltando');
    return;
  }

  // Verificar que la linea no está baneada/pausada en nuestra DB
  if (line.status !== 'active' && line.status !== 'warming_up') {
    console.log(`  Linea status=${line.status}, saltando`);
    return;
  }

  // Verificar horario y dia
  if (!isWithinSchedule(line)) {
    console.log('  Fuera de horario/dia, saltando');
    return;
  }

  // Verificar conexion con Evolution API
  try {
    const res = await fetch(`${EVO_URL}/instance/connectionState/${line.instance_name}`, {
      headers: { apikey: line.api_key || EVO_KEY },
    });
    const data = await res.json() as any;
    const state = data.instance?.state || data.state || 'unknown';
    console.log(`  Conexion: ${state}`);
    if (state !== 'open') {
      console.log(`  Linea desconectada (${state}), saltando`);
      await pool.query("UPDATE whatsapp_lines SET status = 'paused' WHERE id = $1 AND status = 'active'", [line.id]);
      return;
    }
  } catch (err) {
    console.log(`  Error verificando conexion: ${(err as Error).message}, saltando`);
    return;
  }

  // Obtener leads nuevos asignados a esta linea sin contactar
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
    console.log('  SIN LEADS - necesita nueva base de datos');
    return;
  }

  console.log(`  ${leads.length} leads pendientes`);

  // Obtener audios de esta linea
  const { rows: audios } = await pool.query(
    "SELECT * FROM audio_variants WHERE is_active = true AND whatsapp_line_id = $1",
    [line.id]
  );

  if (audios.length === 0) {
    console.log('  SIN AUDIOS configurados, saltando');
    return;
  }

  // Pre-cargar audios
  const audioCache: Array<{ id: string; name: string; b64: string }> = [];
  for (const a of audios) {
    try {
      audioCache.push({ id: a.id, name: a.name, b64: readFileSync(a.file_path).toString('base64') });
    } catch {
      console.log(`  Error leyendo audio ${a.name}`);
    }
  }
  if (audioCache.length === 0) return;

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < leads.length; i++) {
    // Re-verificar horario (puede haber cambiado durante el loop)
    if (!isWithinSchedule(line)) {
      console.log('  Fuera de horario, parando');
      break;
    }

    // Re-verificar que prospeccion sigue activa
    const { rows: [lineCheck] } = await pool.query(
      "SELECT prospecting_active, sent_today, daily_limit FROM whatsapp_lines WHERE id = $1",
      [line.id]
    );
    if (!lineCheck.prospecting_active) {
      console.log('  Prospeccion desactivada, parando');
      break;
    }
    if (lineCheck.sent_today >= lineCheck.daily_limit) {
      console.log(`  Limite diario alcanzado (${lineCheck.sent_today}/${lineCheck.daily_limit})`);
      break;
    }

    const lead = leads[i];

    // Anti-duplicado
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
        console.log(`    FAIL: ${result.response?.message?.[0]?.exists === false ? 'no tiene WhatsApp' : 'error'}`);
        await pool.query("UPDATE leads SET pipeline_status = 'contactado' WHERE id = $1", [lead.id]);
      }
    } catch (err) {
      failed++;
      console.log(`    ERROR: ${(err as Error).message}`);
    }

    // Delay entre mensajes
    if (i < leads.length - 1 && isWithinSchedule(line)) {
      const delay = getDelay(line);
      console.log(`    espera ${Math.round(delay / 1000)}s...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  console.log(`  Resultado: enviados=${sent} errores=${failed} pendientes=${leads.length - sent - failed}`);
}

const CYCLE_MS = 5 * 60 * 1000;

// Motor INDEPENDIENTE por línea: cada línea prospecta a su propio ritmo, en
// paralelo con las demás, sin esperar a nadie (máquina de prospección, no cola).
// Si una línea no tiene leads/horario, vuelve a revisar sola en 5 min.
async function lineWorker(lineId: string) {
  while (true) {
    try {
      const { rows: [line] } = await pool.query('SELECT * FROM whatsapp_lines WHERE id = $1', [lineId]);
      if (line && line.prospecting_active && (line.status === 'active' || line.status === 'warming_up')) {
        const now = getArgentinaTime();
        console.log(`\n[${now.toLocaleString('es-AR')}] >> ${line.display_name}`);
        await processLine(line);
      }
    } catch (err) {
      console.error(`[worker ${lineId}] error: ${(err as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, CYCLE_MS));
  }
}

// Manager: levanta un worker por cada línea y vigila si aparecen líneas nuevas.
async function main() {
  console.log('Motor de prospeccion iniciado (lineas independientes en paralelo).');
  const workers = new Set<string>();

  while (true) {
    try {
      // Reset diario de contadores
      await pool.query(`
        UPDATE whatsapp_lines SET sent_today = 0, last_reset_at = CURRENT_DATE
        WHERE last_reset_at < CURRENT_DATE
      `);

      // Un worker independiente por cada línea (incluye las nuevas)
      const { rows } = await pool.query('SELECT id FROM whatsapp_lines');
      for (const r of rows) {
        if (!workers.has(r.id)) {
          workers.add(r.id);
          lineWorker(r.id);
          console.log(`[motor] worker independiente iniciado para linea ${r.id}`);
        }
      }
    } catch (err) {
      console.error('Error en el manager:', (err as Error).message);
    }

    // Revisar si hay líneas nuevas cada 60s
    await new Promise((r) => setTimeout(r, 60 * 1000));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
