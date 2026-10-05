// Generate the Honeyglass seller wallet for ERC-8183 commerce on BNB testnet.
//
// The private key is written ONLY to .env (gitignored) and NEVER printed.
// Idempotent: if SELLER_PRIVATE_KEY already exists in .env, it is kept and the
// existing address is shown instead of generating a new one.
//
//   node scripts/gen-seller-wallet.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const ENV = new URL('../.env', import.meta.url);

function parseEnv(text) {
  const map = new Map();
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) map.set(m[1], m[2]);
  }
  return map;
}

const existing = existsSync(ENV) ? parseEnv(readFileSync(ENV, 'utf8')) : new Map();

let pk = existing.get('SELLER_PRIVATE_KEY');
let created = false;
if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) {
  pk = generatePrivateKey();
  created = true;
}
const account = privateKeyToAccount(pk);
const password = existing.get('SELLER_WALLET_PASSWORD') || `0x${randomBytes(16).toString('hex')}`;

// Merge into .env without clobbering unrelated keys.
const updates = {
  SELLER_PRIVATE_KEY: pk,
  SELLER_WALLET_PASSWORD: password,
  COMMERCE_ENABLED: existing.get('COMMERCE_ENABLED') ?? 'true',
  COMMERCE_NETWORK: existing.get('COMMERCE_NETWORK') ?? 'bsc-testnet',
};
for (const [k, v] of Object.entries(updates)) existing.set(k, v);
const body =
  Array.from(existing.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('\n') + '\n';
writeFileSync(ENV, body, { mode: 0o600 });

console.log(created ? 'Generated a new seller wallet.' : 'Seller wallet already present; kept it.');
console.log('');
console.log('  Seller / ERC-8004 identity address:');
console.log('    ' + account.address);
console.log('');
console.log('  The private key is in .env (gitignored, chmod 600) and was not printed.');
console.log('');
console.log('  NEXT: fund this address with BNB-testnet gas (chain 97), then register the identity:');
console.log('    • Faucet: https://www.bnbchain.org/en/testnet-faucet  (send tBNB to the address above)');
console.log('    • Then:   npm run register-identity');
console.log('');
console.log('  This wallet needs only tBNB for gas. It RECEIVES the "U" payment token from escrow;');
console.log('  it does not need to hold any U up front.');
