// Lightweight debug logger — silent in production unless FSIQ_DEBUG=true.
// Used for verbose hot-path diagnostics (logo extraction, PDF generation, PDF proxy)
// that are useful when debugging but noisy in normal operation. Errors/warnings still
// use console.error / console.warn directly and are never gated.
export function debugLog(...args: unknown[]): void {
  if (process.env.FSIQ_DEBUG === 'true') {
    console.log(...args);
  }
}
