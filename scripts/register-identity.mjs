// Register the Honeyglass seller wallet as an ERC-8004 identity on BNB testnet.
//
// Requires: .env with SELLER_PRIVATE_KEY + SELLER_WALLET_PASSWORD (run
// `npm run gen-wallet`), and the wallet FUNDED with tBNB for gas.
//
//   PUBLIC_URL=https://honeyglass.onrender.com node scripts/register-identity.mjs
import { readFileSync, existsSync } from 'node:fs';
import { ERC8004Agent, AgentEndpoint } from '@bnbagent/sdk/erc8004';
import { EVMWalletProvider } from '@bnbagent/sdk/wallets';
import { privateKeyToAccount } from 'viem/accounts';

// Load .env (no dependency on a loader).
const ENV = new URL('../.env', import.meta.url);
if (existsSync(ENV)) {
  for (const line of readFileSync(ENV, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const pk = process.env.SELLER_PRIVATE_KEY;
const password = process.env.SELLER_WALLET_PASSWORD;
const network = process.env.COMMERCE_NETWORK ?? 'bsc-testnet';
const publicUrl = (process.env.PUBLIC_URL ?? 'https://honeyglass.onrender.com').replace(/\/+$/, '');

if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk) || !password) {
  console.error('SELLER_PRIVATE_KEY / SELLER_WALLET_PASSWORD missing. Run `npm run gen-wallet` first.');
  process.exit(1);
}

const address = privateKeyToAccount(pk).address;
console.log(`Registering ERC-8004 identity for ${address} on ${network}`);
console.log(`Agent Card: ${publicUrl}/.well-known/agent-card.json`);

const wallet = new EVMWalletProvider({ password, privateKey: pk });
const agent = await ERC8004Agent.create({ walletProvider: wallet, network });

const existing = await agent.getLocalAgentInfo('Honeyglass').catch(() => null);
if (existing) {
  console.log(`Already registered: agentId ${existing.agentId}, uri ${existing.agentUri}`);
  process.exit(0);
}

const endpoint = new AgentEndpoint({
  name: 'A2A',
  endpoint: `${publicUrl}/.well-known/agent-card.json`,
  version: '0.3.0',
});
const agentUri = agent.generateAgentUri({
  name: 'Honeyglass',
  description:
    'Evidence-first, read-only BEP-20 token safety screener on BNB Smart Chain (A2A / ERC-8183).',
  endpoints: [endpoint],
});

const result = await agent.registerAgent(agentUri);
console.log('');
console.log('Registered ✅');
console.log(`  agentId:        ${result.agentId}`);
console.log(`  transactionHash ${result.transactionHash}`);
console.log(`  agentURI:       ${result.agentURI}`);
