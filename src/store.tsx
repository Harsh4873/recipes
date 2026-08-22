import { useCallback, useEffect, useRef, useState } from 'react';
import {
  containsBlockedDietTerm,
  containsBlockedDietTermOutsideCertifiedAnalogs,
  productIsAllowed,
} from './diet';
import {
  createClientId,
  createEmptyState,
  createId,
  type Nutrition,
  type Product,
  type ProductProvenance,
  type ProductSnapshot,
  type Recipe,
  type RecipeIngredient,
  type RecipesSettings,
  type RecipesState,
  type Serving,
  type ShoppingItem,
  type VegetarianEligibility,
} from './model';
import {
  nutritionApproximatelyEquals,
  recipeNutrition,
  roundNutrition,
  scaleNutrition,
} from './nutrition';

export const RECIPES_LOCAL_STORAGE_KEY = 'recipes-state-v1';
export const RECIPES_CLIENT_ID_KEY = 'recipes-client-id-v1';
export const RECIPES_STORAGE_FORMAT = 'recipes-v1' as const;
export const RECIPES_DATABASE_NAME = 'recipes-local-v1';
export const RECIPES_DATABASE_VERSION = 1;
export const RECIPES_OBJECT_STORE = 'recipes-state';
export const RECIPES_OBJECT_KEY = 'current';
const RECOVERY_PREFIX = 'recipes-recovery-v1-';

export interface RecipesStorageEnvelope {
  readonly storageFormat: typeof RECIPES_STORAGE_FORMAT;
  readonly savedAtMs: number;
  readonly state: RecipesState;
}

export type StorageMode = 'indexeddb' | 'localStorage';

export type RecipesMutationType =
  | 'pantry'
  | 'recipes'
  | 'shopping'
  | 'settings'
  | 'replace'
  | 'import'
  | 'reset';

export interface RecipesMutation {
  readonly type: RecipesMutationType;
  readonly state: RecipesState;
}

export type RecipesMutationListener = (mutation: RecipesMutation) => void;
export type NewShoppingItem = Omit<ShoppingItem, 'id' | 'createdAt' | 'updatedAt' | 'checked'> & {
  readonly id?: string;
  readonly checked?: boolean;
};

export interface RecipesStore {
  readonly state: RecipesState | null;
  readonly hydrated: boolean;
  readonly hasStoredState: boolean;
  readonly storageMode: StorageMode;
  readonly storageWarning?: string;
  readonly addPantryProduct: (product: Product) => Product | undefined;
  readonly addProduct: (product: Product) => Product | undefined;
  readonly upsertProduct: (product: Product) => Product | undefined;
  readonly updateProduct: (id: string, patch: Partial<Omit<Product, 'id' | 'createdAt' | 'updatedAt'>>) => Product | undefined;
  readonly deleteProduct: (id: string) => void;
  readonly removeProduct: (id: string) => void;
  readonly saveRecipe: (recipe: Recipe) => Recipe | undefined;
  readonly addRecipe: (recipe: Recipe) => Recipe | undefined;
  readonly updateRecipe: (id: string, patch: Partial<Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'>>) => Recipe | undefined;
  readonly deleteRecipe: (id: string) => void;
  readonly removeRecipe: (id: string) => void;
  readonly addShoppingItem: (item: string | NewShoppingItem) => ShoppingItem | undefined;
  readonly addShoppingItems: (items: readonly (string | NewShoppingItem)[]) => ShoppingItem[];
  readonly updateShoppingItem: (id: string, patch: Partial<Pick<ShoppingItem, 'name' | 'amountLabel' | 'recipeId' | 'checked'>>) => ShoppingItem | undefined;
  readonly toggleShoppingItem: (id: string) => void;
  readonly deleteShoppingItem: (id: string) => void;
  readonly removeShoppingItem: (id: string) => void;
  readonly clearCheckedShopping: () => void;
  readonly updateSettings: (patch: Partial<Omit<RecipesSettings, 'updatedAt' | 'eggsAllowed'>>) => void;
  readonly replaceState: (state: RecipesState) => void;
  readonly importState: (value: string | unknown) => RecipesState;
  readonly importData: (value: string | unknown) => RecipesState;
  readonly exportState: () => string;
  readonly exportData: () => string;
  readonly resetState: () => void;
  readonly applySyncedState: (state: RecipesState) => void;
  readonly subscribeMutations: (listener: RecipesMutationListener) => () => void;
  readonly flushLocalWrites: () => Promise<void>;
  readonly clearLocalData: () => Promise<void>;
}

function record(value: unknown, field = 'value'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) {
    throw new Error(`${field} must be text.`);
  }
  return value;
}

function optionalText(value: unknown, field: string): string | undefined {
  return value === undefined ? undefined : text(value, field);
}

function optionalHttpsUrl(value: unknown, field: string): string | undefined {
  const result = optionalText(value, field);
  if (result === undefined) return undefined;
  let url: URL;
  try {
    url = new URL(result);
  } catch {
    throw new Error(`${field} must be a valid URL.`);
  }
  if (url.protocol !== 'https:') throw new Error(`${field} must use HTTPS.`);
  return url.toString();
}

function textList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${field} must be a text list.`);
  }
  return [...value] as string[];
}

function finiteNumber(value: unknown, field: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) {
    throw new Error(`${field} must be at least ${minimum}.`);
  }
  return value;
}

function positiveInteger(value: unknown, field: string): number {
  const result = finiteNumber(value, field, 1);
  if (!Number.isSafeInteger(result)) throw new Error(`${field} must be a whole number.`);
  return result;
}

function booleanValue(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${field} must be true or false.`);
  return value;
}

function isoTimestamp(value: unknown, field: string): string {
  const result = text(value, field);
  if (!Number.isFinite(Date.parse(result))) throw new Error(`${field} must be a timestamp.`);
  return result;
}

function entityId(value: unknown, field = 'id'): string {
  const id = text(value, field);
  if (id.length > 240 || id === '.' || id === '..' || id.includes('/') || /^__.*__$/.test(id)) {
    throw new Error(`${field} is invalid.`);
  }
  return id;
}

const NUTRITION_KEYS = [
  'calories',
  'proteinG',
  'carbsG',
  'fatG',
  'saturatedFatG',
  'fiberG',
  'sugarG',
  'sodiumMg',
] as const;

function parseNutrition(value: unknown, field = 'nutrition'): Nutrition {
  const raw = record(value, field);
  return Object.fromEntries(
    NUTRITION_KEYS.map((key) => [key, finiteNumber(raw[key], `${field}.${key}`)]),
  ) as unknown as Nutrition;
}

function parseServing(value: unknown, field = 'serving'): Serving {
  const raw = record(value, field);
  return {
    quantity: finiteNumber(raw.quantity, `${field}.quantity`, Number.MIN_VALUE),
    unit: text(raw.unit, `${field}.unit`),
    label: text(raw.label, `${field}.label`),
    ...(raw.grams === undefined ? {} : { grams: finiteNumber(raw.grams, `${field}.grams`, Number.MIN_VALUE) }),
  };
}

function parseProvenance(value: unknown, field = 'provenance'): ProductProvenance {
  const raw = record(value, field);
  const kinds: ProductProvenance['kind'][] = ['starter', 'open-food-facts', 'usda', 'manual'];
  const qualities: ProductProvenance['quality'][] = ['verified', 'complete', 'partial', 'missing'];
  const kind = text(raw.kind, `${field}.kind`) as ProductProvenance['kind'];
  const quality = text(raw.quality, `${field}.quality`) as ProductProvenance['quality'];
  if (!kinds.includes(kind)) throw new Error(`${field}.kind is unsupported.`);
  if (!qualities.includes(quality)) throw new Error(`${field}.quality is unsupported.`);
  return {
    kind,
    providerName: text(raw.providerName, `${field}.providerName`),
    ...(raw.externalId === undefined ? {} : { externalId: text(raw.externalId, `${field}.externalId`) }),
    ...(raw.sourceUrl === undefined ? {} : { sourceUrl: optionalHttpsUrl(raw.sourceUrl, `${field}.sourceUrl`) }),
    ...(raw.fetchedAt === undefined ? {} : { fetchedAt: isoTimestamp(raw.fetchedAt, `${field}.fetchedAt`) }),
    quality,
    coreMacrosComplete: booleanValue(raw.coreMacrosComplete, `${field}.coreMacrosComplete`),
    warnings: textList(raw.warnings, `${field}.warnings`),
  };
}

function parseEligibility(value: unknown, field = 'eligibility'): VegetarianEligibility {
  const raw = record(value, field);
  const statuses: VegetarianEligibility['status'][] = ['allowed', 'review', 'blocked'];
  const evidenceKinds: VegetarianEligibility['evidence'][] = [
    'curated',
    'provider-label',
    'ingredient-check',
    'owner-approved',
    'unknown',
  ];
  const status = text(raw.status, `${field}.status`) as VegetarianEligibility['status'];
  const evidence = text(raw.evidence, `${field}.evidence`) as VegetarianEligibility['evidence'];
  if (!statuses.includes(status) || !evidenceKinds.includes(evidence)) {
    throw new Error(`${field} is unsupported.`);
  }
  return {
    status,
    evidence,
    reason: text(raw.reason, `${field}.reason`),
    checkedAt: isoTimestamp(raw.checkedAt, `${field}.checkedAt`),
  };
}

export function parseProduct(value: unknown, field = 'product'): Product {
  const raw = record(value, field);
  const product: Product = {
    id: entityId(raw.id, `${field}.id`),
    name: text(raw.name, `${field}.name`),
    ...(raw.brand === undefined ? {} : { brand: text(raw.brand, `${field}.brand`) }),
    ...(raw.barcode === undefined ? {} : { barcode: text(raw.barcode, `${field}.barcode`) }),
    categories: textList(raw.categories, `${field}.categories`),
    aliases: textList(raw.aliases, `${field}.aliases`),
    ...(raw.ingredientsText === undefined ? {} : { ingredientsText: text(raw.ingredientsText, `${field}.ingredientsText`, true) }),
    serving: parseServing(raw.serving, `${field}.serving`),
    nutritionPerServing: parseNutrition(raw.nutritionPerServing, `${field}.nutritionPerServing`),
    provenance: parseProvenance(raw.provenance, `${field}.provenance`),
    eligibility: parseEligibility(raw.eligibility, `${field}.eligibility`),
    createdAt: isoTimestamp(raw.createdAt, `${field}.createdAt`),
    updatedAt: isoTimestamp(raw.updatedAt, `${field}.updatedAt`),
  };
  if (product.eligibility.status === 'allowed' && !productIsAllowed(product)) {
    throw new Error(`${field} contains a blocked animal-product term.`);
  }
  if (!product.provenance.coreMacrosComplete) {
    throw new Error(`${field} is missing one or more core macros; enter them from the current package label.`);
  }
  return product;
}

function parseSnapshot(value: unknown, field: string): ProductSnapshot {
  const raw = record(value, field);
  const servings = finiteNumber(raw.servings, `${field}.servings`, Number.MIN_VALUE);
  const nutritionPerServing = parseNutrition(raw.nutritionPerServing, `${field}.nutritionPerServing`);
  const claimedNutrition = parseNutrition(raw.nutrition, `${field}.nutrition`);
  const calculatedNutrition = roundNutrition(scaleNutrition(nutritionPerServing, servings), 2);
  if (!nutritionApproximatelyEquals(claimedNutrition, calculatedNutrition, 0.011)) {
    throw new Error(`${field}.nutrition does not match its serving snapshot.`);
  }
  return {
    productId: entityId(raw.productId, `${field}.productId`),
    name: text(raw.name, `${field}.name`),
    ...(raw.brand === undefined ? {} : { brand: text(raw.brand, `${field}.brand`) }),
    serving: parseServing(raw.serving, `${field}.serving`),
    servings,
    nutritionPerServing,
    nutrition: calculatedNutrition,
    provenance: parseProvenance(raw.provenance, `${field}.provenance`),
    eligibility: parseEligibility(raw.eligibility, `${field}.eligibility`),
  };
}

function parseIngredient(value: unknown, field: string): RecipeIngredient {
  const raw = record(value, field);
  return {
    id: entityId(raw.id, `${field}.id`),
    ...(raw.productId === undefined ? {} : { productId: entityId(raw.productId, `${field}.productId`) }),
    name: text(raw.name, `${field}.name`),
    amountLabel: text(raw.amountLabel, `${field}.amountLabel`),
    optional: booleanValue(raw.optional, `${field}.optional`),
    ...(raw.snapshot === undefined ? {} : { snapshot: parseSnapshot(raw.snapshot, `${field}.snapshot`) }),
  };
}

export function parseRecipe(value: unknown, field = 'recipe'): Recipe {
  const raw = record(value, field);
  const origins: Recipe['origin'][] = ['starter', 'smart', 'firebase-ai', 'manual'];
  const origin = text(raw.origin, `${field}.origin`) as Recipe['origin'];
  if (!origins.includes(origin)) throw new Error(`${field}.origin is unsupported.`);
  if (raw.dietStatus !== 'allowed') throw new Error(`${field} is not an allowed vegetarian recipe.`);
  if (!Array.isArray(raw.ingredients) || !Array.isArray(raw.steps)) {
    throw new Error(`${field} must include ingredient and step lists.`);
  }
  const claimedMacroCoverage = finiteNumber(raw.macroCoverage, `${field}.macroCoverage`);
  if (claimedMacroCoverage > 1) throw new Error(`${field}.macroCoverage cannot exceed 1.`);
  const servings = finiteNumber(raw.servings, `${field}.servings`, Number.MIN_VALUE);
  const ingredients = raw.ingredients.map((item, index) => parseIngredient(item, `${field}.ingredients[${index}]`));
  const claimedNutrition = parseNutrition(raw.nutritionPerServing, `${field}.nutritionPerServing`);
  const calculated = recipeNutrition(ingredients, servings);
  if (!nutritionApproximatelyEquals(claimedNutrition, calculated.nutritionPerServing)) {
    throw new Error(`${field}.nutritionPerServing does not match its product snapshots.`);
  }
  if (Math.abs(claimedMacroCoverage - calculated.macroCoverage) > 0.001) {
    throw new Error(`${field}.macroCoverage does not match its product snapshots.`);
  }
  const recipe: Recipe = {
    id: entityId(raw.id, `${field}.id`),
    title: text(raw.title, `${field}.title`),
    description: text(raw.description, `${field}.description`, true),
    cuisine: text(raw.cuisine, `${field}.cuisine`),
    tags: textList(raw.tags, `${field}.tags`),
    prepMinutes: finiteNumber(raw.prepMinutes, `${field}.prepMinutes`),
    cookMinutes: finiteNumber(raw.cookMinutes, `${field}.cookMinutes`),
    servings,
    ingredients,
    steps: textList(raw.steps, `${field}.steps`),
    nutritionPerServing: calculated.nutritionPerServing,
    macroCoverage: calculated.macroCoverage,
    dietStatus: 'allowed',
    origin,
    createdAt: isoTimestamp(raw.createdAt, `${field}.createdAt`),
    updatedAt: isoTimestamp(raw.updatedAt, `${field}.updatedAt`),
  };
  if (recipe.ingredients.some((ingredient) => (
    ingredient.snapshot && ingredient.snapshot.eligibility.status !== 'allowed'
  ))) {
    throw new Error(`${field} contains an unapproved product snapshot.`);
  }
  if (recipe.ingredients.some((ingredient) => ingredient.snapshot && (
    ingredient.productId !== ingredient.snapshot.productId
    || ingredient.name !== ingredient.snapshot.name
  ))) {
    throw new Error(`${field} has an ingredient that does not match its product snapshot.`);
  }
  if (origin !== 'manual' && recipe.ingredients.some((ingredient) => !ingredient.snapshot)) {
    throw new Error(`${field} has a generated ingredient without a product snapshot.`);
  }
  const certifiedAnalogSnapshots = recipe.ingredients.flatMap((ingredient) => (
    ingredient.snapshot ? [{ name: ingredient.snapshot.name, eligibility: ingredient.snapshot.eligibility }] : []
  ));
  if (containsBlockedDietTermOutsideCertifiedAnalogs([
    recipe.title,
    recipe.description,
    recipe.cuisine,
    ...recipe.tags,
    ...recipe.ingredients.map((ingredient) => ingredient.name),
    ...recipe.ingredients.map((ingredient) => ingredient.amountLabel),
    ...recipe.ingredients.flatMap((ingredient) => ingredient.snapshot ? [ingredient.snapshot.name] : []),
    ...recipe.steps,
  ].join(' '), certifiedAnalogSnapshots)) {
    throw new Error(`${field} crosses the vegetarian boundary.`);
  }
  return recipe;
}

function parseShoppingItem(value: unknown, field: string): ShoppingItem {
  const raw = record(value, field);
  const item: ShoppingItem = {
    id: entityId(raw.id, `${field}.id`),
    name: text(raw.name, `${field}.name`),
    ...(raw.amountLabel === undefined ? {} : { amountLabel: text(raw.amountLabel, `${field}.amountLabel`) }),
    ...(raw.recipeId === undefined ? {} : { recipeId: entityId(raw.recipeId, `${field}.recipeId`) }),
    checked: booleanValue(raw.checked, `${field}.checked`),
    createdAt: isoTimestamp(raw.createdAt, `${field}.createdAt`),
    updatedAt: isoTimestamp(raw.updatedAt, `${field}.updatedAt`),
  };
  if (containsBlockedDietTerm([item.name, item.amountLabel].filter(Boolean).join(' '))) {
    throw new Error(`${field} crosses the vegetarian boundary.`);
  }
  return item;
}

function parseSettings(value: unknown): RecipesSettings {
  const raw = record(value, 'settings');
  const theme = text(raw.theme, 'settings.theme') as RecipesSettings['theme'];
  if (!['dark', 'light', 'system'].includes(theme)) throw new Error('settings.theme is unsupported.');
  if (raw.eggsAllowed !== true) throw new Error('Recipes is always ovo-lacto vegetarian.');
  const calorieTarget = finiteNumber(raw.calorieTarget, 'settings.calorieTarget', 100);
  const proteinTargetG = finiteNumber(raw.proteinTargetG, 'settings.proteinTargetG');
  const maxCookMinutes = finiteNumber(raw.maxCookMinutes, 'settings.maxCookMinutes', 5);
  if (calorieTarget > 2000) throw new Error('settings.calorieTarget cannot exceed 2000.');
  if (proteinTargetG > 200) throw new Error('settings.proteinTargetG cannot exceed 200.');
  if (maxCookMinutes > 240) throw new Error('settings.maxCookMinutes cannot exceed 240.');
  return {
    theme,
    calorieTarget,
    proteinTargetG,
    maxCookMinutes,
    eggsAllowed: true,
    updatedAt: isoTimestamp(raw.updatedAt, 'settings.updatedAt'),
  };
}

function rejectDuplicateIds(values: readonly { id: string }[], field: string): void {
  if (new Set(values.map((item) => item.id)).size !== values.length) {
    throw new Error(`${field} contains duplicate ids.`);
  }
}

export function parseRecipesState(value: unknown): RecipesState {
  const raw = record(value, 'Recipes data');
  if (raw.version !== 1) throw new Error('Unsupported Recipes data version.');
  if (!Array.isArray(raw.pantry) || !Array.isArray(raw.recipes) || !Array.isArray(raw.shopping)) {
    throw new Error('Recipes data is missing pantry, recipes, or shopping lists.');
  }
  const pantry = raw.pantry.map((item, index) => parseProduct(item, `pantry[${index}]`));
  const recipes = raw.recipes.map((item, index) => parseRecipe(item, `recipes[${index}]`));
  const shopping = raw.shopping.map((item, index) => parseShoppingItem(item, `shopping[${index}]`));
  if (pantry.some((product) => product.eligibility.status !== 'allowed')) {
    throw new Error('Pantry products must be reviewed and approved vegetarian items.');
  }
  rejectDuplicateIds(pantry, 'pantry');
  rejectDuplicateIds(recipes, 'recipes');
  rejectDuplicateIds(shopping, 'shopping');

  const updatedAt = isoTimestamp(raw.updatedAt, 'updatedAt');
  const updatedAtMs = positiveInteger(raw.updatedAtMs, 'updatedAtMs');
  if (updatedAtMs > 253_402_300_799_999) throw new Error('updatedAtMs is outside the supported date range.');
  if (Date.parse(updatedAt) !== updatedAtMs) {
    throw new Error('updatedAt and updatedAtMs must describe the same revision.');
  }

  const clientId = entityId(raw.clientId, 'clientId');
  if (clientId.length > 128) throw new Error('clientId is too long.');

  return {
    version: 1,
    settings: parseSettings(raw.settings),
    pantry,
    recipes,
    shopping,
    updatedAt,
    updatedAtMs,
    clientId,
  };
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
  return `{${entries.join(',')}}`;
}

/** Whole-document LWW with client/content tie-breaks that are argument-order independent. */
export function compareRecipesStates(left: RecipesState, right: RecipesState): number {
  if (left.updatedAtMs !== right.updatedAtMs) return left.updatedAtMs < right.updatedAtMs ? -1 : 1;
  if (left.clientId !== right.clientId) return left.clientId < right.clientId ? -1 : 1;
  return stableStringify(left).localeCompare(stableStringify(right));
}

export function selectNewerRecipesState(left: RecipesState, right: RecipesState): RecipesState {
  return compareRecipesStates(left, right) >= 0 ? left : right;
}

export function nextRecipesRevision(
  previous: Pick<RecipesState, 'updatedAtMs'>,
  clientId: string,
  nowMs = Date.now(),
): Pick<RecipesState, 'updatedAt' | 'updatedAtMs' | 'clientId'> {
  const wallClock = Number.isFinite(nowMs) ? Math.max(1, Math.trunc(nowMs)) : 1;
  const updatedAtMs = Math.max(wallClock, previous.updatedAtMs + 1);
  return { updatedAt: new Date(updatedAtMs).toISOString(), updatedAtMs, clientId };
}

export function buildRecipesStorageEnvelope(
  state: RecipesState,
  savedAtMs = Date.now(),
): RecipesStorageEnvelope {
  const validated = parseRecipesState(state);
  return {
    storageFormat: RECIPES_STORAGE_FORMAT,
    savedAtMs: Math.max(1, Math.trunc(savedAtMs)),
    state: validated,
  };
}

interface StoredCandidate {
  readonly state: RecipesState;
  readonly savedAtMs: number;
}

export function parseRecipesStorageValue(value: unknown): StoredCandidate {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const raw = value as Record<string, unknown>;
    if (raw.storageFormat === RECIPES_STORAGE_FORMAT && raw.state !== undefined) {
      return {
        state: parseRecipesState(raw.state),
        savedAtMs: positiveInteger(raw.savedAtMs, 'savedAtMs'),
      };
    }
  }
  const state = parseRecipesState(value);
  return { state, savedAtMs: state.updatedAtMs };
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(RECIPES_DATABASE_NAME, RECIPES_DATABASE_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(RECIPES_OBJECT_STORE)) {
        request.result.createObjectStore(RECIPES_OBJECT_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

async function readIndexedValue(): Promise<{ available: boolean; value: unknown }> {
  const database = await openDatabase();
  if (!database) return { available: false, value: null };
  try {
    const value = await new Promise<unknown>((resolve, reject) => {
      const transaction = database.transaction(RECIPES_OBJECT_STORE, 'readonly');
      const request = transaction.objectStore(RECIPES_OBJECT_STORE).get(RECIPES_OBJECT_KEY);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
    return { available: true, value };
  } finally {
    database.close();
  }
}

async function writeIndexedValue(value: RecipesStorageEnvelope): Promise<boolean> {
  const database = await openDatabase();
  if (!database) return false;
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(RECIPES_OBJECT_STORE, 'readwrite');
      transaction.objectStore(RECIPES_OBJECT_STORE).put(value, RECIPES_OBJECT_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    return true;
  } finally {
    database.close();
  }
}

async function clearIndexedData(): Promise<void> {
  const database = await openDatabase();
  if (!database) return;
  try {
    await new Promise<void>((resolve) => {
      const transaction = database.transaction(RECIPES_OBJECT_STORE, 'readwrite');
      transaction.objectStore(RECIPES_OBJECT_STORE).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    });
  } finally {
    database.close();
  }
}

function preserveCorruptLocalCopy(raw: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`${RECOVERY_PREFIX}${new Date().toISOString()}`, raw);
  } catch {
    // The unreadable original stays in place if a recovery copy cannot be made.
  }
}

function loadOrCreateDeviceClientId(): string {
  if (typeof localStorage !== 'undefined') {
    try {
      const stored = localStorage.getItem(RECIPES_CLIENT_ID_KEY);
      if (stored) return entityId(stored, 'clientId');
    } catch {
      // Fall through to an in-memory client id.
    }
  }
  const clientId = createClientId();
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(RECIPES_CLIENT_ID_KEY, clientId);
    } catch {
      // IndexedDB can still store the state if localStorage is blocked.
    }
  }
  return clientId;
}

function chooseStoredCandidate(candidates: readonly StoredCandidate[]): StoredCandidate | undefined {
  return [...candidates].sort((left, right) => (
    right.savedAtMs - left.savedAtMs || -compareRecipesStates(left.state, right.state)
  ))[0];
}

function restampState(previous: RecipesState, next: Omit<RecipesState, 'updatedAt' | 'updatedAtMs' | 'clientId'>, clientId: string): RecipesState {
  return { ...next, ...nextRecipesRevision(previous, clientId) };
}

export function useRecipesStore(): RecipesStore {
  const [state, setState] = useState<RecipesState | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [hasStoredState, setHasStoredState] = useState(false);
  const [storageMode, setStorageMode] = useState<StorageMode>('localStorage');
  const [storageWarning, setStorageWarning] = useState<string>();
  const stateRef = useRef<RecipesState | null>(null);
  const deviceClientIdRef = useRef<string>();
  const hasStoredStateRef = useRef(false);
  const mutationListenersRef = useRef(new Set<RecipesMutationListener>());
  const pendingLocalWritesRef = useRef(new Set<Promise<void>>());
  const lastLocalTextRef = useRef<string>();

  const persistState = useCallback((next: RecipesState) => {
    const envelope = buildRecipesStorageEnvelope(next);
    let localSaved = false;
    if (typeof localStorage !== 'undefined') {
      try {
        const serialized = JSON.stringify(envelope);
        localStorage.setItem(RECIPES_LOCAL_STORAGE_KEY, serialized);
        lastLocalTextRef.current = serialized;
        localSaved = true;
      } catch {
        localSaved = false;
      }
    }

    const write = writeIndexedValue(envelope)
      .then((available) => {
        if (available) {
          setStorageMode('indexeddb');
          setStorageWarning(undefined);
        } else if (localSaved) {
          setStorageMode('localStorage');
        } else {
          setStorageWarning('This browser is blocking both storage copies. Export your data before leaving.');
        }
      })
      .catch(() => {
        if (localSaved) setStorageMode('localStorage');
        else setStorageWarning('This browser is blocking both storage copies. Export your data before leaving.');
      });
    const tracked = write.finally(() => pendingLocalWritesRef.current.delete(tracked));
    pendingLocalWritesRef.current.add(tracked);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function hydrateLocalState() {
      const clientId = loadOrCreateDeviceClientId();
      deviceClientIdRef.current = clientId;
      const candidates: StoredCandidate[] = [];
      let warning: string | undefined;

      if (typeof localStorage !== 'undefined') {
        let raw: string | null = null;
        try {
          raw = localStorage.getItem(RECIPES_LOCAL_STORAGE_KEY);
        } catch {
          raw = null;
        }
        if (raw) {
          try {
            candidates.push(parseRecipesStorageValue(JSON.parse(raw)));
          } catch {
            preserveCorruptLocalCopy(raw);
            warning = 'An unreadable browser copy was preserved for recovery.';
          }
        }
      }

      try {
        const indexed = await readIndexedValue();
        if (indexed.available) setStorageMode('indexeddb');
        if (indexed.value !== null && indexed.value !== undefined) {
          try {
            candidates.push(parseRecipesStorageValue(indexed.value));
          } catch {
            warning = warning ?? 'The browser database copy is unreadable; using the other safe copy.';
          }
        }
      } catch {
        warning = warning ?? 'The browser database could not be read; localStorage remains active.';
      }

      if (cancelled) return;
      const selected = chooseStoredCandidate(candidates);
      const initial = selected?.state ?? createEmptyState(new Date().toISOString(), clientId);
      stateRef.current = initial;
      hasStoredStateRef.current = Boolean(selected);
      setState(initial);
      setHasStoredState(Boolean(selected));
      setStorageWarning(warning);
      setHydrated(true);
      // Repair a missing/stale mirror only when real state already existed.
      // A pristine empty visit stays unpersisted until a mutation or cloud read.
      if (selected) persistState(initial);
    }
    void hydrateLocalState();
    return () => { cancelled = true; };
  }, [persistState]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    function handleStorage(event: StorageEvent) {
      if (
        event.key !== RECIPES_LOCAL_STORAGE_KEY
        || !event.newValue
        || event.newValue === lastLocalTextRef.current
      ) return;
      const current = stateRef.current;
      if (!current) return;
      try {
        const incoming = parseRecipesStorageValue(JSON.parse(event.newValue)).state;
        const selected = selectNewerRecipesState(current, incoming);
        if (stableStringify(selected) === stableStringify(current)) return;
        stateRef.current = selected;
        hasStoredStateRef.current = true;
        setState(selected);
        setHasStoredState(true);
        persistState(selected);
      } catch {
        // Another tab's incomplete/corrupt write cannot displace valid memory.
      }
    }
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [persistState]);

  const emitMutation = useCallback((mutation: RecipesMutation) => {
    mutationListenersRef.current.forEach((listener) => listener(mutation));
  }, []);

  const commit = useCallback((
    type: RecipesMutationType,
    update: (previous: RecipesState, clientId: string) => RecipesState,
  ): RecipesState | undefined => {
    const previous = stateRef.current;
    if (!previous) return undefined;
    const clientId = deviceClientIdRef.current ?? previous.clientId;
    const next = update(previous, clientId);
    if (next === previous) return previous;
    // Every mutator must return a structurally valid, monotonic state.
    const validated = parseRecipesState(next);
    stateRef.current = validated;
    hasStoredStateRef.current = true;
    setState(validated);
    setHasStoredState(true);
    persistState(validated);
    emitMutation({ type, state: validated });
    return validated;
  }, [emitMutation, persistState]);

  const addPantryProduct = useCallback((input: Product): Product | undefined => {
    const product = parseProduct(input);
    if (product.eligibility.status !== 'allowed') return undefined;
    let stored: Product | undefined;
    commit('pantry', (previous, clientId) => {
      const index = previous.pantry.findIndex((item) => (
        item.id === product.id || Boolean(product.barcode && item.barcode === product.barcode)
      ));
      const revision = nextRecipesRevision(previous, clientId);
      const existing = index >= 0 ? previous.pantry[index] : undefined;
      stored = {
        ...product,
        id: existing?.id ?? product.id,
        createdAt: existing?.createdAt ?? product.createdAt,
        updatedAt: revision.updatedAt,
      };
      const pantry = index >= 0
        ? previous.pantry.map((item, itemIndex) => itemIndex === index ? stored as Product : item)
        : [...previous.pantry, stored];
      return { ...previous, pantry, ...revision };
    });
    return stored;
  }, [commit]);

  const updateProduct = useCallback((
    id: string,
    patch: Partial<Omit<Product, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Product | undefined => {
    let updated: Product | undefined;
    commit('pantry', (previous, clientId) => {
      const existing = previous.pantry.find((item) => item.id === id);
      if (!existing) return previous;
      const revision = nextRecipesRevision(previous, clientId);
      updated = parseProduct({ ...existing, ...patch, id: existing.id, createdAt: existing.createdAt, updatedAt: revision.updatedAt });
      return {
        ...previous,
        pantry: previous.pantry.map((item) => item.id === id ? updated as Product : item),
        ...revision,
      };
    });
    return updated;
  }, [commit]);

  const deleteProduct = useCallback((id: string) => {
    commit('pantry', (previous, clientId) => {
      if (!previous.pantry.some((item) => item.id === id)) return previous;
      return restampState(previous, {
        version: 1,
        settings: previous.settings,
        pantry: previous.pantry.filter((item) => item.id !== id),
        recipes: previous.recipes,
        shopping: previous.shopping,
      }, clientId);
    });
  }, [commit]);

  const saveRecipe = useCallback((input: Recipe): Recipe | undefined => {
    const recipe = parseRecipe(input);
    let stored: Recipe | undefined;
    commit('recipes', (previous, clientId) => {
      const index = previous.recipes.findIndex((item) => item.id === recipe.id);
      const existing = index >= 0 ? previous.recipes[index] : undefined;
      const revision = nextRecipesRevision(previous, clientId);
      stored = {
        ...recipe,
        createdAt: existing?.createdAt ?? recipe.createdAt,
        updatedAt: revision.updatedAt,
      };
      const recipes = index >= 0
        ? previous.recipes.map((item, itemIndex) => itemIndex === index ? stored as Recipe : item)
        : [...previous.recipes, stored];
      return { ...previous, recipes, ...revision };
    });
    return stored;
  }, [commit]);

  const updateRecipe = useCallback((
    id: string,
    patch: Partial<Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Recipe | undefined => {
    let updated: Recipe | undefined;
    commit('recipes', (previous, clientId) => {
      const existing = previous.recipes.find((item) => item.id === id);
      if (!existing) return previous;
      const revision = nextRecipesRevision(previous, clientId);
      updated = parseRecipe({ ...existing, ...patch, id: existing.id, createdAt: existing.createdAt, updatedAt: revision.updatedAt });
      return {
        ...previous,
        recipes: previous.recipes.map((item) => item.id === id ? updated as Recipe : item),
        ...revision,
      };
    });
    return updated;
  }, [commit]);

  const deleteRecipe = useCallback((id: string) => {
    commit('recipes', (previous, clientId) => {
      if (!previous.recipes.some((item) => item.id === id)) return previous;
      const revision = nextRecipesRevision(previous, clientId);
      const now = revision.updatedAt;
      return {
        ...previous,
        recipes: previous.recipes.filter((item) => item.id !== id),
        shopping: previous.shopping.map((item) => item.recipeId === id
          ? { ...item, recipeId: undefined, updatedAt: now }
          : item),
        ...revision,
      };
    });
  }, [commit]);

  const normalizeNewShoppingItem = useCallback((
    input: string | NewShoppingItem,
    now: string,
  ): ShoppingItem | null => {
    const value: NewShoppingItem = typeof input === 'string' ? { name: input } : input;
    const name = value.name.trim();
    if (!name) return null;
    return parseShoppingItem({
      id: value.id ?? createId('shopping'),
      name,
      ...(value.amountLabel?.trim() ? { amountLabel: value.amountLabel.trim() } : {}),
      ...(value.recipeId ? { recipeId: value.recipeId } : {}),
      checked: value.checked ?? false,
      createdAt: now,
      updatedAt: now,
    }, 'shopping item');
  }, []);

  const addShoppingItems = useCallback((inputs: readonly (string | NewShoppingItem)[]): ShoppingItem[] => {
    const added: ShoppingItem[] = [];
    commit('shopping', (previous, clientId) => {
      const revision = nextRecipesRevision(previous, clientId);
      const seen = new Set(previous.shopping.map((item) => `${item.name.trim().toLowerCase()}\u0000${item.recipeId ?? ''}`));
      for (const input of inputs) {
        const item = normalizeNewShoppingItem(input, revision.updatedAt);
        if (!item) continue;
        const key = `${item.name.toLowerCase()}\u0000${item.recipeId ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        added.push(item);
      }
      if (!added.length) return previous;
      return { ...previous, shopping: [...previous.shopping, ...added], ...revision };
    });
    return added;
  }, [commit, normalizeNewShoppingItem]);

  const addShoppingItem = useCallback((input: string | NewShoppingItem) => (
    addShoppingItems([input])[0]
  ), [addShoppingItems]);

  const updateShoppingItem = useCallback((
    id: string,
    patch: Partial<Pick<ShoppingItem, 'name' | 'amountLabel' | 'recipeId' | 'checked'>>,
  ): ShoppingItem | undefined => {
    let updated: ShoppingItem | undefined;
    commit('shopping', (previous, clientId) => {
      const existing = previous.shopping.find((item) => item.id === id);
      if (!existing) return previous;
      const revision = nextRecipesRevision(previous, clientId);
      const candidate = { ...existing, ...patch, id: existing.id, createdAt: existing.createdAt, updatedAt: revision.updatedAt };
      if (patch.amountLabel === undefined && 'amountLabel' in patch) delete candidate.amountLabel;
      if (patch.recipeId === undefined && 'recipeId' in patch) delete candidate.recipeId;
      updated = parseShoppingItem(candidate, 'shopping item');
      return {
        ...previous,
        shopping: previous.shopping.map((item) => item.id === id ? updated as ShoppingItem : item),
        ...revision,
      };
    });
    return updated;
  }, [commit]);

  const toggleShoppingItem = useCallback((id: string) => {
    const existing = stateRef.current?.shopping.find((item) => item.id === id);
    if (existing) updateShoppingItem(id, { checked: !existing.checked });
  }, [updateShoppingItem]);

  const deleteShoppingItem = useCallback((id: string) => {
    commit('shopping', (previous, clientId) => {
      if (!previous.shopping.some((item) => item.id === id)) return previous;
      return restampState(previous, {
        version: 1,
        settings: previous.settings,
        pantry: previous.pantry,
        recipes: previous.recipes,
        shopping: previous.shopping.filter((item) => item.id !== id),
      }, clientId);
    });
  }, [commit]);

  const clearCheckedShopping = useCallback(() => {
    commit('shopping', (previous, clientId) => {
      if (!previous.shopping.some((item) => item.checked)) return previous;
      return restampState(previous, {
        version: 1,
        settings: previous.settings,
        pantry: previous.pantry,
        recipes: previous.recipes,
        shopping: previous.shopping.filter((item) => !item.checked),
      }, clientId);
    });
  }, [commit]);

  const updateSettings = useCallback((patch: Partial<Omit<RecipesSettings, 'updatedAt' | 'eggsAllowed'>>) => {
    commit('settings', (previous, clientId) => {
      const revision = nextRecipesRevision(previous, clientId);
      const settings = parseSettings({
        ...previous.settings,
        ...patch,
        eggsAllowed: true,
        updatedAt: revision.updatedAt,
      });
      if (stableStringify(settings) === stableStringify(previous.settings)) return previous;
      return { ...previous, settings, ...revision };
    });
  }, [commit]);

  const replaceState = useCallback((input: RecipesState) => {
    const replacement = parseRecipesState(input);
    commit('replace', (previous, clientId) => restampState(previous, {
      version: 1,
      settings: replacement.settings,
      pantry: replacement.pantry,
      recipes: replacement.recipes,
      shopping: replacement.shopping,
    }, clientId));
  }, [commit]);

  const importState = useCallback((input: string | unknown): RecipesState => {
    const raw = typeof input === 'string' ? JSON.parse(input) as unknown : input;
    const imported = parseRecipesStorageValue(raw).state;
    const next = commit('import', (previous, clientId) => restampState(previous, {
      version: 1,
      settings: imported.settings,
      pantry: imported.pantry,
      recipes: imported.recipes,
      shopping: imported.shopping,
    }, clientId));
    if (!next) throw new Error('Recipes is still loading. Try the import again.');
    return next;
  }, [commit]);

  const exportState = useCallback((): string => {
    if (!stateRef.current) throw new Error('Recipes is still loading.');
    return `${JSON.stringify(buildRecipesStorageEnvelope(stateRef.current), null, 2)}\n`;
  }, []);

  const resetState = useCallback(() => {
    commit('reset', (previous, clientId) => {
      const revision = nextRecipesRevision(previous, clientId);
      return createEmptyState(revision.updatedAt, clientId);
    });
  }, [commit]);

  const applySyncedState = useCallback((input: RecipesState) => {
    const incoming = parseRecipesState(input);
    stateRef.current = incoming;
    hasStoredStateRef.current = true;
    setState(incoming);
    setHasStoredState(true);
    persistState(incoming);
  }, [persistState]);

  const subscribeMutations = useCallback((listener: RecipesMutationListener) => {
    mutationListenersRef.current.add(listener);
    return () => mutationListenersRef.current.delete(listener);
  }, []);

  const flushLocalWrites = useCallback(async () => {
    while (pendingLocalWritesRef.current.size > 0) {
      await Promise.all([...pendingLocalWritesRef.current]);
    }
  }, []);

  const clearLocalData = useCallback(async () => {
    await flushLocalWrites();
    if (typeof localStorage !== 'undefined') {
      try {
        const keys: string[] = [];
        for (let index = 0; index < localStorage.length; index += 1) {
          const key = localStorage.key(index);
          if (key && (key === RECIPES_LOCAL_STORAGE_KEY || key === RECIPES_CLIENT_ID_KEY || key.startsWith(RECOVERY_PREFIX))) {
            keys.push(key);
          }
        }
        keys.forEach((key) => localStorage.removeItem(key));
      } catch {
        // IndexedDB clearing still proceeds when localStorage is restricted.
      }
    }
    await clearIndexedData();
    const clientId = createClientId();
    deviceClientIdRef.current = clientId;
    const empty = createEmptyState(new Date().toISOString(), clientId);
    stateRef.current = empty;
    hasStoredStateRef.current = false;
    lastLocalTextRef.current = undefined;
    setState(empty);
    setHasStoredState(false);
  }, [flushLocalWrites]);

  return {
    state,
    hydrated,
    hasStoredState,
    storageMode,
    storageWarning,
    addPantryProduct,
    addProduct: addPantryProduct,
    upsertProduct: addPantryProduct,
    updateProduct,
    deleteProduct,
    removeProduct: deleteProduct,
    saveRecipe,
    addRecipe: saveRecipe,
    updateRecipe,
    deleteRecipe,
    removeRecipe: deleteRecipe,
    addShoppingItem,
    addShoppingItems,
    updateShoppingItem,
    toggleShoppingItem,
    deleteShoppingItem,
    removeShoppingItem: deleteShoppingItem,
    clearCheckedShopping,
    updateSettings,
    replaceState,
    importState,
    importData: importState,
    exportState,
    exportData: exportState,
    resetState,
    applySyncedState,
    subscribeMutations,
    flushLocalWrites,
    clearLocalData,
  };
}
