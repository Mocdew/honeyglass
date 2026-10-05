import { z } from 'zod';
import { SUPPORTED_CHAINS, type SupportedChain } from './constants';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.string().default('development'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  PUBLIC_URL: z.string().url().optional(),

  GOPLUS_BASE_URL: z.string().url().default('https://api.gopluslabs.io'),
  GOPLUS_ACCESS_TOKEN: z.string().optional(),
  HONEYPOT_BASE_URL: z.string().url().default('https://api.honeypot.is'),

  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),

  SELL_TAX_FAIL_PCT: z.coerce.number().nonnegative().default(50),
  BUY_TAX_FAIL_PCT: z.coerce.number().nonnegative().default(50),
  SELL_TAX_CAUTION_PCT: z.coerce.number().nonnegative().default(10),
  BUY_TAX_CAUTION_PCT: z.coerce.number().nonnegative().default(10),
  MIN_HOLDER_COUNT: z.coerce.number().nonnegative().default(50),
  MIN_LP_LOCKED_PCT: z.coerce.number().nonnegative().default(50),
});

export interface Thresholds {
  sellTaxFailPct: number;
  buyTaxFailPct: number;
  sellTaxCautionPct: number;
  buyTaxCautionPct: number;
  minHolderCount: number;
  minLpLockedPct: number;
}

export interface Config {
  port: number;
  host: string;
  nodeEnv: string;
  logLevel: string;
  publicUrl?: string;
  goplusBaseUrl: string;
  goplusAccessToken?: string;
  honeypotBaseUrl: string;
  requestTimeoutMs: number;
  rateLimitMax: number;
  rateLimitWindow: string;
  supportedChains: SupportedChain[];
  thresholds: Thresholds;
}

/** Parse + validate process env into a typed Config. Throws on invalid env. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const e = parsed.data;
  return {
    port: e.PORT,
    host: e.HOST,
    nodeEnv: e.NODE_ENV,
    logLevel: e.LOG_LEVEL,
    publicUrl: e.PUBLIC_URL,
    goplusBaseUrl: e.GOPLUS_BASE_URL.replace(/\/+$/, ''),
    goplusAccessToken: e.GOPLUS_ACCESS_TOKEN || undefined,
    honeypotBaseUrl: e.HONEYPOT_BASE_URL.replace(/\/+$/, ''),
    requestTimeoutMs: e.REQUEST_TIMEOUT_MS,
    rateLimitMax: e.RATE_LIMIT_MAX,
    rateLimitWindow: e.RATE_LIMIT_WINDOW,
    supportedChains: [...SUPPORTED_CHAINS],
    thresholds: {
      sellTaxFailPct: e.SELL_TAX_FAIL_PCT,
      buyTaxFailPct: e.BUY_TAX_FAIL_PCT,
      sellTaxCautionPct: e.SELL_TAX_CAUTION_PCT,
      buyTaxCautionPct: e.BUY_TAX_CAUTION_PCT,
      minHolderCount: e.MIN_HOLDER_COUNT,
      minLpLockedPct: e.MIN_LP_LOCKED_PCT,
    },
  };
}
