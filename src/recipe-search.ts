import { STARTER_RECIPES } from './catalog';
import type { Recipe } from './model';

export type RecipeSort = 'recommended' | 'fastest' | 'protein' | 'calories';
export type RecipeCalorieBand = '800-899' | '900-1099' | '1100+';

export interface RecipeSearchOptions {
  readonly query?: string;
  readonly cuisines?: readonly string[];
  readonly proteins?: readonly string[];
  readonly maxMinutes?: number;
  readonly calorieBand?: RecipeCalorieBand;
  readonly minProteinG?: number;
  readonly sort?: RecipeSort;
}

const PROTEIN_BY_PRODUCT_ID: Readonly<Record<string, string>> = Object.freeze({
  'starter:tofu-firm': 'Tofu',
  'starter:paneer': 'Paneer',
  'starter:tempeh': 'Tempeh',
  'starter:seitan': 'Seitan',
  'starter:eggs': 'Eggs',
  'starter:greek-yogurt': 'Greek yogurt',
  'starter:cottage-cheese': 'Cottage cheese',
  'starter:cheddar': 'Cheddar',
  'starter:mozzarella': 'Mozzarella',
  'starter:edamame': 'Edamame',
  'starter:chickpeas': 'Chickpeas',
  'starter:black-beans': 'Black beans',
  'starter:kidney-beans': 'Kidney beans',
  'starter:pinto-beans': 'Pinto beans',
  'starter:lentils': 'Lentils',
  'starter:red-lentils': 'Red lentils',
  'starter:chana-dal': 'Chana dal',
  'starter:urad-dal': 'Urad dal',
  'starter:green-peas': 'Green peas',
});

function normalized(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function recipeProteinFamilies(recipe: Recipe): string[] {
  const values = recipe.ingredients.flatMap((ingredient) => {
    const label = ingredient.productId ? PROTEIN_BY_PRODUCT_ID[ingredient.productId] : undefined;
    return label ? [label] : [];
  });
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export const RECIPE_CUISINES: readonly string[] = Object.freeze(
  [...new Set(STARTER_RECIPES.map((recipe) => recipe.cuisine))].sort((left, right) => left.localeCompare(right)),
);

export const RECIPE_PROTEINS: readonly string[] = Object.freeze(
  [...new Set(STARTER_RECIPES.flatMap(recipeProteinFamilies))].sort((left, right) => left.localeCompare(right)),
);

function inCalorieBand(recipe: Recipe, band: RecipeCalorieBand | undefined): boolean {
  const calories = recipe.nutritionPerServing.calories;
  if (band === '800-899') return calories >= 800 && calories < 900;
  if (band === '900-1099') return calories >= 900 && calories < 1100;
  if (band === '1100+') return calories >= 1100;
  return true;
}

function titleOrder(left: Recipe, right: Recipe): number {
  return left.title.localeCompare(right.title) || left.id.localeCompare(right.id);
}

function compareRecipes(sort: RecipeSort): (left: Recipe, right: Recipe) => number {
  if (sort === 'fastest') return (left, right) => (
    left.prepMinutes + left.cookMinutes - right.prepMinutes - right.cookMinutes
    || right.nutritionPerServing.proteinG - left.nutritionPerServing.proteinG
    || titleOrder(left, right)
  );
  if (sort === 'protein') return (left, right) => (
    right.nutritionPerServing.proteinG - left.nutritionPerServing.proteinG
    || left.nutritionPerServing.calories - right.nutritionPerServing.calories
    || titleOrder(left, right)
  );
  if (sort === 'calories') return (left, right) => (
    right.nutritionPerServing.calories - left.nutritionPerServing.calories
    || right.nutritionPerServing.proteinG - left.nutritionPerServing.proteinG
    || titleOrder(left, right)
  );
  return (left, right) => (
    Math.abs(left.nutritionPerServing.calories - 1_000) - Math.abs(right.nutritionPerServing.calories - 1_000)
    || right.nutritionPerServing.proteinG - left.nutritionPerServing.proteinG
    || left.prepMinutes + left.cookMinutes - right.prepMinutes - right.cookMinutes
    || titleOrder(left, right)
  );
}

function proteinFamilyMatches(family: string, filter: string): boolean {
  if (family === filter) return true;
  if (filter === 'beans') return family === 'black beans'
    || family === 'kidney beans'
    || family === 'pinto beans'
    || family === 'chickpeas';
  if (filter === 'lentils') return family === 'red lentils'
    || family === 'chana dal'
    || family === 'urad dal';
  if (filter === 'cheese') return family === 'cheddar'
    || family === 'mozzarella'
    || family === 'cottage cheese';
  return false;
}

export function filterAndSortRecipes(
  recipes: readonly Recipe[],
  options: RecipeSearchOptions = {},
): Recipe[] {
  const queryTokens = normalized(options.query ?? '').split(/\s+/).filter(Boolean);
  const cuisines = new Set((options.cuisines ?? []).map(normalized));
  const proteins = new Set((options.proteins ?? []).map(normalized));
  const maxMinutes = Number.isFinite(options.maxMinutes) ? Math.max(0, options.maxMinutes!) : undefined;
  const minProteinG = Number.isFinite(options.minProteinG) ? Math.max(0, options.minProteinG!) : undefined;

  return recipes.filter((recipe) => {
    const haystack = normalized([
      recipe.title,
      recipe.description,
      recipe.cuisine,
      ...recipe.tags,
      ...recipe.ingredients.map((ingredient) => ingredient.name),
    ].join(' '));
    if (!queryTokens.every((token) => haystack.includes(token))) return false;
    if (cuisines.size > 0 && !cuisines.has(normalized(recipe.cuisine))) return false;
    const families = recipeProteinFamilies(recipe).map(normalized);
    if (proteins.size > 0 && !families.some((family) => (
      [...proteins].some((protein) => proteinFamilyMatches(family, protein))
    ))) return false;
    if (maxMinutes !== undefined && recipe.prepMinutes + recipe.cookMinutes > maxMinutes) return false;
    if (!inCalorieBand(recipe, options.calorieBand)) return false;
    if (minProteinG !== undefined && recipe.nutritionPerServing.proteinG < minProteinG) return false;
    return true;
  }).sort(compareRecipes(options.sort ?? 'recommended'));
}
