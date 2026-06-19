import type { FastifyInstance } from 'fastify';
import { getUnifiedInbox, getConversations } from '../modules/inbox/unified.js';

export async function inboxRoutes(app: FastifyInstance) {
  app.get('/api/inbox', async (request, reply) => {
    const query = request.query as Record<string, string>;
    const result = await getUnifiedInbox({
      channelId: query.channel,
      lineId: query.line_id,
      limit: query.limit ? parseInt(query.limit) : 50,
      offset: query.offset ? parseInt(query.offset) : 0,
    });
    return reply.send(result);
  });

  app.get('/api/inbox/conversations', async (request, reply) => {
    const query = request.query as Record<string, string>;
    const limit = query.limit ? parseInt(query.limit) : 50;
    const conversations = await getConversations(limit);
    return reply.send(conversations);
  });
}
