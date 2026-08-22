import {
  GoogleAIBackend,
  Schema,
  getAI,
  getGenerativeModel,
} from 'firebase/ai';
import {
  containsBlockedDietTerm,
  productIsAllowed,
  productIsProviderCertifiedAnalog,
} from './diet';
import { firebaseApp } from './firebase';
import type { Product, Recipe, RecipeIngredient } from './model';
import { createId } from './model';
import { recipeNutrition, snapshotProduct } from './nutrition';

interface AiIngredient {
  readonly productId: string;
  readonly servings: number;
  readonly amountLabel: string;
  readonly optional: boolean;
}

interface AiRecipeResponse {
  readonly title: string;
  readonly description: string;
  readonly cuisine: string;
  readonly tags: readonly string[];
  readonly prepMinutes: number;
  readonly cookMinutes: number;
  readonly servings: number;
  readonly ingredients: readonly AiIngredient[];
  readonly steps: readonly string[];
}

const UNTRACKED_FOOD_PATTERN = /\b(?:olive oil|canola oil|coconut oil|vegetable oil|sesame oil|soy sauce|chili sauce|hot sauce|tomato sauce|pasta sauce|coconut milk|almond milk|soy milk|oat milk|dairy milk|whole milk|skim milk|maple syrup|peanut butter|almond butter|black beans|kidney beans|pinto beans|white beans|brown rice|basmati rice|white rice|jasmine rice|wild rice|cooking wine|red wine|white wine|date syrup|oils?|butter|ghee|margarine|shortening|milk|cream|yogurt|yoghurt|cheese|paneer|eggs?|tofu|tempeh|seitan|beans?|lentils?|chickpeas?|edamame|nuts?|almonds?|cashews?|peanuts?|seeds?|tahini|hummus|rice|quinoa|oats?|bread|tortillas?|naan|paratha|pasta|noodles?|flour|sugar|honey|syrup|agave|jaggery|molasses|sauces?|pesto|mayonnaise|mayo|ketchup|dressing|broth|stock|avocados?|coconut|sweet potatoes?|potatoes?|corn|peas?|broccoli|spinach|tomatoes?|bell peppers?|mushrooms?|carrots?|cauliflower|zucchinis?|courgettes?|eggplants?|aubergines?|cucumbers?|cabbages?|kale|lettuce|celery|asparagus|okra|vegetables?|bananas?|berries?|apples?|pears?|peaches?|mangoes?|pineapples?|oranges?|grapes?|raisins?|dates?|figs?|lemons?|limes?|wine|beer|cider)\b/gi;

export interface AiRecipeRequest {
  readonly products: readonly Product[];
  readonly note?: string;
  readonly calorieTarget: number;
  readonly proteinTargetG: number;
  readonly maxCookMinutes: number;
}

export class RecipeAiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecipeAiError';
  }
}

const ingredientSchema = Schema.object({
  properties: {
    productId: Schema.string({ description: 'An exact product id from the supplied pantry list.' }),
    servings: Schema.number({ description: 'How many listed product servings the entire recipe uses.' }),
    amountLabel: Schema.string({ description: 'A concise human-readable amount.' }),
    optional: Schema.boolean(),
  },
});

const recipeSchema = Schema.object({
  properties: {
    title: Schema.string(),
    description: Schema.string(),
    cuisine: Schema.string(),
    tags: Schema.array({ items: Schema.string(), maxItems: 4 }),
    prepMinutes: Schema.integer(),
    cookMinutes: Schema.integer(),
    servings: Schema.integer(),
    ingredients: Schema.array({ items: ingredientSchema, minItems: 2, maxItems: 8 }),
    steps: Schema.array({ items: Schema.string(), minItems: 2, maxItems: 8 }),
  },
});

function finiteNumber(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new RecipeAiError('The chef returned an invalid number.');
  return Math.min(maximum, Math.max(minimum, value));
}

function text(value: unknown, field: string, maximum = 300): string {
  if (typeof value !== 'string' || !value.trim()) throw new RecipeAiError(`The chef omitted ${field}.`);
  return value.trim().slice(0, maximum);
}

function textList(value: unknown, field: string, limit: number): string[] {
  if (!Array.isArray(value)) throw new RecipeAiError(`The chef returned invalid ${field}.`);
  return value.slice(0, limit).map((item) => text(item, field));
}

function parseResponse(value: unknown): AiRecipeResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RecipeAiError('The chef returned an unreadable recipe.');
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.ingredients)) throw new RecipeAiError('The chef returned no ingredients.');
  const parsed: AiRecipeResponse = {
    title: text(raw.title, 'a title', 90),
    description: text(raw.description, 'a description', 240),
    cuisine: text(raw.cuisine, 'a cuisine', 50),
    tags: textList(raw.tags, 'tags', 4),
    prepMinutes: finiteNumber(raw.prepMinutes, 0, 180),
    cookMinutes: finiteNumber(raw.cookMinutes, 0, 240),
    servings: finiteNumber(raw.servings, 1, 12),
    ingredients: raw.ingredients.slice(0, 8).map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new RecipeAiError('The chef returned an invalid ingredient.');
      const ingredient = item as Record<string, unknown>;
      return {
        productId: text(ingredient.productId, 'a product id', 240),
        servings: finiteNumber(ingredient.servings, 0.05, 24),
        amountLabel: text(ingredient.amountLabel, 'an ingredient amount', 100),
        optional: ingredient.optional === true,
      };
    }),
    steps: textList(raw.steps, 'steps', 8),
  };
  if (parsed.ingredients.length < 2) throw new RecipeAiError('The chef returned too few selected products.');
  if (parsed.steps.length < 2) throw new RecipeAiError('The chef returned too few steps.');
  return parsed;
}

function reviewedSelectedProducts(products: readonly Product[]): Product[] {
  return products.filter(productIsAllowed).slice(0, 12);
}

function escapedRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function withoutTrackedAnalogReferences(value: string, products: readonly Product[]): string {
  return products.filter(productIsProviderCertifiedAnalog).reduce((textValue, product) => {
    return [product.name, ...product.aliases]
      // Never treat a bare animal word such as "chicken" as a tracked alias;
      // the method must use a specific multi-word analog reference.
      .filter((reference) => reference.trim().split(/\s+/).length >= 2)
      .reduce((result, reference) => result.replace(new RegExp(escapedRegExp(reference.trim()), 'gi'), ' tracked vegetarian product '), textValue);
  }, value);
}

function normalizedFoodTerm(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (normalized.endsWith('ies')) return `${normalized.slice(0, -3)}y`;
  if (normalized.endsWith('s') && !normalized.endsWith('ss')) return normalized.slice(0, -1);
  return normalized;
}

function productRepresentsFoodTerm(product: Product, term: string): boolean {
  const normalizedTerm = normalizedFoodTerm(term);
  return [product.name, ...product.aliases].some((value) => {
    const normalized = normalizedFoodTerm(value);
    return normalized === normalizedTerm
      || normalized.split(' ').includes(normalizedTerm)
      || normalized.includes(` ${normalizedTerm} `)
      || normalized.startsWith(`${normalizedTerm} `)
      || normalized.endsWith(` ${normalizedTerm}`);
  });
}

function untrackedFoodTerm(parsed: AiRecipeResponse, productsWithSnapshots: readonly Product[]): string | undefined {
  const textToCheck = [
    parsed.title,
    parsed.description,
    parsed.cuisine,
    ...parsed.tags,
    ...parsed.ingredients.map((ingredient) => ingredient.amountLabel),
    ...parsed.steps,
  ].join(' ');
  for (const match of textToCheck.matchAll(UNTRACKED_FOOD_PATTERN)) {
    const term = match[0];
    if (!productsWithSnapshots.some((product) => productRepresentsFoodTerm(product, term))) return term;
  }
  return undefined;
}

/**
 * Converts an untrusted model response into a recipe whose ingredients and
 * nutrition are exclusively backed by the reviewed selected products.
 */
export function assembleAiRecipeDraft(
  value: unknown,
  selectedProducts: readonly Product[],
  now = new Date().toISOString(),
): Recipe {
  const products = reviewedSelectedProducts(selectedProducts);
  if (products.length < 2) throw new RecipeAiError('Choose at least two reviewed vegetarian products first.');

  const parsed = parseResponse(value);
  const productMap = new Map(products.map((product) => [product.id, product]));
  const seenProductIds = new Set<string>();
  const resolved = parsed.ingredients.map((candidate) => {
    const product = productMap.get(candidate.productId);
    if (!product) throw new RecipeAiError('The chef referenced a product outside the selected pantry.');
    if (seenProductIds.has(product.id)) throw new RecipeAiError('The chef repeated a selected product instead of making one auditable snapshot.');
    seenProductIds.add(product.id);
    return { candidate, product };
  });

  const vegetarianText = withoutTrackedAnalogReferences([
    parsed.title,
    parsed.description,
    parsed.cuisine,
    ...parsed.tags,
    ...resolved.map(({ product }) => product.name),
    ...parsed.ingredients.map((ingredient) => ingredient.amountLabel),
    ...parsed.steps,
  ].join(' '), resolved.map(({ product }) => product));
  if (containsBlockedDietTerm(vegetarianText)) {
    throw new RecipeAiError('The draft crossed the vegetarian boundary and was discarded.');
  }

  const externalFood = untrackedFoodTerm(parsed, resolved.map(({ product }) => product));
  if (externalFood) {
    throw new RecipeAiError(`The chef added “${externalFood}” without a product snapshot, so the draft was discarded.`);
  }

  const ingredients: RecipeIngredient[] = resolved.map(({ candidate, product }) => ({
    id: createId('ingredient'),
    productId: product.id,
    name: product.name,
    amountLabel: candidate.amountLabel,
    optional: candidate.optional,
    snapshot: snapshotProduct(product, candidate.servings),
  }));
  const totals = recipeNutrition(ingredients, parsed.servings);
  return {
    id: createId('ai-recipe'),
    title: parsed.title,
    description: parsed.description,
    cuisine: parsed.cuisine,
    tags: [...parsed.tags, 'AI draft'].slice(0, 4),
    prepMinutes: parsed.prepMinutes,
    cookMinutes: parsed.cookMinutes,
    servings: parsed.servings,
    ingredients,
    steps: parsed.steps,
    nutritionPerServing: totals.nutritionPerServing,
    macroCoverage: totals.macroCoverage,
    dietStatus: 'allowed',
    origin: 'firebase-ai',
    createdAt: now,
    updatedAt: now,
  };
}

function friendlyAiFailure(error: unknown): RecipeAiError {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  const message = error instanceof Error ? error.message : '';
  if (code.includes('api-not-enabled') || /API.*not.*enabled/i.test(message)) {
    return new RecipeAiError('Firebase AI Logic is not enabled for this project yet. The local smart chef still works.');
  }
  if (/app.?check|attestation|403/i.test(`${code} ${message}`)) {
    return new RecipeAiError('AI requests need Firebase App Check configured for harsh.bet. The local smart chef still works.');
  }
  if (/429|quota|resource.exhausted/i.test(`${code} ${message}`)) {
    return new RecipeAiError('The AI chef is at its request limit. Try the local smart chef or come back shortly.');
  }
  if ((typeof navigator !== 'undefined' && !navigator.onLine) || /fetch|network|unavailable/i.test(`${code} ${message}`)) {
    return new RecipeAiError('The AI chef needs a connection. Your pantry and local smart chef still work offline.');
  }
  return error instanceof RecipeAiError ? error : new RecipeAiError('The AI chef could not finish this draft. Try the local smart chef instead.');
}

export async function generateRecipeWithFirebaseAI(request: AiRecipeRequest): Promise<Recipe> {
  const products = reviewedSelectedProducts(request.products);
  if (products.length < 2) throw new RecipeAiError('Choose at least two reviewed vegetarian products first.');

  const pantry = products.map((product) => ({
    id: product.id,
    name: product.name,
    brand: product.brand,
    serving: product.serving.label,
    macrosPerServing: {
      calories: product.nutritionPerServing.calories,
      proteinG: product.nutritionPerServing.proteinG,
      carbsG: product.nutritionPerServing.carbsG,
      fatG: product.nutritionPerServing.fatG,
    },
  }));

  const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });
  const model = getGenerativeModel(ai, {
    model: 'gemini-3.6-flash',
    systemInstruction: [
      'You are the recipe drafting layer inside a strict ovo-lacto vegetarian app.',
      'Eggs and dairy are allowed. Never use meat, poultry, fish, shellfish, animal stock, gelatin, lard, or tallow.',
      'Use only the supplied product ids as recipe ingredients and reference those same products in the method.',
      'Do not introduce oil, butter, milk, sweetener, sauce, produce, garnish, or any other food unless that exact product id is included in the ingredient array.',
      'Only water, salt, pepper, and nutritionally negligible amounts of dry spices may appear without a product snapshot.',
      'Do not calculate, estimate, or state nutrition. The app calculates macros from saved product labels.',
      'Make the method concrete, concise, practical, and safe for a home cook.',
    ].join(' '),
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: recipeSchema,
      maxOutputTokens: 2_000,
    },
  });

  const prompt = [
    `Draft one recipe for ${request.calorieTarget} kcal and about ${request.proteinTargetG} g protein per serving, with no more than ${request.maxCookMinutes} cook minutes.`,
    request.note?.trim() ? `Preference: ${request.note.trim().slice(0, 400)}.` : '',
    `Available products: ${JSON.stringify(pantry)}.`,
    'Prefer using most selected products without making the serving implausibly large.',
  ].filter(Boolean).join('\n');

  try {
    const result = await model.generateContent(prompt);
    return assembleAiRecipeDraft(JSON.parse(result.response.text()), products);
  } catch (error) {
    throw friendlyAiFailure(error);
  }
}
