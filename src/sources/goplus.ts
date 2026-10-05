import type { Config } from '../config';
import { BURN_ADDRESSES } from '../constants';
import type { Signals, SourceReport } from '../types';
import { failureKind, getJson } from './http';

export interface SourceResult {
  data: Partial<Signals> | null;
  source: SourceReport;
}

const SOURCE_NAME = 'GoPlus Security';

/** "1" => true, "0" => false, anything else => null (unknown). */
function flag(v: unknown): boolean | null {
  if (v === '1' || v === 1 || v === true) return true;
  if (v === '0' || v === 0 || v === false) return false;
  return null;
}

/** GoPlus returns tax as a decimal fraction string, e.g. "0.1" => 10%. */
function taxPct(v: unknown): number | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 1000) / 10; // one decimal place of percent
}

function intOrNull(v: unknown): number | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

interface LpHolder {
  address?: string;
  is_locked?: number | string;
  percent?: string;
}

/** Sum the share of LP that is locked or held by a burn address. */
function lpLockedPct(lpHolders: unknown): number | null {
  if (!Array.isArray(lpHolders) || lpHolders.length === 0) return null;
  let locked = 0;
  for (const h of lpHolders as LpHolder[]) {
    const addr = (h.address ?? '').toLowerCase();
    const isLocked = h.is_locked === 1 || h.is_locked === '1' || BURN_ADDRESSES.has(addr);
    if (isLocked) {
      const p = Number(h.percent);
      if (Number.isFinite(p)) locked += p;
    }
  }
  return Math.round(locked * 1000) / 10;
}

function ownershipRenounced(ownerAddress: unknown): boolean | null {
  if (typeof ownerAddress !== 'string' || ownerAddress === '') return null;
  return BURN_ADDRESSES.has(ownerAddress.toLowerCase());
}

function normalize(raw: Record<string, unknown>): Partial<Signals> {
  const cannotSell = flag(raw.cannot_sell_all);
  return {
    isHoneypot: flag(raw.is_honeypot),
    canSell: cannotSell === null ? null : !cannotSell,
    buyTaxPct: taxPct(raw.buy_tax),
    sellTaxPct: taxPct(raw.sell_tax),
    ownershipRenounced: ownershipRenounced(raw.owner_address),
    isMintable: flag(raw.is_mintable),
    sourceVerified: flag(raw.is_open_source),
    isProxy: flag(raw.is_proxy),
    canTakeBackOwnership: flag(raw.can_take_back_ownership),
    hiddenOwner: flag(raw.hidden_owner),
    selfDestruct: flag(raw.selfdestruct),
    transferPausable: flag(raw.transfer_pausable),
    tradingCooldown: flag(raw.trading_cooldown),
    isBlacklistable: flag(raw.is_blacklisted),
    holderCount: intOrNull(raw.holder_count),
    lpLockedPct: lpLockedPct(raw.lp_holders),
  };
}

export async function fetchGoPlus(
  address: string,
  chainId: number,
  config: Config,
): Promise<SourceResult> {
  const endpoint = `${config.goplusBaseUrl}/api/v1/token_security/${chainId}?contract_addresses=${address}`;
  const source: SourceReport = { name: SOURCE_NAME, endpoint, status: 'error', fetchedAt: null };

  try {
    const headers: Record<string, string> = {};
    if (config.goplusAccessToken) headers.Authorization = config.goplusAccessToken;

    const { status, body } = await getJson(endpoint, config.requestTimeoutMs, headers);
    source.fetchedAt = new Date().toISOString();

    if (status !== 200) {
      source.detail = `HTTP ${status}`;
      return { data: null, source };
    }
    const b = body as { code?: number; message?: string; result?: Record<string, unknown> };
    if (b.code !== 1 || !b.result) {
      source.detail = b.message || 'no result';
      return { data: null, source };
    }
    const raw = b.result[address.toLowerCase()] as Record<string, unknown> | undefined;
    if (!raw) {
      source.detail = 'token not indexed by GoPlus';
      return { data: null, source };
    }
    source.status = 'ok';
    return { data: normalize(raw), source };
  } catch (err) {
    source.fetchedAt = source.fetchedAt ?? new Date().toISOString();
    source.status = failureKind(err);
    source.detail = (err as Error).message;
    return { data: null, source };
  }
}
