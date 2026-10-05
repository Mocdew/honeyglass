import { z } from 'zod';
import { RPC_CODES, RpcError } from './jsonrpc';
import type { ScreenInput } from './types';

const addressSchema = z
  .string()
  .trim()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'must be a 0x-prefixed 40-hex-character address')
  .transform((s) => s.toLowerCase());

const screenParamsSchema = z.object({
  address: addressSchema,
  chainId: z
    .union([z.literal(56), z.literal(97)])
    .default(56)
    .describe('56 = BNB Smart Chain, 97 = BNB Smart Chain Testnet'),
  dryRun: z.boolean().default(false),
});

/** Parse params for the `screen` method, throwing a deterministic RPC error. */
export function parseScreenParams(params: unknown): ScreenInput {
  const result = screenParamsSchema.safeParse(params ?? {});
  if (!result.success) {
    throw new RpcError(
      RPC_CODES.INVALID_PARAMS,
      'Invalid params',
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}

interface MessagePart {
  kind?: string;
  text?: string;
  data?: Record<string, unknown>;
}

/**
 * Merge the data parts of an A2A `message/send` into one object, for routing
 * on a `skill` field (negotiate / notify_funded) before any screen parsing.
 * Returns null when the shape is not a message with parts.
 */
export function extractDataPart(params: unknown): Record<string, unknown> | null {
  const p = params as { message?: { parts?: unknown } } | undefined;
  const parts = p?.message?.parts;
  if (!Array.isArray(parts)) return null;
  let merged: Record<string, unknown> = {};
  let found = false;
  for (const part of parts as MessagePart[]) {
    if (part?.kind === 'data' && part.data && typeof part.data === 'object') {
      merged = { ...merged, ...part.data };
      found = true;
    }
  }
  return found ? merged : null;
}

/**
 * Parse A2A `message/send` params. Accepts a DataPart carrying
 * { address, chainId?, dryRun? }, or a TextPart whose text is a token address.
 */
export function parseMessageSendParams(params: unknown): ScreenInput {
  const p = params as { message?: { parts?: unknown } } | undefined;
  const parts = p?.message?.parts;
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new RpcError(
      RPC_CODES.INVALID_PARAMS,
      'Invalid params: message.parts must be a non-empty array',
    );
  }

  let candidate: Record<string, unknown> = {};
  for (const part of parts as MessagePart[]) {
    if (part?.kind === 'data' && part.data && typeof part.data === 'object') {
      candidate = { ...candidate, ...part.data };
    } else if (part?.kind === 'text' && typeof part.text === 'string') {
      if (candidate.address === undefined) candidate.address = part.text.trim();
    }
  }
  return parseScreenParams(candidate);
}
