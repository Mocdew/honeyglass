import type { Signals } from './types';

/**
 * SYNTHETIC test vectors for dry-run mode only. These addresses are NOT real
 * tokens and make no claim about any real contract — they exist so Pokter can
 * validate Honeyglass end-to-end without any network calls or rate limits.
 */

const clean: Signals = {
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
  holderCount: 125000,
  lpLockedPct: 100,
};

const honeypot: Signals = {
  isHoneypot: true,
  canSell: false,
  buyTaxPct: 5,
  sellTaxPct: 100,
  ownershipRenounced: false,
  isMintable: true,
  sourceVerified: false,
  isProxy: false,
  canTakeBackOwnership: false,
  hiddenOwner: true,
  selfDestruct: false,
  transferPausable: true,
  tradingCooldown: true,
  isBlacklistable: true,
  holderCount: 12,
  lpLockedPct: 0,
};

const caution: Signals = {
  isHoneypot: false,
  canSell: true,
  buyTaxPct: 3,
  sellTaxPct: 12,
  ownershipRenounced: false,
  isMintable: true,
  sourceVerified: false,
  isProxy: false,
  canTakeBackOwnership: false,
  hiddenOwner: false,
  selfDestruct: false,
  transferPausable: false,
  tradingCooldown: false,
  isBlacklistable: false,
  holderCount: 800,
  lpLockedPct: 60,
};

/** Documented fixture addresses (see README). */
export const FIXTURE_ADDRESSES = {
  pass: '0x000000000000000000000000000000000000f00d',
  fail: '0x00000000000000000000000000000000deadbeef',
} as const;

/** Resolve dry-run signals: known fixtures by address, otherwise a CAUTION sample. */
export function fixtureSignals(address: string): Signals {
  const key = address.toLowerCase();
  if (key === FIXTURE_ADDRESSES.pass) return clean;
  if (key === FIXTURE_ADDRESSES.fail) return honeypot;
  return caution;
}
