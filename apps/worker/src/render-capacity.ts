export interface RenderCapacity {
  run<Result>(task: () => Promise<Result>): Promise<Result>;
}

export class RenderConcurrencyLimiter implements RenderCapacity {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(readonly limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("render concurrency limit must be a positive integer");
  }

  async run<Result>(task: () => Promise<Result>): Promise<Result> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active += 1;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  private release(): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter();
    else this.active -= 1;
  }
}

/** Production peaks above 900 MB, so a 1 GB worker must run heavy FFmpeg/Sharp work serially. */
export const workerRenderConcurrency = 1;
export const workerRenderCapacity = new RenderConcurrencyLimiter(workerRenderConcurrency);
