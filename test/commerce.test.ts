import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NegotiationHandler } from '@bnbagent/sdk/erc8183';
import { EVMWalletProvider } from '@bnbagent/sdk/wallets';
import { getAddress, recoverMessageAddress } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { describe, expect, it } from 'vitest';
import { loadCommerceConfig } from '../src/commerce/config';
import { DeliveryService, extractScreenTarget } from '../src/commerce/delivery';
import { DeliverableStore } from '../src/commerce/store';
import type { Seller } from '../src/commerce/seller';

const CURRENCY = '0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565';
const VERIFYING = '0xa206c0517B6371C6638CD9e4a42Cc9f02A33B0DE';
const KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'; // well-known test key

describe('loadCommerceConfig', () => {
  it('returns null when commerce is disabled', () => {
    expect(loadCommerceConfig({})).toBeNull();
    expect(loadCommerceConfig({ COMMERCE_ENABLED: 'false' })).toBeNull();
  });

  it('throws when enabled without a seller wallet', () => {
    expect(() => loadCommerceConfig({ COMMERCE_ENABLED: 'true' })).toThrow(/SELLER_PRIVATE_KEY/);
  });

  it('parses a valid enabled config', () => {
    const cfg = loadCommerceConfig({
      COMMERCE_ENABLED: 'true',
      SELLER_PRIVATE_KEY: KEY,
      SELLER_WALLET_PASSWORD: 'pw',
    });
    expect(cfg?.servicePriceRaw).toBe('100000000000000000');
    expect(cfg?.quoteTtlSeconds).toBe(900);
    expect(cfg?.network).toBe('bsc-testnet');
  });
});

describe('extractScreenTarget', () => {
  it('pulls an address and defaults to chain 56', () => {
    const t = extractScreenTarget('Screen 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c please');
    expect(t).toEqual({ address: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', chainId: 56 });
  });
  it('detects testnet / chain 97', () => {
    expect(extractScreenTarget('token 0x0000000000000000000000000000000000000001 on chain 97')?.chainId).toBe(97);
    expect(extractScreenTarget('screen 0x0000000000000000000000000000000000000001 (testnet)')?.chainId).toBe(97);
  });
  it('returns null when no address is present', () => {
    expect(extractScreenTarget('just screen my token')).toBeNull();
  });
});

describe('DeliverableStore', () => {
  it('round-trips a record and 404s unknown jobs', () => {
    const store = new DeliverableStore(mkdtempSync(join(tmpdir(), 'hg-deliv-')));
    expect(store.read('123')).toBeNull();
    store.write({
      jobId: '123',
      manifestText: '{"version":1}',
      manifestHash: '0xabc',
      deliverableUrl: 'https://honeyglass.onrender.com/deliverables/123',
      submitTxHash: null,
      createdAt: new Date().toISOString(),
    });
    expect(store.read('123')?.manifestText).toBe('{"version":1}');
  });
});

describe('DeliveryService.notifyFunded', () => {
  it('rejects a malformed job id without touching the chain', async () => {
    const seller = {
      address: getAddress(privateKeyToAccount(KEY).address),
      client: async () => {
        throw new Error('client should not be called for a bad job id');
      },
    } as unknown as Seller;
    const svc = new DeliveryService({
      seller,
      store: new DeliverableStore(mkdtempSync(join(tmpdir(), 'hg-deliv-'))),
      screen: async () => {
        throw new Error('screen should not be called');
      },
      publicUrl: 'https://honeyglass.onrender.com',
    });
    const reply = await svc.notifyFunded('not-a-number');
    expect(reply.status).toBe('rejected');
    expect(reply.reason).toMatch(/Invalid job id/);
  });
});

describe('quote signing (hermetic)', () => {
  it('signs a negotiation hash that recovers to the seller wallet', async () => {
    const account = privateKeyToAccount(KEY);
    const wallet = new EVMWalletProvider({ password: 'pw', privateKey: KEY });
    const handler = new NegotiationHandler({
      servicePrice: '100000000000000000',
      currency: CURRENCY,
      walletProvider: wallet,
      chainId: 97,
      verifyingContract: VERIFYING,
      quoteTtlSeconds: 900,
    });
    const envelope = (await handler.negotiate({
      task_description: 'Screen 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
      terms: { deliverables: 'JSON verdict', quality_standards: 'read-only' },
    })).toDict() as {
      negotiation_hash: string;
      provider_sig: string;
      chain_id: number;
      verifying_contract: string;
    };

    expect(envelope.chain_id).toBe(97);
    expect(getAddress(envelope.verifying_contract)).toBe(getAddress(VERIFYING));

    const expected = getAddress(account.address);
    const candidates = await Promise.all([
      recoverMessageAddress({ message: { raw: envelope.negotiation_hash as `0x${string}` }, signature: envelope.provider_sig as `0x${string}` }).catch(() => null),
      recoverMessageAddress({ message: envelope.negotiation_hash, signature: envelope.provider_sig as `0x${string}` }).catch(() => null),
    ]);
    const matched = candidates.some((a) => a && getAddress(a) === expected);
    expect(matched).toBe(true);
  });
});
