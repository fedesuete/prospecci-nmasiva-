import { Queue } from 'bullmq';
import { redisConnection } from '../config/redis.js';

// Cola de envío de mensajes — un mensaje a la vez con delays anti-bloqueo
export const sendMessageQueue = new Queue('send-message', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 60_000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 500 },
  },
});

// Cola del motor de secuencias — revisa enrollments pendientes periódicamente
export const sequenceEngineQueue = new Queue('sequence-engine', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  },
});

// Cola de reset diario de contadores de WhatsApp
export const dailyResetQueue = new Queue('daily-reset', {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: { count: 10 },
  },
});
