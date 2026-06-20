import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { env } from './config/env.js';
import { leadsRoutes } from './routes/leads.routes.js';
import { sequencesRoutes } from './routes/sequences.routes.js';
import { messagesRoutes } from './routes/messages.routes.js';
import { inboxRoutes } from './routes/inbox.routes.js';
import { webhooksRoutes } from './routes/webhooks.routes.js';
import { databasesRoutes } from './routes/databases.routes.js';
import { deployRoutes } from './routes/deploy.routes.js';
import { authRoutes } from './routes/auth.routes.js';
import { usersRoutes } from './routes/users.routes.js';
import { authMiddleware } from './middleware/auth.js';

const app = Fastify({ logger: true });

async function start() {
  // Plugins
  await app.register(cors, {
    origin: true, // En producción: restringir al dominio del frontend
  });
  await app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max para CSVs grandes
  });

  // Auth middleware (excepto webhooks que tienen su propia verificación)
  app.addHook('onRequest', async (request, reply) => {
    // No autenticar webhooks, health check ni login
    if (
      request.url.startsWith('/api/webhooks/') ||
      request.url === '/health' ||
      request.url === '/api/auth/login'
    ) {
      return;
    }
    await authMiddleware(request, reply);
  });

  // Health check
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // Rutas
  await app.register(authRoutes);
  await app.register(usersRoutes);
  await app.register(leadsRoutes);
  await app.register(sequencesRoutes);
  await app.register(messagesRoutes);
  await app.register(inboxRoutes);
  await app.register(webhooksRoutes);
  await app.register(databasesRoutes);
  await app.register(deployRoutes);

  // Arrancar servidor
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  console.log(`Servidor corriendo en puerto ${env.PORT}`);
}

start().catch((err) => {
  console.error('Error al iniciar:', err);
  process.exit(1);
});
