import { containsBlockedDietTerm, productIsAllowed } from './diet';
import type { Product, Recipe, RecipeIngredient } from './model';
import { createId } from './model';
import { macroDistance, proteinDensity, recipeNutrition, snapshotProduct } from './nutrition';

export interface RecipeMatch {
  readonly recipe: Recipe;
  readonly coverage: number;
  readonly matched: readonly string[];
  readonly missing: readonly string[];
  readonly macroDistance: number;
}

type ProductRole = 'protein' | 'base' | 'produce' | 'flavor';

const MATCH_STOP_WORDS = new Set([
  'fresh',
  'frozen',
  'cooked',
  'uncooked',
  'raw',
  'plain',
  'sliced',
  'diced',
  'chopped',
  'shelled',
  'firm',
  'rolled',
  'prepared',
  'organic',
]);

const SINGULAR_EXCEPTIONS = new Set(['asparagus', 'couscous', 'hummus', 'molasses']);
const DERIVATIVE_FORMS = new Set([
  'bowl',
  'burger',
  'burrito',
  'cake',
  'chip',
  'cracker',
  'curry',
  'dinner',
  'dressing',
  'entree',
  'flour',
  'juice',
  'meal',
  'noodle',
  'nugget',
  'pasta',
  'paste',
  'patty',
  'pizza',
  'powder',
  'pudding',
  'quesadilla',
  'sauce',
  'sandwich',
  'soup',
  'stew',
  'taco',
]);

const FINISHED_PRODUCT_FORMS = new Set([
  'bowl',
  'burger',
  'burrito',
  'casserole',
  'curry',
  'dinner',
  'entree',
  'lasagna',
  'meal',
  'nugget',
  'pizza',
  'quesadilla',
  'sandwich',
  'stew',
  'taco',
]);

function singularizeToken(token: string): string {
  if (SINGULAR_EXCEPTIONS.has(token) || token.length < 4 || token.endsWith('ss')) return token;
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith('oes') && token.length > 4) return token.slice(0, -2);
  if (token.endsWith('s')) return token.slice(0, -1);
  return token;
}

function normalizedFoodTokens(value: string): string[] {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\bgarbanzo beans?\b/g, ' chickpea ')
    .replace(/\bchick peas?\b/g, ' chickpea ')
    .replace(/\bchana\b/g, ' chickpea ')
    .replace(/\brajma\b/g, ' kidney bean ')
    .replace(/\bcapsicums?\b/g, ' bell pepper ')
    .replace(/\bsweet peppers?\b/g, ' bell pepper ')
    .replace(/\byoghurt\b/g, ' yogurt ')
    .replace(/\bold fashioned oats?\b/g, ' oat ')
    .replace(/\bwhole eggs?\b/g, ' egg ');
  return [...new Set(normalized
    .split(/\s+/)
    .map(singularizeToken)
    .filter((token) => token.length > 1 && token !== 'and' && !MATCH_STOP_WORDS.has(token)))];
}

function inferRole(value: string, nutrition?: Product['nutritionPerServing']): ProductRole {
  const text = value.toLowerCase();
  if (/sauce|salsa|chutney|paste|powder|juice|soup|dip|dressing|ketchup/.test(text)) return 'flavor';
  if (/rice|quinoa|pasta|tortilla|wrap|bread|naan|paratha|oat|potato|noodle/.test(text)) return 'base';
  if (/tofu|paneer|egg|bean|lentil|chickpea|yogurt|tempeh|seitan|edamame/.test(text)) return 'protein';
  if (/oil|cheese|hummus|milk|butter/.test(text)) return 'flavor';
  if (/vegetable|spinach|broccoli|pepper|onion|tomato|mushroom|cauliflower|peas?|greens?/.test(text)) return 'produce';
  if (nutrition && proteinDensity(nutrition) >= 5) return 'protein';
  return 'produce';
}

function role(product: Product): ProductRole {
  const explicit = product.categories
    .map((category) => category.toLowerCase())
    .find((category): category is ProductRole => ['protein', 'base', 'produce', 'flavor'].includes(category));
  if (explicit) return explicit;
  return inferRole([product.name, ...product.aliases, ...product.categories].join(' '), product.nutritionPerServing);
}

function ingredientRole(ingredient: RecipeIngredient): ProductRole {
  return inferRole([ingredient.name, ingredient.snapshot?.name].filter(Boolean).join(' '));
}

function providerFamily(product: Product['provenance']): string {
  const provider = product.providerName.toLowerCase();
  if (product.kind === 'usda' || provider.includes('usda') || provider.includes('fooddata central')) return 'usda';
  if (product.kind === 'open-food-facts' || provider.includes('open food facts')) return 'open-food-facts';
  return provider.replace(/[^a-z0-9]+/g, '-');
}

function hasSameExternalIdentity(ingredient: RecipeIngredient, product: Product): boolean {
  const snapshotSource = ingredient.snapshot?.provenance;
  const snapshotId = snapshotSource?.externalId?.trim();
  const productId = product.provenance.externalId?.trim();
  return Boolean(snapshotSource && snapshotId && productId
    && snapshotId === productId
    && providerFamily(snapshotSource) === providerFamily(product.provenance));
}

function hasDerivativeConflict(target: readonly string[], candidate: readonly string[]): boolean {
  const targetTokens = new Set(target);
  for (const token of candidate) {
    if (!DERIVATIVE_FORMS.has(token) || targetTokens.has(token)) continue;
    // Flour is a normal descriptor for finished tortillas, breads, naan, and paratha.
    if (token === 'flour' && target.some((value) => ['tortilla', 'bread', 'naan', 'paratha'].includes(value))) continue;
    return true;
  }
  return false;
}

function hasFinishedProductConflict(
  target: readonly string[],
  product: Pick<Product, 'name' | 'aliases' | 'categories'>,
): boolean {
  const targetTokens = new Set(target);
  const descriptors = normalizedFoodTokens([product.name, ...product.aliases, ...product.categories].join(' '));
  return descriptors.some((token) => FINISHED_PRODUCT_FORMS.has(token) && !targetTokens.has(token));
}

function hasEquivalentFoodName(ingredient: RecipeIngredient, product: Product): boolean {
  const targetRole = ingredientRole(ingredient);
  if (targetRole !== role(product)) return false;
  const targets = [ingredient.name, ingredient.snapshot?.name]
    .filter((value): value is string => Boolean(value))
    .map(normalizedFoodTokens)
    .filter((tokens) => tokens.length > 0);
  const candidates = [product.name, ...product.aliases, ...product.categories]
    .map((value) => ({ role: inferRole(value, product.nutritionPerServing), tokens: normalizedFoodTokens(value) }))
    .filter((candidate) => candidate.tokens.length > 0);

  return targets.some((target) => candidates.some((candidate) => {
    if (targetRole !== candidate.role) return false;
    if (hasFinishedProductConflict(target, product)) return false;
    if (target.length === candidate.tokens.length && target.every((token) => candidate.tokens.includes(token))) return true;
    if (!target.every((token) => candidate.tokens.includes(token))) return false;
    return !hasDerivativeConflict(target, candidate.tokens);
  }));
}

export function findIngredientPantryMatch(ingredient: RecipeIngredient, pantry: readonly Product[]): Product | undefined {
  return pantry.find((product) => productIsAllowed(product) && (
    ingredient.productId === product.id
    || hasSameExternalIdentity(ingredient, product)
    || hasEquivalentFoodName(ingredient, product)
  ));
}

export function ingredientIsAvailable(ingredient: RecipeIngredient, pantry: readonly Product[]): boolean {
  return findIngredientPantryMatch(ingredient, pantry) !== undefined;
}

export function matchRecipes(
  recipes: readonly Recipe[],
  pantry: readonly Product[],
  target: { calories: number; proteinG: number },
): RecipeMatch[] {
  return recipes.map((recipe) => {
    const required = recipe.ingredients.filter((ingredient) => !ingredient.optional);
    const availability = required.map((ingredient) => ({
      ingredient,
      available: ingredientIsAvailable(ingredient, pantry),
    }));
    const matched = availability.filter((entry) => entry.available).map((entry) => entry.ingredient);
    const missing = availability.filter((entry) => !entry.available).map((entry) => entry.ingredient);
    return {
      recipe,
      coverage: required.length === 0 ? 1 : matched.length / required.length,
      matched: matched.map((ingredient) => ingredient.name),
      missing: missing.map((ingredient) => ingredient.name),
      macroDistance: macroDistance(recipe.nutritionPerServing, target),
    };
  }).sort((left, right) => right.coverage - left.coverage
    || left.macroDistance - right.macroDistance
    || left.recipe.title.localeCompare(right.recipe.title));
}

function ingredient(product: Product, servings: number): RecipeIngredient {
  return {
    id: createId('ingredient'),
    productId: product.id,
    name: product.name,
    amountLabel: `${Math.round(servings * 100) / 100} × ${product.serving.label}`,
    optional: false,
    snapshot: snapshotProduct(product, servings),
  };
}

interface Template {
  readonly key: string;
  readonly title: (protein: Product, base?: Product) => string;
  readonly cuisine: string;
  readonly description: string;
  readonly requiresBase: boolean;
  readonly steps: (ingredients: readonly RecipeIngredient[]) => readonly string[];
}

const TEMPLATES: readonly Template[] = [
  {
    key: 'bowl',
    title: (protein, base) => `${protein.name} ${base?.name ?? 'power'} bowl`,
    cuisine: 'Pantry freestyle',
    description: 'A balanced bowl tuned around your selected products.',
    requiresBase: true,
    steps: (items) => [`Prepare ${items[1]?.name ?? 'the base'} and keep it warm.`, `Sear or warm ${items[0]?.name ?? 'the protein'} with your preferred vegetarian spices.`, 'Cook the remaining vegetables until just tender, then assemble and season to taste.'],
  },
  {
    key: 'skillet',
    title: (protein) => `One-pan ${protein.name} skillet`,
    cuisine: 'Weeknight',
    description: 'A fast one-pan meal that puts protein and vegetables first.',
    requiresBase: false,
    steps: (items) => [`Brown or warm ${items[0]?.name ?? 'the main ingredient'} in a wide skillet.`, 'Add the vegetables from firmest to softest and cook over medium-high heat.', 'Fold in the flavor ingredients, add a splash of water if needed, and finish with salt and acid.'],
  },
  {
    key: 'wrap',
    title: (protein, base) => `${protein.name} ${base?.name ?? 'pantry'} wraps`,
    cuisine: 'Handheld',
    description: 'Crisp, portable wraps built from what is already in your pantry.',
    requiresBase: true,
    steps: (items) => [`Warm ${items[1]?.name ?? 'the wraps'} until pliable.`, `Season and cook ${items[0]?.name ?? 'the filling'} with the selected vegetables.`, 'Fill, fold, and toast seam-side down until crisp.'],
  },
  {
    key: 'curry',
    title: (protein) => `Creamy ${protein.name} pantry curry`,
    cuisine: 'Indian-inspired',
    description: 'A flexible curry using selected proteins, produce, and pantry flavor.',
    requiresBase: false,
    steps: (items) => ['Bloom cumin, coriander, turmeric, and chili in a lightly oiled pan.', `Add ${items[0]?.name ?? 'the protein'} and the vegetables; cook until fragrant.`, 'Stir in the flavor ingredients with a splash of water and simmer until the sauce clings.'],
  },
];

function choose<T>(values: readonly T[], index: number): T | undefined {
  return values.length === 0 ? undefined : values[index % values.length];
}

export function generateSmartRecipes(
  selectedProducts: readonly Product[],
  target: { calories: number; proteinG: number },
  now = new Date().toISOString(),
): Recipe[] {
  const allowed = selectedProducts.filter(productIsAllowed);
  if (allowed.length < 2) return [];
  const grouped = {
    protein: allowed.filter((product) => role(product) === 'protein').sort((a, b) => proteinDensity(b.nutritionPerServing) - proteinDensity(a.nutritionPerServing)),
    base: allowed.filter((product) => role(product) === 'base'),
    produce: allowed.filter((product) => role(product) === 'produce'),
    flavor: allowed.filter((product) => role(product) === 'flavor'),
  };
  const proteins = grouped.protein.length > 0 ? grouped.protein : [...allowed].sort((a, b) => b.nutritionPerServing.proteinG - a.nutritionPerServing.proteinG);

  return TEMPLATES.flatMap((template, index) => {
    const protein = choose(proteins, index);
    const base = choose(grouped.base, index);
    if (!protein || (template.requiresBase && !base)) return [];
    const selected = [protein, base, choose(grouped.produce, index), choose(grouped.produce, index + 1), choose(grouped.flavor, index)]
      .filter((product): product is Product => Boolean(product))
      .filter((product, productIndex, values) => values.findIndex((candidate) => candidate.id === product.id) === productIndex)
      .slice(0, 5);
    if (selected.some((product) => containsBlockedDietTerm([product.name, product.ingredientsText].filter(Boolean).join(' ')))) return [];
    const ingredientList = selected.map((product) => ingredient(product, product === base ? 1 : product === protein ? 1.5 : 1));
    const totals = recipeNutrition(ingredientList, 2);
    const title = template.title(protein, base);
    return [{
      id: createId(`smart-${template.key}`),
      title,
      description: template.description,
      cuisine: template.cuisine,
      tags: ['uses your pantry', totals.nutritionPerServing.proteinG >= target.proteinG * 0.8 ? 'protein target' : 'easy to boost'],
      prepMinutes: 10,
      cookMinutes: template.key === 'curry' ? 22 : 15,
      servings: 2,
      ingredients: ingredientList,
      steps: template.steps(ingredientList),
      nutritionPerServing: totals.nutritionPerServing,
      macroCoverage: totals.macroCoverage,
      dietStatus: 'allowed' as const,
      origin: 'smart' as const,
      createdAt: now,
      updatedAt: now,
    }];
  }).sort((left, right) => macroDistance(left.nutritionPerServing, target) - macroDistance(right.nutritionPerServing, target));
}

export function missingIngredients(recipe: Recipe, pantry: readonly Product[]): RecipeIngredient[] {
  return recipe.ingredients.filter((ingredient) => !ingredient.optional && !ingredientIsAvailable(ingredient, pantry));
}
