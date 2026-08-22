import { describe, expect, it } from 'vitest';
import { STARTER_PRODUCTS, STARTER_RECIPES } from '../src/catalog';
import { classifyVegetarian } from '../src/diet';
import { createEmptyState, type RecipesState } from '../src/model';
import { recipeNutrition, snapshotProduct } from '../src/nutrition';
import {
  RECIPES_STORAGE_FORMAT,
  buildRecipesStorageEnvelope,
  nextRecipesRevision,
  parseProduct,
  parseRecipe,
  parseRecipesState,
  parseRecipesStorageValue,
} from '../src/store';

const NOW = '2026-08-22T12:00:00.000Z';

function populatedState(): RecipesState {
  const initial = createEmptyState(NOW, 'recipes-client-test');
  return {
    ...initial,
    pantry: STARTER_PRODUCTS.slice(0, 3),
    recipes: STARTER_RECIPES.slice(0, 2),
    shopping: [{
      id: 'shopping_test',
      name: 'Spinach',
      amountLabel: '1 bag',
      recipeId: STARTER_RECIPES[0].id,
      checked: false,
      createdAt: NOW,
      updatedAt: NOW,
    }],
  };
}

describe('Recipes state validation', () => {
  it('round-trips products, recipes, snapshots, shopping, settings, and revision metadata', () => {
    const original = populatedState();
    const parsed = parseRecipesState(JSON.parse(JSON.stringify(original)));
    expect(parsed).toEqual(original);
    expect(parsed.recipes[0].nutritionPerServing.proteinG).toBeGreaterThan(0);
    expect(parsed.recipes[0].ingredients[0].snapshot?.provenance.providerName).toBeTruthy();
  });

  it('rejects unsupported versions, duplicate ids, and an invalid vegetarian invariant', () => {
    const wrongVersion = { ...populatedState(), version: 2 };
    expect(() => parseRecipesState(wrongVersion)).toThrow(/version/i);

    const duplicate = JSON.parse(JSON.stringify(populatedState()));
    duplicate.pantry.push(duplicate.pantry[0]);
    expect(() => parseRecipesState(duplicate)).toThrow(/duplicate/i);

    const eggsDisabled = JSON.parse(JSON.stringify(populatedState()));
    eggsDisabled.settings.eggsAllowed = false;
    expect(() => parseRecipesState(eggsDisabled)).toThrow(/ovo-lacto/i);
  });

  it('rejects mismatched millisecond and ISO revision stamps', () => {
    const state = { ...populatedState(), updatedAtMs: Date.parse(NOW) + 1 };
    expect(() => parseRecipesState(state)).toThrow(/same revision/i);
  });

  it('keeps meal targets inside the same bounds enforced by cloud rules', () => {
    for (const [field, value] of [
      ['calorieTarget', 99],
      ['calorieTarget', 2001],
      ['proteinTargetG', 201],
      ['maxCookMinutes', 4],
      ['maxCookMinutes', 241],
    ] as const) {
      const state = JSON.parse(JSON.stringify(populatedState()));
      state.settings[field] = value;
      expect(() => parseRecipesState(state)).toThrow(new RegExp(field, 'i'));
    }
  });

  it('rejects invalid nutrition instead of silently turning it into authoritative macros', () => {
    const product = JSON.parse(JSON.stringify(STARTER_PRODUCTS[0]));
    product.nutritionPerServing.proteinG = -1;
    expect(() => parseProduct(product)).toThrow(/proteinG/i);
  });

  it('rejects pantry products whose source omitted a core macro', () => {
    const product = JSON.parse(JSON.stringify(STARTER_PRODUCTS[0]));
    product.provenance.coreMacrosComplete = false;
    expect(() => parseProduct(product)).toThrow(/missing one or more core macros/i);
  });

  it('fails closed when an unreviewed packaged product is placed in pantry data', () => {
    const state = JSON.parse(JSON.stringify(populatedState()));
    state.pantry[0].eligibility.status = 'review';
    state.pantry[0].eligibility.evidence = 'unknown';
    expect(() => parseRecipesState(state)).toThrow(/reviewed and approved/i);
  });

  it('persists only provider-certified analogs and keeps exact analog recipe references auditable', () => {
    const analog = {
      ...STARTER_PRODUCTS[0],
      id: 'off:certified-analog',
      name: 'Plant-based chicken nuggets',
      aliases: ['vegan chicken nuggets'],
      categories: ['plant-based meat alternatives'],
      ingredientsText: 'soy protein, wheat flour, canola oil',
      provenance: {
        ...STARTER_PRODUCTS[0].provenance,
        kind: 'open-food-facts' as const,
        providerName: 'Open Food Facts',
      },
      eligibility: classifyVegetarian({
        name: 'Plant-based chicken nuggets',
        ingredientsText: 'soy protein, wheat flour, canola oil',
        labels: ['en:certified-vegan'],
        now: NOW,
      }),
    };
    const parsedAnalog = parseProduct(analog);
    expect(parsedAnalog.eligibility).toMatchObject({ status: 'allowed', evidence: 'provider-label' });

    const ingredient = {
      id: 'ingredient_certified_analog',
      productId: parsedAnalog.id,
      name: parsedAnalog.name,
      amountLabel: '1 serving',
      optional: false,
      snapshot: snapshotProduct(parsedAnalog, 1),
    };
    const totals = recipeNutrition([ingredient], 1);
    expect(() => parseRecipe({
      id: 'recipe_certified_analog',
      title: `${parsedAnalog.name} bowl`,
      description: `A quick ${parsedAnalog.name} dinner.`,
      cuisine: 'Everyday',
      tags: ['weeknight'],
      prepMinutes: 5,
      cookMinutes: 10,
      servings: 1,
      ingredients: [ingredient],
      steps: [`Heat the ${parsedAnalog.name}.`, 'Serve hot.'],
      nutritionPerServing: totals.nutritionPerServing,
      macroCoverage: totals.macroCoverage,
      dietStatus: 'allowed',
      origin: 'manual',
      createdAt: NOW,
      updatedAt: NOW,
    })).not.toThrow();
  });

  it('rejects animal products smuggled into a shopping list', () => {
    const state = JSON.parse(JSON.stringify(populatedState()));
    state.shopping[0].name = 'pancetta';
    expect(() => parseRecipesState(state)).toThrow(/shopping.*vegetarian boundary/i);
  });

  it('rejects recipe totals, coverage, and snapshot math that do not agree with product snapshots', () => {
    const wrongTotal = JSON.parse(JSON.stringify(STARTER_RECIPES[0]));
    wrongTotal.nutritionPerServing.calories += 25;
    expect(() => parseRecipe(wrongTotal)).toThrow(/nutritionPerServing.*snapshots/i);

    const wrongCoverage = JSON.parse(JSON.stringify(STARTER_RECIPES[0]));
    wrongCoverage.macroCoverage = 0.5;
    expect(() => parseRecipe(wrongCoverage)).toThrow(/macroCoverage.*snapshots/i);

    const wrongSnapshot = JSON.parse(JSON.stringify(STARTER_RECIPES[0]));
    wrongSnapshot.ingredients[0].snapshot.nutrition.proteinG += 2;
    expect(() => parseRecipe(wrongSnapshot)).toThrow(/serving snapshot/i);
  });

  it('accepts harmless float drift but returns freshly calculated canonical totals', () => {
    const drifted = JSON.parse(JSON.stringify(STARTER_RECIPES[0]));
    drifted.nutritionPerServing.calories += 0.05;
    drifted.nutritionPerServing.proteinG -= 0.05;
    drifted.macroCoverage -= 0.0005;

    const parsed = parseRecipe(drifted);
    expect(parsed.nutritionPerServing).toEqual(STARTER_RECIPES[0].nutritionPerServing);
    expect(parsed.macroCoverage).toBe(STARTER_RECIPES[0].macroCoverage);
  });

  it('keeps every bundled recipe inside the same snapshot-derived invariant', () => {
    for (const recipe of STARTER_RECIPES) {
      const parsed = parseRecipe(JSON.parse(JSON.stringify(recipe)), recipe.id);
      expect(parsed.nutritionPerServing, recipe.title).toEqual(recipe.nutritionPerServing);
      expect(parsed.macroCoverage, recipe.title).toBe(recipe.macroCoverage);
      expect(parsed.ingredients.every((ingredient) => ingredient.snapshot), recipe.title).toBe(true);
    }
  });

  it('marks zero-filled unknown starter nutrients as partial with a specific warning', () => {
    const paneer = STARTER_PRODUCTS.find((product) => product.id === 'starter:paneer');
    expect(paneer?.nutritionPerServing.sugarG).toBe(0);
    expect(paneer?.provenance.quality).toBe('partial');
    expect(paneer?.provenance.warnings.join(' ')).toMatch(/does not include.*sugar.*displayed as 0/i);
    expect(STARTER_PRODUCTS.some((product) => product.provenance.quality === 'verified')).toBe(false);
  });
});

describe('local storage contract', () => {
  it('writes one validated state into a versioned envelope', () => {
    const state = populatedState();
    const envelope = buildRecipesStorageEnvelope(state, Date.parse(NOW) + 10);
    expect(envelope.storageFormat).toBe(RECIPES_STORAGE_FORMAT);
    expect(envelope.savedAtMs).toBe(Date.parse(NOW) + 10);
    expect(parseRecipesStorageValue(JSON.parse(JSON.stringify(envelope))).state).toEqual(state);
  });

  it('refuses to persist a state with forged recipe macros', () => {
    const tampered = JSON.parse(JSON.stringify(populatedState()));
    tampered.recipes[0].nutritionPerServing.calories += 100;
    expect(() => buildRecipesStorageEnvelope(tampered)).toThrow(/nutritionPerServing.*snapshots/i);
  });

  it('also accepts a bare validated state for hand-edited imports', () => {
    const state = populatedState();
    expect(parseRecipesStorageValue(JSON.parse(JSON.stringify(state))).state).toEqual(state);
  });

  it('advances the logical clock even when the device wall clock is behind', () => {
    const state = populatedState();
    const revision = nextRecipesRevision(state, 'recipes-client-phone', state.updatedAtMs - 50_000);
    expect(revision.updatedAtMs).toBe(state.updatedAtMs + 1);
    expect(Date.parse(revision.updatedAt)).toBe(revision.updatedAtMs);
    expect(revision.clientId).toBe('recipes-client-phone');
  });
});
