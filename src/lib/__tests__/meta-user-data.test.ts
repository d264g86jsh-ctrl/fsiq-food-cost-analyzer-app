import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { buildUserData } from '../meta/meta-user-data';

function sha256(val: string): string {
  return createHash('sha256').update(val).digest('hex');
}

describe('buildUserData — PII hashing', () => {
  it('hashes email as lowercase+trimmed SHA-256', () => {
    const result = buildUserData({ email: '  Test@Example.COM  ', phone: null, zipCode: null });
    expect(result.em).toBe(sha256('test@example.com'));
  });

  it('hashes phone as digits-only SHA-256', () => {
    const result = buildUserData({ email: 'a@b.com', phone: '(512) 555-0100', zipCode: null });
    expect(result.ph).toBe(sha256('5125550100'));
  });

  it('hashes zipCode as trimmed SHA-256', () => {
    const result = buildUserData({ email: 'a@b.com', phone: null, zipCode: ' 78701 ' });
    expect(result.zp).toBe(sha256('78701'));
  });

  it('omits em when email is empty string', () => {
    const result = buildUserData({ email: '', phone: null, zipCode: null });
    expect(result.em).toBeUndefined();
  });

  it('omits ph when phone has no digits', () => {
    const result = buildUserData({ email: 'a@b.com', phone: '---', zipCode: null });
    expect(result.ph).toBeUndefined();
  });

  it('omits zp when zipCode is null', () => {
    const result = buildUserData({ email: 'a@b.com', phone: null, zipCode: null });
    expect(result.zp).toBeUndefined();
  });

  it('passes fbp and fbc through unmodified', () => {
    const result = buildUserData({
      email: 'a@b.com',
      phone: null,
      zipCode: null,
      fbp: 'fb.1.123.abc',
      fbc: 'fb.1.456.def',
    });
    expect(result.fbp).toBe('fb.1.123.abc');
    expect(result.fbc).toBe('fb.1.456.def');
  });

  it('passes clientIpAddress and clientUserAgent through unmodified', () => {
    const result = buildUserData({
      email: 'a@b.com',
      phone: null,
      zipCode: null,
      clientIpAddress: '1.2.3.4',
      clientUserAgent: 'Mozilla/5.0',
    });
    expect(result.client_ip_address).toBe('1.2.3.4');
    expect(result.client_user_agent).toBe('Mozilla/5.0');
  });

  it('does not include undefined fields in result', () => {
    const result = buildUserData({ email: 'a@b.com', phone: null, zipCode: null });
    expect(Object.keys(result)).toEqual(['em']);
  });
});
