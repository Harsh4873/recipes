import { describe, expect, it } from 'vitest';
import { assembleAiRecipeDraft, RecipeAiError } from '../src/ai-recipe';
import { STARTER_PRODUCTS } from '../src/catalog';
import { recipeNutrition } from '../src/nutrition';

const NOW = '2026-08-22T12:00:00.000Z';
const selected = STARTER_PRODUCTS.filter((product) => [
  'starter:tofu-firm',
  'starter:basmati-rice',
  'starter:olive-oil',
].includes(product.id));

function draft() {
  return {
    title: 'Tofu rice bowl',
    description: 'A quick tofu and rice dinner.',
    cuisine: 'Everyday',
    tags: ['high protein'],
    prepMinutes: 5,
    cookMinutes: 15,
    servings: 2,
    ingredients: [
      { productId: 'starter:tofu-firm', servings: 2, amountLabel: '2 × 100 g', optional: false },
      { productId: 'starter:basmati-rice', servings: 2, amountLabel: '2 cups', optional: false },
    ],
    steps: ['Brown the firm tofu with black pepper.', 'Fold in the cooked basmati rice and serve.'],
  };
}

describe('Firebase AI recipe trust boundary', () => {
  it('builds nutrition only from selected immutable product snapshots', () => {
    const recipe = assembleAiRecipeDraft(draft(), selected, NOW);
    const recalculated = recipeNutrition(recipe.ingredients, recipe.servings);

    expect(recipe.createdAt).toBe(NOW);
    expect(recipe.ingredients.map((ingredient) => ingredient.productId)).toEqual([
      'starter:tofu-firm',
      'starter:basmati-rice',
    ]);
    expect(recipe.ingredients.every((ingredient) => ingredient.snapshot)).toBe(true);
    expect(recipe.nutritionPerServing).toEqual(recalculated.nutritionPerServing);
    expect(recipe.macroCoverage).toBe(1);
  });

  it('rejects vegetarian violations hidden in tags or amount labels', () => {
    const tagged = draft();
    tagged.tags = ['fish night'];
    expect(() => assembleAiRecipeDraft(tagged, selected, NOW)).toThrow(/vegetarian boundary/i);

    const mislabeled = draft();
    mislabeled.ingredients[0].amountLabel = '1 cup chicken stock';
    expect(() => assembleAiRecipeDraft(mislabeled, selected, NOW)).toThrow(/vegetarian boundary/i);
  });

  it('rejects selected-product escapes, duplicate ids, and untracked caloric ingredients', () => {
    const outsidePantry = draft();
    outsidePantry.ingredients[1].productId = 'starter:quinoa';
    expect(() => assembleAiRecipeDraft(outsidePantry, selected, NOW)).toThrow(/outside the selected pantry/i);

    const duplicate = draft();
    duplicate.ingredients[1].productId = 'starter:tofu-firm';
    expect(() => assembleAiRecipeDraft(duplicate, selected, NOW)).toThrow(/repeated/i);

    const untrackedOil = draft();
    untrackedOil.steps[0] = 'Brown the firm tofu in olive oil.';
    expect(() => assembleAiRecipeDraft(untrackedOil, selected, NOW)).toThrow(/without a product snapshot/i);

    for (const instruction of [
      'Sauté diced zucchini with the tofu.',
      'Deglaze the pan with red wine.',
      'Fold chopped dates into the rice.',
    ]) {
      const untrackedFood = draft();
      untrackedFood.steps[0] = instruction;
      expect(() => assembleAiRecipeDraft(untrackedFood, selected, NOW), instruction).toThrow(/without a product snapshot/i);
    }
  });

  it('allows a caloric food only when that product is represented by a recipe snapshot', () => {
    const withTrackedOil = draft();
    withTrackedOil.ingredients.push({
      productId: 'starter:olive-oil',
      servings: 0.5,
      amountLabel: '1/2 tbsp olive oil',
      optional: false,
    });
    withTrackedOil.steps[0] = 'Brown the firm tofu in olive oil.';

    const recipe = assembleAiRecipeDraft(withTrackedOil, selected, NOW);
    expect(recipe.ingredients.some((ingredient) => ingredient.productId === 'starter:olive-oil')).toBe(true);
    expect(recipe.nutritionPerServing).toEqual(recipeNutrition(recipe.ingredients, 2).nutritionPerServing);

    withTrackedOil.steps[0] = 'Brown the firm tofu in canola oil.';
    expect(() => assembleAiRecipeDraft(withTrackedOil, selected, NOW)).toThrow(/canola oil.*without a product snapshot/i);
  });

  it('keeps optional product snapshots auditable but outside baseline nutrition', () => {
    const baseline = assembleAiRecipeDraft(draft(), selected, NOW);
    const withOptionalOil = draft();
    withOptionalOil.ingredients.push({
      productId: 'starter:olive-oil',
      servings: 1,
      amountLabel: '1 tbsp olive oil, optional',
      optional: true,
    });
    withOptionalOil.steps[0] = 'Optionally brown the firm tofu in olive oil.';

    const recipe = assembleAiRecipeDraft(withOptionalOil, selected, NOW);
    const optional = recipe.ingredients.find((ingredient) => ingredient.optional);
    expect(optional?.snapshot).toBeDefined();
    expect(recipe.nutritionPerServing).toEqual(baseline.nutritionPerServing);
    expect(recipe.nutritionPerServing).toEqual(recipeNutrition(recipe.ingredients, recipe.servings).nutritionPerServing);
  });

  it('fails closed when fewer than two reviewed products remain', () => {
    expect(() => assembleAiRecipeDraft(draft(), selected.slice(0, 1), NOW)).toThrow(RecipeAiError);
  });
});
