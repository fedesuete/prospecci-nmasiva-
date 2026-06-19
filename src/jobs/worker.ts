import { Worker } from 'bullmq';
import { redisConnection } from '../config/redis.js';
import { processSendMessage, getJobDelay, type SendMessageJobData } from './send-message.job.js';
import { processSequenceEngine } from '../modules/sequences/engine.js';
import { resetDailyCounters } from '../db/queries/whatsapp-lines.js';
import { sendMessageQueue } from './queue.js';

console.log('Iniciando workers de BullMQ...');

// Worker de envío de mensajes — procesa uno a la vez con delays anti-bloqueo
const sendWorker = new Worker<SendMessageJobData>(
  'send-message',
  async (job) => {
    console.log(`[send-message] Procesando job ${job.id} para lead ${job.data.leadId} por ${job.data.channelId}`);
    await processSendMessage(job.data);

    // Delay anti-bloqueo: agregar delay al próximo job en la cola
    // Esto hace que los mensajes se espacien naturalmente
    const delay = getJobDelay(job.data.channelId);
    console.log(`[send-message] Próximo job en ${Math.round(delay / 1000)}s`);
  },
  {
    connection: redisConnection,
    concurrency: 1, // UN mensaje a la vez — crítico para anti-bloqueo
    limiter: {
      max: 1,
      duration: 40_000, // Máximo 1 mensaje cada 40 segundos
    },
  }
);

sendWorker.on('failed', (job, err) => {
  console.error(`[send-message] Job ${job?.id} falló:`, err.message);
});

sendWorker.on('completed', (job) => {
  console.log(`[send-message] Job ${job.id} completado`);
});

// Worker del motor de secuencias — corre cada 5 minutos
const sequenceWorker = new Worker(
  'sequence-engine',
  async () => {
    console.log('[sequence-engine] Procesando secuencias pendientes...');
    const result = await processSequenceEngine();
    console.log(`[sequence-engine] Procesados: ${result.processed}, Errores: ${result.errors.length}`);
    if (result.errors.length > 0) {
      console.error('[sequence-engine] Errores:', result.errors);
    }
  },
  {
    connection: redisConnection,
    concurrency: 1,
  }
);

// Worker de reset diario
const resetWorker = new Worker(
  'daily-reset',
  async () => {
    console.log('[daily-reset] Reseteando contadores de WhatsApp...');
    const count = await resetDailyCounters();
    console.log(`[daily-reset] ${count} líneas reseteadas`);
  },
  {
    connection: redisConnection,
    concurrency: 1,
  }
);

// Programar jobs recurrentes
async function setupRecurringJobs() {
  // Motor de secuencias: cada 5 minutos
  await import('./queue.js').then(async ({ sequenceEngineQueue }) => {
    await sequenceEngineQueue.upsertJobScheduler(
      'sequence-engine-scheduler',
      { every: 5 * 60 * 1000 }, // cada 5 minutos
      { name: 'process-sequences' }
    );
  });

  // Reset diario: a medianoche Argentina (3:00 UTC)
  await import('./queue.js').then(async ({ dailyResetQueue }) => {
    await dailyResetQueue.upsertJobScheduler(
      'daily-reset-scheduler',
      { pattern: '0 3 * * *' }, // 3:00 UTC = 0:00 Argentina
      { name: 'reset-counters' }
    );
  });

  console.log('Jobs recurrentes configurados');
}

setupRecurringJobs().catch(console.error);

console.log('Workers iniciados y escuchando');
