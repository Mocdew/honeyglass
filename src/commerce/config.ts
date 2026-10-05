import { z } from 'zod';

/**
 * ERC-8183 commerce configuration. Entirely optional: when COMMERCE_ENABLED is
 * not "true", Honeyglass runs as the read-only screener only, with no wallet
 * and no on-chain surface.
 *
 * The seller key lives ONLY in env (never logged, never in the card/response).
 */
const schema = z.object({
  COMMERCE_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  COMMERCE_NETWORK: z.string().default('bsc-testnet'),
  SELLER_PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, 'SELLER_PRIVATE_KEY must be 0x + 64 hex chars')
    .optional(),
  SELLER_WALLET_PASSWORD: z.string().min(1).optional(),
  /** Price in the payment token's smallest unit (18 decimals). Default 0.1 U. */
  SERVICE_PRICE_RAW: z
    .string()
    .regex(/^\d{1,78}$/)
    .default('100000000000000000'),
  /** Quote validity window; SDK caps at 900s. */
  QUOTE_TTL_SECONDS: z.coerce.number().int().positive().max(900).default(900),
  /** Marketplace category advertised in the Agent Card. */
  COMMERCE_CATEGORY: z.string().default('security'),
  /** Where delivered manifests are persisted so their on-chain URL resolves. */
  DELIVERABLE_DIR: z.string().default('data/deliverables'),
});

export interface CommerceConfig {
  network: string;
  sellerPrivateKey: `0x${string}`;
  walletPassword: string;
  servicePriceRaw: string;
  quoteTtlSeconds: number;
  category: string;
  deliverableDir: string;
}

/**
 * Returns the commerce config, or null when commerce is disabled.
 * Throws only when COMMERCE_ENABLED=true but required secrets are missing —
 * failing closed rather than booting a half-configured seller.
 */
export function loadCommerceConfig(env: NodeJS.ProcessEnv = process.env): CommerceConfig | null {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid commerce configuration:\n${issues}`);
  }
  const e = parsed.data;
  if (!e.COMMERCE_ENABLED) return null;

  if (!e.SELLER_PRIVATE_KEY || !e.SELLER_WALLET_PASSWORD) {
    throw new Error(
      'COMMERCE_ENABLED=true but SELLER_PRIVATE_KEY and/or SELLER_WALLET_PASSWORD are missing. ' +
        'Run `npm run gen-wallet` to create the seller wallet.',
    );
  }

  return {
    network: e.COMMERCE_NETWORK,
    sellerPrivateKey: e.SELLER_PRIVATE_KEY as `0x${string}`,
    walletPassword: e.SELLER_WALLET_PASSWORD,
    servicePriceRaw: e.SERVICE_PRICE_RAW,
    quoteTtlSeconds: e.QUOTE_TTL_SECONDS,
    category: e.COMMERCE_CATEGORY,
    deliverableDir: e.DELIVERABLE_DIR,
  };
}
