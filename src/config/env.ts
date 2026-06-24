import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z.object({
  // Postgres
  DATABASE_URL: z.string().min(1),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Evolution API
  EVOLUTION_API_URL: z.string().url(),
  EVOLUTION_API_KEY: z.string().min(1),

  // Facebook Lead Ads
  FB_VERIFY_TOKEN: z.string().default('prospeccion-verify-token'),
  FB_APP_SECRET: z.string().optional(),
  FB_ACCESS_TOKEN: z.string().optional(),

  // Email SMTP
  EMAIL_PROVIDER: z.enum(['smtp', 'api']).default('smtp'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),

  // App
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  TIMEZONE: z.string().default('America/Argentina/Buenos_Aires'),
  API_KEY: z.string().default('dev-key-cambiar-en-produccion'),
  JWT_SECRET: z.string().default('prospeccion-jwt-secret-cambiar'),

  // Google Places API (generador de bases de datos)
  GOOGLE_PLACES_API_KEY: z.string().default(''),

  // Audio
  AUDIO_STORAGE_PATH: z.string().default('./storage/audios'),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
