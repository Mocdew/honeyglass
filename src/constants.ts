export const APP_NAME = 'Honeyglass';
export const APP_VERSION = '1.0.0';
export const SCHEMA_VERSION = '1.0';
export const A2A_PROTOCOL_VERSION = '0.3.0';

export const CHAIN_NAMES: Record<number, string> = {
  56: 'BNB Smart Chain',
  97: 'BNB Smart Chain Testnet',
};

export const SUPPORTED_CHAINS = [56, 97] as const;
export type SupportedChain = (typeof SUPPORTED_CHAINS)[number];

/** Addresses treated as "no owner" / burned LP. */
export const BURN_ADDRESSES = new Set([
  '0x0000000000000000000000000000000000000000',
  '0x000000000000000000000000000000000000dead',
]);
