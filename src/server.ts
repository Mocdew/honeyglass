import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { buildAgentCard } from './agentCard';
import { buildCommerce } from './commerce';
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

  // Optional ERC-8183 commerce layer (null when COMMERCE_ENABLED is not set).
  const commerce = buildCommerce(config, app.log);
  if (commerce) {
    app.log.info(
      `Commerce enabled: seller ${commerce.sellerAddress} on ${commerce.network} (category: ${commerce.category})`,
    );
  }

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
    return buildAgentCard(config, publicUrl(config, req.protocol, host), commerce);
  });

  // Public deliverable manifests — the target of the on-chain deliverable URL.
  app.get<{ Params: { jobId: string } }>(
    '/deliverables/:jobId',
    { config: { rateLimit: false } },
    async (req, reply) => {
      const { jobId } = req.params;
      if (!commerce || !/^\d+$/.test(jobId)) {
        return reply.code(404).send({ error: 'Not found' });
      }
      const stored = commerce.store.read(jobId);
      if (!stored) return reply.code(404).send({ error: 'Deliverable not found' });
      return reply.code(200).type('application/json').send(stored.manifestText);
    },
  );

  // JSON-RPC 2.0 task endpoint.
  app.post('/', async (req, reply) => {
    const response = await handleRpc(req.body, config, app.log, commerce);
    return reply.code(200).type('application/json').send(response);
  });

  return app;
}
