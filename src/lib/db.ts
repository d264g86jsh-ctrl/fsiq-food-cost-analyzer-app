import { PrismaClient } from '@prisma/client';

/**
 * Normalise a Supabase pooler URL so it always carries the parameters
 * Prisma requires for PgBouncer session mode:
 *   - pgbouncer=true  → forces unnamed prepared statements (avoids 42P05
 *                        "prepared statement already exists" when a pooler
 *                        session is reused across invocations)
 *   - connection_limit=1 → each serverless function instance holds at most
 *                          one pooler connection, preventing session exhaustion
 *
 * Idempotent: strips any existing values for those params before re-appending,
 * so a URL that already contains them is not double-suffixed.
 *
 * Exported for unit testing. Never call this at the module level outside this
 * file — use `db` directly everywhere else.
 */
export function normaliseDatabaseUrl(url: string): string {
  if (!url) return url;
  const cleaned = url
    .replace(/[?&]pgbouncer=[^&]*/g, '')
    .replace(/[?&]connection_limit=[^&]*/g, '');
  // Remove a trailing ? or & that stripping may have left, THEN determine the
  // separator from the trimmed result (not the original url) — this ensures
  // idempotency and correct ? vs & placement after params are removed.
  const trimmed = cleaned.replace(/[?&]$/, '');
  const sep = trimmed.includes('?') ? '&' : '?';
  return `${trimmed}${sep}pgbouncer=true&connection_limit=1`;
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: { url: normaliseDatabaseUrl(process.env.DATABASE_URL ?? '') },
    },
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
