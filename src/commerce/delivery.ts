import { DeliverableManifest, JobStatus } from '@bnbagent/sdk/erc8183';
import type { SupportedChain } from '../constants';
import type { ScreenInput, ScreenResult } from '../types';
import type { Seller } from './seller';
import type { DeliverableStore } from './store';

export interface NotifyFundedReply {
  status: 'accepted' | 'rejected';
  job_id: string;
  reason?: string;
}

type ScreenFn = (input: ScreenInput) => Promise<ScreenResult>;

interface MinimalJob {
  provider: `0x${string}`;
  description: string;
  status: JobStatus;
  budget: bigint;
  client: `0x${string}`;
}

/** Pull a BEP-20 target + chain out of a free-text job description. */
export function extractScreenTarget(
  text: string,
): { address: string; chainId: SupportedChain } | null {
  const m = text.match(/0x[0-9a-fA-F]{40}/);
  if (!m) return null;
  const chainId: SupportedChain = /\b97\b|testnet/i.test(text) ? 97 : 56;
  return { address: m[0].toLowerCase(), chainId };
}

function assertPubliclyFetchable(url: URL): void {
  const host = url.hostname.replace(/^\[(.+)\]$/, '$1');
  const local =
    url.protocol !== 'https:' ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '::1' ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (local) {
    throw new Error(
      `Refusing to submit deliverable URL ${url.href}: it is written on-chain ` +
        'permanently and is not publicly fetchable. Set PUBLIC_URL to the deployed HTTPS origin.',
    );
  }
}

export class DeliveryService {
  private readonly inFlight = new Map<string, Promise<void>>();

  constructor(
    private readonly deps: {
      seller: Seller;
      store: DeliverableStore;
      screen: ScreenFn;
      publicUrl: string | undefined;
      logError?: (msg: string, err: unknown) => void;
      now?: () => Date;
    },
  ) {}

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  /**
   * Handle a buyer's "I funded job X" notice: verify the funded job belongs to
   * this seller, accept at once, and run delivery in the background. Returns
   * immediately — the deliverable is read back from chain once SUBMITTED.
   */
  async notifyFunded(jobId: string): Promise<NotifyFundedReply> {
    if (!/^\d+$/.test(jobId) || BigInt(jobId) > BigInt(Number.MAX_SAFE_INTEGER)) {
      return { status: 'rejected', job_id: jobId, reason: 'Invalid job id.' };
    }

    const client = await this.deps.seller.client();
    const job = (await client.getJob(BigInt(jobId))) as unknown as MinimalJob;

    if (job.provider.toLowerCase() !== this.deps.seller.address.toLowerCase()) {
      return {
        status: 'rejected',
        job_id: jobId,
        reason: 'The funded job names a different provider wallet.',
      };
    }

    const existing = this.deps.store.read(jobId);
    if (job.status === JobStatus.SUBMITTED && existing?.submitTxHash) {
      return { status: 'accepted', job_id: jobId };
    }
    if (job.status !== JobStatus.FUNDED) {
      return {
        status: 'rejected',
        job_id: jobId,
        reason: `Job is ${JobStatus[job.status]}, not FUNDED.`,
      };
    }

    this.scheduleDelivery(jobId, job);
    return { status: 'accepted', job_id: jobId };
  }

  private scheduleDelivery(jobId: string, job: MinimalJob): void {
    if (this.inFlight.has(jobId)) return;
    const task = this.performDelivery(jobId, job)
      .catch((err) => this.deps.logError?.(`delivery failed for job ${jobId}`, err))
      .finally(() => this.inFlight.delete(jobId));
    this.inFlight.set(jobId, task);
  }

  private async performDelivery(jobId: string, job: MinimalJob): Promise<void> {
    const existing = this.deps.store.read(jobId);
    if (existing?.submitTxHash) return;

    if (!this.deps.publicUrl) {
      throw new Error('PUBLIC_URL is not set; cannot publish a fetchable deliverable URL.');
    }

    const client = await this.deps.seller.client();
    const target = extractScreenTarget(job.description);

    const body: Record<string, unknown> = {
      title: 'Honeyglass token safety screen',
      task: job.description,
      limits:
        'Automated read-only risk screen. No transaction was executed and no funds moved. ' +
        'Not financial advice and not a guarantee of safety.',
    };
    if (target) {
      body.screen = await this.deps.screen({
        address: target.address,
        chainId: target.chainId,
        dryRun: false,
      });
    } else {
      body.error = 'No BEP-20 token address was found in the task description.';
    }

    const chainId = Number((client as unknown as { network: { chainId: number } }).network.chainId);
    const commerce = (client as unknown as { commerce?: { address?: string } }).commerce?.address;

    const manifest = new DeliverableManifest({
      version: 1,
      jobId: Number(jobId),
      chainId,
      contracts: commerce ? { commerce } : {},
      response: { content: JSON.stringify(body), contentType: 'application/json' },
      metadata: {
        producer: 'Honeyglass',
        generated_at: this.now().toISOString(),
        proof: 'ERC-8183 funded job re-read before submission',
      },
    });
    const manifestHash = manifest.manifestHash();

    const url = new URL(`/deliverables/${jobId}`, this.deps.publicUrl);
    url.searchParams.set('hash', manifestHash);
    assertPubliclyFetchable(url);
    const deliverableUrl = url.href;

    // The bytes must resolve before the on-chain URL is published.
    const createdAt = this.now().toISOString();
    this.deps.store.write({
      jobId,
      manifestText: JSON.stringify(manifest.toDict()),
      manifestHash,
      deliverableUrl,
      submitTxHash: null,
      createdAt,
    });

    const tx = (await client.submit(BigInt(jobId), manifestHash, {
      deliverable_url: deliverableUrl,
    })) as { transactionHash?: string; hash?: string };
    const submitTxHash = (tx.transactionHash ?? tx.hash ?? null) as `0x${string}` | null;

    this.deps.store.write({
      jobId,
      manifestText: JSON.stringify(manifest.toDict()),
      manifestHash,
      deliverableUrl,
      submitTxHash,
      createdAt,
    });
  }
}
