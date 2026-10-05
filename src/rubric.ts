import type { Thresholds } from './config';
import { type Finding, type Signals, type Verdict, SIGNAL_KEYS } from './types';

export interface Evaluation {
  verdict: Verdict;
  confidence: number;
  findings: Finding[];
  summary: string;
}

/**
 * Deterministic verdict engine. Pure function: same signals + thresholds
 * always produce the same verdict. No network, no randomness, no clock.
 *
 * Rules (balanced defaults, all thresholds injectable):
 *  - Hard FAIL on confirmed honeypot, un-sellable token, self-destruct,
 *    hidden owner, or extreme taxes.
 *  - CAUTION on owner privileges (mint / take-back / pause while not
 *    renounced), high-but-not-extreme taxes, proxy, cooldown, blacklist,
 *    unverified source, weak LP lock, or thin holder base.
 *  - PASS only when honeypot status is positively known to be false and no
 *    caution applies. Unknown honeypot status can never yield PASS.
 *  - UNKNOWN when no signals could be resolved at all.
 */
export function evaluate(signals: Signals, t: Thresholds): Evaluation {
  const findings: Finding[] = [];
  const add = (
    code: string,
    severity: Finding['severity'],
    message: string,
    signal?: keyof Signals,
  ) => findings.push({ code, severity, message, signal });

  // --- Hard fails ---
  if (signals.isHoneypot === true) {
    add('honeypot', 'fail', 'Confirmed honeypot: token cannot be sold normally.', 'isHoneypot');
  }
  if (signals.canSell === false) {
    add('cannot_sell', 'fail', 'Simulation indicates the token cannot be sold.', 'canSell');
  }
  if (signals.selfDestruct === true) {
    add('self_destruct', 'fail', 'Contract contains a self-destruct capability.', 'selfDestruct');
  }
  if (signals.hiddenOwner === true) {
    add('hidden_owner', 'fail', 'Contract has a hidden owner.', 'hiddenOwner');
  }
  if (signals.sellTaxPct !== null && signals.sellTaxPct >= t.sellTaxFailPct) {
    add('sell_tax_extreme', 'fail', `Sell tax is extreme (${signals.sellTaxPct}%).`, 'sellTaxPct');
  }
  if (signals.buyTaxPct !== null && signals.buyTaxPct >= t.buyTaxFailPct) {
    add('buy_tax_extreme', 'fail', `Buy tax is extreme (${signals.buyTaxPct}%).`, 'buyTaxPct');
  }

  // --- Cautions ---
  if (
    signals.sellTaxPct !== null &&
    signals.sellTaxPct >= t.sellTaxCautionPct &&
    signals.sellTaxPct < t.sellTaxFailPct
  ) {
    add('sell_tax_high', 'caution', `Sell tax is high (${signals.sellTaxPct}%).`, 'sellTaxPct');
  }
  if (
    signals.buyTaxPct !== null &&
    signals.buyTaxPct >= t.buyTaxCautionPct &&
    signals.buyTaxPct < t.buyTaxFailPct
  ) {
    add('buy_tax_high', 'caution', `Buy tax is high (${signals.buyTaxPct}%).`, 'buyTaxPct');
  }
  if (signals.isMintable === true && signals.ownershipRenounced !== true) {
    add('mintable', 'caution', 'Supply is mintable and ownership is not renounced.', 'isMintable');
  }
  if (signals.canTakeBackOwnership === true) {
    add('take_back_ownership', 'caution', 'Ownership can be reclaimed after renouncing.', 'canTakeBackOwnership');
  }
  if (signals.transferPausable === true && signals.ownershipRenounced !== true) {
    add('pausable', 'caution', 'Transfers can be paused and ownership is not renounced.', 'transferPausable');
  }
  if (signals.isProxy === true) {
    add('upgradeable_proxy', 'caution', 'Contract is an upgradeable proxy; logic can change.', 'isProxy');
  }
  if (signals.tradingCooldown === true) {
    add('trading_cooldown', 'caution', 'Contract enforces a trading cooldown.', 'tradingCooldown');
  }
  if (signals.isBlacklistable === true) {
    add('blacklistable', 'caution', 'Contract can blacklist addresses from trading.', 'isBlacklistable');
  }
  if (signals.sourceVerified === false) {
    add('unverified_source', 'caution', 'Contract source code is not verified/open.', 'sourceVerified');
  }
  if (signals.lpLockedPct !== null && signals.lpLockedPct < t.minLpLockedPct) {
    add('weak_lp_lock', 'caution', `Only ${signals.lpLockedPct}% of LP is locked/burned.`, 'lpLockedPct');
  }
  if (signals.holderCount !== null && signals.holderCount < t.minHolderCount) {
    add('thin_holders', 'caution', `Thin holder base (${signals.holderCount} holders).`, 'holderCount');
  }

  // --- Confidence (coverage of resolvable signals) ---
  const resolved = SIGNAL_KEYS.filter((k) => signals[k] !== null).length;
  const confidence = Math.round((resolved / SIGNAL_KEYS.length) * 100) / 100;

  // --- Verdict ---
  const hasAnySignal = SIGNAL_KEYS.some((k) => signals[k] !== null);
  let verdict: Verdict;
  if (!hasAnySignal) {
    verdict = 'UNKNOWN';
  } else if (findings.some((f) => f.severity === 'fail')) {
    verdict = 'FAIL';
  } else {
    // A clean PASS requires honeypot status to be positively known false.
    if (signals.isHoneypot === null) {
      add(
        'honeypot_unknown',
        'caution',
        'Honeypot/sellability could not be confirmed by any source.',
        'isHoneypot',
      );
    }
    verdict = findings.some((f) => f.severity === 'caution') ? 'CAUTION' : 'PASS';
  }

  return { verdict, confidence, findings, summary: summarize(verdict, findings) };
}

function summarize(verdict: Verdict, findings: Finding[]): string {
  switch (verdict) {
    case 'FAIL': {
      const first = findings.find((f) => f.severity === 'fail');
      return `Do not trade — ${first?.message ?? 'blocking risk detected'}`;
    }
    case 'CAUTION': {
      const n = findings.filter((f) => f.severity === 'caution').length;
      return `Trade with caution — ${n} concern${n === 1 ? '' : 's'} found.`;
    }
    case 'PASS':
      return 'No blocking issues found in available checks (not a safety guarantee).';
    case 'UNKNOWN':
    default:
      return 'Insufficient data to assess this token.';
  }
}
