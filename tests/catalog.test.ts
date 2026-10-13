import { describe, expect, it } from 'vitest';
import { STARTER_PRODUCTS, STARTER_RECIPES } from '../src/catalog';
import { containsBlockedDietTerm } from '../src/diet';
import { groceryGuideForProductId } from '../src/grocery';
import { recipeNutrition } from '../src/nutrition';

describe('substantial meal catalog', () => {
  it('contains at least 100 unique one-serving lunch and dinner recipes', () => {
    expect(STARTER_RECIPES.length).toBeGreaterThanOrEqual(100);
    expect(new Set(STARTER_RECIPES.map((recipe) => recipe.id)).size).toBe(STARTER_RECIPES.length);
    expect(new Set(STARTER_RECIPES.map((recipe) => recipe.title.toLowerCase())).size).toBe(STARTER_RECIPES.length);
    expect(STARTER_RECIPES.every((recipe) => recipe.servings === 1)).toBe(true);
    expect(STARTER_RECIPES.every((recipe) => recipe.tags.includes('lunch or dinner'))).toBe(true);
  });

  it('derives complete 800-1300 kcal macros from gram-backed product snapshots', () => {
    const invalid = STARTER_RECIPES.flatMap((recipe) => {
      const recalculated = recipeNutrition(recipe.ingredients, recipe.servings);
      const gramBacked = recipe.ingredients.every((ingredient) => (
        ingredient.snapshot
        && ingredient.snapshot.serving.grams === 100
        && ingredient.amountLabel.includes('g')
      ));
      const valid = recipe.macroCoverage === 1
        && recalculated.macroCoverage === 1
        && recipe.nutritionPerServing.calories >= 800
        && recipe.nutritionPerServing.calories <= 1300
        && JSON.stringify(recipe.nutritionPerServing) === JSON.stringify(recalculated.nutritionPerServing)
        && gramBacked;
      return valid ? [] : [`${recipe.id}:${recipe.nutritionPerServing.calories}`];
    });
    expect(invalid).toEqual([]);
  });

  it('has actionable steps, strict diet safety, and no breakfast language', () => {
    for (const recipe of STARTER_RECIPES) {
      const text = [recipe.id, recipe.title, recipe.description, recipe.cuisine, ...recipe.tags, ...recipe.ingredients.map((item) => item.name), ...recipe.steps].join(' ');
      expect(recipe.steps.length, recipe.title).toBeGreaterThanOrEqual(4);
      expect(recipe.steps.every((step) => step.trim().length >= 20), recipe.title).toBe(true);
      expect(recipe.steps.join(' '), recipe.title).not.toMatch(/\b(?:with|from|and|in|top with)\s*\./i);
      expect(containsBlockedDietTerm(text), recipe.title).toBe(false);
      expect(text).not.toMatch(/\b(?:breakfast|brunch|overnight oats?|pancakes?|waffles?|cereal)\b/i);
    }
  });

  it('uses every exact ingredient in the method and handles eggs, edamame, and cooked staples safely', () => {
    const missing: string[] = [];
    const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const recipe of STARTER_RECIPES) {
      const method = recipe.steps.join(' ').toLowerCase();
      for (const ingredient of recipe.ingredients) {
        const grams = Math.round((ingredient.snapshot?.serving.grams ?? 0) * (ingredient.snapshot?.servings ?? 0));
        const name = escapePattern(ingredient.name.toLowerCase());
        const nameThenGrams = new RegExp(`${name}[^.]{0,80}\\(${grams} g\\)`);
        const gramsThenName = new RegExp(`(?:^|\\D)${grams} g[^.]{0,80}${name}`);
        if (!nameThenGrams.test(method) && !gramsThenName.test(method)) {
          missing.push(`${recipe.id}:${ingredient.name}`);
        }
      }
      if (recipe.ingredients.some((item) => item.productId === 'starter:eggs')) {
        expect(method, recipe.title).toMatch(/160°f|fully set/);
      }
      if (recipe.ingredients.some((item) => item.productId === 'starter:edamame')) {
        expect(method, recipe.title).toMatch(/boil.*edamame|edamame.*boil/);
      }
      expect(method, recipe.title).not.toMatch(/boil (?:the )?\d[^.]*cooked (?:basmati|brown) rice/);
      expect(method, recipe.title).not.toMatch(/boil (?:the )?\d[^.]*cooked pasta/);
    }
    expect(missing).toEqual([]);
  });

  it('does not name sauces that are missing from the plate, and pinto plates are not titled as white beans', () => {
    const absentLabels = [
      { needle: 'greek yogurt', name: 'Plain Greek yogurt' },
      { needle: 'fresh lemon', name: 'Fresh lemon' },
      { needle: 'hot sauce', name: 'Hot sauce' },
      { needle: 'hummus', name: 'Hummus' },
      { needle: 'salsa', name: 'Salsa' },
    ];
    for (const recipe of STARTER_RECIPES) {
      const method = recipe.steps.join(' ').toLowerCase();
      const names = new Set(recipe.ingredients.map((ingredient) => ingredient.name.toLowerCase()));
      for (const label of absentLabels) {
        if (!names.has(label.name.toLowerCase())) expect(method, `${recipe.title} mentions ${label.name}`).not.toContain(label.needle);
      }
      const hasSauce = names.has('salsa') || names.has('hot sauce') || names.has('hummus');
      if (!hasSauce) expect(method, `${recipe.title} mentions fresh sauces`).not.toContain('fresh sauces');
      if (!names.has('plain greek yogurt')) expect(method, `${recipe.title} mentions yogurt`).not.toContain('yogurt');
    }
    const renamed = [
      'starter-recipe:scout-tuscan-white-bean-pasta',
      'starter-recipe:scout-lemon-tofu-white-bean-pasta',
      'starter-recipe:scout-white-bean-chili',
    ];
    expect(STARTER_RECIPES.some((recipe) => /white bean/i.test(recipe.title))).toBe(false);
    for (const id of renamed) {
      const recipe = STARTER_RECIPES.find((item) => item.id === id);
      expect(recipe?.title.toLowerCase()).toContain('pinto');
      expect(recipe?.ingredients.some((ingredient) => ingredient.productId === 'starter:pinto-beans')).toBe(true);
    }
  });

  it('offers useful calorie bands without oversized non-soup portions', () => {
    const low = STARTER_RECIPES.filter((recipe) => recipe.nutritionPerServing.calories < 900);
    const middle = STARTER_RECIPES.filter((recipe) => recipe.nutritionPerServing.calories >= 900 && recipe.nutritionPerServing.calories < 1100);
    const high = STARTER_RECIPES.filter((recipe) => recipe.nutritionPerServing.calories >= 1100);
    expect(low.length).toBeGreaterThanOrEqual(20);
    expect(middle.length).toBeGreaterThanOrEqual(35);
    expect(high.length).toBeLessThanOrEqual(45);
    const bandFor = (calories: number) => calories < 900 ? 'low' : calories < 1_100 ? 'middle' : 'high';
    const firstTwentyBands = new Set(STARTER_RECIPES.slice(0, 20).map((recipe) => bandFor(recipe.nutritionPerServing.calories)));
    expect(firstTwentyBands).toEqual(new Set(['low', 'middle', 'high']));
    for (const band of ['low', 'middle', 'high']) {
      const cuisines = new Set(STARTER_RECIPES.filter((recipe) => bandFor(recipe.nutritionPerServing.calories) === band).map((recipe) => recipe.cuisine));
      expect(cuisines.size, `${band} calorie cuisine breadth`).toBeGreaterThanOrEqual(8);
    }
    for (const recipe of STARTER_RECIPES) {
      const grams = recipe.ingredients.reduce((sum, item) => sum + (item.snapshot?.serving.grams ?? 0) * (item.snapshot?.servings ?? 0), 0);
      const brothStew = recipe.tags.includes('stew') && recipe.ingredients.some((item) => item.productId === 'starter:vegetable-broth');
      if (!brothStew) expect(grams, recipe.title).toBeLessThanOrEqual(1_100);
    }
  });

  it('keeps discrete groceries whole and every displayed quantity practical', () => {
    const increments: Readonly<Record<string, number>> = {
      'starter:eggs': 50,
      'starter:whole-wheat-tortilla': 56,
      'starter:fajita-tortillas': 42,
      'starter:corn-tortillas': 26,
      'starter:naan': 90,
      'starter:paratha': 80,
      'starter:pita': 60,
    };
    for (const recipe of STARTER_RECIPES) {
      for (const ingredient of recipe.ingredients) {
        const grams = (ingredient.snapshot?.serving.grams ?? 0) * (ingredient.snapshot?.servings ?? 0);
        const roundedGrams = Math.round(grams);
        const increment = ingredient.productId ? increments[ingredient.productId] : undefined;
        if (increment) expect(roundedGrams % increment, `${recipe.title}: ${ingredient.name}`).toBe(0);
        expect(Math.abs(grams - roundedGrams), `${recipe.title}: ${ingredient.name}`).toBeLessThan(1e-6);
        expect(ingredient.amountLabel, `${recipe.title}: ${ingredient.name}`).not.toMatch(/\b0\.1 (?:tbsp|tsp)\b/);
      }
    }
  });

  it('uses unique ingredient IDs and recipe signatures', () => {
    const signatures = new Set<string>();
    for (const recipe of STARTER_RECIPES) {
      const ids = recipe.ingredients.map((ingredient) => ingredient.id);
      expect(new Set(ids).size, recipe.title).toBe(ids.length);
      const signature = recipe.ingredients
        .map((ingredient) => `${ingredient.productId}:${ingredient.snapshot?.servings}`)
        .sort()
        .join('|');
      expect(signatures.has(signature), recipe.title).toBe(false);
      signatures.add(signature);
    }
  });

  it('covers broad cuisines and protein families', () => {
    expect(new Set(STARTER_RECIPES.map((recipe) => recipe.cuisine)).size).toBeGreaterThanOrEqual(10);
    expect(new Set(STARTER_RECIPES.map((recipe) => recipe.tags[2])).size).toBeGreaterThanOrEqual(8);
  });

  it('treats legume amounts as cooked weight and requires a real boil for dry kidney beans', () => {
    const legumeIds = ['starter:chickpeas', 'starter:black-beans', 'starter:kidney-beans', 'starter:pinto-beans', 'starter:lentils', 'starter:red-lentils', 'starter:chana-dal', 'starter:urad-dal'];
    const legumeRecipes = STARTER_RECIPES.filter((recipe) => recipe.ingredients.some((item) => legumeIds.includes(item.productId ?? '')));
    expect(legumeRecipes.length).toBeGreaterThan(0);
    for (const recipe of legumeRecipes) {
      const method = recipe.steps.join(' ');
      expect(method, recipe.title).toMatch(/cooked, drained weight/);
      expect(method, recipe.title).toMatch(/dry weight/);
      expect(method, recipe.title).not.toMatch(/already cooked and only need to be heated through/);
    }
    const kidney = STARTER_RECIPES.filter((recipe) => recipe.ingredients.some((item) => item.productId === 'starter:kidney-beans'));
    expect(kidney.length).toBeGreaterThan(0);
    for (const recipe of kidney) {
      expect(recipe.steps.join(' '), recipe.title).toMatch(/at least 10 minutes/);
    }
    const paneer = STARTER_PRODUCTS.find((product) => product.id === 'starter:paneer');
    expect(paneer?.nutritionPerServing.calories).toBe(299);
    expect(paneer?.provenance.warnings.some((warning) => warning.includes('not interchangeable'))).toBe(true);
  });

  it('provides complete source macros and a grocery guide for every tracked product', () => {
    expect(STARTER_PRODUCTS).toHaveLength(62);
    for (const product of STARTER_PRODUCTS) {
      expect(product.serving.grams, product.name).toBe(100);
      expect(product.provenance.coreMacrosComplete, product.name).toBe(true);
      expect(groceryGuideForProductId(product.id), product.name).toBeDefined();
    }
    for (const recipe of STARTER_RECIPES) {
      for (const ingredient of recipe.ingredients) {
        expect(ingredient.productId && groceryGuideForProductId(ingredient.productId), recipe.title).toBeDefined();
      }
    }
  });
});
