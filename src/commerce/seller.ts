import { ERC8183Client, NegotiationHandler } from '@bnbagent/sdk/erc8183';
import { EVMWalletProvider } from '@bnbagent/sdk/wallets';
import { getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { CommerceConfig } from './config';

/**
 * Lazily-initialised ERC-8183 seller built on @bnbagent/sdk.
 *
 * All signing (EIP-191 quotes) and the on-chain commerce client come from the
 * SDK, so quotes are bound to the live chain-97 escrow and verify exactly the
 * way Pokter verifies them. The screening engine is untouched by this module.
 */
export class Seller {
  readonly address: `0x${string}`;
  private clientPromise?: Promise<ERC8183Client>;
  private handlerPromise?: Promise<NegotiationHandler>;

  constructor(private readonly config: CommerceConfig) {
    // Deterministic address from the key — no await, never logs the key.
    this.address = getAddress(privateKeyToAccount(config.sellerPrivateKey).address);
  }

  private wallet(): EVMWalletProvider {
    return new EVMWalletProvider({
      password: this.config.walletPassword,
      privateKey: this.config.sellerPrivateKey,
    });
  }

  /** The ERC-8183 commerce client (getJob / submit), connected to the escrow. */
  client(): Promise<ERC8183Client> {
    this.clientPromise ??= ERC8183Client.create({
      walletProvider: this.wallet(),
      network: this.config.network,
    }).catch((err) => {
      this.clientPromise = undefined;
      throw err;
    });
    return this.clientPromise;
  }

  private handler(): Promise<NegotiationHandler> {
    this.handlerPromise ??= this.client()
      .then((erc8183) =>
        NegotiationHandler.fromErc8183Client(erc8183, {
          servicePrice: this.config.servicePriceRaw,
          walletProvider: this.wallet(),
          quoteTtlSeconds: this.config.quoteTtlSeconds,
        }),
      )
      .catch((err) => {
        this.handlerPromise = undefined;
        throw err;
      });
    return this.handlerPromise;
  }

  /**
   * Produce a wallet-signed quote envelope for a negotiation request.
   * The returned object is the exact wire shape buyers anchor on-chain.
   */
  async negotiate(requestData: Record<string, unknown>): Promise<Record<string, unknown>> {
    const handler = await this.handler();
    const result = await handler.negotiate(requestData);
    return result.toDict();
  }

  get category(): string {
    return this.config.category;
  }
}

let singleton: Seller | null | undefined;

/** Process-wide seller, or null when commerce is disabled. */
export function getSeller(config: CommerceConfig | null): Seller | null {
  if (config === null) return null;
  singleton ??= new Seller(config);
  return singleton;
}
