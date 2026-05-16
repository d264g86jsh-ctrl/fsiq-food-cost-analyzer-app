import type { ReachabilityStatus } from './types';

export type FetchErrorType =
  | 'dns_nxdomain'
  | 'timeout'
  | 'abort'
  | 'ssl_error'
  | 'redirect_loop'
  | 'network_error';

export interface ReachabilityResult {
  status: ReachabilityStatus;
  httpStatus: number;
  internalFlags: string[];
  userFacingMessage: string | null;
}

const SOCIAL_DOMAINS = ['instagram.com', 'facebook.com', 'twitter.com', 'x.com', 'tiktok.com', 'linktr.ee', 'linktree.com'];
const ORDERING_DOMAINS = ['toasttab.com', 'order.online', 'olo.com', 'grubhub.com', 'doordash.com', 'ubereats.com', 'squareup.com'];

export function classifyReachability(options: {
  httpStatus: number;
  errorType?: FetchErrorType;
  bodyTextLength?: number;
  finalUrl?: string;
  originalUrl?: string;
}): ReachabilityResult {
  const { httpStatus, errorType, bodyTextLength, finalUrl, originalUrl } = options;

  if (errorType === 'dns_nxdomain') {
    return {
      status: 'invalid',
      httpStatus: 0,
      internalFlags: ['dns_nxdomain'],
      userFacingMessage: "That domain doesn't appear to exist. Please check the URL for typos.",
    };
  }

  if (errorType === 'timeout') {
    return { status: 'inaccessible', httpStatus: 0, internalFlags: ['connection_timeout'], userFacingMessage: null };
  }

  if (errorType === 'abort') {
    return { status: 'inaccessible', httpStatus: 0, internalFlags: ['request_timeout'], userFacingMessage: null };
  }

  if (errorType === 'ssl_error') {
    return { status: 'blocked', httpStatus: 0, internalFlags: ['ssl_error'], userFacingMessage: null };
  }

  if (errorType === 'redirect_loop') {
    return { status: 'inaccessible', httpStatus: 0, internalFlags: ['redirect_loop'], userFacingMessage: null };
  }

  if (errorType === 'network_error') {
    return { status: 'inaccessible', httpStatus: 0, internalFlags: ['network_error'], userFacingMessage: null };
  }

  if (httpStatus === 404) {
    return {
      status: 'invalid',
      httpStatus,
      internalFlags: ['http_404'],
      userFacingMessage: "We couldn't find that website. Please double-check the URL.",
    };
  }

  if (httpStatus === 200 || httpStatus === 304) {
    // Thin content check
    if (bodyTextLength !== undefined && bodyTextLength < 200) {
      return { status: 'thin', httpStatus, internalFlags: ['thin_content'], userFacingMessage: null };
    }

    // Redirect destination classification
    if (finalUrl && originalUrl && finalUrl !== originalUrl) {
      const finalHost = tryHostname(finalUrl);
      if (finalHost) {
        if (SOCIAL_DOMAINS.some((d) => finalHost.includes(d))) {
          return { status: 'redirected', httpStatus, internalFlags: ['redirects_to_social'], userFacingMessage: null };
        }
        if (ORDERING_DOMAINS.some((d) => finalHost.includes(d))) {
          return { status: 'redirected', httpStatus, internalFlags: ['redirects_to_ordering_platform'], userFacingMessage: null };
        }
      }
    }

    return { status: 'reachable', httpStatus, internalFlags: [], userFacingMessage: null };
  }

  if (httpStatus === 403) {
    return { status: 'blocked', httpStatus, internalFlags: ['http_403'], userFacingMessage: null };
  }
  if (httpStatus === 401) {
    return { status: 'blocked', httpStatus, internalFlags: ['http_401'], userFacingMessage: null };
  }
  if (httpStatus === 429) {
    return { status: 'blocked', httpStatus, internalFlags: ['http_429'], userFacingMessage: null };
  }
  if (httpStatus === 500) {
    return { status: 'blocked', httpStatus, internalFlags: ['http_500'], userFacingMessage: null };
  }
  if (httpStatus === 502) {
    return { status: 'blocked', httpStatus, internalFlags: ['http_502'], userFacingMessage: null };
  }
  if (httpStatus === 503) {
    return { status: 'blocked', httpStatus, internalFlags: ['http_503'], userFacingMessage: null };
  }
  if (httpStatus >= 520 && httpStatus <= 527) {
    return { status: 'blocked', httpStatus, internalFlags: ['cloudflare_error'], userFacingMessage: null };
  }

  // Other 4xx/5xx
  if (httpStatus >= 400) {
    return { status: 'blocked', httpStatus, internalFlags: [`http_${httpStatus}`], userFacingMessage: null };
  }

  // 3xx without following redirects (should normally be followed)
  if (httpStatus >= 300 && httpStatus < 400) {
    return { status: 'redirected', httpStatus, internalFlags: [], userFacingMessage: null };
  }

  return { status: 'blocked', httpStatus, internalFlags: [`http_${httpStatus}`], userFacingMessage: null };
}

function tryHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
