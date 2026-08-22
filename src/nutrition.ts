import type { Nutrition, Product, ProductSnapshot, RecipeIngredient } from './model';

export const ZERO_NUTRITION: Nutrition = Object.freeze({
  calories: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  saturatedFatG: 0,
  fiberG: 0,
  sugarG: 0,
  sodiumMg: 0,
});

export const NUTRITION_KEYS = Object.freeze(
  Object.keys(ZERO_NUTRITION) as Array<keyof Nutrition>,
);

export const CORE_MACRO_KEYS = Object.freeze([
  'calories',
  'proteinG',
  'carbsG',
  'fatG',
] as const satisfies readonly (keyof Nutrition)[]);

export function hasCompleteCoreMacros(
  values: Partial<Record<keyof Nutrition, number>>,
): boolean {
  return CORE_MACRO_KEYS.every((key) => (
    typeof values[key] === 'number'
    && Number.isFinite(values[key])
    && values[key]! >= 0
  ));
}

export function addNutrition(left: Nutrition, right: Nutrition): Nutrition {
  return Object.fromEntries(NUTRITION_KEYS.map((key) => [key, left[key] + right[key]])) as unknown as Nutrition;
}

export function scaleNutrition(nutrition: Nutrition, multiplier: number): Nutrition {
  const safe = Number.isFinite(multiplier) ? Math.max(0, multiplier) : 0;
  return Object.fromEntries(NUTRITION_KEYS.map((key) => [key, nutrition[key] * safe])) as unknown as Nutrition;
}

export function roundNutrition(nutrition: Nutrition, digits = 1): Nutrition {
  const factor = 10 ** digits;
  return Object.fromEntries(NUTRITION_KEYS.map((key) => [key, Math.round(nutrition[key] * factor) / factor])) as unknown as Nutrition;
}

/**
 * Numeric payloads can pick up tiny floating-point differences while moving
 * through JSON and Firestore. Trust-boundary checks allow those differences,
 * but still reject nutrition claims that differ materially from their source.
 */
export function nutritionApproximatelyEquals(
  left: Nutrition,
  right: Nutrition,
  absoluteTolerance = 0.11,
  relativeTolerance = 1e-9,
): boolean {
  return NUTRITION_KEYS.every((key) => {
    const difference = Math.abs(left[key] - right[key]);
    const tolerance = Math.max(
      absoluteTolerance,
      Math.max(Math.abs(left[key]), Math.abs(right[key])) * relativeTolerance,
    );
    return difference <= tolerance;
  });
}

export function snapshotProduct(product: Product, servings: number): ProductSnapshot {
  const safeServings = Math.max(0.01, Number.isFinite(servings) ? servings : 1);
  return Object.freeze({
    productId: product.id,
    name: product.name,
    brand: product.brand,
    serving: Object.freeze({ ...product.serving }),
    servings: safeServings,
    nutritionPerServing: Object.freeze({ ...product.nutritionPerServing }),
    nutrition: Object.freeze(roundNutrition(scaleNutrition(product.nutritionPerServing, safeServings), 2)),
    provenance: Object.freeze({
      ...product.provenance,
      warnings: Object.freeze([...product.provenance.warnings]),
    }),
    eligibility: Object.freeze({ ...product.eligibility }),
  });
}

export function recipeNutrition(
  ingredients: readonly RecipeIngredient[],
  servings: number,
): { nutritionPerServing: Nutrition; macroCoverage: number } {
  const required = ingredients.filter((ingredient) => !ingredient.optional);
  const covered = required.filter((ingredient) => (
    ingredient.snapshot?.provenance.coreMacrosComplete === true
  ));
  const total = required.reduce(
    (sum, ingredient) => ingredient.snapshot ? addNutrition(sum, ingredient.snapshot.nutrition) : sum,
    ZERO_NUTRITION,
  );
  return {
    nutritionPerServing: roundNutrition(scaleNutrition(total, 1 / Math.max(1, servings))),
    macroCoverage: required.length === 0 ? 1 : covered.length / required.length,
  };
}

export function proteinDensity(nutrition: Nutrition): number {
  return nutrition.calories > 0 ? nutrition.proteinG / nutrition.calories * 100 : 0;
}

export function macroDistance(
  nutrition: Nutrition,
  target: { calories: number; proteinG: number },
): number {
  const calorieDelta = Math.abs(nutrition.calories - target.calories) / Math.max(100, target.calories);
  const proteinDelta = Math.abs(nutrition.proteinG - target.proteinG) / Math.max(10, target.proteinG);
  return calorieDelta * 0.45 + proteinDelta * 0.55;
}
