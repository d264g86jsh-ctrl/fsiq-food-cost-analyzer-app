// Google Places Text Search + Place Details.
// Degrades gracefully when GOOGLE_PLACES_API_KEY is missing or the API errors.

export interface GooglePlacesResult {
  googlePlacesScore: number;  // 0–100
  placesCountry: string | null; // ISO 3166-1 alpha-2, e.g. "US"
  placeTypes: string[];
  matchedPlaceId: string | null;
  googlePlacesQueried: boolean;
  internalFlags: string[];
}

const RESTAURANT_PLACE_TYPES = new Set([
  'restaurant', 'food', 'meal_takeaway', 'meal_delivery', 'cafe', 'bakery',
  'bar', 'night_club', 'lodging', 'food', 'establishment',
]);

const TEXT_SEARCH_URL = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const PLACE_DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';

export async function queryGooglePlaces(options: {
  restaurantName: string;
  zipCode: string;
  domain?: string;
  conceptType?: string;
}): Promise<GooglePlacesResult> {
  const noResult: GooglePlacesResult = {
    googlePlacesScore: 0,
    placesCountry: null,
    placeTypes: [],
    matchedPlaceId: null,
    googlePlacesQueried: false,
    internalFlags: [],
  };

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return { ...noResult, internalFlags: ['google_places_key_missing'] };
  }

  try {
    // Build text search query
    const queryParts = [options.restaurantName, options.zipCode];
    if (options.conceptType) queryParts.push(options.conceptType);
    const query = queryParts.join(' ');

    const searchParams = new URLSearchParams({
      query,
      type: 'restaurant',
      region: 'us',
      components: 'country:us',
      key: apiKey,
    });

    const searchRes = await fetch(`${TEXT_SEARCH_URL}?${searchParams}`, {
      signal: AbortSignal.timeout(8_000),
    });

    if (!searchRes.ok) {
      return { ...noResult, googlePlacesQueried: true, internalFlags: ['google_places_api_error'] };
    }

    const searchData = (await searchRes.json()) as TextSearchResponse;

    if (searchData.status !== 'OK' || !searchData.results?.length) {
      return { ...noResult, googlePlacesQueried: true };
    }

    const topResult = searchData.results[0];
    const placeId = topResult.place_id;

    // Place Details for address + place types
    const detailsParams = new URLSearchParams({
      place_id: placeId,
      fields: 'address_components,types,business_status,website,name',
      key: apiKey,
    });

    const detailsRes = await fetch(`${PLACE_DETAILS_URL}?${detailsParams}`, {
      signal: AbortSignal.timeout(8_000),
    });

    if (!detailsRes.ok) {
      // Partial result — we got a match but no details
      const placeTypes = topResult.types ?? [];
      const hasRestaurantType = placeTypes.some((t) => RESTAURANT_PLACE_TYPES.has(t));
      return {
        googlePlacesScore: hasRestaurantType ? 50 : 25,
        placesCountry: null,
        placeTypes,
        matchedPlaceId: placeId,
        googlePlacesQueried: true,
        internalFlags: ['google_places_details_error'],
      };
    }

    const detailsData = (await detailsRes.json()) as PlaceDetailsResponse;

    if (detailsData.status !== 'OK' || !detailsData.result) {
      return { ...noResult, googlePlacesQueried: true };
    }

    const place = detailsData.result;
    const placeTypes = place.types ?? [];
    const country = extractCountry(place.address_components ?? []);
    const hasRestaurantType = placeTypes.some((t) => RESTAURANT_PLACE_TYPES.has(t));
    const flags: string[] = [];

    if (country === 'US') {
      flags.push('google_place_us_confirmed');
    } else if (country) {
      flags.push('google_place_non_us');
    }

    // Score: confirmed restaurant + US address = 100
    let score = 0;
    if (hasRestaurantType) score += 60;
    if (country === 'US') score += 40;
    else if (!country) score += 0; // unknown country — partial credit

    return {
      googlePlacesScore: Math.min(100, score),
      placesCountry: country,
      placeTypes,
      matchedPlaceId: placeId,
      googlePlacesQueried: true,
      internalFlags: flags,
    };
  } catch {
    return { ...noResult, googlePlacesQueried: true, internalFlags: ['google_places_api_error'] };
  }
}

function extractCountry(components: AddressComponent[]): string | null {
  const countryComp = components.find((c) => c.types.includes('country'));
  return countryComp?.short_name ?? null;
}

// ── Minimal API response types ────────────────────────────────────────────────

interface AddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

interface TextSearchResult {
  place_id: string;
  name: string;
  types: string[];
}

interface TextSearchResponse {
  status: string;
  results: TextSearchResult[];
}

interface PlaceDetailsResult {
  name: string;
  types: string[];
  business_status?: string;
  website?: string;
  address_components: AddressComponent[];
}

interface PlaceDetailsResponse {
  status: string;
  result: PlaceDetailsResult;
}
