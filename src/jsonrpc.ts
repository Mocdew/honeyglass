/** JSON-RPC 2.0 helpers with a fixed, documented error-code table. */

export const RPC_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // Application-defined (-32000..-32099)
  RATE_LIMITED: -32000,
} as const;

export type RpcId = string | number | null;

export interface RpcSuccess {
  jsonrpc: '2.0';
  id: RpcId;
  result: unknown;
}

export interface RpcErrorBody {
  jsonrpc: '2.0';
  id: RpcId;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export function rpcResult(id: RpcId, result: unknown): RpcSuccess {
  return { jsonrpc: '2.0', id, result };
}

export function rpcError(
  id: RpcId,
  code: number,
  message: string,
  data?: unknown,
): RpcErrorBody {
  return {
    jsonrpc: '2.0',
    id,
    error: data === undefined ? { code, message } : { code, message, data },
  };
}

/** Thrown inside handlers; mapped to a deterministic JSON-RPC error. */
export class RpcError extends Error {
  code: number;
  data?: unknown;
  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = 'RpcError';
    this.code = code;
    this.data = data;
  }
}
