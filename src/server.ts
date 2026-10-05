import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { buildAgentCard } from './agentCard';
import type { Config } from './config';
import { APP_NAME, APP_VERSION } from './constants';
import { RPC_CODES, rpcError } from './jsonrpc';
import { handleRpc } from './rpc';

function publicUrl(config: Config, protocol: string, host: string): string {
  return (config.publicUrl ?? `${protocol}://${host}`).replace(/\/+$/, '');
}

export async function buildServer(config: Config): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: true,
    logger: {
      level: config.logLevel,
      redact: ['req.headers.authorization'],
      ...(config.nodeEnv !== 'production'
        ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } }
        : {}),
    },
  });

  await app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindow,
    errorResponseBuilder: (_req, context) =>
      rpcError(null, RPC_CODES.RATE_LIMITED, `Rate limit exceeded, retry in ${context.after}`),
  });

  // Convert body-parse (and other) errors into deterministic JSON-RPC envelopes on POST /.
  app.setErrorHandler((err, req, reply) => {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    if (req.method === 'POST' && req.url === '/') {
      if (statusCode === 400) {
        return reply.code(200).send(rpcError(null, RPC_CODES.PARSE_ERROR, 'Parse error'));
      }
      return reply.code(200).send(rpcError(null, RPC_CODES.INTERNAL_ERROR, 'Internal error'));
    }
    req.log.error({ err }, 'request error');
    return reply.code(statusCode).send({ error: (err as Error).message });
  });

  // Liveness — intentionally cheap and dependency-free (no external calls).
  app.get('/health', { config: { rateLimit: false } }, async () => ({
    status: 'ok',
    agent: APP_NAME,
    version: APP_VERSION,
    uptimeSec: Math.round(process.uptime()),
  }));

  // Discovery convenience.
  app.get('/', async () => ({
    name: APP_NAME,
    version: APP_VERSION,
    agentCard: '/.well-known/agent-card.json',
    health: '/health',
    rpc: 'POST / (JSON-RPC 2.0)',
  }));

  // A2A Agent Card.
  app.get('/.well-known/agent-card.json', async (req) => {
    const host = req.headers.host ?? `${config.host}:${config.port}`;
    return buildAgentCard(config, publicUrl(config, req.protocol, host));
  });

  // JSON-RPC 2.0 task endpoint.
  app.post('/', async (req, reply) => {
    const response = await handleRpc(req.body, config, app.log);
    return reply.code(200).type('application/json').send(response);
  });

  return app;
}
