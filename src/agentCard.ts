import type { Commerce } from './commerce';
import type { Config } from './config';
import { A2A_PROTOCOL_VERSION, APP_NAME, APP_VERSION, CHAIN_NAMES } from './constants';
import { FIXTURE_ADDRESSES } from './fixtures';
import { buildDisclosures } from './screen';

const COMMERCE_SKILLS = [
  {
    id: 'negotiate',
    name: 'Negotiate a screening job',
    description:
      'Send a data part {"skill":"negotiate","task_description":"...","terms":{"deliverables":"...","quality_standards":"..."}} (both terms keys required) and receive a wallet-signed price quote (price, currency, negotiation_hash, provider_sig) bound to the ERC-8183 escrow on BNB testnet. Anchor the quote on-chain via createJob + fund, then call notify_funded with the job_id.',
    tags: ['erc8183', 'negotiation', 'bnb-chain'],
    inputModes: ['application/json'],
    outputModes: ['application/json'],
  },
  {
    id: 'notify_funded',
    name: 'Notify the seller a job is funded (request delivery)',
    description:
      'After funding the job on-chain, send {"skill":"notify_funded","job_id":<int>}. The seller verifies the funded job names it as provider and replies at once with {"status":"accepted"|"rejected","job_id"}; delivery (a token safety screen) runs in the background and is read back from chain once the job is SUBMITTED (the submit tx carries the deliverable_url).',
    tags: ['erc8183', 'delivery', 'bnb-chain'],
    inputModes: ['application/json'],
    outputModes: ['application/json'],
  },
];

/**
 * A2A Agent Card. Standard fields per the A2A spec, plus clearly-named
 * `x-honeyglass` extension fields carrying honest disclosures, the supported
 * chains, and the application-level RPC method contract. When commerce is
 * enabled, advertises the ERC-8183 negotiate/notify_funded skills.
 */
export function buildAgentCard(config: Config, url: string, commerce: Commerce | null = null) {
  const screenSkill = {
    id: 'screen-token',
    name: 'Screen BEP-20 token',
    description:
      'Screen a token contract for honeypot, sellability, buy/sell tax, ownership, mint authority, upgradeable proxy, LP lock, holder base and related risk signals. Returns a verdict with evidence and sources.',
    tags: ['security', 'bnb-chain', 'honeypot', 'risk', 'read-only', 'bep-20'],
    inputModes: ['application/json'],
    outputModes: ['application/json'],
    examples: [
      'Screen 0x0000000000000000000000000000000000000000 on chainId 56',
      'Is this BEP-20 token a honeypot?',
    ],
  };

  return {
    protocolVersion: A2A_PROTOCOL_VERSION,
    name: APP_NAME,
    description:
      'Evidence-first, read-only pre-trade safety screen for BEP-20 tokens on BNB Smart Chain. Returns a PASS / CAUTION / FAIL / UNKNOWN verdict with per-signal evidence and sources. Not financial advice.',
    url,
    preferredTransport: 'JSONRPC',
    version: APP_VERSION,
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: false,
    },
    defaultInputModes: ['application/json'],
    defaultOutputModes: ['application/json'],
    skills: commerce ? [screenSkill, ...COMMERCE_SKILLS] : [screenSkill],
    provider: {
      organization: APP_NAME,
      url,
    },
    'x-honeyglass': {
      methods: {
        screen: {
          description: 'Primary method. Returns a ScreenResult directly.',
          params: { address: 'string (0x…40 hex)', chainId: '56 | 97 (default 56)', dryRun: 'boolean' },
        },
        'message/send': {
          description:
            'A2A-compatible wrapper. Pass a DataPart { address, chainId?, dryRun? } (or a TextPart with the address). Returns an A2A Task whose artifact carries the ScreenResult.',
        },
      },
      supportedChains: config.supportedChains.map((c) => ({ chainId: c, name: CHAIN_NAMES[c] })),
      dryRunFixtures: {
        pass: FIXTURE_ADDRESSES.pass,
        fail: FIXTURE_ADDRESSES.fail,
        note: 'Synthetic test vectors; not real tokens. Any other address in dry-run returns a CAUTION sample.',
      },
      commerce: commerce
        ? {
            protocol: 'erc8183',
            category: commerce.category,
            seller: commerce.sellerAddress,
            network: commerce.network,
            note: 'Seller signs quotes with its ERC-8004 identity wallet; jobs settle in ERC-8183 escrow on BNB testnet.',
          }
        : null,
      disclosures: buildDisclosures(config),
    },
  };
}
