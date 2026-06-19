import IORedis from 'ioredis';
import { env } from './env.js';

export const redis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // Requerido por BullMQ
});

// Cast para compatibilidad BullMQ (usa su propia versión interna de ioredis)
export const redisConnection = redis as any;
