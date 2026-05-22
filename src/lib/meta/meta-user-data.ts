// Server-only — builds hashed MetaUserData for CAPI.
// All PII is SHA-256 hashed before leaving the server. Never log raw values.
// Safe to import from server actions and route handlers.

import { createHash } from 'crypto';
import type { MetaUserData } from './meta-types';

interface UserDataInput {
  email: string;
  phone?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

// Returns MetaUserData with PII fields SHA-256 hashed.
// Non-PII fields (fbp, fbc, ip, ua) are passed through unmodified per Meta spec.
export function buildUserData(input: UserDataInput): MetaUserData {
  const result: MetaUserData = {};

  if (input.email) {
    result.em = sha256(input.email.toLowerCase().trim());
  }
  if (input.phone) {
    const digits = input.phone.replace(/\D/g, '');
    if (digits) result.ph = sha256(digits);
  }
  if (input.fbp) result.fbp = input.fbp;
  if (input.fbc) result.fbc = input.fbc;
  if (input.clientIpAddress) result.client_ip_address = input.clientIpAddress;
  if (input.clientUserAgent) result.client_user_agent = input.clientUserAgent;

  return result;
}
