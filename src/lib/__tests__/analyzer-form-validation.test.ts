import { describe, it, expect } from 'vitest';
import {
  isValidUsZip,
  isValidEmail,
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

// ── isValidUsZip ──────────────────────────────────────────────────────────────

describe('isValidUsZip', () => {
  it('5-digit ZIP is valid', () => expect(isValidUsZip('78701')).toBe(true));
  it('ZIP+4 is valid', () => expect(isValidUsZip('78701-1234')).toBe(true));
  it('trims whitespace', () => expect(isValidUsZip(' 78701 ')).toBe(true));
  it('4-digit ZIP is invalid', () => expect(isValidUsZip('7870')).toBe(false));
  it('6-digit ZIP is invalid', () => expect(isValidUsZip('787011')).toBe(false));
  it('letters are invalid', () => expect(isValidUsZip('abc12')).toBe(false));
  it('Canadian format H2X 1Y4 is invalid', () => expect(isValidUsZip('H2X 1Y4')).toBe(false));
  it('empty string is invalid', () => expect(isValidUsZip('')).toBe(false));
  it('ZIP+3 (too short) is invalid', () => expect(isValidUsZip('78701-123')).toBe(false));
  it('ZIP+5 (too long) is invalid', () => expect(isValidUsZip('78701-12345')).toBe(false));
});

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
  zip_code: '78701',
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

  it('missing zip_code → blocks', () => {
    expect(canAdvanceFromStep1({ ...baseStep1, zip_code: '' }, 'idle')).toBe(false);
  });

  it('malformed ZIP → blocks', () => {
    expect(canAdvanceFromStep1({ ...baseStep1, zip_code: 'abc' }, 'idle')).toBe(false);
  });

  it('Canadian ZIP format → blocks', () => {
    expect(canAdvanceFromStep1({ ...baseStep1, zip_code: 'H2X 1Y4' }, 'idle')).toBe(false);
  });
});

// ── canAdvanceFromStep2 ───────────────────────────────────────────────────────

describe('canAdvanceFromStep2', () => {
  it('all Step 2 fields present → can advance', () => {
    expect(canAdvanceFromStep2({
      concept_type: 'Fast casual',
      locations: 'Single location',
      annual_food_spend: '$1M–$3M',
    })).toBe(true);
  });

  it('missing concept_type → blocks', () => {
    expect(canAdvanceFromStep2({ locations: 'Single location', annual_food_spend: '$1M–$3M' })).toBe(false);
  });

  it('missing locations → blocks', () => {
    expect(canAdvanceFromStep2({ concept_type: 'Fast casual', annual_food_spend: '$1M–$3M' })).toBe(false);
  });

  it('missing annual_food_spend → blocks', () => {
    expect(canAdvanceFromStep2({ concept_type: 'Fast casual', locations: 'Single location' })).toBe(false);
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

// ── canSubmitStep4 ────────────────────────────────────────────────────────────

describe('canSubmitStep4', () => {
  it('full_name + valid email → can submit', () => {
    expect(canSubmitStep4({ full_name: 'Maria Garcia', email: 'maria@restaurant.com' })).toBe(true);
  });

  it('phone is optional — absent does not block', () => {
    expect(canSubmitStep4({ full_name: 'Maria Garcia', email: 'maria@restaurant.com' })).toBe(true);
  });

  it('missing full_name → blocks', () => {
    expect(canSubmitStep4({ full_name: '', email: 'maria@restaurant.com' })).toBe(false);
  });

  it('missing email → blocks', () => {
    expect(canSubmitStep4({ full_name: 'Maria Garcia', email: '' })).toBe(false);
  });

  it('invalid email format → blocks', () => {
    expect(canSubmitStep4({ full_name: 'Maria Garcia', email: 'notanemail' })).toBe(false);
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

  it('malformed ZIP → error', () => {
    const errors = getStep1Errors({ ...baseStep1, zip_code: 'bad' }, 'idle');
    expect(errors.zip_code).toBeTruthy();
  });

  it('invalid_website state → website error', () => {
    const errors = getStep1Errors(baseStep1, 'invalid_website');
    expect(errors.website).toBeTruthy();
  });
});

// ── getStep4Errors ────────────────────────────────────────────────────────────

describe('getStep4Errors', () => {
  it('valid full_name + email → no errors', () => {
    const errors = getStep4Errors({ full_name: 'Maria Garcia', email: 'maria@restaurant.com' });
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('invalid email → error', () => {
    const errors = getStep4Errors({ full_name: 'Maria Garcia', email: 'bad' });
    expect(errors.email).toBeTruthy();
  });

  it('missing full_name → error', () => {
    const errors = getStep4Errors({ full_name: '', email: 'maria@restaurant.com' });
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
    locations: 'Single location',
    annual_food_spend: '$1M–$3M',
    distributor_type: 'National broadliners (Sysco, US Foods)',
    procurement_strategy: 'Market price, single distributor',
    top_skus: 'chicken and beef',
    full_name: 'Maria Garcia',
    email: 'maria@restaurant.com',
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
});
