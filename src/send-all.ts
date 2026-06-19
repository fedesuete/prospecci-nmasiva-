import pg from 'pg';
import { readFileSync } from 'fs';

const pool = new pg.Pool({
  connectionString: 'postgres://postgres:b395dd333e170341efb7@testfederico_evolution-api-db:5432/prospeccion',
});

const EVO_URL = 'http://testfederico_evolution-api:8080';
const EVO_KEY = '429683C4C977415CAAFCCE10F7D57E11';

// Delay aleatorio entre 3.5 y 4.5 minutos (anti-bloqueo)
function randomDelay(): number {
  return Math.floor(Math.random() * 60000) + 210000;
}

async function sendAll() {
  // Obtener todas las líneas activas
  const { rows: lines } = await pool.query(
    "SELECT * FROM whatsapp_lines WHERE status IN ('active', 'warming_up') AND sent_today < daily_limit"
  );

  if (lines.length === 0) {
    console.log('[fin] No hay lineas disponibles');
    await pool.end();
    return;
  }

  console.log(`[inicio] ${lines.length} linea(s) activa(s)`);

  for (const line of lines) {
    console.log(`\n=== LINEA: ${line.display_name} (${line.instance_name}) ===`);

    // Obtener enrollments pendientes de leads asignados a esta línea
    const { rows: enrollments } = await pool.query(
      `SELECT se.id as enrollment_id, se.lead_id, se.sequence_id
       FROM sequence_enrollments se
       JOIN leads l ON se.lead_id = l.id
       WHERE se.status = 'active'
         AND se.next_step_at <= now()
         AND l.assigned_line_id = $1
       ORDER BY se.next_step_at`,
      [line.id]
    );

    if (enrollments.length === 0) {
      console.log('  Sin leads pendientes para esta linea');
      continue;
    }

    console.log(`  ${enrollments.length} leads pendientes`);

    // Obtener audios DE ESTA LINEA
    const { rows: audios } = await pool.query(
      "SELECT * FROM audio_variants WHERE is_active = true AND whatsapp_line_id = $1",
      [line.id]
    );

    if (audios.length === 0) {
      console.log('  Sin audios configurados para esta linea, saltando');
      continue;
    }

    // Pre-cargar audios en memoria
    const audioCache = audios.map(a => ({
      id: a.id,
      name: a.name,
      b64: readFileSync(a.file_path).toString('base64'),
    }));

    let sent = 0;
    let failed = 0;

    for (let i = 0; i < enrollments.length; i++) {
      const enrollment = enrollments[i];

      // Verificar limite diario
      const { rows: [lineStatus] } = await pool.query(
        "SELECT sent_today, daily_limit FROM whatsapp_lines WHERE id = $1",
        [line.id]
      );
      if (lineStatus.sent_today >= lineStatus.daily_limit) {
        console.log(`  Limite diario alcanzado (${lineStatus.sent_today}/${lineStatus.daily_limit})`);
        break;
      }

      const { rows: [lead] } = await pool.query("SELECT * FROM leads WHERE id = $1", [enrollment.lead_id]);
      if (!lead || lead.do_not_contact) {
        await pool.query("UPDATE sequence_enrollments SET status='cancelled' WHERE id=$1", [enrollment.enrollment_id]);
        continue;
      }

      // ANTI-DUPLICADO: verificar si ya se envió un mensaje a este lead
      const { rows: [existing] } = await pool.query(
        "SELECT id FROM messages WHERE lead_id = $1 AND direction = 'outbound' AND channel_id = 'whatsapp' LIMIT 1",
        [lead.id]
      );
      if (existing) {
        console.log(`  [${i + 1}/${enrollments.length}] ${lead.first_name} - YA CONTACTADO, saltando`);
        await pool.query("UPDATE sequence_enrollments SET status='completed', completed_at=now() WHERE id=$1", [enrollment.enrollment_id]);
        await pool.query("UPDATE leads SET pipeline_status='contactado' WHERE id=$1 AND pipeline_status='nuevo'", [lead.id]);
        continue;
      }

      const audio = audioCache[Math.floor(Math.random() * audioCache.length)];
      const phone = lead.phone.replace('+', '');

      console.log(`  [${i + 1}/${enrollments.length}] ${lead.first_name} (${lead.phone}) - ${audio.name}`);

      try {
        const res = await fetch(`${EVO_URL}/message/sendWhatsAppAudio/${line.instance_name}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: line.api_key },
          body: JSON.stringify({ number: phone, audio: audio.b64 }),
        });

        const result = await res.json() as any;

        if (res.ok) {
          sent++;
          await pool.query(
            `INSERT INTO messages (lead_id, channel_id, whatsapp_line_id, enrollment_id, direction, content_type, audio_variant_id, status, sent_at)
             VALUES ($1, 'whatsapp', $2, $3, 'outbound', 'audio', $4, 'sent', now())`,
            [lead.id, line.id, enrollment.enrollment_id, audio.id]
          );
          await pool.query("UPDATE sequence_enrollments SET status='completed', completed_at=now() WHERE id=$1", [enrollment.enrollment_id]);
          await pool.query("UPDATE leads SET pipeline_status='contactado' WHERE id=$1 AND pipeline_status='nuevo'", [lead.id]);
          await pool.query("UPDATE whatsapp_lines SET sent_today = sent_today + 1 WHERE id = $1", [line.id]);
          console.log('    OK');
        } else {
          if (result.response?.message?.[0]?.exists === false) {
            console.log('    numero no existe en WhatsApp');
          } else {
            failed++;
            console.log('    error:', JSON.stringify(result.response || result.error).substring(0, 100));
          }
          await pool.query("UPDATE sequence_enrollments SET status='cancelled' WHERE id=$1", [enrollment.enrollment_id]);
        }
      } catch (err) {
        failed++;
        console.log('    excepcion:', (err as Error).message);
        await pool.query("UPDATE sequence_enrollments SET status='cancelled' WHERE id=$1", [enrollment.enrollment_id]);
      }

      // Delay anti-bloqueo
      if (i < enrollments.length - 1) {
        const delay = randomDelay();
        console.log(`    espera ${Math.round(delay / 1000)}s...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }

    console.log(`  Linea ${line.display_name}: enviados=${sent} errores=${failed}`);
  }

  console.log('\n[fin] Proceso completado');
  await pool.end();
}

sendAll().catch(e => { console.error(e); process.exit(1); });
