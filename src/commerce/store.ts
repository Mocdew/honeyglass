import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Persisted record of a delivered job.
 *
 * The deliverable URL is written on-chain permanently, so the manifest bytes
 * behind it must keep resolving. This store keeps the exact manifest JSON that
 * was hashed, so a buyer can re-fetch and re-verify `manifestHash` forever.
 *
 * NOTE: this writes to the local filesystem. On an ephemeral host (e.g. Render
 * without a persistent disk) these survive restarts within a deploy but not a
 * redeploy — attach a persistent disk for durable delivery history.
 */
export interface StoredDeliverable {
  jobId: string;
  manifestText: string;
  manifestHash: `0x${string}`;
  deliverableUrl: string;
  submitTxHash: `0x${string}` | null;
  createdAt: string;
}

export class DeliverableStore {
  private readonly dir: string;
  constructor(dir: string) {
    this.dir = resolve(dir);
  }

  private path(jobId: string): string {
    if (!/^\d+$/.test(jobId)) throw new Error('Invalid job id for store path.');
    return join(this.dir, `${jobId}.json`);
  }

  read(jobId: string): StoredDeliverable | null {
    try {
      const path = this.path(jobId);
      if (!existsSync(path)) return null;
      return JSON.parse(readFileSync(path, 'utf8')) as StoredDeliverable;
    } catch {
      return null;
    }
  }

  write(record: StoredDeliverable): void {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.path(record.jobId), JSON.stringify(record), 'utf8');
  }
}
