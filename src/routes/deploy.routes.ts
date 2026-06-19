import type { FastifyInstance } from 'fastify';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const DEPLOY_SECRET = process.env.DEPLOY_SECRET || 'prospeccion-deploy-2026';

export async function deployRoutes(app: FastifyInstance) {
  // POST /api/webhooks/deploy — GitHub webhook para auto-deploy
  app.post('/api/webhooks/deploy', async (request, reply) => {
    const body = request.body as any;
    const secret = (request.query as any).secret;

    // Verificar secret
    if (secret !== DEPLOY_SECRET) {
      return reply.status(403).send({ error: 'Secret invalido' });
    }

    // Solo procesar push a main
    const ref = body.ref || '';
    if (ref !== 'refs/heads/main') {
      return reply.send({ ok: true, skipped: 'No es push a main' });
    }

    const commit = body.head_commit?.message || 'unknown';
    console.log(`[deploy] Recibido push a main: "${commit}"`);

    try {
      // Pull, rebuild y restart
      const { stdout, stderr } = await execAsync(
        'cd /opt/prospeccion && git pull origin main && docker compose -f docker-compose.prod.yml up -d --build prospeccion-api prospeccion-frontend prospeccion-sender 2>&1',
        { timeout: 300000 }
      );

      console.log(`[deploy] OK: ${stdout.slice(-200)}`);
      return reply.send({ ok: true, commit, output: stdout.slice(-500) });
    } catch (err) {
      console.error(`[deploy] Error:`, err);
      return reply.send({ ok: false, error: (err as Error).message });
    }
  });
}
