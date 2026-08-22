import { describe, expect, it } from 'vitest';
import { STARTER_PRODUCTS } from '../src/catalog';
import type { RecipeIngredient } from '../src/model';
import { recipeNutrition, scaleNutrition, snapshotProduct } from '../src/nutrition';

describe('nutrition math', () => {
  it('marks every typed starter product as having all four source core macros', () => {
    expect(STARTER_PRODUCTS.every((product) => product.provenance.coreMacrosComplete)).toBe(true);
  });

  it('scales each macro without mutating the source', () => {
    const product = STARTER_PRODUCTS[0];
    const scaled = scaleNutrition(product.nutritionPerServing, 2);
    expect(scaled.calories).toBe(product.nutritionPerServing.calories * 2);
    expect(product.nutritionPerServing.calories).not.toBe(scaled.calories);
  });

  it('calculates per-serving macros only from immutable snapshots', () => {
    const ingredients: RecipeIngredient[] = STARTER_PRODUCTS.slice(0, 2).map((product) => ({
      id: `ingredient:${product.id}`,
      productId: product.id,
      name: product.name,
      amountLabel: product.serving.label,
      optional: false,
      snapshot: snapshotProduct(product, 1),
    }));
    const totalCalories = ingredients.reduce((sum, ingredient) => sum + (ingredient.snapshot?.nutrition.calories ?? 0), 0);
    const result = recipeNutrition(ingredients, 2);
    expect(result.nutritionPerServing.calories).toBeCloseTo(totalCalories / 2, 1);
    expect(result.macroCoverage).toBe(1);
    expect(ingredients.every((ingredient) => ingredient.snapshot?.provenance.coreMacrosComplete)).toBe(true);
  });

  it('excludes zero-filled incomplete core macros from recipe coverage', () => {
    const complete = STARTER_PRODUCTS[0];
    const incomplete = {
      ...STARTER_PRODUCTS[1],
      id: 'dynamic:incomplete-tofu',
      nutritionPerServing: {
        ...STARTER_PRODUCTS[1].nutritionPerServing,
        fatG: 0,
      },
      provenance: {
        ...STARTER_PRODUCTS[1].provenance,
        quality: 'partial' as const,
        coreMacrosComplete: false,
        warnings: ['Fat is missing and displayed as zero.'],
      },
    };
    const completeSnapshot = snapshotProduct(complete, 1);
    const incompleteSnapshot = snapshotProduct(incomplete, 1);
    const ingredients: RecipeIngredient[] = [
      {
        id: 'complete',
        productId: complete.id,
        name: complete.name,
        amountLabel: complete.serving.label,
        optional: false,
        snapshot: completeSnapshot,
      },
      {
        id: 'incomplete',
        productId: incomplete.id,
        name: incomplete.name,
        amountLabel: incomplete.serving.label,
        optional: false,
        snapshot: incompleteSnapshot,
      },
    ];

    expect(incompleteSnapshot.nutrition.fatG).toBe(0);
    expect(incompleteSnapshot.provenance.coreMacrosComplete).toBe(false);
    expect(recipeNutrition(ingredients, 1).macroCoverage).toBe(0.5);
  });

  it('keeps optional snapshots auditable without adding them to baseline totals or coverage', () => {
    const requiredProduct = STARTER_PRODUCTS[0];
    const optionalProduct = STARTER_PRODUCTS[1];
    const requiredSnapshot = snapshotProduct(requiredProduct, 1);
    const optionalSnapshot = snapshotProduct(optionalProduct, 5);
    const result = recipeNutrition([
      {
        id: 'required',
        productId: requiredProduct.id,
        name: requiredProduct.name,
        amountLabel: requiredProduct.serving.label,
        optional: false,
        snapshot: requiredSnapshot,
      },
      {
        id: 'optional',
        productId: optionalProduct.id,
        name: optionalProduct.name,
        amountLabel: optionalProduct.serving.label,
        optional: true,
        snapshot: optionalSnapshot,
      },
    ], 1);

    expect(result.nutritionPerServing).toEqual(requiredSnapshot.nutrition);
    expect(result.macroCoverage).toBe(1);
  });

  it('reports partial macro coverage for an unresolved required ingredient', () => {
    const result = recipeNutrition([{
      id: 'missing',
      name: 'unknown sauce',
      amountLabel: '2 tbsp',
      optional: false,
    }], 1);
    expect(result.macroCoverage).toBe(0);
    expect(result.nutritionPerServing.calories).toBe(0);
  });
});
