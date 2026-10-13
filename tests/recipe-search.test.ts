import { describe, expect, it } from 'vitest';
import { STARTER_RECIPES } from '../src/catalog';
import {
  filterAndSortRecipes,
  RECIPE_CUISINES,
  RECIPE_PROTEINS,
  recipeProteinFamilies,
} from '../src/recipe-search';

describe('recipe catalog search', () => {
  it('searches title, cuisine, tags, and ingredient names with AND token matching', () => {
    expect(filterAndSortRecipes(STARTER_RECIPES, { query: 'paneer tikka' }).map((recipe) => recipe.title)).toContain('Paneer tikka rice bowl');
    expect(filterAndSortRecipes(STARTER_RECIPES, { query: 'korean tofu' }).every((recipe) => recipe.cuisine === 'Korean-inspired')).toBe(true);
    expect(filterAndSortRecipes(STARTER_RECIPES, { query: 'lunch edamame' }).length).toBeGreaterThan(0);
    expect(filterAndSortRecipes(STARTER_RECIPES, { query: 'definitely absent phrase' })).toEqual([]);
  });

  it('combines cuisine, protein, time, calorie, and minimum-protein filters', () => {
    const results = filterAndSortRecipes(STARTER_RECIPES, {
      cuisines: ['Indian'],
      proteins: ['Tofu', 'Paneer'],
      maxMinutes: 50,
      calorieBand: '1100+',
      minProteinG: 30,
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((recipe) => recipe.cuisine === 'Indian')).toBe(true);
    expect(results.every((recipe) => recipeProteinFamilies(recipe).some((family) => ['Tofu', 'Paneer'].includes(family)))).toBe(true);
    expect(results.every((recipe) => recipe.prepMinutes + recipe.cookMinutes <= 50)).toBe(true);
    expect(results.every((recipe) => recipe.nutritionPerServing.calories >= 1100)).toBe(true);
    expect(results.every((recipe) => recipe.nutritionPerServing.proteinG >= 30)).toBe(true);
  });

  it('sorts deterministically without mutating the source array', () => {
    const original = STARTER_RECIPES.map((recipe) => recipe.id);
    for (const sort of ['recommended', 'fastest', 'protein', 'calories'] as const) {
      const first = filterAndSortRecipes(STARTER_RECIPES, { sort }).map((recipe) => recipe.id);
      const second = filterAndSortRecipes(STARTER_RECIPES, { sort }).map((recipe) => recipe.id);
      expect(first).toEqual(second);
    }
    const fastest = filterAndSortRecipes(STARTER_RECIPES, { sort: 'fastest' });
    const mostProtein = filterAndSortRecipes(STARTER_RECIPES, { sort: 'protein' });
    const calories = filterAndSortRecipes(STARTER_RECIPES, { sort: 'calories' });
    expect(fastest[0].prepMinutes + fastest[0].cookMinutes).toBeLessThanOrEqual(fastest.at(-1)!.prepMinutes + fastest.at(-1)!.cookMinutes);
    expect(mostProtein[0].nutritionPerServing.proteinG).toBeGreaterThanOrEqual(mostProtein.at(-1)!.nutritionPerServing.proteinG);
    expect(calories[0].nutritionPerServing.calories).toBeGreaterThanOrEqual(calories.at(-1)!.nutritionPerServing.calories);
    expect(STARTER_RECIPES.map((recipe) => recipe.id)).toEqual(original);
  });

  it('matches the tagged main protein rather than every ingredient on the plate', () => {
    const cheese = filterAndSortRecipes(STARTER_RECIPES, { proteins: ['Cheese'] });
    expect(cheese.length).toBeGreaterThan(0);
    expect(cheese.every((recipe) => recipe.tags.includes('Cheddar') || recipe.tags.includes('Mozzarella') || recipe.tags.includes('Cottage cheese'))).toBe(true);
    expect(cheese.some((recipe) => recipe.id === 'starter-recipe:lentil-taco-bowl')).toBe(false);

    const beans = filterAndSortRecipes(STARTER_RECIPES, { proteins: ['Beans'] });
    expect(beans.some((recipe) => recipe.id === 'starter-recipe:caribbean-tofu-rice-beans')).toBe(false);
    expect(beans.some((recipe) => recipe.id === 'starter-recipe:black-bean-burrito-bowl')).toBe(true);

    const eggs = filterAndSortRecipes(STARTER_RECIPES, { proteins: ['Eggs'] });
    expect(eggs.every((recipe) => recipe.tags.includes('Eggs'))).toBe(true);
    expect(eggs.some((recipe) => recipe.id === 'starter-recipe:orange-tofu-fried-rice')).toBe(false);

    const lentils = filterAndSortRecipes(STARTER_RECIPES, { proteins: ['Lentils'] });
    expect(lentils.some((recipe) => recipe.id === 'starter-recipe:scout-dal-tadka-rice')).toBe(true);
    expect(lentils.some((recipe) => recipe.id === 'starter-recipe:scout-lentil-baked-ziti')).toBe(true);
    expect(cheese.some((recipe) => recipe.id === 'starter-recipe:scout-lentil-baked-ziti')).toBe(false);
    expect(beans.some((recipe) => recipe.id === 'starter-recipe:scout-hummus-pasta')).toBe(true);
    expect(filterAndSortRecipes(STARTER_RECIPES, { proteins: ['Greek yogurt'] }).some((recipe) => recipe.id === 'starter-recipe:scout-dal-tadka-rice')).toBe(false);

    const filters = ['Paneer', 'Tofu', 'Beans', 'Lentils', 'Eggs', 'Tempeh', 'Seitan', 'Cheese', 'Edamame', 'Greek yogurt', 'Green peas'];
    const covered = new Set(filters.flatMap((protein) => filterAndSortRecipes(STARTER_RECIPES, { proteins: [protein] }).map((recipe) => recipe.id)));
    expect(STARTER_RECIPES.every((recipe) => covered.has(recipe.id))).toBe(true);
  });

  it('supports the umbrella protein filters shown in the recipe browser', () => {
    for (const protein of ['Beans', 'Lentils', 'Cheese']) {
      expect(filterAndSortRecipes(STARTER_RECIPES, { proteins: [protein] }).length, protein).toBeGreaterThan(0);
    }
  });

  it('exports complete deterministic facet values', () => {
    expect(RECIPE_CUISINES.length).toBeGreaterThanOrEqual(10);
    expect(RECIPE_PROTEINS.length).toBeGreaterThanOrEqual(8);
    expect(RECIPE_CUISINES).toEqual([...RECIPE_CUISINES].sort((left, right) => left.localeCompare(right)));
    expect(RECIPE_PROTEINS).toEqual([...RECIPE_PROTEINS].sort((left, right) => left.localeCompare(right)));
    expect(RECIPE_PROTEINS).toEqual(expect.arrayContaining(['Tofu', 'Paneer', 'Tempeh', 'Eggs', 'Chickpeas']));
  });
});
