import type { Config } from './config';
import { APP_NAME, CHAIN_NAMES, SCHEMA_VERSION } from './constants';
import { fixtureSignals } from './fixtures';
import { evaluate } from './rubric';
import { fetchGoPlus } from './sources/goplus';
import { fetchHoneypot } from './sources/honeypot';
import type { ScreenInput, ScreenResult, Signals, SourceReport } from './types';
import { SIGNAL_KEYS } from './types';

/** Merge two partial signal sets into the canonical Signals object. */
export function mergeSignals(
  goplus: Partial<Signals> | null,
  honeypot: Partial<Signals> | null,
): Signals {
  const g = goplus ?? {};
  const h = honeypot ?? {};

  // isHoneypot: any true => true; else any false => false; else null.
  const hp = (a: boolean | null | undefined, b: boolean | null | undefined): boolean | null => {
    if (a === true || b === true) return true;
    if (a === false || b === false) return false;
    return null;
  };

  const base = Object.fromEntries(SIGNAL_KEYS.map((k) => [k, null])) as unknown as Signals;

  return {
    ...base,
    ...g,
    isHoneypot: hp(g.isHoneypot, h.isHoneypot),
    canSell: g.canSell ?? h.canSell ?? null,
    buyTaxPct: g.buyTaxPct ?? h.buyTaxPct ?? null,
    sellTaxPct: g.sellTaxPct ?? h.sellTaxPct ?? null,
  };
}

export function buildDisclosures(config: Config): string[] {
  const chains = config.supportedChains
    .map((c) => `${CHAIN_NAMES[c]} (chainId ${c})`)
    .join(', ');
  return [
    `Supported chains: ${chains}. Only BEP-20 token contracts are screened.`,
    'Data sources: GoPlus Security token API (primary) and honeypot.is simulation (cross-check). Both are independent third parties; Honeyglass does not control their accuracy or uptime.',
    'Freshness: each result reflects its sources at fetch time (see sources[].fetchedAt). Contracts can change after screening — a prior PASS does not stay valid.',
    'Assumptions: tax figures use GoPlus when present, else honeypot.is simulation; ownership is treated as renounced only when the owner is the zero or burn address; LP is treated as locked when flagged locked or held by a burn address.',
    'Failure modes: if a source times out or does not index the token, its signals are marked unknown. Unknown honeypot status never yields PASS. Testnet (chainId 97) coverage is frequently unavailable, so testnet results are often UNKNOWN.',
    'This is an automated, read-only risk screen — not financial advice and not a guarantee of safety. PASS means no blocking signals were found in the available checks, nothing more.',
  ];
}

function assemble(
  signals: Signals,
  input: ScreenInput,
  sources: SourceReport[],
  config: Config,
): ScreenResult {
  const { verdict, confidence, findings, summary } = evaluate(signals, config.thresholds);
  return {
    schemaVersion: SCHEMA_VERSION,
    agent: APP_NAME,
    token: {
      address: input.address,
      chainId: input.chainId,
      chainName: CHAIN_NAMES[input.chainId] ?? `chain ${input.chainId}`,
    },
    verdict,
    confidence,
    summary,
    findings,
    signals,
    sources,
    disclosures: buildDisclosures(config),
    notFinancialAdvice: true,
    dryRun: input.dryRun,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Orchestrate a token screen. Never throws on upstream failure: a source that
 * times out or errors is recorded in `sources` and its signals become unknown.
 */
export async function screenToken(input: ScreenInput, config: Config): Promise<ScreenResult> {
  if (input.dryRun) {
    const signals = fixtureSignals(input.address);
    const sources: SourceReport[] = [
      {
        name: 'GoPlus Security',
        endpoint: '(dry-run)',
        status: 'skipped',
        fetchedAt: null,
        detail: 'dry-run: synthetic fixture, no external call',
      },
      {
        name: 'honeypot.is',
        endpoint: '(dry-run)',
        status: 'skipped',
        fetchedAt: null,
        detail: 'dry-run: synthetic fixture, no external call',
      },
    ];
    return assemble(signals, input, sources, config);
  }

  const [goplus, honeypot] = await Promise.all([
    fetchGoPlus(input.address, input.chainId, config),
    fetchHoneypot(input.address, input.chainId, config),
  ]);

  const signals = mergeSignals(goplus.data, honeypot.data);
  return assemble(signals, input, [goplus.source, honeypot.source], config);
}
