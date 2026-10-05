import type { SupportedChain } from './constants';

export type Verdict = 'PASS' | 'CAUTION' | 'FAIL' | 'UNKNOWN';
export type Severity = 'fail' | 'caution' | 'info';

/**
 * Canonical, source-agnostic risk signals.
 * `null` means "could not be determined" — never silently treated as safe.
 */
export interface Signals {
  /** Confirmed honeypot (cannot sell / sell blocked). */
  isHoneypot: boolean | null;
  /** Token can be sold at all. */
  canSell: boolean | null;
  buyTaxPct: number | null;
  sellTaxPct: number | null;
  /** Ownership renounced (owner is zero/burn address). */
  ownershipRenounced: boolean | null;
  isMintable: boolean | null;
  /** Contract source verified / open. */
  sourceVerified: boolean | null;
  isProxy: boolean | null;
  canTakeBackOwnership: boolean | null;
  hiddenOwner: boolean | null;
  selfDestruct: boolean | null;
  transferPausable: boolean | null;
  tradingCooldown: boolean | null;
  isBlacklistable: boolean | null;
  holderCount: number | null;
  /** Percent of LP locked or burned (0..100). */
  lpLockedPct: number | null;
}

/** Every signal key, for coverage/confidence accounting. */
export const SIGNAL_KEYS: (keyof Signals)[] = [
  'isHoneypot',
  'canSell',
  'buyTaxPct',
  'sellTaxPct',
  'ownershipRenounced',
  'isMintable',
  'sourceVerified',
  'isProxy',
  'canTakeBackOwnership',
  'hiddenOwner',
  'selfDestruct',
  'transferPausable',
  'tradingCooldown',
  'isBlacklistable',
  'holderCount',
  'lpLockedPct',
];

export interface Finding {
  code: string;
  severity: Severity;
  message: string;
  signal?: keyof Signals;
}

export interface SourceReport {
  name: string;
  endpoint: string;
  status: 'ok' | 'timeout' | 'error' | 'skipped';
  fetchedAt: string | null;
  detail?: string;
}

export interface ScreenResult {
  schemaVersion: string;
  agent: string;
  token: {
    address: string;
    chainId: SupportedChain;
    chainName: string;
  };
  verdict: Verdict;
  /** 0..1 — fraction of signals that could be resolved. */
  confidence: number;
  summary: string;
  findings: Finding[];
  signals: Signals;
  sources: SourceReport[];
  disclosures: string[];
  notFinancialAdvice: true;
  dryRun: boolean;
  generatedAt: string;
}

export interface ScreenInput {
  address: string;
  chainId: SupportedChain;
  dryRun: boolean;
}
