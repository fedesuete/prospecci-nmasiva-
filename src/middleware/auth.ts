import type { FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../config/env.js';

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const apiKey = request.headers['x-api-key'] || request.headers.authorization?.replace('Bearer ', '');

  if (!apiKey || apiKey !== env.API_KEY) {
    return reply.status(401).send({ error: 'API key inválida o faltante' });
  }
}
