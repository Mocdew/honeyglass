import { randomUUID } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import type { Config } from './config';
import { RPC_CODES, RpcError, rpcError, rpcResult, type RpcId } from './jsonrpc';
import { screenToken } from './screen';
import type { ScreenResult } from './types';
import { parseMessageSendParams, parseScreenParams } from './validation';

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
export async function handleRpc(body: unknown, config: Config, log: FastifyBaseLogger) {
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
