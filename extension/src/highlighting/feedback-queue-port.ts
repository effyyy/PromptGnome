/**
 * Null-object port for the FeedbackQueue class.
 *
 * Provides a noop class so highlighting/index.ts can import FeedbackQueue
 * without requiring the Pro implementation. The class is only instantiated
 * when feedbackEnabled && feedbackEndpoint are truthy, which is never true
 * in the Free build.
 *
 * Architecture layer: Highlighting / Port class (Free)
 */

/** Options accepted by the FeedbackQueue constructor. */
export interface FeedbackQueueOptions {
  /** Backend URL for feedback flushing. */
  readonly endpoint: string;
  /** Flush interval in milliseconds. */
  readonly flushIntervalMs: number;
  /** Max items before auto-flush. */
  readonly maxBatchSize: number;
}

/**
 * Noop FeedbackQueue — all methods resolve immediately, nothing is persisted
 * or transmitted. Used in the Free build where feedback upload is unavailable.
 */
export class FeedbackQueue {
  constructor(_options: FeedbackQueueOptions) {
    // noop
  }

  /**
   * Loads persisted queue items from storage.
   * Noop in the Free build.
   *
   * @returns A promise that resolves immediately.
   */
  async load(): Promise<void> {
    // noop
  }

  /**
   * Enqueues a feedback payload.
   * Noop in the Free build.
   *
   * @param _payload - The feedback payload to enqueue.
   * @returns A promise that resolves immediately.
   */
  async enqueue(_payload: unknown): Promise<void> {
    // noop
  }

  /**
   * Flushes queued items to the backend.
   * Noop in the Free build.
   *
   * @returns A promise that resolves immediately.
   */
  async flush(): Promise<void> {
    // noop
  }

  /**
   * Tears down the queue and clears the flush timer.
   * Noop in the Free build.
   */
  destroy(): void {
    // noop
  }
}
