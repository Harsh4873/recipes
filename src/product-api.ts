import { classifyVegetarian } from './diet';
import type { Nutrition, NutritionQuality, Product, ProductProvenance, Serving } from './model';
import {
  CORE_MACRO_KEYS,
  hasCompleteCoreMacros,
  NUTRITION_KEYS,
  roundNutrition,
  ZERO_NUTRITION,
} from './nutrition';

const OPEN_FOOD_FACTS_BASE_URL = 'https://world.openfoodfacts.org';
const USDA_BASE_URL = 'https://api.nal.usda.gov/fdc/v1';
const USDA_PRODUCT_URL = 'https://fdc.nal.usda.gov/fdc-app.html#/food-details';
const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1_000;
const DEFAULT_OFF_SEARCH_INTERVAL_MS = 6_000;
// Open Food Facts publishes a 15 product-read/minute/IP limit.
const DEFAULT_OFF_BARCODE_INTERVAL_MS = 4_000;
const DEFAULT_USDA_INTERVAL_MS = 4_000;
const DEFAULT_USDA_DEMO_INTERVAL_MS = 2 * 60 * 1_000;

export const USDA_DEMO_KEY = 'DEMO_KEY';

export const OPEN_FOOD_FACTS_FIELDS = Object.freeze([
  'code',
  'product_name',
  'generic_name',
  'brands',
  'ingredients_text',
  'ingredients_text_en',
  'labels_tags',
  'ingredients_analysis_tags',
  'categories_tags',
  'quantity',
  'serving_size',
  'serving_quantity',
  'serving_quantity_unit',
  'nutrition_data_per',
  'nutriments',
] as const);

export type ProductApiProvider = 'Open Food Facts' | 'USDA FoodData Central';
export type ProductApiErrorCode =
  | 'invalid-input'
  | 'network'
  | 'rate-limited'
  | 'unauthorized'
  | 'unavailable'
  | 'bad-response';

export class ProductApiError extends Error {
  readonly provider: ProductApiProvider;
  readonly code: ProductApiErrorCode;

  constructor(
    provider: ProductApiProvider,
    code: ProductApiErrorCode,
    message: string,
    options?: { readonly cause?: unknown },
  ) {
    super(message, options);
    this.name = 'ProductApiError';
    this.provider = provider;
    this.code = code;
  }
}

export interface ProductRequestOptions {
  readonly signal?: AbortSignal;
  readonly forceRefresh?: boolean;
}

export interface ProductSearchOptions extends ProductRequestOptions {
  readonly limit?: number;
}

export interface UsdaSearchOptions extends ProductSearchOptions {
  /** Passed only to the current USDA request. It is never persisted or added to product provenance. */
  readonly apiKey?: string;
}

export interface ProductApiClientOptions {
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly cacheTtlMs?: number;
  readonly openFoodFactsSearchMinIntervalMs?: number;
  readonly openFoodFactsBarcodeMinIntervalMs?: number;
  readonly usdaMinIntervalMs?: number;
  readonly usdaDemoMinIntervalMs?: number;
}

interface CacheEntry {
  readonly expiresAt: number;
  readonly value: unknown;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function asTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === 'string' && entry.trim()) return [entry.trim()];
    const tag = asRecord(entry);
    return asString(tag?.id) ? [asString(tag?.id)!] : [];
  });
}

function uniqueStrings(values: readonly (string | undefined)[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const cleaned = value?.trim();
    if (!cleaned || seen.has(cleaned.toLowerCase())) continue;
    seen.add(cleaned.toLowerCase());
    output.push(cleaned);
  }
  return output;
}

function displayTag(value: string): string {
  return value.replace(/^[a-z]{2}:/i, '').replace(/[_-]+/g, ' ').trim();
}

function safeInterval(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, value!) : fallback;
}

function safeLimit(value: number | undefined, fallback: number, maximum: number): number {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(1, Math.floor(value!))) : fallback;
}

function freezeProduct(product: Product): Product {
  return Object.freeze({
    ...product,
    categories: Object.freeze([...product.categories]),
    aliases: Object.freeze([...product.aliases]),
    serving: Object.freeze({ ...product.serving }),
    nutritionPerServing: Object.freeze({ ...product.nutritionPerServing }),
    provenance: Object.freeze({
      ...product.provenance,
      warnings: Object.freeze([...product.provenance.warnings]),
    }),
    eligibility: Object.freeze({ ...product.eligibility }),
  });
}

function nutritionQuality(values: Partial<Record<keyof Nutrition, number>>): NutritionQuality {
  if (NUTRITION_KEYS.every((key) => values[key] !== undefined)) return 'complete';
  if (Object.values(values).some((value) => value !== undefined)) return 'partial';
  return 'missing';
}

function missingCoreMacroWarning(values: Partial<Record<keyof Nutrition, number>>): string | undefined {
  const labels: Readonly<Record<(typeof CORE_MACRO_KEYS)[number], string>> = {
    calories: 'calories',
    proteinG: 'protein',
    carbsG: 'carbohydrate',
    fatG: 'fat',
  };
  const missing = CORE_MACRO_KEYS.filter((key) => values[key] === undefined);
  return missing.length > 0
    ? `Core macros are incomplete (${missing.map((key) => labels[key]).join(', ')} missing); recipe macro coverage excludes this product.`
    : undefined;
}

function completeNutrition(values: Partial<Record<keyof Nutrition, number>>): Nutrition {
  return roundNutrition(Object.fromEntries(
    NUTRITION_KEYS.map((key) => [key, values[key] ?? ZERO_NUTRITION[key]]),
  ) as unknown as Nutrition, 2);
}

function parseGrams(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const matches = [...value.matchAll(/([\d,.]+)\s*(kg|g|grams?|ounces?|oz)\b/gi)];
  if (matches.length === 0) return undefined;
  const match = matches[matches.length - 1];
  const quantity = asNumber(match[1]?.replace(/,/g, ''));
  const unit = match[2]?.toLowerCase();
  if (quantity === undefined) return undefined;
  if (unit === 'kg') return quantity * 1_000;
  if (unit === 'oz' || unit?.startsWith('ounce')) return quantity * 28.3495;
  return quantity;
}

function openFoodFactsServingGrams(product: UnknownRecord): number | undefined {
  const quantity = asNumber(product.serving_quantity);
  const unit = asString(product.serving_quantity_unit)?.toLowerCase();
  if (quantity !== undefined && (!unit || unit === 'g' || unit.startsWith('gram'))) return quantity;
  if (quantity !== undefined && unit === 'kg') return quantity * 1_000;
  if (quantity !== undefined && (unit === 'oz' || unit?.startsWith('ounce'))) return quantity * 28.3495;
  return parseGrams(asString(product.serving_size));
}

function readOffValue(nutriments: UnknownRecord, key: string, suffix: string): number | undefined {
  return asNumber(nutriments[`${key}${suffix}`]);
}

function readOffEnergy(nutriments: UnknownRecord, suffix: string): number | undefined {
  const calories = readOffValue(nutriments, 'energy-kcal', suffix);
  if (calories !== undefined) return calories;
  const kilojoules = readOffValue(nutriments, 'energy', suffix);
  return kilojoules === undefined ? undefined : kilojoules / 4.184;
}

function readOffSodium(nutriments: UnknownRecord, suffix: string): number | undefined {
  const sodium = readOffValue(nutriments, 'sodium', suffix);
  if (sodium === undefined) return undefined;
  const unit = asString(nutriments.sodium_unit)?.toLowerCase();
  return unit === 'mg' ? sodium : sodium * 1_000;
}

function offNutrition(
  product: UnknownRecord,
): {
  readonly nutrition: Nutrition;
  readonly quality: NutritionQuality;
  readonly coreMacrosComplete: boolean;
  readonly serving: Serving;
  readonly perHundredGramsFallback: boolean;
  readonly coreMacroWarning?: string;
} {
  const nutriments = asRecord(product.nutriments) ?? {};
  const servingGrams = openFoodFactsServingGrams(product);
  const servingSize = asString(product.serving_size);
  const servingCoreCount = ['energy-kcal', 'proteins', 'carbohydrates', 'fat']
    .filter((key) => readOffValue(nutriments, key, '_serving') !== undefined).length;
  const hundredGramCoreCount = ['energy-kcal', 'proteins', 'carbohydrates', 'fat']
    .filter((key) => readOffValue(nutriments, key, '_100g') !== undefined).length;
  const declaredPerServing = asString(product.nutrition_data_per)?.toLowerCase() === 'serving';
  const basis = servingCoreCount > 0
    ? 'serving'
    : hundredGramCoreCount > 0
      ? '100g'
      : declaredPerServing
        ? 'declared-serving'
        : 'declared-100g';
  const perHundredMultiplier = servingGrams === undefined ? 1 : servingGrams / 100;

  const resolve = (reader: (suffix: string) => number | undefined): number | undefined => {
    if (basis === 'serving') {
      const direct = reader('_serving');
      if (direct !== undefined) return direct;
      const perHundred = reader('_100g');
      return perHundred !== undefined && servingGrams !== undefined ? perHundred * perHundredMultiplier : undefined;
    }
    if (basis === '100g') {
      const perHundred = reader('_100g');
      return perHundred === undefined ? undefined : perHundred * perHundredMultiplier;
    }
    const declared = reader('');
    return basis === 'declared-100g' && declared !== undefined ? declared * perHundredMultiplier : declared;
  };

  const values: Partial<Record<keyof Nutrition, number>> = {
    calories: resolve((suffix) => readOffEnergy(nutriments, suffix)),
    proteinG: resolve((suffix) => readOffValue(nutriments, 'proteins', suffix)),
    carbsG: resolve((suffix) => readOffValue(nutriments, 'carbohydrates', suffix)),
    fatG: resolve((suffix) => readOffValue(nutriments, 'fat', suffix)),
    saturatedFatG: resolve((suffix) => readOffValue(nutriments, 'saturated-fat', suffix)),
    fiberG: resolve((suffix) => readOffValue(nutriments, 'fiber', suffix) ?? readOffValue(nutriments, 'fibre', suffix)),
    sugarG: resolve((suffix) => readOffValue(nutriments, 'sugars', suffix)),
    sodiumMg: resolve((suffix) => readOffSodium(nutriments, suffix)),
  };
  const usesHundredGrams = basis === '100g' || basis === 'declared-100g';
  const grams = servingGrams ?? (usesHundredGrams ? 100 : undefined);
  const serving: Serving = grams === undefined
    ? { quantity: 1, unit: 'serving', label: servingSize ?? '1 serving' }
    : { quantity: grams, unit: 'g', label: servingSize ?? `${Math.round(grams * 100) / 100} g`, grams };
  return {
    nutrition: completeNutrition(values),
    quality: nutritionQuality(values),
    coreMacrosComplete: hasCompleteCoreMacros(values),
    serving,
    perHundredGramsFallback: usesHundredGrams && servingGrams === undefined,
    coreMacroWarning: missingCoreMacroWarning(values),
  };
}

function normalizeOpenFoodFactsProduct(
  value: unknown,
  fallbackCode: string | undefined,
  fetchedAt: string,
): Product | undefined {
  const raw = asRecord(value);
  if (!raw) return undefined;
  const code = asString(raw.code) ?? fallbackCode;
  if (!code) return undefined;
  const name = asString(raw.product_name) ?? asString(raw.generic_name) ?? `Product ${code}`;
  const genericName = asString(raw.generic_name);
  const ingredientsText = asString(raw.ingredients_text) ?? asString(raw.ingredients_text_en);
  const labels = asTags(raw.labels_tags);
  const analysisTags = asTags(raw.ingredients_analysis_tags);
  const categoryTags = asTags(raw.categories_tags);
  const categories = uniqueStrings(categoryTags.map(displayTag));
  const normalizedNutrition = offNutrition(raw);
  const warnings = ['Open Food Facts is community-contributed; compare nutrition with the current package label.'];
  if (normalizedNutrition.quality === 'partial') warnings.push('Some nutrition fields are missing and are shown as zero.');
  if (normalizedNutrition.quality === 'missing') warnings.push('Nutrition is missing; enter it from the package label before using macro totals.');
  if (normalizedNutrition.coreMacroWarning) warnings.push(normalizedNutrition.coreMacroWarning);
  if (normalizedNutrition.perHundredGramsFallback) warnings.push('Serving size is missing, so nutrition is shown per 100 g.');
  const provenance: ProductProvenance = {
    kind: 'open-food-facts',
    providerName: 'Open Food Facts',
    externalId: code,
    sourceUrl: `${OPEN_FOOD_FACTS_BASE_URL}/product/${encodeURIComponent(code)}`,
    fetchedAt,
    quality: normalizedNutrition.quality,
    coreMacrosComplete: normalizedNutrition.coreMacrosComplete,
    warnings,
  };
  return freezeProduct({
    id: `off:${code}`,
    name,
    brand: asString(raw.brands),
    barcode: code,
    categories,
    aliases: genericName && genericName.toLowerCase() !== name.toLowerCase() ? [genericName] : [],
    ingredientsText,
    serving: normalizedNutrition.serving,
    nutritionPerServing: normalizedNutrition.nutrition,
    provenance,
    eligibility: classifyVegetarian({
      name,
      ingredientsText,
      labels,
      analysisTags,
      categories: categoryTags,
      now: fetchedAt,
    }),
    createdAt: fetchedAt,
    updatedAt: fetchedAt,
  });
}

interface UsdaNutrient {
  readonly id?: number;
  readonly number?: string;
  readonly name: string;
  readonly unit: string;
  readonly value: number;
}

function usdaNutrients(food: UnknownRecord): UsdaNutrient[] {
  const values = Array.isArray(food.foodNutrients) ? food.foodNutrients : [];
  return values.flatMap((entry) => {
    const raw = asRecord(entry);
    if (!raw) return [];
    const nested = asRecord(raw.nutrient);
    const value = asNumber(raw.value) ?? asNumber(raw.amount);
    const name = asString(raw.nutrientName) ?? asString(nested?.name);
    if (value === undefined || !name) return [];
    return [{
      id: asNumber(raw.nutrientId) ?? asNumber(nested?.id),
      number: asString(raw.nutrientNumber) ?? asString(nested?.number),
      name,
      unit: (asString(raw.unitName) ?? asString(nested?.unitName) ?? '').toUpperCase(),
      value,
    }];
  });
}

function findUsdaNutrient(
  nutrients: readonly UsdaNutrient[],
  ids: readonly number[],
  numbers: readonly string[],
  namePatterns: readonly RegExp[],
): UsdaNutrient | undefined {
  for (const id of ids) {
    const match = nutrients.find((nutrient) => nutrient.id === id);
    if (match) return match;
  }
  for (const number of numbers) {
    const match = nutrients.find((nutrient) => nutrient.number === number);
    if (match) return match;
  }
  return nutrients.find((nutrient) => namePatterns.some((pattern) => pattern.test(nutrient.name)));
}

function gramsFromUsdaNutrient(nutrient: UsdaNutrient | undefined): number | undefined {
  if (!nutrient) return undefined;
  if (nutrient.unit === 'G') return nutrient.value;
  if (nutrient.unit === 'MG') return nutrient.value / 1_000;
  if (nutrient.unit === 'UG' || nutrient.unit === 'µG') return nutrient.value / 1_000_000;
  return nutrient.value;
}

function milligramsFromUsdaNutrient(nutrient: UsdaNutrient | undefined): number | undefined {
  if (!nutrient) return undefined;
  if (nutrient.unit === 'G') return nutrient.value * 1_000;
  if (nutrient.unit === 'UG' || nutrient.unit === 'µG') return nutrient.value / 1_000;
  return nutrient.value;
}

function caloriesFromUsdaNutrients(nutrients: readonly UsdaNutrient[]): number | undefined {
  const candidates = nutrients.filter((nutrient) => nutrient.id === 1008 || nutrient.id === 2047 || nutrient.id === 2048
    || nutrient.number === '208' || /^energy$/i.test(nutrient.name));
  const calories = candidates.find((nutrient) => nutrient.unit === 'KCAL');
  if (calories) return calories.value;
  const kilojoules = candidates.find((nutrient) => nutrient.unit === 'KJ');
  return kilojoules ? kilojoules.value / 4.184 : undefined;
}

function usdaServing(food: UnknownRecord): { readonly serving: Serving; readonly multiplier: number; readonly warning?: string } {
  const dataType = asString(food.dataType)?.toLowerCase();
  const branded = dataType === 'branded';
  const quantity = asNumber(food.servingSize);
  const unit = asString(food.servingSizeUnit)?.toLowerCase();
  const household = asString(food.householdServingFullText);
  const grams = branded
    ? quantity !== undefined && (unit === 'g' || unit?.startsWith('gram'))
      ? quantity
      : parseGrams(household)
    : undefined;
  if (grams !== undefined && grams > 0) {
    return {
      serving: {
        quantity: grams,
        unit: 'g',
        label: household ?? `${Math.round(grams * 100) / 100} g`,
        grams,
      },
      multiplier: grams / 100,
    };
  }
  const volumeWarning = branded && quantity !== undefined
    ? 'The package serving could not be converted safely to grams; nutrition is shown per 100 g.'
    : undefined;
  return {
    serving: { quantity: 100, unit: 'g', label: '100 g', grams: 100 },
    multiplier: 1,
    warning: volumeWarning,
  };
}

function normalizeUsdaProduct(value: unknown, fetchedAt: string): Product | undefined {
  const raw = asRecord(value);
  const fdcId = asNumber(raw?.fdcId);
  const name = asString(raw?.description);
  if (!raw || fdcId === undefined || !name) return undefined;
  const nutrients = usdaNutrients(raw);
  const serving = usdaServing(raw);
  const valuesPerHundredGrams: Partial<Record<keyof Nutrition, number>> = {
    calories: caloriesFromUsdaNutrients(nutrients),
    proteinG: gramsFromUsdaNutrient(findUsdaNutrient(nutrients, [1003], ['203'], [/^protein$/i])),
    carbsG: gramsFromUsdaNutrient(findUsdaNutrient(nutrients, [1005], ['205'], [/^carbohydrate(?:, by difference)?$/i])),
    fatG: gramsFromUsdaNutrient(findUsdaNutrient(nutrients, [1004], ['204'], [/^total lipid \(fat\)$/i, /^total fat$/i])),
    saturatedFatG: gramsFromUsdaNutrient(findUsdaNutrient(nutrients, [1258], ['606'], [/fatty acids, total saturated/i, /saturated fat/i])),
    fiberG: gramsFromUsdaNutrient(findUsdaNutrient(nutrients, [1079], ['291'], [/fiber, total dietary/i, /^dietary fiber$/i])),
    sugarG: gramsFromUsdaNutrient(findUsdaNutrient(nutrients, [2000, 1063], ['269'], [/sugars, total/i, /^total sugars$/i])),
    sodiumMg: milligramsFromUsdaNutrient(findUsdaNutrient(nutrients, [1093], ['307'], [/^sodium,? na$/i, /^sodium$/i])),
  };
  const scaledValues = Object.fromEntries(Object.entries(valuesPerHundredGrams).map(([key, value]) => [
    key,
    value === undefined ? undefined : value * serving.multiplier,
  ])) as Partial<Record<keyof Nutrition, number>>;
  const quality = nutritionQuality(scaledValues);
  const coreMacrosComplete = hasCompleteCoreMacros(scaledValues);
  const warnings = ['USDA does not verify vegetarian eligibility; review the name and ingredient label before approval.'];
  if (quality === 'partial') warnings.push('Some nutrition fields are missing and are shown as zero.');
  if (quality === 'missing') warnings.push('Nutrition is missing; enter it from a current label before using macro totals.');
  const coreWarning = missingCoreMacroWarning(scaledValues);
  if (coreWarning) warnings.push(coreWarning);
  if (serving.warning) warnings.push(serving.warning);
  const ingredientsText = asString(raw.ingredients);
  const dataType = asString(raw.dataType);
  const foodCategory = asString(raw.foodCategory);
  const categories = uniqueStrings([foodCategory, dataType]);
  const brand = asString(raw.brandOwner) ?? asString(raw.brandName);
  const barcode = asString(raw.gtinUpc);
  const additionalDescriptions = asString(raw.additionalDescriptions)?.split(';').map((entry) => entry.trim());
  const externalId = String(fdcId);
  const provenance: ProductProvenance = {
    kind: 'usda',
    providerName: 'USDA FoodData Central',
    externalId,
    sourceUrl: `${USDA_PRODUCT_URL}/${encodeURIComponent(externalId)}/nutrients`,
    fetchedAt,
    quality,
    coreMacrosComplete,
    warnings,
  };
  return freezeProduct({
    id: `usda:${externalId}`,
    name,
    brand,
    barcode,
    categories,
    aliases: uniqueStrings(additionalDescriptions ?? []),
    ingredientsText,
    serving: serving.serving,
    nutritionPerServing: completeNutrition(scaledValues),
    provenance,
    eligibility: classifyVegetarian({ name, ingredientsText, categories, now: fetchedAt }),
    createdAt: fetchedAt,
    updatedAt: fetchedAt,
  });
}

function validateQuery(query: string, provider: ProductApiProvider): string {
  const normalized = typeof query === 'string' ? query.trim().replace(/\s+/g, ' ') : '';
  if (!normalized) {
    throw new ProductApiError(provider, 'invalid-input', 'Enter a product name before searching.');
  }
  if (normalized.length > 120) {
    throw new ProductApiError(provider, 'invalid-input', 'Keep the product search under 120 characters.');
  }
  return normalized;
}

function validateBarcode(barcode: string): string {
  const normalized = typeof barcode === 'string' ? barcode.replace(/[\s-]/g, '') : '';
  if (!/^\d{8,14}$/.test(normalized)) {
    throw new ProductApiError('Open Food Facts', 'invalid-input', 'Enter an 8–14 digit barcode.');
  }
  return normalized;
}

export class ProductApiClient {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly cacheTtlMs: number;
  private readonly offSearchIntervalMs: number;
  private readonly offBarcodeIntervalMs: number;
  private readonly usdaIntervalMs: number;
  private readonly usdaDemoIntervalMs: number;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly lastRequestAt = new Map<string, number>();
  private readonly laneTails = new Map<string, Promise<void>>();

  constructor(options: ProductApiClientOptions = {}) {
    const globalFetch = globalThis.fetch?.bind(globalThis);
    if (!options.fetch && !globalFetch) throw new Error('This browser does not support product lookup requests.');
    this.fetchImpl = options.fetch ?? globalFetch!;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.cacheTtlMs = safeInterval(options.cacheTtlMs, DEFAULT_CACHE_TTL_MS);
    this.offSearchIntervalMs = safeInterval(options.openFoodFactsSearchMinIntervalMs, DEFAULT_OFF_SEARCH_INTERVAL_MS);
    this.offBarcodeIntervalMs = safeInterval(options.openFoodFactsBarcodeMinIntervalMs, DEFAULT_OFF_BARCODE_INTERVAL_MS);
    this.usdaIntervalMs = safeInterval(options.usdaMinIntervalMs, DEFAULT_USDA_INTERVAL_MS);
    this.usdaDemoIntervalMs = safeInterval(options.usdaDemoMinIntervalMs, DEFAULT_USDA_DEMO_INTERVAL_MS);
  }

  clearCache(): void {
    this.cache.clear();
  }

  async submitOpenFoodFactsSearch(query: string, options: ProductSearchOptions = {}): Promise<Product[]> {
    const normalizedQuery = validateQuery(query, 'Open Food Facts');
    const limit = safeLimit(options.limit, 12, 24);
    const cacheKey = `off:search:${normalizedQuery.toLowerCase()}:${limit}`;
    const cached = options.forceRefresh ? undefined : this.readCache<Product[]>(cacheKey);
    if (cached !== undefined) return cached;

    const url = new URL('/cgi/search.pl', OPEN_FOOD_FACTS_BASE_URL);
    url.searchParams.set('search_terms', normalizedQuery);
    url.searchParams.set('search_simple', '1');
    url.searchParams.set('action', 'process');
    url.searchParams.set('json', '1');
    url.searchParams.set('page_size', String(limit));
    url.searchParams.set('fields', OPEN_FOOD_FACTS_FIELDS.join(','));
    const payload = await this.requestJson('Open Food Facts', 'off-search', this.offSearchIntervalMs, url, options.signal);
    const products = (Array.isArray(asRecord(payload)?.products) ? asRecord(payload)!.products as unknown[] : [])
      .map((product) => normalizeOpenFoodFactsProduct(product, undefined, this.isoNow()))
      .filter((product): product is Product => product !== undefined)
      .slice(0, limit);
    this.writeCache(cacheKey, products);
    return products;
  }

  async lookupOpenFoodFactsBarcode(barcode: string, options: ProductRequestOptions = {}): Promise<Product | null> {
    const normalizedBarcode = validateBarcode(barcode);
    const cacheKey = `off:barcode:${normalizedBarcode}`;
    const cached = options.forceRefresh ? undefined : this.readCache<Product | null>(cacheKey);
    if (cached !== undefined) return cached;

    const url = new URL(`/api/v3.6/product/${encodeURIComponent(normalizedBarcode)}.json`, OPEN_FOOD_FACTS_BASE_URL);
    url.searchParams.set('fields', OPEN_FOOD_FACTS_FIELDS.join(','));
    const payload = await this.requestJson(
      'Open Food Facts',
      'off-barcode',
      this.offBarcodeIntervalMs,
      url,
      options.signal,
      true,
    );
    if (payload === null) {
      this.writeCache(cacheKey, null);
      return null;
    }
    const product = normalizeOpenFoodFactsProduct(asRecord(payload)?.product, normalizedBarcode, this.isoNow()) ?? null;
    this.writeCache(cacheKey, product);
    return product;
  }

  async submitUsdaSearch(query: string, options: UsdaSearchOptions = {}): Promise<Product[]> {
    const normalizedQuery = validateQuery(query, 'USDA FoodData Central');
    const limit = safeLimit(options.limit, 12, 50);
    const apiKey = options.apiKey?.trim() || USDA_DEMO_KEY;
    const cacheKey = `usda:search:${normalizedQuery.toLowerCase()}:${limit}`;
    const cached = options.forceRefresh ? undefined : this.readCache<Product[]>(cacheKey);
    if (cached !== undefined) return cached;

    const url = new URL(`${USDA_BASE_URL}/foods/search`);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('query', normalizedQuery);
    url.searchParams.set('pageSize', String(limit));
    // A plain GET with no custom headers stays a CORS-safelisted browser request.
    const interval = apiKey === USDA_DEMO_KEY ? this.usdaDemoIntervalMs : this.usdaIntervalMs;
    const payload = await this.requestJson('USDA FoodData Central', 'usda-search', interval, url, options.signal);
    const products = (Array.isArray(asRecord(payload)?.foods) ? asRecord(payload)!.foods as unknown[] : [])
      .map((food) => normalizeUsdaProduct(food, this.isoNow()))
      .filter((product): product is Product => product !== undefined)
      .slice(0, limit);
    this.writeCache(cacheKey, products);
    return products;
  }

  private isoNow(): string {
    const timestamp = this.now();
    return new Date(Number.isFinite(timestamp) ? timestamp : Date.now()).toISOString();
  }

  private readCache<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  private writeCache(key: string, value: unknown): void {
    if (this.cacheTtlMs <= 0) return;
    this.cache.set(key, { expiresAt: this.now() + this.cacheTtlMs, value });
  }

  private async withRateLimit<T>(lane: string, intervalMs: number, action: () => Promise<T>): Promise<T> {
    const previousTail = this.laneTails.get(lane) ?? Promise.resolve();
    let release!: () => void;
    const currentLock = new Promise<void>((resolve) => { release = resolve; });
    const currentTail = previousTail.catch(() => undefined).then(() => currentLock);
    this.laneTails.set(lane, currentTail);
    await previousTail.catch(() => undefined);
    try {
      const lastRequest = this.lastRequestAt.get(lane);
      if (lastRequest !== undefined) {
        const remaining = intervalMs - (this.now() - lastRequest);
        if (remaining > 0) await this.sleep(remaining);
      }
      this.lastRequestAt.set(lane, this.now());
      return await action();
    } finally {
      release();
      if (this.laneTails.get(lane) === currentTail) this.laneTails.delete(lane);
    }
  }

  private async requestJson(
    provider: ProductApiProvider,
    lane: string,
    intervalMs: number,
    url: URL,
    signal: AbortSignal | undefined,
    allowNotFound = false,
  ): Promise<unknown | null> {
    return this.withRateLimit(lane, intervalMs, async () => {
      let response: Response;
      try {
        response = await this.fetchImpl(url, { method: 'GET', signal });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        throw new ProductApiError(provider, 'network', `Could not reach ${provider}. Check your connection and try again.`, { cause: error });
      }
      if (allowNotFound && response.status === 404) return null;
      if (!response.ok) {
        if (response.status === 429) {
          throw new ProductApiError(provider, 'rate-limited', `${provider} is receiving too many requests. Wait a moment and try again.`);
        }
        if (response.status === 401 || response.status === 403) {
          const message = provider === 'USDA FoodData Central'
            ? 'USDA rejected this API key. Try DEMO_KEY or add a valid FoodData Central key.'
            : 'Open Food Facts rejected this request. Please try again.';
          throw new ProductApiError(provider, 'unauthorized', message);
        }
        throw new ProductApiError(provider, 'unavailable', `${provider} is temporarily unavailable. Please try again later.`);
      }
      try {
        return await response.json() as unknown;
      } catch (error) {
        throw new ProductApiError(provider, 'bad-response', `${provider} returned an unexpected response. Please try again.`, { cause: error });
      }
    });
  }
}

export function createProductApiClient(options: ProductApiClientOptions = {}): ProductApiClient {
  return new ProductApiClient(options);
}

const defaultProductApiClient = createProductApiClient();

export function submitOpenFoodFactsSearch(query: string, options?: ProductSearchOptions): Promise<Product[]> {
  return defaultProductApiClient.submitOpenFoodFactsSearch(query, options);
}

export function lookupOpenFoodFactsBarcode(barcode: string, options?: ProductRequestOptions): Promise<Product | null> {
  return defaultProductApiClient.lookupOpenFoodFactsBarcode(barcode, options);
}

export function submitUsdaSearch(query: string, options?: UsdaSearchOptions): Promise<Product[]> {
  return defaultProductApiClient.submitUsdaSearch(query, options);
}
