import ffmpeg from 'fluent-ffmpeg';
import { randomBytes } from 'crypto';
import { createHash } from 'crypto';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { env } from '../../../config/env.js';

// ============================================
// Recodificación de audio con hash único
// Cada envío genera un archivo con metadata/bitrate diferente
// para que WhatsApp no detecte el mismo audio repetido
// ============================================

const PROCESSED_DIR = join(env.AUDIO_STORAGE_PATH, 'processed');

// Bitrates disponibles para rotación (variación sutil)
const BITRATE_OPTIONS = ['48k', '52k', '56k', '60k', '64k'];

// Recodificar un audio base generando un archivo con hash único
export async function reencodeAudio(baseFilePath: string): Promise<{
  outputPath: string;
  hash: string;
}> {
  // Crear directorio de procesados si no existe
  if (!existsSync(PROCESSED_DIR)) {
    mkdirSync(PROCESSED_DIR, { recursive: true });
  }

  // Generar nombre único para el archivo procesado
  const uniqueId = randomBytes(8).toString('hex');
  const outputPath = join(PROCESSED_DIR, `audio_${uniqueId}.ogg`);

  // Elegir bitrate aleatorio
  const bitrate = BITRATE_OPTIONS[Math.floor(Math.random() * BITRATE_OPTIONS.length)];

  // Metadata aleatoria para cambiar el hash del archivo
  const randomTitle = `msg_${randomBytes(4).toString('hex')}`;

  await new Promise<void>((resolve, reject) => {
    ffmpeg(baseFilePath)
      .audioCodec('libopus')
      .audioBitrate(bitrate)
      .outputOptions([
        `-metadata title=${randomTitle}`,
        `-metadata comment=${randomBytes(6).toString('hex')}`,
        // Pequeña variación en el volumen (imperceptible) para cambiar waveform
        `-af volume=${(0.98 + Math.random() * 0.04).toFixed(3)}`,
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(new Error(`Error recodificando audio: ${err.message}`)))
      .run();
  });

  // Calcular hash del archivo generado
  const fileBuffer = readFileSync(outputPath);
  const hash = createHash('sha256').update(fileBuffer).digest('hex');

  return { outputPath, hash };
}

// Seleccionar una variante de audio aleatoria de las disponibles
export function selectRandomVariant<T>(variants: T[]): T {
  return variants[Math.floor(Math.random() * variants.length)];
}
