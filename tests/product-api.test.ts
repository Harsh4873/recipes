import { describe, expect, it, vi } from 'vitest';
import {
  createProductApiClient,
  OPEN_FOOD_FACTS_FIELDS,
  ProductApiError,
} from '../src/product-api';

const FIXED_TIME = Date.parse('2026-08-22T12:00:00.000Z');

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function clientWithFetch(fetchImpl: typeof fetch) {
  return createProductApiClient({
    fetch: fetchImpl,
    now: () => FIXED_TIME,
    sleep: async () => undefined,
    openFoodFactsSearchMinIntervalMs: 0,
    openFoodFactsBarcodeMinIntervalMs: 0,
    usdaMinIntervalMs: 0,
    usdaDemoMinIntervalMs: 0,
  });
}

describe('product API adapters', () => {
  it('submits a legacy Open Food Facts search with focused fields, normalizes it, and caches repeats', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({
      products: [{
        code: '1234567890123',
        product_name: 'Paneer tortilla wrap',
        generic_name: 'Frozen paneer wrap',
        brands: 'Example Kitchen',
        ingredients_text: 'Wheat tortilla, paneer (milk), peppers, spices',
        labels_tags: ['en:vegetarian'],
        ingredients_analysis_tags: ['en:vegetarian'],
        categories_tags: ['en:frozen-foods', 'en:wraps'],
        serving_size: '1 wrap (50 g)',
        serving_quantity: 50,
        serving_quantity_unit: 'g',
        nutriments: {
          'energy-kcal_serving': 160,
          proteins_serving: 9,
          carbohydrates_serving: 20,
          fat_serving: 6,
          'saturated-fat_serving': 3,
          fiber_serving: 4,
          sugars_serving: 2,
          sodium_serving: 0.25,
          sodium_unit: 'g',
        },
      }],
    }));
    const client = clientWithFetch(fetchImpl);

    const first = await client.submitOpenFoodFactsSearch('  Paneer   wrap  ', { limit: 8 });
    const second = await client.submitOpenFoodFactsSearch('paneer wrap', { limit: 8 });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const requestedUrl = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(requestedUrl.pathname).toBe('/cgi/search.pl');
    expect(requestedUrl.searchParams.get('search_terms')).toBe('Paneer wrap');
    expect(requestedUrl.searchParams.get('search_simple')).toBe('1');
    expect(requestedUrl.searchParams.get('action')).toBe('process');
    expect(requestedUrl.searchParams.get('json')).toBe('1');
    expect(requestedUrl.searchParams.get('page_size')).toBe('8');
    expect(requestedUrl.searchParams.get('fields')?.split(',')).toEqual([...OPEN_FOOD_FACTS_FIELDS]);
    expect(second).toBe(first);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      id: 'off:1234567890123',
      name: 'Paneer tortilla wrap',
      brand: 'Example Kitchen',
      barcode: '1234567890123',
      categories: ['frozen foods', 'wraps'],
      serving: { quantity: 50, unit: 'g', grams: 50 },
      nutritionPerServing: {
        calories: 160,
        proteinG: 9,
        carbsG: 20,
        fatG: 6,
        saturatedFatG: 3,
        fiberG: 4,
        sugarG: 2,
        sodiumMg: 250,
      },
      eligibility: { status: 'allowed', evidence: 'provider-label' },
      provenance: { kind: 'open-food-facts', quality: 'complete', coreMacrosComplete: true },
    });
  });

  it('uses the Open Food Facts v3.6 barcode endpoint and blocks animal ingredients despite a vegetarian label', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({
      status: 'success',
      product: {
        code: '0123456789012',
        product_name: 'Vegetable noodle bowl',
        ingredients_text: 'Noodles, vegetables, chicken stock',
        labels_tags: ['en:vegetarian'],
        ingredients_analysis_tags: ['en:vegetarian'],
        categories_tags: ['en:prepared-meals'],
        nutriments: {
          energy_100g: 418.4,
          proteins_100g: 7,
          carbohydrates_100g: 24,
          fat_100g: 3,
          'saturated-fat_100g': 0.5,
          fiber_100g: 2,
          sugars_100g: 4,
          sodium_100g: 0.4,
        },
      },
    }));
    const client = clientWithFetch(fetchImpl);

    const product = await client.lookupOpenFoodFactsBarcode('0123-4567-89012');

    const requestedUrl = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(requestedUrl.pathname).toBe('/api/v3.6/product/0123456789012.json');
    expect(requestedUrl.searchParams.get('fields')).toContain('ingredients_analysis_tags');
    expect(requestedUrl.searchParams.get('fields')).toContain('nutriments');
    expect(product?.nutritionPerServing.calories).toBe(100);
    expect(product?.nutritionPerServing.sodiumMg).toBe(400);
    expect(product?.serving).toEqual({ quantity: 100, unit: 'g', label: '100 g', grams: 100 });
    expect(product?.eligibility.status).toBe('blocked');
    expect(product?.provenance.coreMacrosComplete).toBe(true);
    expect(product?.provenance.warnings).toContain('Serving size is missing, so nutrition is shown per 100 g.');
  });

  it('returns and caches null when Open Food Facts does not know a barcode', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ status: 'failure' }, 404));
    const client = clientWithFetch(fetchImpl);

    await expect(client.lookupOpenFoodFactsBarcode('12345678')).resolves.toBeNull();
    await expect(client.lookupOpenFoodFactsBarcode('12345678')).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('uses a caller-supplied USDA key only for the CORS-safe request and normalizes branded portions', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({
      foods: [{
        fdcId: 987654,
        description: 'Paneer tikka',
        dataType: 'Branded',
        brandOwner: 'Example Foods',
        gtinUpc: '000111222333',
        foodCategory: 'Frozen Dinners & Entrees',
        ingredients: 'Milk, peppers, spices',
        servingSize: 50,
        servingSizeUnit: 'g',
        householdServingFullText: '1 tray (50 g)',
        foodNutrients: [
          { nutrientId: 1008, nutrientName: 'Energy', unitName: 'KCAL', value: 300 },
          { nutrientId: 1003, nutrientName: 'Protein', unitName: 'G', value: 18 },
          { nutrientId: 1005, nutrientName: 'Carbohydrate, by difference', unitName: 'G', value: 6 },
          { nutrientId: 1004, nutrientName: 'Total lipid (fat)', unitName: 'G', value: 22 },
          { nutrientId: 1258, nutrientName: 'Fatty acids, total saturated', unitName: 'G', value: 14 },
          { nutrientId: 1079, nutrientName: 'Fiber, total dietary', unitName: 'G', value: 1 },
          { nutrientId: 2000, nutrientName: 'Sugars, total including NLEA', unitName: 'G', value: 3 },
          { nutrientId: 1093, nutrientName: 'Sodium, Na', unitName: 'MG', value: 600 },
        ],
      }],
    }));
    const client = clientWithFetch(fetchImpl);

    const [product] = await client.submitUsdaSearch('paneer tikka', { apiKey: 'private-example-key', limit: 5 });

    const [input, init] = fetchImpl.mock.calls[0];
    const requestedUrl = new URL(String(input));
    expect(requestedUrl.origin).toBe('https://api.nal.usda.gov');
    expect(requestedUrl.pathname).toBe('/fdc/v1/foods/search');
    expect(requestedUrl.searchParams.get('api_key')).toBe('private-example-key');
    expect(requestedUrl.searchParams.get('query')).toBe('paneer tikka');
    expect(init).toEqual({ method: 'GET', signal: undefined });
    expect(product).toMatchObject({
      id: 'usda:987654',
      name: 'Paneer tikka',
      brand: 'Example Foods',
      barcode: '000111222333',
      categories: ['Frozen Dinners & Entrees', 'Branded'],
      serving: { quantity: 50, unit: 'g', label: '1 tray (50 g)', grams: 50 },
      nutritionPerServing: {
        calories: 150,
        proteinG: 9,
        carbsG: 3,
        fatG: 11,
        saturatedFatG: 7,
        fiberG: 0.5,
        sugarG: 1.5,
        sodiumMg: 300,
      },
      eligibility: { status: 'review' },
      provenance: { kind: 'usda', quality: 'complete', coreMacrosComplete: true },
    });
    expect(JSON.stringify(product)).not.toContain('private-example-key');
    expect(product.provenance.sourceUrl).toBe('https://fdc.nal.usda.gov/fdc-app.html#/food-details/987654/nutrients');
  });

  it('normalizes generic USDA foods per 100 g, including kilojoule energy', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({
      foods: [{
        fdcId: 246810,
        description: 'Broccoli, raw',
        dataType: 'Foundation',
        foodCategory: 'Vegetables and Vegetable Products',
        foodNutrients: [
          { nutrientNumber: '208', nutrientName: 'Energy', unitName: 'KJ', value: 141 },
          { nutrientNumber: '203', nutrientName: 'Protein', unitName: 'G', value: 2.82 },
          { nutrientNumber: '205', nutrientName: 'Carbohydrate, by difference', unitName: 'G', value: 6.64 },
          { nutrientNumber: '204', nutrientName: 'Total lipid (fat)', unitName: 'G', value: 0.37 },
        ],
      }],
    }));
    const client = clientWithFetch(fetchImpl);

    const [product] = await client.submitUsdaSearch('broccoli');

    expect(new URL(String(fetchImpl.mock.calls[0][0])).searchParams.get('api_key')).toBe('DEMO_KEY');
    expect(product.serving).toEqual({ quantity: 100, unit: 'g', label: '100 g', grams: 100 });
    expect(product.nutritionPerServing.calories).toBeCloseTo(33.7, 1);
    expect(product.nutritionPerServing.proteinG).toBe(2.82);
    expect(product.provenance.quality).toBe('partial');
    expect(product.provenance.coreMacrosComplete).toBe(true);
    expect(product.provenance.warnings).toContain('Some nutrition fields are missing and are shown as zero.');
    expect(product.eligibility.status).toBe('review');
  });

  it('marks an Open Food Facts product with a missing core macro as incomplete despite a zero placeholder', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({
      products: [{
        code: '9998887776665',
        product_name: 'Incomplete lentil bowl',
        labels_tags: ['en:vegetarian'],
        nutriments: {
          'energy-kcal_serving': 210,
          proteins_serving: 12,
          carbohydrates_serving: 30,
          fiber_serving: 8,
          sugars_serving: 2,
          sodium_serving: 0.3,
          sodium_unit: 'g',
        },
      }],
    }));
    const [product] = await clientWithFetch(fetchImpl).submitOpenFoodFactsSearch('lentil bowl');

    expect(product.nutritionPerServing.fatG).toBe(0);
    expect(product.provenance.quality).toBe('partial');
    expect(product.provenance.coreMacrosComplete).toBe(false);
    expect(product.provenance.warnings.join(' ')).toMatch(/fat missing.*coverage excludes/i);
  });

  it('marks a USDA product with a missing core macro as incomplete after normalization', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({
      foods: [{
        fdcId: 135790,
        description: 'Incomplete bean bowl',
        dataType: 'Foundation',
        foodNutrients: [
          { nutrientId: 1008, nutrientName: 'Energy', unitName: 'KCAL', value: 180 },
          { nutrientId: 1003, nutrientName: 'Protein', unitName: 'G', value: 10 },
          { nutrientId: 1005, nutrientName: 'Carbohydrate, by difference', unitName: 'G', value: 32 },
        ],
      }],
    }));
    const [product] = await clientWithFetch(fetchImpl).submitUsdaSearch('bean bowl');

    expect(product.nutritionPerServing.fatG).toBe(0);
    expect(product.provenance.quality).toBe('partial');
    expect(product.provenance.coreMacrosComplete).toBe(false);
    expect(product.provenance.warnings.join(' ')).toMatch(/fat missing.*coverage excludes/i);
  });

  it('enforces independent provider request intervals while allowing cache-free test control', async () => {
    let now = 1_000;
    const waits: number[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      return jsonResponse(url.hostname.includes('openfoodfacts') ? { products: [] } : { foods: [] });
    });
    const client = createProductApiClient({
      fetch: fetchImpl,
      now: () => now,
      sleep: async (milliseconds) => {
        waits.push(milliseconds);
        now += milliseconds;
      },
      cacheTtlMs: 0,
      openFoodFactsSearchMinIntervalMs: 6_000,
      usdaDemoMinIntervalMs: 120_000,
    });

    await client.submitOpenFoodFactsSearch('paneer');
    await client.submitOpenFoodFactsSearch('tofu');
    await client.submitUsdaSearch('lentils');
    await client.submitUsdaSearch('chickpeas');

    expect(waits).toEqual([6_000, 120_000]);
  });

  it('paces barcode reads at the documented 15 requests per minute by default', async () => {
    let now = 1_000;
    const waits: number[] = [];
    const client = createProductApiClient({
      fetch: vi.fn<typeof fetch>(async () => jsonResponse({ status: 'failure' }, 404)),
      now: () => now,
      sleep: async (milliseconds) => {
        waits.push(milliseconds);
        now += milliseconds;
      },
      cacheTtlMs: 0,
    });

    await client.lookupOpenFoodFactsBarcode('12345678');
    await client.lookupOpenFoodFactsBarcode('87654321');

    expect(waits).toEqual([4_000]);
  });

  it('provides actionable validation, authorization, and network errors without leaking keys', async () => {
    const untouchedFetch = vi.fn<typeof fetch>();
    const client = clientWithFetch(untouchedFetch);
    await expect(client.submitOpenFoodFactsSearch('   ')).rejects.toMatchObject({
      name: 'ProductApiError',
      code: 'invalid-input',
      message: 'Enter a product name before searching.',
    });
    await expect(client.lookupOpenFoodFactsBarcode('not-a-barcode')).rejects.toBeInstanceOf(ProductApiError);
    expect(untouchedFetch).not.toHaveBeenCalled();

    const rejectedKeyFetch = vi.fn<typeof fetch>(async () => jsonResponse({}, 403));
    const rejectedKeyClient = clientWithFetch(rejectedKeyFetch);
    const error = await rejectedKeyClient.submitUsdaSearch('paneer', { apiKey: 'secret-key' }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: 'unauthorized', provider: 'USDA FoodData Central' });
    expect((error as Error).message).not.toContain('secret-key');

    const offlineFetch = vi.fn<typeof fetch>(async () => { throw new TypeError('offline'); });
    const offlineClient = clientWithFetch(offlineFetch);
    await expect(offlineClient.submitOpenFoodFactsSearch('paneer')).rejects.toMatchObject({
      code: 'network',
      message: 'Could not reach Open Food Facts. Check your connection and try again.',
    });
  });
});
