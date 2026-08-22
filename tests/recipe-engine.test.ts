import { describe, expect, it } from 'vitest';
import { STARTER_PRODUCTS, STARTER_RECIPES } from '../src/catalog';
import type { Product, Recipe } from '../src/model';
import {
  findIngredientPantryMatch,
  generateSmartRecipes,
  ingredientIsAvailable,
  matchRecipes,
  missingIngredients,
} from '../src/recipe-engine';

function starterProduct(id: string): Product {
  const product = STARTER_PRODUCTS.find((candidate) => candidate.id === id);
  if (!product) throw new Error(`Missing test product ${id}`);
  return product;
}

function externalProduct(
  starterId: string,
  overrides: Partial<Product> & Pick<Product, 'id' | 'name'>,
): Product {
  const base = starterProduct(starterId);
  return {
    ...base,
    ...overrides,
    categories: overrides.categories ?? base.categories,
    aliases: overrides.aliases ?? base.aliases,
    provenance: overrides.provenance ?? {
      ...base.provenance,
      kind: 'manual',
      providerName: 'Package label',
      externalId: undefined,
    },
    eligibility: overrides.eligibility ?? {
      status: 'allowed',
      evidence: 'owner-approved',
      reason: 'Reviewed for this test.',
      checkedAt: '2026-08-22T12:00:00.000Z',
    },
  };
}

function recipeById(id: string): Recipe {
  const recipe = STARTER_RECIPES.find((candidate) => candidate.id === id);
  if (!recipe) throw new Error(`Missing test recipe ${id}`);
  return recipe;
}

describe('two-way recipe engine', () => {
  it('ranks recipes with complete pantry coverage before recipes with missing products', () => {
    const recipe = STARTER_RECIPES[0];
    const ids = new Set(recipe.ingredients.flatMap((ingredient) => ingredient.productId ? [ingredient.productId] : []));
    const pantry = STARTER_PRODUCTS.filter((product) => ids.has(product.id));
    const matches = matchRecipes(STARTER_RECIPES, pantry, { calories: 550, proteinG: 30 });
    expect(matches[0].recipe.id).toBe(recipe.id);
    expect(matches[0].coverage).toBe(1);
    expect(missingIngredients(matches[0].recipe, pantry)).toHaveLength(0);
  });

  it('turns a product selection into allowed macro-calculated recipe drafts', () => {
    const ids = ['starter:tofu-firm', 'starter:basmati-rice', 'starter:mixed-vegetables', 'starter:tomato-sauce'];
    const products = STARTER_PRODUCTS.filter((product) => ids.includes(product.id));
    const recipes = generateSmartRecipes(products, { calories: 550, proteinG: 30 }, '2026-08-22T12:00:00.000Z');
    expect(recipes.length).toBeGreaterThan(0);
    expect(recipes.every((recipe) => recipe.dietStatus === 'allowed')).toBe(true);
    expect(recipes.every((recipe) => recipe.macroCoverage === 1)).toBe(true);
    expect(recipes.every((recipe) => recipe.nutritionPerServing.calories > 0)).toBe(true);
  });

  it('recognizes allowed OFF, USDA, and manual equivalents of starter ingredients', () => {
    const recipe = recipeById('starter-recipe:palak-paneer-wrap');
    const directIds = new Set(['starter:spinach', 'starter:tomato-sauce', 'starter:onion']);
    const pantry: Product[] = [
      ...STARTER_PRODUCTS.filter((product) => directIds.has(product.id)),
      externalProduct('starter:paneer', {
        id: 'usda:2705740',
        name: 'Indian fresh cheese',
        aliases: [],
        categories: ['Dairy and Egg Products'],
        provenance: {
          ...starterProduct('starter:paneer').provenance,
          kind: 'usda',
          providerName: 'USDA FoodData Central',
          externalId: '2705740',
        },
      }),
      externalProduct('starter:whole-wheat-tortilla', {
        id: 'off:0041220000001',
        name: 'H-E-B Whole Wheat Flour Tortillas',
        aliases: ['whole wheat tortillas'],
        categories: ['Tortillas and wraps'],
        provenance: {
          ...starterProduct('starter:whole-wheat-tortilla').provenance,
          kind: 'open-food-facts',
          providerName: 'Open Food Facts',
          externalId: '0041220000001',
        },
      }),
    ];

    const [match] = matchRecipes([recipe], pantry, { calories: 550, proteinG: 30 });
    expect(match.coverage).toBe(1);
    expect(match.missing).toEqual([]);
    expect(missingIngredients(recipe, pantry)).toEqual([]);
  });

  it('matches normalized food aliases and category names conservatively', () => {
    const recipe = recipeById('starter-recipe:chana-basmati');
    const pantry: Product[] = [
      externalProduct('starter:chickpeas', {
        id: 'off:garbanzo-example',
        name: 'Garbanzo Beans',
        aliases: ['chana'],
        categories: ['Beans and legumes'],
      }),
      externalProduct('starter:basmati-rice', {
        id: 'usda:basmati-example',
        name: 'Basmati Rice, prepared',
        aliases: [],
        categories: ['Rice'],
      }),
      externalProduct('starter:tomato-sauce', {
        id: 'manual:tomato-sauce',
        name: 'Tomato passata',
        aliases: ['tomato sauce'],
        categories: ['Pasta sauces'],
      }),
      externalProduct('starter:spinach', {
        id: 'off:spinach-example',
        name: 'Leafy greens',
        aliases: [],
        categories: ['Frozen spinach'],
      }),
      externalProduct('starter:onion', {
        id: 'manual:onion-example',
        name: 'Yellow onions',
        aliases: [],
        categories: ['Fresh vegetables'],
      }),
    ];

    expect(matchRecipes([recipe], pantry, { calories: 550, proteinG: 30 })[0].coverage).toBe(1);
    expect(missingIngredients(recipe, pantry)).toHaveLength(0);
  });

  it('does not confuse adjacent products or unapproved products with recipe ingredients', () => {
    const recipe = recipeById('starter-recipe:egg-bhurji-tacos');
    const cornTortillaChips = externalProduct('starter:corn-tortillas', {
      id: 'off:corn-chips',
      name: 'Corn Tortilla Chips',
      aliases: [],
      categories: ['Snack chips'],
    });
    const tomatoSauce = externalProduct('starter:tomato', {
      id: 'usda:tomato-sauce',
      name: 'Tomato sauce',
      aliases: [],
      categories: ['Sauces'],
    });
    const unapprovedEggs = externalProduct('starter:eggs', {
      id: 'off:eggs-review',
      name: 'Whole Eggs',
      eligibility: {
        status: 'review',
        evidence: 'unknown',
        reason: 'Not reviewed.',
        checkedAt: '2026-08-22T12:00:00.000Z',
      },
    });

    const missing = missingIngredients(recipe, [cornTortillaChips, tomatoSauce, unapprovedEggs]);
    expect(missing.map((ingredient) => ingredient.name)).toEqual(expect.arrayContaining([
      'Whole eggs',
      'Corn tortillas',
    ]));

    const chanaRecipe = recipeById('starter-recipe:chana-basmati');
    const chickpeaPasta = externalProduct('starter:chickpeas', {
      id: 'off:chickpea-pasta',
      name: 'Chickpea pasta',
      aliases: ['garbanzo beans'],
      categories: ['Chickpeas and pastas'],
    });
    expect(missingIngredients(chanaRecipe, [chickpeaPasta]).some((ingredient) => ingredient.name === 'Cooked chickpeas')).toBe(true);

    const spinachDip = externalProduct('starter:spinach', {
      id: 'off:spinach-dip',
      name: 'Spinach dip',
      aliases: ['spinach'],
      categories: ['Spinach products'],
    });
    expect(missingIngredients(chanaRecipe, [spinachDip]).some((ingredient) => ingredient.name === 'Frozen spinach')).toBe(true);
  });

  it('does not use finished meals as substitutes for their component ingredients', () => {
    const cases = [
      {
        recipe: recipeById('starter-recipe:palak-paneer-wrap'),
        ingredientName: 'Paneer',
        product: externalProduct('starter:paneer', {
          id: 'off:paneer-curry',
          name: 'Paneer curry entrée',
          aliases: ['paneer'],
          categories: ['Frozen meals'],
        }),
      },
      {
        recipe: recipeById('starter-recipe:black-bean-quesadilla'),
        ingredientName: 'Black beans',
        product: externalProduct('starter:black-beans', {
          id: 'usda:black-bean-burger',
          name: 'Black bean burger',
          aliases: ['black beans'],
          categories: ['Meatless burgers'],
        }),
      },
      {
        recipe: recipeById('starter-recipe:chana-basmati'),
        ingredientName: 'Cooked basmati rice',
        product: externalProduct('starter:basmati-rice', {
          id: 'off:rice-bowl',
          name: 'Basmati rice bowl',
          aliases: ['basmati rice'],
          categories: ['Prepared bowls'],
        }),
      },
      {
        recipe: recipeById('starter-recipe:rajma-wrap'),
        ingredientName: 'Whole-wheat tortilla',
        product: externalProduct('starter:whole-wheat-tortilla', {
          id: 'off:burrito',
          name: 'Whole-wheat bean burrito',
          aliases: ['whole wheat tortilla'],
          categories: ['Burritos and entrées'],
        }),
      },
    ];

    for (const testCase of cases) {
      const ingredient = testCase.recipe.ingredients.find((candidate) => candidate.name === testCase.ingredientName);
      if (!ingredient) throw new Error(`Missing test ingredient ${testCase.ingredientName}`);
      expect(findIngredientPantryMatch(ingredient, [testCase.product]), testCase.product.name).toBeUndefined();
      expect(ingredientIsAvailable(ingredient, [testCase.product]), testCase.product.name).toBe(false);
      expect(missingIngredients(testCase.recipe, [testCase.product]), testCase.product.name).toContain(ingredient);
    }
  });
});
