import type { Config } from './config';
import { A2A_PROTOCOL_VERSION, APP_NAME, APP_VERSION, CHAIN_NAMES } from './constants';
import { FIXTURE_ADDRESSES } from './fixtures';
import { buildDisclosures } from './screen';

/**
 * A2A Agent Card. Standard fields per the A2A spec, plus clearly-named
 * `x-honeyglass` extension fields carrying honest disclosures, the supported
 * chains, and the application-level RPC method contract.
 */
export function buildAgentCard(config: Config, url: string) {
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
    skills: [
      {
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
      },
    ],
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
      disclosures: buildDisclosures(config),
    },
  };
}
