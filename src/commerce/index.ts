import type { FastifyBaseLogger } from 'fastify';
import type { Config } from '../config';
import { screenToken } from '../screen';
import { loadCommerceConfig } from './config';
import { DeliveryService } from './delivery';
import { getSeller, type Seller } from './seller';
import { DeliverableStore } from './store';

export interface Commerce {
  seller: Seller;
  delivery: DeliveryService;
  store: DeliverableStore;
  category: string;
  sellerAddress: `0x${string}`;
  network: string;
}

/**
 * Build the commerce layer, or return null when commerce is disabled.
 * Throws when COMMERCE_ENABLED=true but the seller wallet is missing.
 */
export function buildCommerce(config: Config, log: FastifyBaseLogger): Commerce | null {
  const cfg = loadCommerceConfig();
  if (!cfg) return null;

  const seller = getSeller(cfg);
  if (!seller) return null;
  const store = new DeliverableStore(cfg.deliverableDir);
  const delivery = new DeliveryService({
    seller,
    store,
    screen: (input) => screenToken(input, config),
    publicUrl: config.publicUrl,
    logError: (msg, err) => log.error({ err }, msg),
  });

  return {
    seller,
    delivery,
    store,
    category: cfg.category,
    sellerAddress: seller.address,
    network: cfg.network,
  };
}
