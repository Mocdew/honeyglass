import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import { evaluate } from '../src/rubric';
import type { Signals } from '../src/types';
import { SIGNAL_KEYS } from '../src/types';

const t = loadConfig({}).thresholds;

function signals(overrides: Partial<Signals> = {}): Signals {
  const base = Object.fromEntries(SIGNAL_KEYS.map((k) => [k, null])) as Signals;
  return { ...base, ...overrides };
}

const clean = signals({
  isHoneypot: false,
  canSell: true,
  buyTaxPct: 1,
  sellTaxPct: 1,
  ownershipRenounced: true,
  isMintable: false,
  sourceVerified: true,
  isProxy: false,
  canTakeBackOwnership: false,
  hiddenOwner: false,
  selfDestruct: false,
  transferPausable: false,
  tradingCooldown: false,
  isBlacklistable: false,
  holderCount: 5000,
  lpLockedPct: 100,
});

describe('evaluate', () => {
  it('returns UNKNOWN when nothing is resolved', () => {
    const r = evaluate(signals(), t);
    expect(r.verdict).toBe('UNKNOWN');
    expect(r.confidence).toBe(0);
  });

  it('PASSes a fully clean token', () => {
    const r = evaluate(clean, t);
    expect(r.verdict).toBe('PASS');
    expect(r.confidence).toBe(1);
    expect(r.findings).toHaveLength(0);
  });

  it('FAILs a confirmed honeypot', () => {
    const r = evaluate(signals({ isHoneypot: true }), t);
    expect(r.verdict).toBe('FAIL');
    expect(r.findings.some((f) => f.code === 'honeypot')).toBe(true);
  });

  it('FAILs an un-sellable token', () => {
    const r = evaluate(signals({ isHoneypot: false, canSell: false }), t);
    expect(r.verdict).toBe('FAIL');
    expect(r.findings.some((f) => f.code === 'cannot_sell')).toBe(true);
  });

  it('FAILs on extreme sell tax', () => {
    const r = evaluate({ ...clean, sellTaxPct: 60 }, t);
    expect(r.verdict).toBe('FAIL');
    expect(r.findings.some((f) => f.code === 'sell_tax_extreme')).toBe(true);
  });

  it('CAUTIONs on high-but-not-extreme sell tax', () => {
    const r = evaluate({ ...clean, sellTaxPct: 15 }, t);
    expect(r.verdict).toBe('CAUTION');
    expect(r.findings.some((f) => f.code === 'sell_tax_high')).toBe(true);
  });

  it('CAUTIONs when honeypot status is unknown even if everything else is fine', () => {
    const r = evaluate({ ...clean, isHoneypot: null }, t);
    expect(r.verdict).toBe('CAUTION');
    expect(r.findings.some((f) => f.code === 'honeypot_unknown')).toBe(true);
  });

  it('CAUTIONs on mintable + non-renounced ownership', () => {
    const r = evaluate({ ...clean, isMintable: true, ownershipRenounced: false }, t);
    expect(r.verdict).toBe('CAUTION');
    expect(r.findings.some((f) => f.code === 'mintable')).toBe(true);
  });

  it('does not flag mint when ownership is renounced', () => {
    const r = evaluate({ ...clean, isMintable: true, ownershipRenounced: true }, t);
    expect(r.findings.some((f) => f.code === 'mintable')).toBe(false);
    expect(r.verdict).toBe('PASS');
  });

  it('prefers FAIL over CAUTION when both apply', () => {
    const r = evaluate({ ...clean, isHoneypot: true, isProxy: true }, t);
    expect(r.verdict).toBe('FAIL');
  });
});
