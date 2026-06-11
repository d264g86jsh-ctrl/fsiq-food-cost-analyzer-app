import { describe, it, expect } from 'vitest';
import {
  isValidEmail,
  isValidPhone,
  normalizePhone,
  canAdvanceFromStep1,
  canAdvanceFromStep2,
  canAdvanceFromStep3,
  canSubmitStep4,
  getStep1Errors,
  getStep4Errors,
} from '../analyzer/form-validation';
import {
  decisionToUIState,
  isSubmitBlocked,
} from '../../components/analyzer/WebsiteValidationStatus';
import type { ValidationUIState } from '../../components/analyzer/WebsiteValidationStatus';
import type { AnalyzerFormPayload } from '../analyzer/form-types';

// ── isValidEmail ──────────────────────────────────────────────────────────────

describe('isValidEmail', () => {
  it('valid email passes', () => expect(isValidEmail('owner@myrestaurant.com')).toBe(true));
  it('valid email with subdomain passes', () => expect(isValidEmail('info@cafe.co.uk')).toBe(true));
  it('no @ fails', () => expect(isValidEmail('notanemail.com')).toBe(false));
  it('no domain fails', () => expect(isValidEmail('owner@')).toBe(false));
  it('empty string fails', () => expect(isValidEmail('')).toBe(false));
  it('spaces in address fail', () => expect(isValidEmail('owner @restaurant.com')).toBe(false));
});

// ── canAdvanceFromStep1 ───────────────────────────────────────────────────────

const baseStep1: Partial<AnalyzerFormPayload> = {
  restaurant_name: 'Casa Roberto',
  website: 'casaroberto.com',
  us_business_confirmed: true,
};

describe('canAdvanceFromStep1', () => {
  it('valid fields + idle → can advance', () => {
    expect(canAdvanceFromStep1(baseStep1, 'idle')).toBe(true);
  });

  it('valid fields + verified → can advance', () => {
    expect(canAdvanceFromStep1(baseStep1, 'verified')).toBe(true);
  });

  it('valid fields + unable_to_verify_but_can_continue → can advance', () => {
    expect(canAdvanceFromStep1(baseStep1, 'unable_to_verify_but_can_continue')).toBe(true);
  });

  it('valid fields + likely_not_fit (clear_non_fit) → can advance', () => {
    expect(canAdvanceFromStep1(baseStep1, 'likely_not_fit')).toBe(true);
  });

  it('valid fields + national_chain → can advance (eligibility, not a block)', () => {
    expect(canAdvanceFromStep1(baseStep1, 'national_chain')).toBe(true);
  });

  it('valid fields + non_us → can advance (eligibility, not a block)', () => {
    expect(canAdvanceFromStep1(baseStep1, 'non_us')).toBe(true);
  });

  it('valid fields + error → can advance', () => {
    expect(canAdvanceFromStep1(baseStep1, 'error')).toBe(true);
  });

  it('invalid_website → blocks advancement', () => {
    expect(canAdvanceFromStep1(baseStep1, 'invalid_website')).toBe(false);
  });

  it('checking → temporarily blocks advancement (race condition guard)', () => {
    expect(canAdvanceFromStep1(baseStep1, 'checking')).toBe(false);
  });

  it('missing restaurant_name → blocks', () => {
    expect(canAdvanceFromStep1({ ...baseStep1, restaurant_name: '' }, 'idle')).toBe(false);
  });

  it('missing website → blocks', () => {
    expect(canAdvanceFromStep1({ ...baseStep1, website: '' }, 'idle')).toBe(false);
  });

  it('us_business_confirmed false → blocks', () => {
    expect(canAdvanceFromStep1({ ...baseStep1, us_business_confirmed: false }, 'idle')).toBe(false);
  });
});

// ── canAdvanceFromStep2 ───────────────────────────────────────────────────────

describe('canAdvanceFromStep2', () => {
  it('all Step 2 fields present → can advance', () => {
    expect(canAdvanceFromStep2({
      concept_type: 'Fast casual',
      locations: '2-4 locations',
      annual_food_spend: '$1M–$3M',
    })).toBe(true);
  });

  it('missing concept_type → blocks', () => {
    expect(canAdvanceFromStep2({ locations: '2-4 locations', annual_food_spend: '$1M–$3M' })).toBe(false);
  });

  it('missing locations → blocks', () => {
    expect(canAdvanceFromStep2({ concept_type: 'Fast casual', annual_food_spend: '$1M–$3M' })).toBe(false);
  });

  it('missing annual_food_spend → blocks', () => {
    expect(canAdvanceFromStep2({ concept_type: 'Fast casual', locations: '2-4 locations' })).toBe(false);
  });
});

// ── canAdvanceFromStep3 ───────────────────────────────────────────────────────

describe('canAdvanceFromStep3', () => {
  it('all Step 3 fields present → can advance', () => {
    expect(canAdvanceFromStep3({
      distributor_type: 'National broadliners (Sysco, US Foods)',
      procurement_strategy: 'Market price, single distributor',
      top_skus: 'chicken and beef',
    })).toBe(true);
  });

  it('top_skus is free text (any non-empty value accepted)', () => {
    expect(canAdvanceFromStep3({
      distributor_type: 'Local/specialty only',
      procurement_strategy: 'Negotiated cost-plus agreement',
      top_skus: 'napkins and paper cups',
    })).toBe(true);
  });

  it('empty top_skus → blocks', () => {
    expect(canAdvanceFromStep3({
      distributor_type: 'Local/specialty only',
      procurement_strategy: 'Negotiated cost-plus agreement',
      top_skus: '   ',
    })).toBe(false);
  });

  it('missing distributor_type → blocks', () => {
    expect(canAdvanceFromStep3({
      procurement_strategy: 'Market price, single distributor',
      top_skus: 'chicken',
    })).toBe(false);
  });
});

// ── isValidPhone ──────────────────────────────────────────────────────────────

describe('isValidPhone', () => {
  // Valid formats — should all pass
  it('plain 10-digit US number passes', () => expect(isValidPhone('5125550100')).toBe(true));
  it('E.164 US +15125550100 passes', () => expect(isValidPhone('+15125550100')).toBe(true));
  it('Mexican E.164 +527775343254 passes (founder number, confirmed production)', () => expect(isValidPhone('+527775343254')).toBe(true));
  it('+52 777 534 3254 (spaces) passes', () => expect(isValidPhone('+52 777 534 3254')).toBe(true));
  it('(555) 123-4567 US formatted passes', () => expect(isValidPhone('(555) 123-4567')).toBe(true));
  it('+1.555.123.4567 dot-separated passes', () => expect(isValidPhone('+1.555.123.4567')).toBe(true));
  it('7-digit minimum passes', () => expect(isValidPhone('5550100')).toBe(true));
  it('15-digit maximum (E.164 ceiling) passes', () => expect(isValidPhone('+123456789012345')).toBe(true));

  // Production failure values — all three must be rejected client-side
  it('"not a phone number" → rejected (production failure)', () => expect(isValidPhone('not a phone number')).toBe(false));
  it('SQL injection string → rejected (production failure)', () => expect(isValidPhone("'; DROP TABLE Submission; --")).toBe(false));
  it('500-char digit string → rejected (too long, production failure)', () => expect(isValidPhone('1'.repeat(500))).toBe(false));

  // Edge cases
  it('empty string → rejected', () => expect(isValidPhone('')).toBe(false));
  it('whitespace-only → rejected', () => expect(isValidPhone('   ')).toBe(false));
  it('6 digits → rejected (too short)', () => expect(isValidPhone('123456')).toBe(false));
  it('16 digits → rejected (too long)', () => expect(isValidPhone('1234567890123456')).toBe(false));
  it('letters mixed with digits → rejected', () => expect(isValidPhone('555abc1234')).toBe(false));
});

// ── normalizePhone ────────────────────────────────────────────────────────────

describe('normalizePhone', () => {
  // Valid inputs → canonical string
  it('10-digit US number → stored as-is', () => expect(normalizePhone('5125550100')).toBe('5125550100'));
  it('E.164 +15125550100 → stored as-is', () => expect(normalizePhone('+15125550100')).toBe('+15125550100'));
  it('+52 777 534 3254 → +527775343254 (spaces stripped)', () => expect(normalizePhone('+52 777 534 3254')).toBe('+527775343254'));
  it('(555) 123-4567 → 5551234567 (formatting stripped)', () => expect(normalizePhone('(555) 123-4567')).toBe('5551234567'));
  it('+1.555.123.4567 → +15551234567 (dots stripped)', () => expect(normalizePhone('+1.555.123.4567')).toBe('+15551234567'));
  it('leading/trailing whitespace stripped', () => expect(normalizePhone('  +15551234567  ')).toBe('+15551234567'));

  // Production failure values → null (phone omitted from GHL, contact still created)
  it('"not a phone number" → null (GHL payload omits phone)', () => expect(normalizePhone('not a phone number')).toBeNull());
  it('SQL injection string → null', () => expect(normalizePhone("'; DROP TABLE Submission; --")).toBeNull());
  it('500-char digit string → null (too long)', () => expect(normalizePhone('1'.repeat(500))).toBeNull());

  // Null/empty inputs
  it('null → null', () => expect(normalizePhone(null)).toBeNull());
  it('undefined → null', () => expect(normalizePhone(undefined)).toBeNull());
  it('empty string → null', () => expect(normalizePhone('')).toBeNull());
  it('whitespace-only → null', () => expect(normalizePhone('   ')).toBeNull());
});

// ── canSubmitStep4 ────────────────────────────────────────────────────────────

describe('canSubmitStep4', () => {
  it('full_name + valid email + valid phone → can submit', () => {
    expect(canSubmitStep4({ full_name: 'Maria Garcia', email: 'maria@restaurant.com', phone: '5125550100' })).toBe(true);
  });

  it('phone required — absent blocks submit', () => {
    expect(canSubmitStep4({ full_name: 'Maria Garcia', email: 'maria@restaurant.com' })).toBe(false);
  });

  it('phone required — whitespace-only blocks submit', () => {
    expect(canSubmitStep4({ full_name: 'Maria Garcia', email: 'maria@restaurant.com', phone: '   ' })).toBe(false);
  });

  it('phone required — empty string blocks submit', () => {
    expect(canSubmitStep4({ full_name: 'Maria Garcia', email: 'maria@restaurant.com', phone: '' })).toBe(false);
  });

  it('"not a phone number" → blocks (production failure value)', () => {
    expect(canSubmitStep4({ full_name: 'Maria Garcia', email: 'maria@restaurant.com', phone: 'not a phone number' })).toBe(false);
  });

  it('SQL injection string → blocks (production failure value)', () => {
    expect(canSubmitStep4({ full_name: 'Maria Garcia', email: 'maria@restaurant.com', phone: "'; DROP TABLE Submission; --" })).toBe(false);
  });

  it('500-char digit string → blocks (production failure value)', () => {
    expect(canSubmitStep4({ full_name: 'Maria Garcia', email: 'maria@restaurant.com', phone: '1'.repeat(500) })).toBe(false);
  });

  it('+52 777 534 3254 (Mexican number with spaces) → passes', () => {
    expect(canSubmitStep4({ full_name: 'Maria Garcia', email: 'maria@restaurant.com', phone: '+52 777 534 3254' })).toBe(true);
  });

  it('(555) 123-4567 US formatted → passes', () => {
    expect(canSubmitStep4({ full_name: 'Maria Garcia', email: 'maria@restaurant.com', phone: '(555) 123-4567' })).toBe(true);
  });

  it('+15551234567 with surrounding spaces → passes (spaces stripped before format check)', () => {
    expect(canSubmitStep4({ full_name: 'Maria Garcia', email: 'maria@restaurant.com', phone: '  +15551234567  ' })).toBe(true);
  });

  it('missing full_name → blocks', () => {
    expect(canSubmitStep4({ full_name: '', email: 'maria@restaurant.com', phone: '5125550100' })).toBe(false);
  });

  it('whitespace-only full_name → blocks (required field)', () => {
    expect(canSubmitStep4({ full_name: '   ', email: 'maria@restaurant.com', phone: '5125550100' })).toBe(false);
  });

  it('missing email → blocks', () => {
    expect(canSubmitStep4({ full_name: 'Maria Garcia', email: '', phone: '5125550100' })).toBe(false);
  });

  it('invalid email format → blocks', () => {
    expect(canSubmitStep4({ full_name: 'Maria Garcia', email: 'notanemail', phone: '5125550100' })).toBe(false);
  });
});

// ── getStep1Errors ────────────────────────────────────────────────────────────

describe('getStep1Errors', () => {
  it('all valid → no errors', () => {
    const errors = getStep1Errors(baseStep1, 'idle');
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('missing restaurant_name → error', () => {
    const errors = getStep1Errors({ ...baseStep1, restaurant_name: '' }, 'idle');
    expect(errors.restaurant_name).toBeTruthy();
  });

  it('us_business_confirmed false → error', () => {
    const errors = getStep1Errors({ ...baseStep1, us_business_confirmed: false }, 'idle');
    expect(errors.us_business_confirmed).toBeTruthy();
  });

  it('invalid_website state → website error', () => {
    const errors = getStep1Errors(baseStep1, 'invalid_website');
    expect(errors.website).toBeTruthy();
  });
});

// ── getStep4Errors ────────────────────────────────────────────────────────────

describe('getStep4Errors', () => {
  it('valid full_name + email + valid phone → no errors', () => {
    const errors = getStep4Errors({ full_name: 'Maria Garcia', email: 'maria@restaurant.com', phone: '5125550100' });
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('phone absent → "required" error', () => {
    const errors = getStep4Errors({ full_name: 'Maria Garcia', email: 'maria@restaurant.com' });
    expect(errors.phone).toBe('Phone number is required.');
  });

  it('whitespace-only phone → "required" error', () => {
    const errors = getStep4Errors({ full_name: 'Maria Garcia', email: 'maria@restaurant.com', phone: '   ' });
    expect(errors.phone).toBe('Phone number is required.');
  });

  it('"not a phone number" → format error (production failure value)', () => {
    const errors = getStep4Errors({ full_name: 'Maria Garcia', email: 'maria@restaurant.com', phone: 'not a phone number' });
    expect(errors.phone).toMatch(/valid phone number/i);
  });

  it('500-char digit string → format error (production failure value)', () => {
    const errors = getStep4Errors({ full_name: 'Maria Garcia', email: 'maria@restaurant.com', phone: '1'.repeat(500) });
    expect(errors.phone).toMatch(/valid phone number/i);
  });

  it('+15551234567 with spaces → no error (valid E.164 with surrounding spaces)', () => {
    const errors = getStep4Errors({ full_name: 'Maria Garcia', email: 'maria@restaurant.com', phone: '  +15551234567  ' });
    expect(errors.phone).toBeUndefined();
  });

  it('+52 777 534 3254 → no error (Mexican number, founder format)', () => {
    const errors = getStep4Errors({ full_name: 'Maria Garcia', email: 'maria@restaurant.com', phone: '+52 777 534 3254' });
    expect(errors.phone).toBeUndefined();
  });

  it('invalid email → error', () => {
    const errors = getStep4Errors({ full_name: 'Maria Garcia', email: 'bad', phone: '5125550100' });
    expect(errors.email).toBeTruthy();
  });

  it('missing full_name → error', () => {
    const errors = getStep4Errors({ full_name: '', email: 'maria@restaurant.com', phone: '5125550100' });
    expect(errors.full_name).toBeTruthy();
  });
});

// ── decisionToUIState ─────────────────────────────────────────────────────────

describe('decisionToUIState', () => {
  it('null → idle', () => {
    expect(decisionToUIState(null)).toBe('idle');
  });

  it('verified_restaurant → verified', () => {
    expect(decisionToUIState('verified_restaurant')).toBe('verified');
  });

  it('plausible_unverified → unable_to_verify_but_can_continue', () => {
    expect(decisionToUIState('plausible_unverified')).toBe('unable_to_verify_but_can_continue');
  });

  it('clear_non_fit without non_us_ineligible → likely_not_fit', () => {
    expect(decisionToUIState('clear_non_fit')).toBe('likely_not_fit');
    expect(decisionToUIState('clear_non_fit', [])).toBe('likely_not_fit');
    expect(decisionToUIState('clear_non_fit', ['other_flag'])).toBe('likely_not_fit');
  });

  it('clear_non_fit with non_us_ineligible → non_us', () => {
    expect(decisionToUIState('clear_non_fit', ['non_us_ineligible'])).toBe('non_us');
    expect(decisionToUIState('clear_non_fit', ['other_flag', 'non_us_ineligible'])).toBe('non_us');
  });

  it('national_chain → national_chain', () => {
    expect(decisionToUIState('national_chain')).toBe('national_chain');
  });

  it('invalid_website → invalid_website', () => {
    expect(decisionToUIState('invalid_website')).toBe('invalid_website');
  });

  it('hasError=true → error regardless of decision', () => {
    expect(decisionToUIState('verified_restaurant', [], true)).toBe('error');
    expect(decisionToUIState(null, [], true)).toBe('error');
  });
});

// ── isSubmitBlocked ───────────────────────────────────────────────────────────

describe('isSubmitBlocked', () => {
  const blockingStates: ValidationUIState[] = ['invalid_website'];
  const nonBlockingStates: ValidationUIState[] = [
    'idle',
    'checking',
    'verified',
    'unable_to_verify_but_can_continue',
    'likely_not_fit',
    'national_chain',  // eligibility decision — must NOT block
    'non_us',          // eligibility decision — must NOT block
    'error',
  ];

  for (const state of blockingStates) {
    it(`${state} → blocked`, () => expect(isSubmitBlocked(state)).toBe(true));
  }

  for (const state of nonBlockingStates) {
    it(`${state} → not blocked`, () => expect(isSubmitBlocked(state)).toBe(false));
  }
});

// ── Lead payload preservation ─────────────────────────────────────────────────

describe('lead payload is never erased by eligibility decisions', () => {
  const fullPayload: Partial<AnalyzerFormPayload> = {
    ...baseStep1,
    concept_type: 'Fast casual',
    locations: '2-4 locations',
    annual_food_spend: '$1M–$3M',
    distributor_type: 'National broadliners (Sysco, US Foods)',
    procurement_strategy: 'Market price, single distributor',
    top_skus: 'chicken and beef',
    full_name: 'Maria Garcia',
    email: 'maria@restaurant.com',
    phone: '5125550100',
  };

  const eligibilityStates: ValidationUIState[] = [
    'national_chain', 'likely_not_fit', 'non_us', 'unable_to_verify_but_can_continue',
  ];

  for (const state of eligibilityStates) {
    it(`${state} state does not prevent step4 submission when required fields present`, () => {
      // Step 4 uses canSubmitStep4 which does NOT check validation state
      expect(canSubmitStep4(fullPayload)).toBe(true);
    });
  }

  it('tracking fields are optional and absence does not block submission', () => {
    const payloadWithoutTracking = { ...fullPayload };
    expect(canSubmitStep4(payloadWithoutTracking)).toBe(true);
  });

  it('phone absent from full payload blocks submission (phone is required)', () => {
    const { phone: _p, ...withoutPhone } = fullPayload;
    expect(canSubmitStep4(withoutPhone)).toBe(false);
  });
});
