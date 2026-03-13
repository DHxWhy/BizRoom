/** Performance measurement utilities */

export class Timer {
  private start: number;

  constructor() {
    this.start = Date.now();
  }

  /** Returns elapsed time in milliseconds */
  elapsed(): number {
    return Date.now() - this.start;
  }

  /** Resets the timer and returns elapsed time */
  lap(): number {
    const elapsed = this.elapsed();
    this.start = Date.now();
    return elapsed;
  }

  /** Asserts elapsed time is under threshold */
  assertUnder(thresholdMs: number, label: string): void {
    const elapsed = this.elapsed();
    if (elapsed > thresholdMs) {
      throw new Error(
        `[Performance] ${label}: ${elapsed}ms exceeded threshold ${thresholdMs}ms`,
      );
    }
  }
}

/** Wait for a condition to be true, polling at interval */
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

/** Measure async operation and return [result, elapsedMs] */
export async function measure<T>(
  fn: () => Promise<T>,
): Promise<[T, number]> {
  const timer = new Timer();
  const result = await fn();
  return [result, timer.elapsed()];
}
