// Generic retry helper with exponential backoff.
// Designed for idempotent external API calls (GHL, Meta CAPI).
//
// maxAttempts: total number of attempts (including first try)
// backoffMs: base delay in ms, doubles each attempt (1x, 2x, 4x...)
// onRetry: optional callback called before each retry attempt (for logging)

export interface RetryOptions {
  maxAttempts: number;
  backoffMs: number;
  onRetry?: (attempt: number, error: unknown) => void;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const { maxAttempts, backoffMs, onRetry } = options;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        onRetry?.(attempt, err);
        const delay = backoffMs * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
