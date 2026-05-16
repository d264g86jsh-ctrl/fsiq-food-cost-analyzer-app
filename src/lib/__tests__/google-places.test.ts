import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { queryGooglePlaces } from '../relevance/google-places';

// Mock global fetch
const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  // Default: API key present
  vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-key');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  mockFetch.mockReset();
});

function makeTextSearchResponse(results: object[]) {
  return new Response(JSON.stringify({ status: 'OK', results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makePlaceDetailsResponse(result: object) {
  return new Response(JSON.stringify({ status: 'OK', result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const US_RESTAURANT_PLACE = {
  place_id: 'place123',
  name: 'Casa Roberto',
  types: ['restaurant', 'food', 'establishment'],
};

const US_PLACE_DETAILS = {
  name: 'Casa Roberto',
  types: ['restaurant', 'food', 'establishment'],
  business_status: 'OPERATIONAL',
  address_components: [
    { long_name: 'United States', short_name: 'US', types: ['country', 'political'] },
    { long_name: 'Texas', short_name: 'TX', types: ['administrative_area_level_1'] },
  ],
};

describe('queryGooglePlaces', () => {
  it('returns no-query result when API key is missing', async () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', '');
    const r = await queryGooglePlaces({ restaurantName: 'Casa Roberto', zipCode: '78704' });
    expect(r.googlePlacesQueried).toBe(false);
    expect(r.internalFlags).toContain('google_places_key_missing');
    expect(r.googlePlacesScore).toBe(0);
  });

  it('confirmed US restaurant → high score and us_verified country', async () => {
    mockFetch
      .mockResolvedValueOnce(makeTextSearchResponse([US_RESTAURANT_PLACE]))
      .mockResolvedValueOnce(makePlaceDetailsResponse(US_PLACE_DETAILS));

    const r = await queryGooglePlaces({ restaurantName: 'Casa Roberto', zipCode: '78704' });

    expect(r.googlePlacesQueried).toBe(true);
    expect(r.placesCountry).toBe('US');
    expect(r.googlePlacesScore).toBeGreaterThanOrEqual(80);
    expect(r.internalFlags).toContain('google_place_us_confirmed');
  });

  it('non-US address in Place Details → google_place_non_us flag', async () => {
    const caPlace = {
      ...US_PLACE_DETAILS,
      address_components: [
        { long_name: 'Canada', short_name: 'CA', types: ['country', 'political'] },
      ],
    };
    mockFetch
      .mockResolvedValueOnce(makeTextSearchResponse([US_RESTAURANT_PLACE]))
      .mockResolvedValueOnce(makePlaceDetailsResponse(caPlace));

    const r = await queryGooglePlaces({ restaurantName: 'Some Place', zipCode: '78704' });
    expect(r.placesCountry).toBe('CA');
    expect(r.internalFlags).toContain('google_place_non_us');
  });

  it('no match → googlePlacesScore=0 and graceful return', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'ZERO_RESULTS', results: [] }), { status: 200 }),
    );
    const r = await queryGooglePlaces({ restaurantName: 'Unknown Place', zipCode: '78704' });
    expect(r.googlePlacesQueried).toBe(true);
    expect(r.googlePlacesScore).toBe(0);
    expect(r.placesCountry).toBeNull();
  });

  it('API error → googlePlacesQueried=true, score=0, no throw', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    const r = await queryGooglePlaces({ restaurantName: 'Casa Roberto', zipCode: '78704' });
    expect(r.googlePlacesQueried).toBe(true);
    expect(r.googlePlacesScore).toBe(0);
    expect(r.internalFlags).toContain('google_places_api_error');
  });

  it('non-200 HTTP response → graceful degradation', async () => {
    mockFetch.mockResolvedValueOnce(new Response('', { status: 500 }));
    const r = await queryGooglePlaces({ restaurantName: 'Casa Roberto', zipCode: '78704' });
    expect(r.googlePlacesQueried).toBe(true);
    expect(r.internalFlags).toContain('google_places_api_error');
  });
});
