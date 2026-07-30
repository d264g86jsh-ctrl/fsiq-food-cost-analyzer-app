import { classifyReachability, type FetchErrorType, type ReachabilityResult } from './reachability';
import { extractSignals, type WebsiteSignals } from './extract-signals';

export interface CheckWebsiteResult {
  httpStatus: number;
  finalUrl: string;
  redirectChain: string[];
  reachability: ReachabilityResult;
  html: string;
  bodyText: string;
  signals: WebsiteSignals | null;
}

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const FETCH_TIMEOUT_MS = 10_000;
const RETRY_TIMEOUT_MS = 5_000;

export async function checkWebsite(normalizedUrl: string): Promise<CheckWebsiteResult> {
  const redirectChain: string[] = [];
  let currentUrl = normalizedUrl;
  let httpStatus = 0;
  let finalUrl = normalizedUrl;
  let html = '';

  try {
    let response = await fetchWithFallbacks(normalizedUrl);
    currentUrl = response.requestUrl;

    httpStatus = response.response.status;
    finalUrl = response.response.url || currentUrl;

    // If a deep link is stale (404), retry the domain root before treating it
    // as unreachable. CRM data frequently contains old /menu or /about URLs.
    if (httpStatus === 404) {
      const rootUrl = toDomainRoot(normalizedUrl);
      if (rootUrl && rootUrl !== normalizedUrl) {
        try {
          const rootResponse = await fetchWithFallbacks(rootUrl);
          const rootStatus = rootResponse.response.status;
          if (rootStatus >= 200 && rootStatus < 400) {
            response = rootResponse;
            currentUrl = response.requestUrl;
            httpStatus = rootStatus;
            finalUrl = response.response.url || currentUrl;
            redirectChain.push(rootUrl);
          }
        } catch {
          // Keep original 404 result.
        }
      }
    }

    // Track redirect if URL changed
    if (finalUrl !== currentUrl) {
      redirectChain.push(finalUrl);
    }

    const contentType = (response.response.headers.get('content-type') ?? '').toLowerCase();

    // Read HTML bodies even on protected/error responses. Cloudflare and other
    // bot mitigations often return 403 with a useful challenge page.
    if (httpStatus < 400 || httpStatus === 404 || contentType.includes('text/html')) {
      try {
        html = await response.response.text();
      } catch {
        html = '';
      }
    }
  } catch (err: unknown) {
    const errorType = classifyFetchError(err);
    const reachability = classifyReachability({ httpStatus: 0, errorType });

    return {
      httpStatus: 0,
      finalUrl: normalizedUrl,
      redirectChain: [],
      reachability,
      html: '',
      bodyText: '',
      signals: null,
    };
  }

  const signals = html ? extractSignals(html, finalUrl) : null;
  const bodyText = signals?.bodyText ?? '';

  const reachability = classifyReachability({
    httpStatus,
    bodyTextLength: bodyText.length,
    finalUrl,
    originalUrl: normalizedUrl,
  });

  return {
    httpStatus,
    finalUrl,
    redirectChain,
    reachability,
    html,
    bodyText,
    signals,
  };
}

function toDomainRoot(url: string): string | null {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}/`;
  } catch {
    return null;
  }
}

async function fetchWithFallbacks(url: string): Promise<{ response: Response; requestUrl: string }> {
  const candidates = buildFetchCandidates(url);
  let lastError: unknown = null;

  for (const candidate of candidates) {
    try {
      return { response: await fetchWithTimeoutRetry(candidate), requestUrl: candidate };
    } catch (err) {
      lastError = err;
      const errorType = classifyFetchError(err);
      if (errorType === 'dns_nxdomain') continue;
      if (errorType === 'timeout' || errorType === 'abort' || errorType === 'network_error' || errorType === 'ssl_error') continue;
      throw err;
    }
  }

  throw lastError ?? new Error('network_error');
}

function buildFetchCandidates(url: string): string[] {
  const candidates = new Set<string>([url]);
  try {
    const parsed = new URL(url);
    const originalProtocol = parsed.protocol;
    const originalHost = parsed.hostname;
    const hostVariants = new Set<string>([originalHost]);
    if (originalHost.startsWith('www.')) hostVariants.add(originalHost.replace(/^www\./, ''));
    else hostVariants.add(`www.${originalHost}`);

    for (const host of hostVariants) {
      for (const protocol of [originalProtocol, originalProtocol === 'https:' ? 'http:' : 'https:']) {
        const candidate = new URL(parsed.toString());
        candidate.protocol = protocol;
        candidate.hostname = host;
        candidates.add(candidate.toString());
      }
    }
  } catch {
    // normalizeUrl should prevent this; keep the original candidate if parsing fails.
  }

  return [...candidates];
}

async function fetchWithTimeoutRetry(url: string): Promise<Response> {
  try {
    return await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
  } catch (err) {
    const errorType = classifyFetchError(err);
    if (errorType !== 'timeout' && errorType !== 'abort') throw err;
    return fetchWithTimeout(url, RETRY_TIMEOUT_MS);
  }
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control': 'no-cache',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function classifyFetchError(err: unknown): FetchErrorType {
  if (!(err instanceof Error)) return 'network_error';

  const msg = err.message.toLowerCase();
  const name = err.name?.toLowerCase() ?? '';

  if (name === 'aborterror' || msg.includes('abort')) return 'abort';
  if (msg.includes('enotfound') || msg.includes('nxdomain') || msg.includes('dns')) return 'dns_nxdomain';
  if (msg.includes('cert') || msg.includes('ssl') || msg.includes('tls') || msg.includes('certificate')) return 'ssl_error';
  if (msg.includes('timeout') || msg.includes('etimedout')) return 'timeout';
  if (msg.includes('econnreset') || msg.includes('econnrefused') || msg.includes('socket')) return 'network_error';
  if (msg.includes('too many redirect') || msg.includes('redirect')) return 'redirect_loop';

  return 'network_error';
}
