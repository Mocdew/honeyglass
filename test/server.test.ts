import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import { FIXTURE_ADDRESSES } from '../src/fixtures';
import { buildServer } from '../src/server';

const VALID = FIXTURE_ADDRESSES.pass;
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildServer(loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }));
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

async function rpc(payload: unknown) {
  const res = await app.inject({ method: 'POST', url: '/', payload: payload as object });
  return { statusCode: res.statusCode, body: res.json() };
}

describe('GET /health', () => {
  it('reports ok without external calls', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', agent: 'Honeyglass' });
  });
});

describe('GET /.well-known/agent-card.json', () => {
  it('serves a valid A2A agent card', async () => {
    const res = await app.inject({ method: 'GET', url: '/.well-known/agent-card.json' });
    expect(res.statusCode).toBe(200);
    const card = res.json();
    expect(card.name).toBe('Honeyglass');
    expect(card.skills[0].id).toBe('screen-token');
    expect(card.capabilities.streaming).toBe(false);
    expect(card['x-honeyglass'].supportedChains.map((c: { chainId: number }) => c.chainId)).toEqual([
      56, 97,
    ]);
    expect(card['x-honeyglass'].disclosures.length).toBeGreaterThan(0);
  });
});

describe('POST / (JSON-RPC)', () => {
  it('runs a dry-run screen and returns a result', async () => {
    const { statusCode, body } = await rpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'screen',
      params: { address: VALID, dryRun: true },
    });
    expect(statusCode).toBe(200);
    expect(body.jsonrpc).toBe('2.0');
    expect(body.id).toBe(1);
    expect(body.result.verdict).toBe('PASS');
    expect(body.result.notFinancialAdvice).toBe(true);
  });

  it('supports the A2A message/send wrapper', async () => {
    const { body } = await rpc({
      jsonrpc: '2.0',
      id: 'abc',
      method: 'message/send',
      params: { message: { role: 'user', parts: [{ kind: 'data', data: { address: VALID, dryRun: true } }] } },
    });
    expect(body.result.kind).toBe('task');
    expect(body.result.status.state).toBe('completed');
    expect(body.result.artifacts[0].parts[0].data.verdict).toBe('PASS');
  });

  it('rejects a non-2.0 envelope (-32600)', async () => {
    const { body } = await rpc({ jsonrpc: '1.0', id: 1, method: 'screen', params: {} });
    expect(body.error.code).toBe(-32600);
  });

  it('rejects an unknown method (-32601)', async () => {
    const { body } = await rpc({ jsonrpc: '2.0', id: 1, method: 'nope', params: {} });
    expect(body.error.code).toBe(-32601);
  });

  it('rejects bad params (-32602)', async () => {
    const { body } = await rpc({ jsonrpc: '2.0', id: 1, method: 'screen', params: { address: 'x' } });
    expect(body.error.code).toBe(-32602);
    expect(Array.isArray(body.error.data)).toBe(true);
  });

  it('returns a parse error for malformed JSON (-32700)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/',
      headers: { 'content-type': 'application/json' },
      payload: '{ not json',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().error.code).toBe(-32700);
  });
});
