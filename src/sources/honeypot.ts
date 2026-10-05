import type { Config } from '../config';
import type { Signals, SourceReport } from '../types';
import type { SourceResult } from './goplus';
import { failureKind, getJson } from './http';

const SOURCE_NAME = 'honeypot.is';

function numOrNull(v: unknown): number | null {
  if (typeof v !== 'number') return null;
  return Number.isFinite(v) ? Math.round(v * 10) / 10 : null;
}

/**
 * honeypot.is simulation. Used mainly as an independent cross-check on the
 * honeypot/sellability verdict. Taxes are kept as secondary evidence; the
 * merge layer prefers GoPlus tax figures to avoid unit mismatch.
 */
export async function fetchHoneypot(
  address: string,
  chainId: number,
  config: Config,
): Promise<SourceResult> {
  const endpoint = `${config.honeypotBaseUrl}/v2/IsHoneypot?address=${address}&chainID=${chainId}`;
  const source: SourceReport = { name: SOURCE_NAME, endpoint, status: 'error', fetchedAt: null };

  try {
    const { status, body } = await getJson(endpoint, config.requestTimeoutMs);
    source.fetchedAt = new Date().toISOString();

    if (status !== 200) {
      source.detail = `HTTP ${status}`;
      return { data: null, source };
    }

    const b = body as {
      honeypotResult?: { isHoneypot?: boolean };
      simulationSuccess?: boolean;
      simulationResult?: { buyTax?: number; sellTax?: number };
      error?: string;
    };

    if (b.error) {
      source.detail = String(b.error);
      return { data: null, source };
    }

    const isHoneypot =
      typeof b.honeypotResult?.isHoneypot === 'boolean' ? b.honeypotResult.isHoneypot : null;

    let canSell: boolean | null = null;
    if (isHoneypot === true) canSell = false;
    else if (b.simulationSuccess === true && isHoneypot === false) canSell = true;

    const data: Partial<Signals> = {
      isHoneypot,
      canSell,
      buyTaxPct: numOrNull(b.simulationResult?.buyTax),
      sellTaxPct: numOrNull(b.simulationResult?.sellTax),
    };

    // honeypot.is gives us nothing useful if it could not simulate at all.
    const hasAny = Object.values(data).some((v) => v !== null);
    if (!hasAny) {
      source.detail = 'simulation produced no usable signals';
      return { data: null, source };
    }

    source.status = 'ok';
    return { data, source };
  } catch (err) {
    source.fetchedAt = source.fetchedAt ?? new Date().toISOString();
    source.status = failureKind(err);
    source.detail = (err as Error).message;
    return { data: null, source };
  }
}
