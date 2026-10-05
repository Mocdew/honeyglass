import { describe, expect, it } from 'vitest';
import { RpcError } from '../src/jsonrpc';
import { parseMessageSendParams, parseScreenParams } from '../src/validation';

const VALID = '0x1234567890abcdef1234567890ABCDEF12345678';

describe('parseScreenParams', () => {
  it('accepts a valid address and lowercases it', () => {
    const r = parseScreenParams({ address: VALID });
    expect(r.address).toBe(VALID.toLowerCase());
    expect(r.chainId).toBe(56);
    expect(r.dryRun).toBe(false);
  });

  it('accepts chainId 97 and dryRun', () => {
    const r = parseScreenParams({ address: VALID, chainId: 97, dryRun: true });
    expect(r.chainId).toBe(97);
    expect(r.dryRun).toBe(true);
  });

  it('rejects a missing address', () => {
    expect(() => parseScreenParams({})).toThrow(RpcError);
  });

  it('rejects a malformed address', () => {
    expect(() => parseScreenParams({ address: '0x123' })).toThrow(RpcError);
    expect(() => parseScreenParams({ address: 'nothex' })).toThrow(RpcError);
  });

  it('rejects an unsupported chainId', () => {
    expect(() => parseScreenParams({ address: VALID, chainId: 1 })).toThrow(RpcError);
  });

  it('attaches field-level data to the error', () => {
    try {
      parseScreenParams({ address: 'bad' });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(RpcError);
      expect((err as RpcError).code).toBe(-32602);
      expect(Array.isArray((err as RpcError).data)).toBe(true);
    }
  });
});

describe('parseMessageSendParams', () => {
  it('reads an address from a DataPart', () => {
    const r = parseMessageSendParams({
      message: { parts: [{ kind: 'data', data: { address: VALID, chainId: 97 } }] },
    });
    expect(r.address).toBe(VALID.toLowerCase());
    expect(r.chainId).toBe(97);
  });

  it('reads an address from a TextPart', () => {
    const r = parseMessageSendParams({ message: { parts: [{ kind: 'text', text: VALID }] } });
    expect(r.address).toBe(VALID.toLowerCase());
  });

  it('rejects when parts are missing', () => {
    expect(() => parseMessageSendParams({ message: {} })).toThrow(RpcError);
  });
});
