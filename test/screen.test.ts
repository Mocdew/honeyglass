import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config';
import { mergeSignals, screenToken } from '../src/screen';
import { FIXTURE_ADDRESSES } from '../src/fixtures';

const config = loadConfig({});
const ADDR = '0x1234567890abcdef1234567890abcdef12345678';

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status === 200, status, json: async () => body } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('mergeSignals', () => {
  it('treats any honeypot=true as honeypot', () => {
    const m = mergeSignals({ isHoneypot: false }, { isHoneypot: true });
    expect(m.isHoneypot).toBe(true);
  });

  it('prefers GoPlus tax, falls back to honeypot.is', () => {
    expect(mergeSignals({ sellTaxPct: 5 }, { sellTaxPct: 9 }).sellTaxPct).toBe(5);
    expect(mergeSignals({ sellTaxPct: null }, { sellTaxPct: 9 }).sellTaxPct).toBe(9);
  });

  it('is all-null when both sources are empty', () => {
    const m = mergeSignals(null, null);
    expect(m.isHoneypot).toBeNull();
    expect(m.holderCount).toBeNull();
  });
});

describe('screenToken (dry-run)', () => {
  it('returns a PASS fixture without any network call', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const r = await screenToken({ address: FIXTURE_ADDRESSES.pass, chainId: 56, dryRun: true }, config);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(r.verdict).toBe('PASS');
    expect(r.dryRun).toBe(true);
    expect(r.sources.every((s) => s.status === 'skipped')).toBe(true);
  });

  it('returns a FAIL fixture for the honeypot vector', async () => {
    const r = await screenToken({ address: FIXTURE_ADDRESSES.fail, chainId: 56, dryRun: true }, config);
    expect(r.verdict).toBe('FAIL');
  });
});

describe('screenToken (live, mocked HTTP)', () => {
  it('merges both sources into a verdict', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('gopluslabs')) {
          return jsonResponse({
            code: 1,
            result: {
              [ADDR]: {
                is_honeypot: '0',
                cannot_sell_all: '0',
                buy_tax: '0.01',
                sell_tax: '0.01',
                owner_address: '0x0000000000000000000000000000000000000000',
                is_mintable: '0',
                is_open_source: '1',
                holder_count: '5000',
                lp_holders: [{ address: '0x000000000000000000000000000000000000dead', percent: '1' }],
              },
            },
          });
        }
        return jsonResponse({ honeypotResult: { isHoneypot: false }, simulationSuccess: true });
      }),
    );

    const r = await screenToken({ address: ADDR, chainId: 56, dryRun: false }, config);
    expect(r.verdict).toBe('PASS');
    expect(r.signals.isHoneypot).toBe(false);
    expect(r.signals.lpLockedPct).toBe(100);
    expect(r.sources.map((s) => s.status)).toEqual(['ok', 'ok']);
  });

  it('degrades gracefully when one source fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('gopluslabs')) {
          return jsonResponse({ honeypotResult: { isHoneypot: false } }, 500);
        }
        return jsonResponse({ honeypotResult: { isHoneypot: false }, simulationSuccess: true });
      }),
    );

    const r = await screenToken({ address: ADDR, chainId: 56, dryRun: false }, config);
    expect(r.sources.find((s) => s.name === 'GoPlus Security')?.status).toBe('error');
    expect(r.signals.isHoneypot).toBe(false);
    // honeypot known-false but most GoPlus-only signals unknown => reduced confidence.
    expect(r.confidence).toBeLessThan(1);
  });

  it('is UNKNOWN when both sources fail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, 503)));
    const r = await screenToken({ address: ADDR, chainId: 56, dryRun: false }, config);
    expect(r.verdict).toBe('UNKNOWN');
    expect(r.sources.every((s) => s.status === 'error')).toBe(true);
  });

  it('classifies a timeout distinctly', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const e = new Error('timed out');
        e.name = 'TimeoutError';
        throw e;
      }),
    );
    const r = await screenToken({ address: ADDR, chainId: 56, dryRun: false }, config);
    expect(r.sources.every((s) => s.status === 'timeout')).toBe(true);
    expect(r.verdict).toBe('UNKNOWN');
  });
});
