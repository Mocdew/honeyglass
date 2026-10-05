import { randomUUID } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import type { Commerce } from './commerce';
import type { Config } from './config';
import { RPC_CODES, RpcError, rpcError, rpcResult, type RpcId } from './jsonrpc';
import { screenToken } from './screen';
import type { ScreenResult } from './types';
import { extractDataPart, parseMessageSendParams, parseScreenParams } from './validation';

/** Wrap a ScreenResult as an A2A completed Task carrying a DataPart artifact. */
function toA2ATask(result: ScreenResult) {
  return {
    kind: 'task',
    id: randomUUID(),
    status: { state: 'completed', timestamp: new Date().toISOString() },
    artifacts: [
      {
        artifactId: randomUUID(),
        name: 'token-screen',
        parts: [{ kind: 'data', data: result }],
      },
    ],
  };
}

/** Wrap an A2A agent message carrying a single DataPart (negotiate / notify_funded). */
function toA2AMessage(data: unknown) {
  return {
    kind: 'message',
    role: 'agent',
    messageId: randomUUID(),
    parts: [{ kind: 'data', data }],
  };
}

function extractId(body: unknown): RpcId {
  if (body && typeof body === 'object') {
    const id = (body as { id?: unknown }).id;
    if (typeof id === 'string' || typeof id === 'number') return id;
  }
  return null;
}

/**
 * Handle a single JSON-RPC 2.0 request. Always resolves to a well-formed
 * JSON-RPC envelope (success or error) — never throws.
 */
export async function handleRpc(
  body: unknown,
  config: Config,
  log: FastifyBaseLogger,
  commerce: Commerce | null = null,
) {
  const id = extractId(body);

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return rpcError(id, RPC_CODES.INVALID_REQUEST, 'Invalid Request: expected a JSON-RPC object');
  }
  const { jsonrpc, method } = body as { jsonrpc?: unknown; method?: unknown };
  if (jsonrpc !== '2.0') {
    return rpcError(id, RPC_CODES.INVALID_REQUEST, 'Invalid Request: jsonrpc must be "2.0"');
  }
  if (typeof method !== 'string') {
    return rpcError(id, RPC_CODES.INVALID_REQUEST, 'Invalid Request: method must be a string');
  }

  const params = (body as { params?: unknown }).params;

  try {
    switch (method) {
      case 'screen': {
        const input = parseScreenParams(params);
        return rpcResult(id, await screenToken(input, config));
      }
      case 'message/send': {
        // Route ERC-8183 commerce skills before falling back to screening.
        const data = extractDataPart(params);
        const skill = typeof data?.skill === 'string' ? data.skill : null;

        if (skill === 'negotiate') {
          if (!commerce) {
            return rpcError(id, RPC_CODES.METHOD_NOT_FOUND, 'negotiate is not available (commerce disabled)');
          }
          return rpcResult(id, toA2AMessage(await commerce.seller.negotiate(data as Record<string, unknown>)));
        }
        if (skill === 'notify_funded') {
          if (!commerce) {
            return rpcError(id, RPC_CODES.METHOD_NOT_FOUND, 'notify_funded is not available (commerce disabled)');
          }
          const jobId = String((data as Record<string, unknown>).job_id ?? '');
          return rpcResult(id, toA2AMessage(await commerce.delivery.notifyFunded(jobId)));
        }

        const input = parseMessageSendParams(params);
        return rpcResult(id, toA2ATask(await screenToken(input, config)));
      }
      default:
        return rpcError(id, RPC_CODES.METHOD_NOT_FOUND, `Method not found: ${method}`);
    }
  } catch (err) {
    if (err instanceof RpcError) {
      return rpcError(id, err.code, err.message, err.data);
    }
    log.error({ err }, 'unhandled error in RPC handler');
    return rpcError(id, RPC_CODES.INTERNAL_ERROR, 'Internal error');
  }
}
