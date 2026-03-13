/**
 * @file timing.ts
 * @description Performance measurement utilities for E2E benchmark tests.
 *
 * Provides:
 *   - Timer: Stopwatch class for measuring elapsed time
 *   - waitForCondition: Polling utility that waits for an async predicate
 *   - measure: Wraps an async function and returns [result, elapsedMs]
 */

/**
 * Stopwatch utility for measuring elapsed time.
 *
 * @example
 * ```ts
 * const timer = new Timer();
 * await someOperation();
 * console.log(`Elapsed: ${timer.elapsed()}ms`);
 * ```
 */
export class Timer {
  private start: number;

  constructor() {
    this.start = Date.now();
  }

  /**
   * Get the elapsed time since construction (or last lap) in milliseconds.
   * @returns Elapsed time in ms
   */
  elapsed(): number {
    return Date.now() - this.start;
  }

  /**
   * Get the elapsed time and reset the timer.
   * Useful for measuring sequential phases within a single test.
   * @returns Elapsed time since last reset in ms
   */
  lap(): number {
    const elapsed = this.elapsed();
    this.start = Date.now();
    return elapsed;
  }

  /**
   * Assert that elapsed time is under a threshold; throw if exceeded.
   * @param thresholdMs - Maximum allowed elapsed time in ms
   * @param label - Description for the error message
   * @throws Error if elapsed time exceeds threshold
   */
  assertUnder(thresholdMs: number, label: string): void {
    const elapsed = this.elapsed();
    if (elapsed > thresholdMs) {
      throw new Error(
        `[Performance] ${label}: ${elapsed}ms exceeded threshold ${thresholdMs}ms`,
      );
    }
  }
}

/**
 * Poll an async predicate until it returns true, or throw on timeout.
 *
 * @param fn - Async function that returns true when the condition is met
 * @param timeoutMs - Maximum wait time in ms (default: 30000)
 * @param intervalMs - Polling interval in ms (default: 500)
 * @param label - Description for the timeout error message
 * @throws Error if condition is not met within timeout
 *
 * @example
 * ```ts
 * await waitForCondition(
 *   async () => page.locator('.result').isVisible(),
 *   10_000,
 *   500,
 *   'result element visible',
 * );
 * ```
 */
export async function waitForCondition(
  fn: () => Promise<boolean>,
  timeoutMs: number = 30_000,
  intervalMs: number = 500,
  label: string = "condition",
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`[Timeout] ${label} not met within ${timeoutMs}ms`);
}

/**
 * Measure the execution time of an async operation.
 * Returns both the result and the elapsed time as a tuple.
 *
 * @param fn - Async function to measure
 * @returns Tuple of [result, elapsedMs]
 *
 * @example
 * ```ts
 * const [response, ms] = await measure(() => api.createRoom('test', 'user'));
 * console.log(`Room created in ${ms}ms, status: ${response.status}`);
 * ```
 */
export async function measure<T>(
  fn: () => Promise<T>,
): Promise<[T, number]> {
  const timer = new Timer();
  const result = await fn();
  return [result, timer.elapsed()];
}
