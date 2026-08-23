import { classifyVegetarian, containsBlockedDietTerm } from './diet';
import { groceryGuideForProductId } from './grocery';
import type { Nutrition, Product, ProductProvenance, Recipe, RecipeIngredient } from './model';
import { hasCompleteCoreMacros, NUTRITION_KEYS, recipeNutrition, snapshotProduct } from './nutrition';

const CATALOG_DATE = '2026-08-22T00:00:00.000Z';
const USDA_URL = 'https://fdc.nal.usda.gov/';

type NutritionInput = Pick<Nutrition, 'calories' | 'proteinG' | 'carbsG' | 'fatG'> & Partial<Nutrition>;

interface StarterSpec {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly nutrition: NutritionInput;
  readonly aliases?: readonly string[];
  readonly externalId?: string;
}

function nutrition(value: NutritionInput): Nutrition {
  return {
    calories: value.calories,
    proteinG: value.proteinG,
    carbsG: value.carbsG,
    fatG: value.fatG,
    saturatedFatG: value.saturatedFatG ?? 0,
    fiberG: value.fiberG ?? 0,
    sugarG: value.sugarG ?? 0,
    sodiumMg: value.sodiumMg ?? 0,
  };
}

const NUTRIENT_LABELS: Readonly<Record<keyof Nutrition, string>> = {
  calories: 'calories', proteinG: 'protein', carbsG: 'carbohydrate', fatG: 'total fat',
  saturatedFatG: 'saturated fat', fiberG: 'fiber', sugarG: 'sugar', sodiumMg: 'sodium',
};

function starterProvenance(spec: StarterSpec): ProductProvenance {
  const missing = NUTRITION_KEYS.filter((key) => spec.nutrition[key] === undefined);
  const warnings = ['Typical USDA value per 100 g; compare packaged products with their current label.'];
  if (missing.length > 0) warnings.push(`Reference does not include ${missing.map((key) => NUTRIENT_LABELS[key]).join(', ')}; missing values are displayed as 0.`);
  return {
    kind: 'starter', providerName: 'USDA FoodData Central', sourceUrl: USDA_URL,
    externalId: spec.externalId, quality: missing.length === 0 ? 'complete' : 'partial',
    coreMacrosComplete: hasCompleteCoreMacros(spec.nutrition), warnings: Object.freeze(warnings),
  };
}

function starter(spec: StarterSpec): Product {
  return Object.freeze({
    id: `starter:${spec.id}`, name: spec.name, categories: Object.freeze([spec.category]),
    aliases: Object.freeze([...(spec.aliases ?? [])]),
    serving: Object.freeze({ quantity: 100, unit: 'g', label: '100 g', grams: 100 }),
    nutritionPerServing: Object.freeze(nutrition(spec.nutrition)), provenance: Object.freeze(starterProvenance(spec)),
    eligibility: Object.freeze(classifyVegetarian({ name: spec.name, categories: [spec.category], curated: true, now: CATALOG_DATE })),
    createdAt: CATALOG_DATE, updatedAt: CATALOG_DATE,
  });
}

/** Curated per-100 g references. Recipe macros are calculated from immutable snapshots of these records. */
export const STARTER_PRODUCTS: readonly Product[] = Object.freeze([
  starter({ id: 'tofu-firm', name: 'Firm tofu', category: 'protein', aliases: ['tofu'], nutrition: { calories: 144, proteinG: 17.3, carbsG: 2.8, fatG: 8.7, saturatedFatG: 1.3, fiberG: 2.3, sugarG: 0.6, sodiumMg: 14 } }),
  starter({ id: 'paneer', name: 'Paneer', category: 'protein', externalId: '2705740', nutrition: { calories: 299, proteinG: 16, carbsG: 22.5, fatG: 15.5, saturatedFatG: 9, fiberG: 0, sodiumMg: 22 } }),
  starter({ id: 'tempeh', name: 'Tempeh', category: 'protein', nutrition: { calories: 195, proteinG: 19.9, carbsG: 7.6, fatG: 11.4, saturatedFatG: 3.4, fiberG: 3.9, sugarG: 0, sodiumMg: 14 } }),
  starter({ id: 'seitan', name: 'Seitan', category: 'protein', nutrition: { calories: 141, proteinG: 24.7, carbsG: 9.4, fatG: 1.8, saturatedFatG: 0.2, fiberG: 1.2, sugarG: 0, sodiumMg: 518 } }),
  starter({ id: 'eggs', name: 'Egg', category: 'protein', aliases: ['eggs'], externalId: '2707152', nutrition: { calories: 144, proteinG: 12.4, carbsG: 1, fatG: 10, saturatedFatG: 3.2, fiberG: 0, sugarG: 0.4, sodiumMg: 142 } }),
  starter({ id: 'greek-yogurt', name: 'Plain Greek yogurt', category: 'protein', aliases: ['yogurt'], externalId: '2705421', nutrition: { calories: 67, proteinG: 10.2, carbsG: 3.6, fatG: 1.3, saturatedFatG: 0.8, fiberG: 0, sugarG: 3.6, sodiumMg: 37 } }),
  starter({ id: 'cottage-cheese', name: 'Cottage cheese', category: 'protein', externalId: '2705747', nutrition: { calories: 82, proteinG: 11, carbsG: 4.3, fatG: 2.3, saturatedFatG: 1.4, fiberG: 0, sugarG: 3.3, sodiumMg: 333 } }),
  starter({ id: 'cheddar', name: 'Vegetarian-enzyme cheddar', category: 'protein', aliases: ['cheddar cheese'], nutrition: { calories: 407, proteinG: 23.2, carbsG: 3.2, fatG: 33.6, saturatedFatG: 19.4, fiberG: 0, sugarG: 0.5, sodiumMg: 654 } }),
  starter({ id: 'mozzarella', name: 'Vegetarian-enzyme mozzarella', category: 'protein', aliases: ['mozzarella cheese'], nutrition: { calories: 280, proteinG: 28, carbsG: 3.1, fatG: 17.1, saturatedFatG: 10.9, fiberG: 0, sugarG: 1.2, sodiumMg: 627 } }),
  starter({ id: 'edamame', name: 'Shelled edamame', category: 'protein', externalId: '2707436', nutrition: { calories: 140, proteinG: 11.5, carbsG: 8.8, fatG: 7.5, saturatedFatG: 1, fiberG: 5, sugarG: 2.2, sodiumMg: 6 } }),
  starter({ id: 'chickpeas', name: 'Chickpeas', category: 'protein', aliases: ['garbanzo beans', 'chana'], externalId: '2707416', nutrition: { calories: 163, proteinG: 8.9, carbsG: 27.3, fatG: 2.6, saturatedFatG: 0.3, fiberG: 7.6, sugarG: 4.8, sodiumMg: 7 } }),
  starter({ id: 'black-beans', name: 'Black beans', category: 'protein', nutrition: { calories: 133, proteinG: 8.8, carbsG: 23.7, fatG: 0.6, saturatedFatG: 0.2, fiberG: 8.7, sugarG: 0.3, sodiumMg: 1 } }),
  starter({ id: 'kidney-beans', name: 'Kidney beans', category: 'protein', aliases: ['rajma'], nutrition: { calories: 127, proteinG: 8.7, carbsG: 22.8, fatG: 0.5, saturatedFatG: 0.1, fiberG: 6.4, sugarG: 0.3, sodiumMg: 1 } }),
  starter({ id: 'pinto-beans', name: 'Pinto beans', category: 'protein', nutrition: { calories: 143, proteinG: 9, carbsG: 26.2, fatG: 0.7, saturatedFatG: 0.1, fiberG: 9, sugarG: 0.3, sodiumMg: 1 } }),
  starter({ id: 'lentils', name: 'Brown lentils', category: 'protein', aliases: ['lentils'], externalId: '2707425', nutrition: { calories: 116, proteinG: 8.9, carbsG: 20.1, fatG: 0.4, saturatedFatG: 0.1, fiberG: 7.9, sugarG: 1.8, sodiumMg: 2 } }),
  starter({ id: 'red-lentils', name: 'Red lentils', category: 'protein', aliases: ['masoor dal'], nutrition: { calories: 116, proteinG: 9, carbsG: 20.1, fatG: 0.4, saturatedFatG: 0.1, fiberG: 7.9, sugarG: 1.8, sodiumMg: 2 } }),
  starter({ id: 'chana-dal', name: 'Chana dal', category: 'protein', aliases: ['split chickpeas'], nutrition: { calories: 164, proteinG: 8.9, carbsG: 27.4, fatG: 2.6, saturatedFatG: 0.3, fiberG: 7.6, sugarG: 4.8, sodiumMg: 7 } }),
  starter({ id: 'urad-dal', name: 'Urad dal', category: 'protein', aliases: ['black gram'], nutrition: { calories: 116, proteinG: 8, carbsG: 20.6, fatG: 0.5, saturatedFatG: 0.1, fiberG: 7.6, sugarG: 1, sodiumMg: 2 } }),
  starter({ id: 'basmati-rice', name: 'Basmati rice', category: 'base', aliases: ['rice'], nutrition: { calories: 127, proteinG: 2.7, carbsG: 27.3, fatG: 0.3, saturatedFatG: 0.1, fiberG: 0.4, sugarG: 0.1, sodiumMg: 1 } }),
  starter({ id: 'brown-rice', name: 'Brown rice', category: 'base', nutrition: { calories: 111, proteinG: 2.6, carbsG: 23, fatG: 0.9, saturatedFatG: 0.2, fiberG: 1.8, sugarG: 0.4, sodiumMg: 5 } }),
  starter({ id: 'quinoa', name: 'Quinoa', category: 'base', externalId: '2708400', nutrition: { calories: 110, proteinG: 4, carbsG: 19.5, fatG: 1.7, saturatedFatG: 0.2, fiberG: 2.8, sugarG: 0.9, sodiumMg: 7 } }),
  starter({ id: 'pasta', name: 'Pasta', category: 'base', nutrition: { calories: 158, proteinG: 5.8, carbsG: 30.9, fatG: 0.9, saturatedFatG: 0.2, fiberG: 1.8, sugarG: 0.6, sodiumMg: 1 } }),
  starter({ id: 'chickpea-pasta', name: 'Dry chickpea pasta', category: 'base', nutrition: { calories: 339, proteinG: 19.6, carbsG: 60.7, fatG: 6.3, saturatedFatG: 0.9, fiberG: 14.3, sugarG: 3.6, sodiumMg: 71 } }),
  starter({ id: 'whole-wheat-tortilla', name: 'Whole-wheat tortilla', category: 'base', aliases: ['whole wheat tortilla'], externalId: '2707825', nutrition: { calories: 311, proteinG: 9.8, carbsG: 45.9, fatG: 9.8, saturatedFatG: 2.3, fiberG: 7.1, sugarG: 2.4, sodiumMg: 616 } }),
  starter({ id: 'fajita-tortillas', name: 'Fajita flour tortilla', category: 'base', aliases: ['flour tortillas'], nutrition: { calories: 310, proteinG: 8.3, carbsG: 52.4, fatG: 7.1, saturatedFatG: 2.4, fiberG: 3.6, sugarG: 2.4, sodiumMg: 650 } }),
  starter({ id: 'corn-tortillas', name: 'Corn tortilla', category: 'base', externalId: '2707823', nutrition: { calories: 218, proteinG: 5.7, carbsG: 44.5, fatG: 2.9, saturatedFatG: 0.4, fiberG: 6, sugarG: 0.8, sodiumMg: 45 } }),
  starter({ id: 'naan', name: 'Naan', category: 'base', externalId: '2707613', nutrition: { calories: 289, proteinG: 10, carbsG: 50, fatG: 5.6, saturatedFatG: 1.7, fiberG: 2.2, sugarG: 3.3, sodiumMg: 467 } }),
  starter({ id: 'paratha', name: 'Paratha', category: 'base', externalId: '2707715', nutrition: { calories: 285, proteinG: 5.6, carbsG: 39.8, fatG: 11.5, saturatedFatG: 3.8, fiberG: 3.8, sugarG: 1.5, sodiumMg: 425 } }),
  starter({ id: 'pita', name: 'Whole-wheat pita', category: 'base', aliases: ['pita bread'], nutrition: { calories: 275, proteinG: 9.1, carbsG: 55.7, fatG: 1.2, saturatedFatG: 0.2, fiberG: 7.4, sugarG: 1.2, sodiumMg: 536 } }),
  starter({ id: 'potato', name: 'Potato', category: 'produce', nutrition: { calories: 87, proteinG: 1.9, carbsG: 20.1, fatG: 0.1, saturatedFatG: 0, fiberG: 1.8, sugarG: 0.9, sodiumMg: 4 } }),
  starter({ id: 'sweet-potato', name: 'Sweet potato', category: 'produce', nutrition: { calories: 86, proteinG: 1.6, carbsG: 20.1, fatG: 0.1, saturatedFatG: 0, fiberG: 3, sugarG: 4.2, sodiumMg: 55 } }),
  starter({ id: 'mixed-vegetables', name: 'Frozen mixed vegetables', category: 'produce', externalId: '2710013', nutrition: { calories: 64, proteinG: 2.9, carbsG: 13, fatG: 0.1, saturatedFatG: 0, fiberG: 3.9, sugarG: 3.9, sodiumMg: 50 } }),
  starter({ id: 'broccoli', name: 'Frozen broccoli', category: 'produce', externalId: '2709646', nutrition: { calories: 28, proteinG: 3.1, carbsG: 5.4, fatG: 0.1, saturatedFatG: 0, fiberG: 2.8, sugarG: 1.5, sodiumMg: 32 } }),
  starter({ id: 'spinach', name: 'Frozen spinach', category: 'produce', externalId: '2709616', nutrition: { calories: 34, proteinG: 4, carbsG: 4.8, fatG: 0.9, saturatedFatG: 0.1, fiberG: 3.7, sugarG: 0.4, sodiumMg: 116 } }),
  starter({ id: 'green-peas', name: 'Frozen green peas', category: 'produce', nutrition: { calories: 100, proteinG: 6.4, carbsG: 18.7, fatG: 0.4, saturatedFatG: 0.1, fiberG: 6.6, sugarG: 6.2, sodiumMg: 4 } }),
  starter({ id: 'onion', name: 'Onion', category: 'produce', nutrition: { calories: 40, proteinG: 1.1, carbsG: 9.3, fatG: 0.1, saturatedFatG: 0, fiberG: 1.7, sugarG: 4.2, sodiumMg: 4 } }),
  starter({ id: 'bell-pepper', name: 'Bell pepper', category: 'produce', aliases: ['capsicum'], nutrition: { calories: 31, proteinG: 1, carbsG: 6, fatG: 0.3, saturatedFatG: 0, fiberG: 2.1, sugarG: 4.2, sodiumMg: 4 } }),
  starter({ id: 'mushrooms', name: 'Sliced mushrooms', category: 'produce', nutrition: { calories: 22, proteinG: 3.1, carbsG: 3.3, fatG: 0.3, saturatedFatG: 0.1, fiberG: 1, sugarG: 2, sodiumMg: 5 } }),
  starter({ id: 'garlic', name: 'Garlic', category: 'flavor', nutrition: { calories: 149, proteinG: 6.4, carbsG: 33.1, fatG: 0.5, saturatedFatG: 0.1, fiberG: 2.1, sugarG: 1, sodiumMg: 17 } }),
  starter({ id: 'ginger', name: 'Fresh ginger', category: 'flavor', nutrition: { calories: 80, proteinG: 1.8, carbsG: 17.8, fatG: 0.8, saturatedFatG: 0.2, fiberG: 2, sugarG: 1.7, sodiumMg: 13 } }),
  starter({ id: 'tomato', name: 'Tomato', category: 'produce', nutrition: { calories: 18, proteinG: 0.9, carbsG: 3.9, fatG: 0.2, saturatedFatG: 0, fiberG: 1.2, sugarG: 2.6, sodiumMg: 5 } }),
  starter({ id: 'tomato-paste', name: 'Tomato paste', category: 'flavor', nutrition: { calories: 82, proteinG: 4.3, carbsG: 18.9, fatG: 0.5, saturatedFatG: 0.1, fiberG: 4.1, sugarG: 12.2, sodiumMg: 59 } }),
  starter({ id: 'tomato-sauce', name: 'Tomato sauce', category: 'flavor', aliases: ['crushed tomatoes', 'passata'], nutrition: { calories: 48, proteinG: 2.2, carbsG: 10.2, fatG: 0.4, saturatedFatG: 0.1, fiberG: 2.4, sugarG: 6.5, sodiumMg: 472 } }),
  starter({ id: 'coconut-milk', name: 'Canned coconut milk', category: 'flavor', nutrition: { calories: 192, proteinG: 1.9, carbsG: 2.8, fatG: 20, saturatedFatG: 17.5, fiberG: 1.1, sugarG: 1.7, sodiumMg: 15 } }),
  starter({ id: 'salsa', name: 'Salsa', category: 'flavor', nutrition: { calories: 28, proteinG: 1.5, carbsG: 5.5, fatG: 0.2, saturatedFatG: 0, fiberG: 1.8, sugarG: 3.1, sodiumMg: 731 } }),
  starter({ id: 'hummus', name: 'Hummus', category: 'flavor', nutrition: { calories: 237, proteinG: 7.8, carbsG: 20, fatG: 15.5, saturatedFatG: 2.2, fiberG: 6, sugarG: 0.7, sodiumMg: 428 } }),
  starter({ id: 'peanut-butter', name: 'Peanut butter', category: 'flavor', nutrition: { calories: 594, proteinG: 21.9, carbsG: 21.9, fatG: 50, saturatedFatG: 9.4, fiberG: 6.3, sugarG: 9.4, sodiumMg: 438 } }),
  starter({ id: 'olive-oil', name: 'Olive oil', category: 'flavor', nutrition: { calories: 884, proteinG: 0, carbsG: 0, fatG: 100, saturatedFatG: 13.8, fiberG: 0, sugarG: 0, sodiumMg: 0 } }),
  starter({ id: 'soy-sauce', name: 'Soy sauce', category: 'flavor', nutrition: { calories: 53, proteinG: 8.1, carbsG: 4.9, fatG: 0.6, saturatedFatG: 0.1, fiberG: 0.8, sugarG: 0.4, sodiumMg: 5493 } }),
  starter({ id: 'vegetable-broth', name: 'Vegetable broth', category: 'flavor', aliases: ['vegetable stock'], nutrition: { calories: 7, proteinG: 0.3, carbsG: 1, fatG: 0.1, saturatedFatG: 0, fiberG: 0, sugarG: 0.5, sodiumMg: 260 } }),
  starter({ id: 'curry-powder', name: 'Curry powder', category: 'seasoning', nutrition: { calories: 325, proteinG: 14.3, carbsG: 55.8, fatG: 14, saturatedFatG: 2.2, fiberG: 53.2, sugarG: 2.8, sodiumMg: 52 } }),
  starter({ id: 'garam-masala', name: 'Garam masala', category: 'seasoning', nutrition: { calories: 379, proteinG: 15, carbsG: 45, fatG: 15, saturatedFatG: 2, fiberG: 25, sugarG: 2, sodiumMg: 100 } }),
  starter({ id: 'taco-seasoning', name: 'Taco seasoning', category: 'seasoning', nutrition: { calories: 250, proteinG: 8, carbsG: 50, fatG: 5, saturatedFatG: 1, fiberG: 20, sugarG: 8, sodiumMg: 6500 } }),
  starter({ id: 'italian-seasoning', name: 'Italian seasoning', category: 'seasoning', nutrition: { calories: 265, proteinG: 9, carbsG: 69, fatG: 4.3, saturatedFatG: 1.6, fiberG: 42, sugarG: 4, sodiumMg: 77 } }),
  starter({ id: 'shawarma-seasoning', name: 'Shawarma seasoning', category: 'seasoning', nutrition: { calories: 300, proteinG: 11, carbsG: 52, fatG: 9, saturatedFatG: 1.5, fiberG: 25, sugarG: 3, sodiumMg: 1600 } }),
  starter({ id: 'cajun-seasoning', name: 'Cajun seasoning', category: 'seasoning', nutrition: { calories: 240, proteinG: 9, carbsG: 44, fatG: 5, saturatedFatG: 1, fiberG: 20, sugarG: 4, sodiumMg: 7200 } }),
  starter({ id: 'berbere-seasoning', name: 'Berbere seasoning', category: 'seasoning', nutrition: { calories: 306, proteinG: 12, carbsG: 47, fatG: 12, saturatedFatG: 2, fiberG: 25, sugarG: 4, sodiumMg: 1800 } }),
  starter({ id: 'ras-el-hanout', name: 'Ras el hanout', category: 'seasoning', nutrition: { calories: 322, proteinG: 12, carbsG: 58, fatG: 10, saturatedFatG: 1.7, fiberG: 28, sugarG: 3, sodiumMg: 150 } }),
  starter({ id: 'jerk-seasoning', name: 'Jerk seasoning', category: 'seasoning', nutrition: { calories: 250, proteinG: 8, carbsG: 45, fatG: 7, saturatedFatG: 1.2, fiberG: 18, sugarG: 8, sodiumMg: 5200 } }),
  starter({ id: 'smoked-paprika', name: 'Smoked paprika', category: 'seasoning', nutrition: { calories: 282, proteinG: 14.1, carbsG: 54, fatG: 12.9, saturatedFatG: 2.1, fiberG: 34.9, sugarG: 10.3, sodiumMg: 68 } }),
  starter({ id: 'hot-sauce', name: 'Hot sauce', category: 'seasoning', nutrition: { calories: 11, proteinG: 0.5, carbsG: 1.8, fatG: 0.4, saturatedFatG: 0.1, fiberG: 0.6, sugarG: 1.3, sodiumMg: 2643 } }),
  starter({ id: 'lemon', name: 'Fresh lemon', category: 'seasoning', aliases: ['lemon juice'], nutrition: { calories: 29, proteinG: 1.1, carbsG: 9.3, fatG: 0.3, saturatedFatG: 0, fiberG: 2.8, sugarG: 2.5, sodiumMg: 2 } }),
]);

const productMap = new Map(STARTER_PRODUCTS.map((product) => [product.id, product]));
type IngredientTuple = readonly [productId: string, grams: number];
type Method = 'curry' | 'bowl' | 'wrap' | 'skillet' | 'pasta' | 'bake' | 'stew' | 'tray';

interface MealSpec {
  readonly id: string; readonly title: string; readonly cuisine: string; readonly protein: string;
  readonly method: Method; readonly prepMinutes: number; readonly cookMinutes: number; readonly items: readonly IngredientTuple[];
}

function decimal(value: number): string { return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, ''); }
function kitchenQuantity(value: number, subdivisions = 4): string {
  const rounded = Math.round(value * subdivisions) / subdivisions;
  if (rounded <= 0) return decimal(value);
  const whole = Math.floor(rounded);
  const remainder = Math.round((rounded - whole) * subdivisions);
  const divisor = remainder === 0 ? 1 : subdivisions;
  const common = remainder === 0 ? 1 : remainder;
  const gcd = (left: number, right: number): number => right === 0 ? left : gcd(right, left % right);
  const factor = gcd(common, divisor);
  const fraction = remainder === 0 ? '' : `${common / factor}/${divisor / factor}`;
  return [whole > 0 ? String(whole) : '', fraction].filter(Boolean).join(' ');
}
function amountLabel(productId: string, grams: number): string {
  const id = productId.replace('starter:', '');
  const unit = (singular: string, plural: string, divisor: number, subdivisions = 4) => {
    const quantity = kitchenQuantity(grams / divisor, subdivisions);
    const simpleFraction = quantity.includes('/') && !quantity.includes(' ');
    return `${quantity} ${quantity === '1' || simpleFraction ? singular : plural} (${grams} g)`;
  };
  if (id === 'eggs') return unit('large egg', 'large eggs', 50, 1);
  if (id === 'olive-oil') return grams < 14 ? unit('tsp', 'tsp', 4.5) : unit('tbsp', 'tbsp', 14);
  if (id === 'peanut-butter' || id === 'tomato-paste') return unit('tbsp', 'tbsp', 16);
  if (id === 'soy-sauce') return unit('tbsp', 'tbsp', 15);
  if (id === 'hot-sauce') return unit('tbsp', 'tbsp', 15);
  if (id === 'lemon') return unit('tbsp juice', 'tbsp juice', 15);
  if (['curry-powder', 'garam-masala', 'taco-seasoning', 'italian-seasoning', 'shawarma-seasoning', 'cajun-seasoning', 'berbere-seasoning', 'ras-el-hanout', 'jerk-seasoning', 'smoked-paprika'].includes(id)) return unit('tsp', 'tsp', 3);
  if (id === 'garlic') return unit('clove', 'cloves', 3, 1);
  if (id === 'ginger') return unit('tsp grated', 'tsp grated', 5);
  if (id === 'whole-wheat-tortilla') return unit('large whole-wheat tortilla', 'large whole-wheat tortillas', 56, 1);
  if (id === 'fajita-tortillas') return unit('fajita flour tortilla', 'fajita flour tortillas', 42, 1);
  if (id === 'corn-tortillas') return unit('corn tortilla', 'corn tortillas', 26, 1);
  if (id === 'naan') return unit('naan piece', 'naan pieces', 90, 1);
  if (id === 'paratha') return unit('paratha', 'parathas', 80, 1);
  if (id === 'pita') return unit('whole-wheat pita', 'whole-wheat pitas', 60, 1);
  if (id === 'basmati-rice') return unit('cup cooked', 'cups cooked', 165, 8);
  if (id === 'brown-rice') return unit('cup cooked', 'cups cooked', 195, 8);
  if (id === 'quinoa') return unit('cup cooked', 'cups cooked', 185, 8);
  if (id === 'pasta') return unit('cup cooked', 'cups cooked', 140, 8);
  if (id === 'chickpea-pasta') return unit('oz dry', 'oz dry', 28);
  if (id === 'tofu-firm') return `${grams} g drained`;
  if (['chickpeas', 'black-beans', 'kidney-beans', 'pinto-beans'].includes(id)) return unit('cup drained', 'cups drained', 180, 8);
  if (['lentils', 'red-lentils', 'chana-dal', 'urad-dal'].includes(id)) return unit('cup cooked', 'cups cooked', 198, 8);
  if (['salsa', 'hummus', 'tomato-sauce', 'coconut-milk', 'vegetable-broth'].includes(id)) return unit('cup', 'cups', 240, 8);
  return `${grams} g`;
}

function ingredient([id, grams]: IngredientTuple): RecipeIngredient {
  const fullId = id.startsWith('starter:') ? id : `starter:${id}`;
  const product = productMap.get(fullId);
  if (!product) throw new Error(`Unknown starter product: ${id}`);
  if (!groceryGuideForProductId(product.id)) throw new Error(`Missing grocery guide for ${product.id}`);
  if (!Number.isFinite(grams) || grams <= 0) throw new Error(`Invalid gram quantity for ${product.id}`);
  return { id: `ingredient:${product.id}`, productId: product.id, name: product.name, amountLabel: amountLabel(product.id, grams), optional: false, snapshot: snapshotProduct(product, grams / 100) };
}

const I = (productId: string, grams: number): IngredientTuple => [productId, grams];
const M = (id: string, title: string, cuisine: string, protein: string, method: Method, prepMinutes: number, cookMinutes: number, items: readonly IngredientTuple[]): MealSpec => ({ id, title, cuisine, protein, method, prepMinutes, cookMinutes, items });

const SPICE_IDS = new Set([
  'curry-powder', 'garam-masala', 'taco-seasoning', 'italian-seasoning', 'shawarma-seasoning',
  'cajun-seasoning', 'berbere-seasoning', 'ras-el-hanout', 'jerk-seasoning', 'smoked-paprika',
]);

function seasoningItems(spec: MealSpec): IngredientTuple[] {
  const cuisine = spec.cuisine.toLowerCase();
  if (spec.id === 'tofu-katsu-curry' || spec.id === 'japanese-tofu-curry') return [I('curry-powder', 6)];
  if (spec.id === 'egg-bhurji-tacos') return [I('garam-masala', 6)];
  if (spec.id === 'cajun-red-beans-rice') return [I('cajun-seasoning', 6)];
  if (spec.id === 'ethiopian-red-lentils') return [I('berbere-seasoning', 6)];
  if (spec.id === 'moroccan-chickpea-quinoa' || spec.id === 'chickpea-tagine') return [I('ras-el-hanout', 6)];
  if (spec.id === 'caribbean-tofu-rice-beans') return [I('jerk-seasoning', 6)];
  if (cuisine.includes('mexican') || cuisine.includes('tex-mex')) return [I('taco-seasoning', 6), ...(spec.title.toLowerCase().includes('spicy') ? [I('hot-sauce', 15)] : [])];
  if (cuisine.includes('indian')) return [I(spec.method === 'curry' || spec.method === 'stew' ? 'curry-powder' : 'garam-masala', 6)];
  if (cuisine.includes('italian') || cuisine.includes('european')) return [I('italian-seasoning', 6), ...(spec.title.toLowerCase().includes('salad') ? [I('lemon', 30)] : [])];
  if (cuisine.includes('mediterranean') || cuisine.includes('greek') || cuisine.includes('middle eastern')) return [I('shawarma-seasoning', 6), I('lemon', 30)];
  if (cuisine.includes('cuban') || cuisine.includes('peruvian') || cuisine.includes('west african')) return [I('smoked-paprika', 6), I('lemon', 30)];
  if (cuisine.includes('east asian') || cuisine.includes('korean') || cuisine.includes('thai') || cuisine.includes('japanese') || cuisine.includes('vietnamese')) return [I('hot-sauce', 15)];
  if (cuisine.includes('hawaiian')) return [I('lemon', 30)];
  return [I(spec.title.toLowerCase().includes('spicy') ? 'hot-sauce' : 'smoked-paprika', spec.title.toLowerCase().includes('spicy') ? 15 : 6)];
}

function caloriesFor(items: readonly IngredientTuple[]): number {
  return items.reduce((sum, [id, grams]) => {
    const product = productMap.get(`starter:${id}`);
    if (!product) throw new Error(`Unknown starter product: ${id}`);
    return sum + product.nutritionPerServing.calories * grams / 100;
  }, 0);
}

function mergeItems(items: readonly IngredientTuple[]): IngredientTuple[] {
  const merged = new Map<string, number>();
  for (const [id, grams] of items) merged.set(id, (merged.get(id) ?? 0) + grams);
  return [...merged].map(([id, grams]) => I(id, grams));
}

const DISCRETE_GRAMS: Readonly<Record<string, number>> = Object.freeze({
  eggs: 50,
  'whole-wheat-tortilla': 56,
  'fajita-tortillas': 42,
  'corn-tortillas': 26,
  naan: 90,
  paratha: 80,
  pita: 60,
  garlic: 3,
  ginger: 5,
  'tomato-paste': 8,
  'peanut-butter': 8,
  'soy-sauce': 15,
});

function practicalGrams(id: string, grams: number): number {
  const increment = DISCRETE_GRAMS[id];
  if (increment) return Math.max(increment, Math.round(grams / increment) * increment);
  if (SPICE_IDS.has(id) || id === 'hot-sauce' || id === 'lemon' || id === 'olive-oil') return Math.max(1, Math.round(grams));
  return Math.max(5, Math.round(grams / 5) * 5);
}

function balancedItems(spec: MealSpec, index: number): IngredientTuple[] {
  const seasonings = seasoningItems(spec);
  // A coprime permutation spreads the three calorie bands through the catalog
  // instead of tying them to the cuisine groups in MEAL_SPECS order.
  const calorieRank = (index * 37) % 100;
  const target = calorieRank < 20 ? 850 : calorieRank < 55 ? 1_000 : 1_150;
  const available = Math.max(100, target - caloriesFor(seasonings));
  const scale = available / caloriesFor(spec.items);
  const scaled = spec.items.map(([id, grams]) => I(id, practicalGrams(id, grams * scale)));
  let items = mergeItems([...scaled, ...seasonings]);
  let currentCalories = caloriesFor(items);
  if (currentCalories > target + 20) {
    const fixedIds = new Set([...Object.keys(DISCRETE_GRAMS), ...SPICE_IDS, 'hot-sauce', 'lemon']);
    const fixed = items.filter(([id]) => fixedIds.has(id));
    const adjustable = items.filter(([id]) => !fixedIds.has(id));
    const adjustableCalories = caloriesFor(adjustable);
    const availableCalories = Math.max(adjustableCalories * 0.5, target - caloriesFor(fixed));
    const correction = Math.min(1, availableCalories / Math.max(1, adjustableCalories));
    items = mergeItems([...fixed, ...adjustable.map(([id, grams]) => I(id, practicalGrams(id, grams * correction)))]);
  }
  const hasBrothStew = spec.method === 'stew' && items.some(([id]) => id === 'vegetable-broth');
  const totalMass = items.reduce((sum, [, grams]) => sum + grams, 0);
  if (!hasBrothStew && totalMass > 1_000) {
    const fixedMass = items.filter(([id]) => SPICE_IDS.has(id) || id === 'hot-sauce' || id === 'lemon').reduce((sum, [, grams]) => sum + grams, 0);
    const shrink = Math.max(0.1, (1_000 - fixedMass) / (totalMass - fixedMass));
    items = items.map(([id, grams]) => (
      SPICE_IDS.has(id) || id === 'hot-sauce' || id === 'lemon'
        ? I(id, grams)
        : I(id, practicalGrams(id, grams * shrink))
    ));
  }
  currentCalories = caloriesFor(items);
  const calorieGap = target - currentCalories;
  if (calorieGap > 20) items = mergeItems([...items, I('olive-oil', Math.max(3, Math.round(calorieGap / 8.84)))]);
  return items;
}

function keyOf(item: RecipeIngredient): string { return item.productId?.replace('starter:', '') ?? ''; }
function described(item: RecipeIngredient): string {
  const key = keyOf(item);
  if (key === 'eggs' || FLATBREAD_IDS.has(key)) return item.amountLabel;
  const name = `${item.name[0].toLowerCase()}${item.name.slice(1)}`;
  return item.amountLabel.includes('(')
    ? item.amountLabel.replace(/\s+\(([^)]+)\)$/, ` ${name} ($1)`)
    : `${item.amountLabel} ${name}`;
}
function describedList(items: readonly RecipeIngredient[]): string {
  const values = items.map(described);
  if (values.length <= 1) return values[0] ?? '';
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`;
}
function selected(ingredients: readonly RecipeIngredient[], ids: ReadonlySet<string>): RecipeIngredient[] {
  return ingredients.filter((item) => ids.has(keyOf(item)));
}

const GRAIN_IDS = new Set(['basmati-rice', 'brown-rice', 'quinoa', 'pasta']);
const FLATBREAD_IDS = new Set(['whole-wheat-tortilla', 'fajita-tortillas', 'corn-tortillas', 'naan', 'paratha', 'pita']);
const POTATO_IDS = new Set(['potato', 'sweet-potato']);
const LEGUME_IDS = new Set(['chickpeas', 'black-beans', 'kidney-beans', 'pinto-beans', 'lentils', 'red-lentils', 'chana-dal', 'urad-dal']);
const COLD_IDS = new Set(['greek-yogurt', 'hummus', 'salsa', 'hot-sauce', 'lemon']);
const WET_IDS = new Set(['tomato-paste', 'tomato-sauce', 'coconut-milk', 'peanut-butter', 'soy-sauce', 'vegetable-broth']);
const CHEESE_IDS = new Set(['cottage-cheese', 'cheddar', 'mozzarella']);
const ROASTABLE_IDS = new Set(['tofu-firm', 'paneer', 'tempeh', 'seitan', 'chickpeas', 'broccoli', 'mixed-vegetables', 'spinach', 'green-peas', 'onion', 'bell-pepper', 'mushrooms', 'garlic', 'ginger', 'tomato', 'potato', 'sweet-potato']);

function preparationSteps(ingredients: readonly RecipeIngredient[]): string[] {
  const steps: string[] = [];
  const grains = selected(ingredients, GRAIN_IDS);
  const dryPasta = ingredients.filter((item) => keyOf(item) === 'chickpea-pasta');
  const potatoes = selected(ingredients, POTATO_IDS);
  const legumes = selected(ingredients, LEGUME_IDS);
  const tofu = ingredients.filter((item) => keyOf(item) === 'tofu-firm');
  const cutProteins = ingredients.filter((item) => ['paneer', 'tempeh', 'seitan'].includes(keyOf(item)));
  const edamame = ingredients.filter((item) => keyOf(item) === 'edamame');
  if (grains.length > 0) steps.push(`Use ${describedList(grains)} as the cooked target: if starting from a dry package, follow its directions to produce that cooked amount; if using pre-cooked food, reheat it covered for 4 to 5 minutes. Do not boil the listed cooked portion again.`);
  if (dryPasta.length > 0) steps.push(`Boil the ${describedList(dryPasta)} in water according to its package timing, then drain it.`);
  if (potatoes.length > 0) steps.push(`Cut the ${describedList(potatoes)} into 2 cm pieces and microwave them covered with a splash of water for 6 to 9 minutes, until fork-tender.`);
  if (legumes.length > 0) steps.push(`Drain and rinse the ${describedList(legumes)} if canned; these beans and lentils are already cooked and only need to be heated through.`);
  if (tofu.length > 0) steps.push(`Press the ${describedList(tofu)} dry for 10 minutes, then cut it into 2 cm cubes.`);
  if (cutProteins.length > 0) steps.push(`Cut the ${describedList(cutProteins)} into even bite-size pieces.`);
  if (edamame.length > 0) steps.push(`Boil the ${describedList(edamame)} for 4 to 5 minutes until hot and tender, then drain it.`);
  return steps;
}

function eggStep(ingredients: readonly RecipeIngredient[], title: string): string | undefined {
  const eggs = ingredients.filter((item) => keyOf(item) === 'eggs');
  if (eggs.length === 0) return undefined;
  if (title.toLowerCase().includes('salad pitas')) return `Hard-boil the ${describedList(eggs)} for 10 to 12 minutes, chill in cold water, peel, and chop; the yolks must be fully set.`;
  if (title.toLowerCase().includes('burger')) return undefined;
  return `Beat the ${describedList(eggs)}, cook in a nonstick skillet until no liquid egg remains and the center reaches 160°F / 71°C, then set aside.`;
}

function coldFinishPhrase(ingredients: readonly RecipeIngredient[]): string {
  const cold = selected(ingredients, COLD_IDS);
  return cold.length > 0
    ? `add ${describedList(cold)} only after the hot components leave the heat, so yogurt stays smooth and fresh sauces keep their flavor`
    : 'let the finished meal stand off the heat for 2 minutes before serving';
}

function coldFinish(ingredients: readonly RecipeIngredient[]): string {
  const phrase = coldFinishPhrase(ingredients);
  return `${phrase[0].toUpperCase()}${phrase.slice(1)}.`;
}

function specialShapeSteps(spec: MealSpec, ingredients: readonly RecipeIngredient[]): string[] | undefined {
  const title = spec.title.toLowerCase();
  const all = describedList(ingredients);
  const items = (...ids: string[]) => ingredients.filter((item) => ids.includes(keyOf(item)));
  if (spec.id === 'black-bean-burger-plate') {
    const eggs = ingredients.filter((item) => keyOf(item) === 'eggs');
    return [
      ...preparationSteps(ingredients),
      `Mash ${describedList(items('black-beans'))}, then mix with ${describedList(eggs)}, ${describedList(items('onion'))}, and ${describedList(items('smoked-paprika'))}; shape two compact patties.`,
      `Cook the patties in ${describedList(items('olive-oil'))} for 5 to 6 minutes per side, until firm and the egg-bound centers reach 160°F / 71°C.`,
      `Toast ${describedList(items('pita'))}, melt ${describedList(items('cheddar'))} over the patties, and serve with the fork-tender ${describedList(items('potato'))}.`,
      `Spoon ${describedList(items('salsa'))} over the plated burger and potatoes.`,
    ];
  }
  if (spec.id === 'enchilada-quinoa-casserole') {
    return [
      'Heat the oven to 400°F / 205°C and line a baking dish.',
      ...preparationSteps(ingredients),
      `Stir ${describedList(items('quinoa', 'black-beans', 'taco-seasoning'))} together for the filling, and cut ${describedList(items('corn-tortillas'))} into wide strips.`,
      `Layer ${describedList(items('tomato-sauce'))}, the tortilla strips, the filling, and ${describedList(items('cheddar'))}; repeat until the dish is full.`,
      `Bake for 20 minutes until steaming, rest for 5 minutes, then spoon on ${describedList(items('salsa'))}.`,
    ];
  }
  if (title.includes('enchilada')) {
    return [
      'Heat the oven to 400°F / 205°C and spread the measured Tomato sauce across the bottom of a baking dish.',
      ...preparationSteps(ingredients),
      `Cook the filling from ${all} except the Corn tortillas, cheddar, Salsa, and Tomato sauce in a skillet for 6 minutes.`,
      'Warm the Corn tortillas, divide the hot filling among them, roll tightly, and arrange seam-side down in the Tomato sauce.',
      'Top with the Vegetarian-enzyme cheddar, bake for 18 to 20 minutes, and spoon on the Salsa only after the dish leaves the oven.',
    ];
  }
  if (title.includes('stuffed peppers')) {
    return [
      'Heat the oven to 400°F / 205°C; halve the measured Bell pepper, remove the seeds, and bake the halves cut-side up for 10 minutes.',
      ...preparationSteps(ingredients),
      `Stir together the hot ${all} except the Bell pepper, cheddar, and Salsa to make the filling.`,
      'Pack the filling into the pepper halves, top with the Vegetarian-enzyme cheddar, and bake for 15 minutes.',
      'Rest for 5 minutes and spoon the measured Salsa over the stuffed peppers.',
    ];
  }
  if (title.includes('moussaka')) {
    return [
      'Heat the oven to 400°F / 205°C and arrange the fork-tender Potato in an even layer.',
      ...preparationSteps(ingredients),
      `Cook ${describedList(items('lentils', 'onion', 'tomato-sauce', 'olive-oil', 'shawarma-seasoning'))} together for 8 minutes.`,
      `Layer the lentil mixture over ${describedList(items('potato'))}, spread on ${describedList(items('cottage-cheese'))}, and top with ${describedList(items('mozzarella'))}.`,
      `Bake for 22 to 25 minutes until bubbling, rest for 5 minutes, then finish with ${describedList(items('lemon'))}.`,
    ];
  }
  if (title.includes('shepherd-style')) {
    return [
      ...preparationSteps(ingredients),
      `Mash the fork-tender ${describedList(items('potato'))} with ${describedList(items('cottage-cheese'))} until mostly smooth.`,
      `Cook ${describedList(items('lentils', 'green-peas', 'onion', 'vegetable-broth', 'olive-oil', 'italian-seasoning'))} in a skillet until thick, about 10 minutes.`,
      'Spread the lentil filling in a baking dish, cover completely with the potato mash, and bake at 400°F / 205°C for 20 minutes.',
      'Rest the layered pie for 5 minutes before serving.',
    ];
  }
  if (title.includes('pizza')) {
    if (spec.id === 'naan-pizza-chickpea-salad') {
      return [
        'Heat the oven to 425°F / 220°C and place the measured Naan on a lined sheet pan.',
        ...preparationSteps(ingredients),
        `Spread ${describedList(items('tomato-sauce'))} over ${describedList(items('naan'))}, top with ${describedList(items('mozzarella'))}, and sprinkle with ${describedList(items('garam-masala'))}.`,
        'Bake the naan pizza for 10 to 12 minutes, until the cheese bubbles and the edges are crisp.',
        `Toss ${describedList(items('chickpeas', 'spinach', 'olive-oil', 'garlic'))} together and serve the warm salad beside the pizza.`,
      ];
    }
    return [
      'Heat the oven to 425°F / 220°C and place the measured Naan on a lined sheet pan.',
      ...preparationSteps(ingredients),
      `Spread and arrange ${all} except the Naan across the naan in an even layer.`,
      'Bake the naan pizza for 10 to 12 minutes, until the cheese bubbles and the edges are crisp.',
      'Rest the baked pizza for 2 minutes, then cut it into wedges and serve.',
    ];
  }
  if (title.includes('pita melts')) {
    return [
      'Heat the oven to 425°F / 220°C and split the measured Whole-wheat pita into pockets.',
      ...preparationSteps(ingredients),
      `Cook the filling from ${all} except the pita and cheese in a skillet until hot and fairly dry.`,
      'Fill the pita pockets, add all measured cheese, and bake for 6 to 8 minutes until melted.',
      'Rest for 2 minutes before serving the crisp pita melts.',
    ];
  }
  if (title.includes('quesadilla') || title.includes('crunchwrap')) {
    return [
      ...preparationSteps(ingredients),
      `Cook the filling from ${all} except the tortillas, cheddar, Salsa, Greek yogurt, Fresh lemon, and Hot sauce for 6 to 8 minutes.`,
      'Warm the tortillas, divide the hot filling and Vegetarian-enzyme cheddar among them, then fold them closed.',
      'Toast each folded tortilla in a dry skillet for 2 to 3 minutes per side until crisp and the cheese melts.',
      coldFinish(ingredients),
    ];
  }
  if (title.includes('taco') && ingredients.some((item) => FLATBREAD_IDS.has(keyOf(item)))) {
    const eggs = items('eggs');
    return [
      ...preparationSteps(ingredients),
      ...(eggStep(ingredients, spec.title) ? [eggStep(ingredients, spec.title)!] : []),
      `Cook the filling from ${all} except the tortillas, cooked grain, fully cooked eggs, cheese, and cool sauces for 6 to 8 minutes.`,
      `Warm ${describedList(ingredients.filter((item) => FLATBREAD_IDS.has(keyOf(item))))} in a dry skillet for 20 to 30 seconds per side.`,
      `Fill the warm tortillas with the hot filling${eggs.length > 0 ? ` and ${describedList(eggs)}` : ''}; add any measured cheese over low heat so it melts.`,
      `Serve any ${describedList(ingredients.filter((item) => GRAIN_IDS.has(keyOf(item)))) || 'remaining hot filling'} beside the tacos, and ${coldFinishPhrase(ingredients)}.`,
    ];
  }
  if (title.includes('loaded potato') || title.includes('chickpea potato')) {
    return [
      ...preparationSteps(ingredients),
      `Cook every hot topping from ${all} except the Potato, cheeses, Greek yogurt, Salsa, Fresh lemon, and Hot sauce in a skillet until steaming.`,
      'Split the fork-tender Potato, fluff its center, and pile in the hot topping.',
      'Add the Vegetarian-enzyme cheddar and cover for 2 minutes so it melts.',
      coldFinish(ingredients),
    ];
  }
  return undefined;
}

function methodSteps(spec: MealSpec, ingredients: readonly RecipeIngredient[]): readonly string[] {
  const special = specialShapeSteps(spec, ingredients);
  if (special) return special;
  const steps = preparationSteps(ingredients);
  const egg = eggStep(ingredients, spec.title);
  if (egg) steps.push(egg);
  const bases = ingredients.filter((item) => GRAIN_IDS.has(keyOf(item)) || FLATBREAD_IDS.has(keyOf(item)) || POTATO_IDS.has(keyOf(item)) || keyOf(item) === 'chickpea-pasta');
  const cold = selected(ingredients, COLD_IDS);
  const wet = selected(ingredients, WET_IDS);
  const cheese = selected(ingredients, CHEESE_IDS);
  const oil = ingredients.filter((item) => keyOf(item) === 'olive-oil');
  const roastable = selected(ingredients, ROASTABLE_IDS);
  const seasoning = ingredients.filter((item) => SPICE_IDS.has(keyOf(item)));
  const eggs = ingredients.filter((item) => keyOf(item) === 'eggs');
  const hot = ingredients.filter((item) => !bases.includes(item) && !cold.includes(item) && !wet.includes(item) && !cheese.includes(item) && !eggs.includes(item));

  if (spec.method === 'tray') {
    const separateBases = bases.filter((item) => !roastable.includes(item));
    steps.push(`Heat the oven to 425°F / 220°C; toss ${describedList(roastable)} with ${describedList([...seasoning, ...oil])}, then spread in one layer.`);
    steps.push('Roast for 20 to 25 minutes, turning the solid ingredients once; keep cooked grains, broth, coconut milk, hummus, salsa, and yogurt out of the oven.');
    if (wet.length > 0) steps.push(`Warm ${describedList(wet)} in a small saucepan for 5 minutes to make the serving sauce.`);
    if (cheese.length > 0) steps.push(`Add ${describedList(cheese)} to the hot solid ingredients after roasting so it softens without drying out.`);
    steps.push(`Plate the roasted ingredients${separateBases.length > 0 ? ` with ${describedList(separateBases)}` : ''}, then ${coldFinishPhrase(ingredients)}.`);
  } else if (spec.method === 'bake') {
    steps.push('Heat the oven to 400°F / 205°C and line a baking dish with parchment.');
    steps.push(`Cook ${describedList(hot)} in a skillet for 6 to 8 minutes, until every solid ingredient is hot.`);
    if (wet.length > 0) steps.push(`Stir in ${describedList(wet)} and simmer for 3 minutes.`);
    steps.push(`Combine the hot filling with ${describedList(bases)} in the baking dish and top with ${describedList(cheese)}.`);
    steps.push('Bake for 18 to 22 minutes until the center is steaming and the cheese is melted.');
    steps.push(coldFinish(ingredients));
  } else if (spec.method === 'wrap') {
    steps.push(`Cook ${describedList(hot)} in a skillet for 6 to 8 minutes, until the filling is hot and fairly dry.`);
    if (wet.length > 0) steps.push(`Stir ${describedList(wet)} into the filling and cook for 3 minutes, until the excess moisture evaporates.`);
    steps.push(`Warm ${describedList(bases)} in a dry skillet for 20 to 30 seconds per side.`);
    if (cold.length > 0) steps.push(coldFinish(ingredients));
    const additions = [...cheese, ...eggs];
    steps.push(`Divide the filling${additions.length > 0 ? ` and ${describedList(additions)}` : ''} among the warm flatbreads, then fold or roll tightly.`);
  } else if (spec.method === 'pasta') {
    steps.push(`Cook ${describedList(hot)} in a wide skillet for 6 minutes, until the solid ingredients are hot.`);
    if (wet.length > 0) steps.push(`Add ${describedList(wet)} and simmer for 5 minutes to make the sauce.`);
    steps.push(`Fold the prepared cooked portion of ${describedList(bases)} into the sauce and reheat for 3 to 4 minutes; do not boil the cooked portion again.`);
    if (cheese.length > 0) steps.push(`Turn the heat to low and fold in ${describedList(cheese)} until creamy or melted.`);
    steps.push(coldFinish(ingredients));
  } else if (spec.method === 'curry' || spec.method === 'stew') {
    steps.push(`Cook ${describedList(hot)} in a deep skillet over medium heat for 6 minutes.`);
    if (wet.length > 0) steps.push(`Add ${describedList(wet)} and simmer for 10 to 15 minutes, until every cooked bean is hot and the sauce thickens.`);
    if (egg) steps.push('Return the fully cooked eggs to the sauce for the final 2 minutes.');
    if (cheese.length > 0) steps.push(`Turn the heat to low and stir in ${describedList(cheese)}.`);
    steps.push(`Serve the ${spec.method} with ${describedList(bases)}. ${coldFinish(ingredients)}`);
  } else {
    steps.push(`Cook ${describedList(hot)} in a wide skillet for 7 to 9 minutes, until browned and heated through.`);
    if (wet.length > 0) steps.push(`Stir in ${describedList(wet)} and simmer for 3 to 5 minutes.`);
    if (egg) steps.push('Return the fully cooked eggs to the skillet and toss for 1 minute.');
    if (cheese.length > 0) steps.push(`Add ${describedList(cheese)} over low heat and cover for 2 minutes to melt or warm it gently.`);
    steps.push(`Fold in or plate with ${describedList(bases)}, then ${coldFinishPhrase(ingredients)}.`);
  }
  const meaningful = steps.filter((step) => !/\b(?:with|from|and|in|top with)\s*\./i.test(step));
  if (meaningful.length < 4) meaningful.push(`Serve the entire measured ${spec.title} portion while the cooked components are hot.`);
  return meaningful;
}

function recipe(spec: MealSpec, index: number): Recipe {
  const ingredients = balancedItems(spec, index).map(ingredient);
  const ingredientIds = ingredients.map((item) => item.id);
  if (new Set(ingredientIds).size !== ingredientIds.length) throw new Error(`Duplicate ingredient in ${spec.id}`);
  const totals = recipeNutrition(ingredients, 1);
  const steps = methodSteps(spec, ingredients);
  const text = [spec.title, spec.cuisine, ...ingredients.map((item) => item.name), ...steps].join(' ');
  if (containsBlockedDietTerm(text)) throw new Error(`Blocked diet term in ${spec.id}`);
  if (/\b(?:breakfast|brunch|overnight oats?|pancakes?|waffles?|cereal)\b/i.test(text)) throw new Error(`Breakfast marker in ${spec.id}`);
  if (totals.macroCoverage !== 1) throw new Error(`Incomplete macros in ${spec.id}`);
  if (totals.nutritionPerServing.calories < 800 || totals.nutritionPerServing.calories > 1300) throw new Error(`${spec.id} is ${totals.nutritionPerServing.calories} kcal; expected 800-1300`);
  return Object.freeze({
    id: `starter-recipe:${spec.id}`, title: spec.title,
    description: `A substantial one-plate ${spec.cuisine.toLowerCase()} meal with exact quantities and fully calculated macros.`,
    cuisine: spec.cuisine, tags: Object.freeze(['lunch or dinner', spec.method, spec.protein]),
    prepMinutes: spec.prepMinutes, cookMinutes: spec.cookMinutes, servings: 1,
    ingredients: Object.freeze(ingredients), steps: Object.freeze([...steps]),
    nutritionPerServing: Object.freeze(totals.nutritionPerServing), macroCoverage: totals.macroCoverage,
    dietStatus: 'allowed', origin: 'starter', createdAt: CATALOG_DATE, updatedAt: CATALOG_DATE,
  });
}

const MEAL_SPECS: readonly MealSpec[] = [
  // Indian and Indian-fusion
  M('paneer-power-bowl', 'Paneer tikka rice bowl', 'Indian', 'Paneer', 'bowl', 12, 24, [I('paneer', 190), I('basmati-rice', 260), I('greek-yogurt', 100), I('onion', 100), I('bell-pepper', 120), I('tomato-paste', 32), I('olive-oil', 10), I('garlic', 9), I('ginger', 10)]),
  M('chana-basmati', 'Chana masala rice bowl', 'Indian', 'Chickpeas', 'curry', 10, 25, [I('chickpeas', 300), I('basmati-rice', 280), I('tomato-sauce', 220), I('onion', 120), I('spinach', 100), I('olive-oil', 14), I('garlic', 9), I('ginger', 10)]),
  M('rajma-chawal', 'Rajma chawal', 'Indian', 'Kidney beans', 'curry', 10, 25, [I('kidney-beans', 350), I('basmati-rice', 300), I('tomato-sauce', 200), I('onion', 120), I('olive-oil', 14), I('garlic', 9), I('ginger', 10)]),
  M('dal-makhani-plate', 'Creamy urad dal rice plate', 'Indian', 'Urad dal', 'stew', 10, 30, [I('urad-dal', 380), I('basmati-rice', 300), I('greek-yogurt', 150), I('tomato-sauce', 180), I('onion', 100), I('olive-oil', 18), I('garlic', 9), I('ginger', 10)]),
  M('palak-paneer-wrap', 'Palak paneer skillet wraps', 'Indian', 'Paneer', 'wrap', 12, 20, [I('paneer', 180), I('whole-wheat-tortilla', 112), I('spinach', 200), I('tomato-sauce', 120), I('onion', 80), I('greek-yogurt', 80), I('olive-oil', 7), I('garlic', 6)]),
  M('matar-paneer-pulao', 'Matar paneer pulao bowl', 'Indian', 'Paneer', 'bowl', 10, 25, [I('paneer', 150), I('basmati-rice', 300), I('green-peas', 170), I('onion', 100), I('tomato-paste', 24), I('olive-oil', 10), I('garlic', 6), I('ginger', 10)]),
  M('tofu-biryani-raita', 'Tofu vegetable biryani with raita', 'Indian', 'Tofu', 'skillet', 12, 28, [I('tofu-firm', 260), I('basmati-rice', 300), I('mixed-vegetables', 200), I('greek-yogurt', 150), I('onion', 100), I('olive-oil', 14), I('garlic', 6), I('ginger', 10)]),
  M('paneer-kathi-rolls', 'Paneer kathi rolls', 'Indian', 'Paneer', 'wrap', 14, 18, [I('paneer', 180), I('fajita-tortillas', 126), I('greek-yogurt', 100), I('bell-pepper', 120), I('onion', 100), I('tomato-paste', 24), I('olive-oil', 7)]),
  M('masoor-khichdi', 'Masoor dal khichdi bowl', 'Indian', 'Red lentils', 'stew', 10, 30, [I('red-lentils', 350), I('basmati-rice', 280), I('mixed-vegetables', 180), I('greek-yogurt', 180), I('olive-oil', 14), I('onion', 100), I('garlic', 6), I('ginger', 10)]),
  M('chole-sweet-potato-chaat', 'Chole sweet potato dinner chaat', 'Indian', 'Chickpeas', 'tray', 12, 30, [I('chickpeas', 300), I('sweet-potato', 300), I('greek-yogurt', 160), I('hummus', 80), I('salsa', 100), I('olive-oil', 10), I('onion', 80), I('tomato', 120)]),

  // Mexican and Tex-Mex
  M('black-bean-burrito-bowl', 'Black bean burrito bowl', 'Mexican-inspired', 'Black beans', 'bowl', 12, 18, [I('black-beans', 300), I('basmati-rice', 280), I('cheddar', 45), I('salsa', 140), I('bell-pepper', 120), I('onion', 80), I('olive-oil', 10)]),
  M('tofu-fajita-burritos', 'Chipotle tofu fajita burritos', 'Tex-Mex', 'Tofu', 'wrap', 14, 20, [I('tofu-firm', 260), I('whole-wheat-tortilla', 112), I('basmati-rice', 160), I('cheddar', 35), I('salsa', 120), I('bell-pepper', 160), I('onion', 100), I('olive-oil', 7)]),
  M('sweet-potato-enchiladas', 'Sweet potato black bean enchilada plate', 'Mexican-inspired', 'Black beans', 'bake', 15, 28, [I('black-beans', 250), I('sweet-potato', 240), I('corn-tortillas', 156), I('cheddar', 55), I('tomato-sauce', 180), I('salsa', 100), I('onion', 80)]),
  M('paneer-pepper-quesadilla', 'Paneer pepper quesadilla plate', 'Indian-Mexican', 'Paneer', 'skillet', 12, 18, [I('paneer', 170), I('whole-wheat-tortilla', 112), I('cheddar', 35), I('bell-pepper', 150), I('salsa', 120), I('onion', 80), I('olive-oil', 7)]),
  M('tempeh-taco-rice', 'Tempeh taco rice plate', 'Tex-Mex', 'Tempeh', 'skillet', 12, 18, [I('tempeh', 210), I('corn-tortillas', 104), I('basmati-rice', 220), I('salsa', 120), I('greek-yogurt', 100), I('bell-pepper', 120), I('olive-oil', 7)]),
  M('bean-cheese-crunchwrap', 'Bean and cheese crunchwrap plate', 'Tex-Mex', 'Pinto beans', 'wrap', 14, 16, [I('pinto-beans', 260), I('whole-wheat-tortilla', 112), I('corn-tortillas', 52), I('cheddar', 55), I('salsa', 100), I('greek-yogurt', 80), I('bell-pepper', 100)]),
  M('lentil-taco-bowl', 'Lentil taco quinoa bowl', 'Mexican-inspired', 'Lentils', 'bowl', 10, 20, [I('lentils', 350), I('quinoa', 300), I('cheddar', 50), I('salsa', 140), I('bell-pepper', 120), I('olive-oil', 10)]),
  M('pinto-enchiladas', 'Pinto bean broccoli enchiladas', 'Mexican-inspired', 'Pinto beans', 'bake', 14, 26, [I('pinto-beans', 280), I('corn-tortillas', 156), I('broccoli', 200), I('cheddar', 60), I('tomato-sauce', 180), I('salsa', 100)]),
  M('loaded-nacho-skillet', 'Loaded black bean tortilla skillet', 'Tex-Mex', 'Black beans', 'skillet', 12, 18, [I('black-beans', 280), I('corn-tortillas', 156), I('cheddar', 65), I('salsa', 140), I('bell-pepper', 120), I('onion', 80), I('olive-oil', 10)]),
  M('quinoa-stuffed-peppers', 'Quinoa black bean stuffed peppers', 'Mexican-inspired', 'Black beans', 'bake', 15, 30, [I('quinoa', 320), I('black-beans', 260), I('cheddar', 55), I('bell-pepper', 260), I('salsa', 120), I('olive-oil', 7)]),

  // Mediterranean and Middle Eastern
  M('hummus-chickpea-quinoa', 'Hummus chickpea quinoa mezze bowl', 'Mediterranean', 'Chickpeas', 'bowl', 12, 15, [I('chickpeas', 240), I('quinoa', 300), I('hummus', 90), I('pita', 60), I('tomato', 150), I('bell-pepper', 120), I('olive-oil', 7)]),
  M('shawarma-tofu-bowl', 'Garlic tofu shawarma rice bowl', 'Middle Eastern-inspired', 'Tofu', 'bowl', 14, 22, [I('tofu-firm', 300), I('basmati-rice', 300), I('hummus', 80), I('greek-yogurt', 100), I('tomato', 120), I('onion', 80), I('olive-oil', 7), I('garlic', 9)]),
  M('paneer-mezze-platter', 'Seared paneer mezze platter', 'Mediterranean', 'Paneer', 'skillet', 12, 18, [I('paneer', 180), I('pita', 120), I('hummus', 80), I('tomato', 150), I('bell-pepper', 120), I('greek-yogurt', 80), I('olive-oil', 7)]),
  M('chickpea-mozzarella-pasta-salad', 'Chickpea mozzarella pasta salad', 'Mediterranean', 'Chickpeas', 'pasta', 14, 16, [I('pasta', 300), I('chickpeas', 220), I('mozzarella', 70), I('tomato', 150), I('bell-pepper', 120), I('olive-oil', 14), I('garlic', 6)]),
  M('lentil-potato-moussaka', 'Lentil potato moussaka bake', 'Greek-inspired', 'Lentils', 'bake', 18, 35, [I('lentils', 320), I('potato', 350), I('cottage-cheese', 180), I('mozzarella', 55), I('tomato-sauce', 200), I('onion', 100), I('olive-oil', 10)]),
  M('hummus-vegetable-pitas', 'Hummus roasted vegetable pitas', 'Middle Eastern-inspired', 'Chickpeas', 'tray', 14, 28, [I('pita', 120), I('hummus', 130), I('chickpeas', 220), I('mixed-vegetables', 220), I('greek-yogurt', 100), I('olive-oil', 10)]),
  M('spinach-mozzarella-orzo', 'Spinach mozzarella pasta skillet', 'Mediterranean', 'Mozzarella', 'pasta', 10, 20, [I('pasta', 340), I('mozzarella', 90), I('chickpeas', 160), I('spinach', 180), I('tomato-sauce', 160), I('olive-oil', 10), I('garlic', 6)]),
  M('mujaddara-yogurt', 'Mujaddara-style rice and lentils', 'Middle Eastern-inspired', 'Lentils', 'skillet', 12, 26, [I('lentils', 330), I('basmati-rice', 300), I('onion', 220), I('greek-yogurt', 160), I('olive-oil', 18), I('garlic', 6)]),
  M('white-bean-quinoa-bowl', 'Creamy pinto quinoa herb bowl', 'Mediterranean', 'Pinto beans', 'bowl', 10, 18, [I('pinto-beans', 300), I('quinoa', 320), I('mozzarella', 60), I('greek-yogurt', 100), I('spinach', 120), I('tomato', 150), I('olive-oil', 10), I('garlic', 6)]),
  M('chickpea-tagine', 'Tomato chickpea tagine with rice', 'Moroccan-inspired', 'Chickpeas', 'stew', 12, 28, [I('chickpeas', 300), I('basmati-rice', 280), I('sweet-potato', 180), I('tomato-sauce', 200), I('onion', 100), I('olive-oil', 14), I('garlic', 6), I('ginger', 10)]),

  // East and Southeast Asian
  M('peanut-tofu-noodles', 'Peanut tofu noodle bowl', 'East Asian-inspired', 'Tofu', 'pasta', 12, 20, [I('tofu-firm', 250), I('pasta', 280), I('peanut-butter', 48), I('soy-sauce', 20), I('broccoli', 180), I('bell-pepper', 120), I('garlic', 6), I('ginger', 10)]),
  M('teriyaki-tempeh-rice', 'Ginger soy tempeh rice bowl', 'East Asian-inspired', 'Tempeh', 'bowl', 10, 20, [I('tempeh', 210), I('basmati-rice', 300), I('mixed-vegetables', 200), I('soy-sauce', 30), I('peanut-butter', 24), I('olive-oil', 7), I('garlic', 6), I('ginger', 10)]),
  M('gochujang-tofu-bibimbap', 'Spicy tofu bibimbap-style bowl', 'Korean-inspired', 'Tofu', 'bowl', 14, 22, [I('tofu-firm', 260), I('basmati-rice', 300), I('eggs', 100), I('spinach', 100), I('mushrooms', 120), I('soy-sauce', 25), I('salsa', 60), I('olive-oil', 7)]),
  M('thai-red-curry-tofu', 'Coconut tofu curry with rice', 'Thai-inspired', 'Tofu', 'curry', 12, 24, [I('tofu-firm', 250), I('basmati-rice', 280), I('coconut-milk', 180), I('mixed-vegetables', 200), I('soy-sauce', 20), I('garlic', 6), I('ginger', 10)]),
  M('sesame-edamame-noodles', 'Peanut edamame noodle bowl', 'East Asian-inspired', 'Edamame', 'pasta', 10, 18, [I('pasta', 300), I('edamame', 250), I('peanut-butter', 48), I('soy-sauce', 25), I('broccoli', 160), I('garlic', 6), I('ginger', 10)]),
  M('tofu-katsu-curry', 'Crispy tofu potato curry rice plate', 'Japanese-inspired', 'Tofu', 'tray', 16, 30, [I('tofu-firm', 300), I('basmati-rice', 245), I('potato', 200), I('coconut-milk', 100), I('tomato-paste', 24), I('vegetable-broth', 180), I('olive-oil', 14), I('onion', 80)]),
  M('miso-style-tofu-noodle-soup', 'Soy ginger tofu noodle soup', 'Japanese-inspired', 'Tofu', 'stew', 12, 20, [I('tofu-firm', 240), I('pasta', 320), I('eggs', 100), I('edamame', 120), I('vegetable-broth', 350), I('soy-sauce', 25), I('mushrooms', 120), I('ginger', 10)]),
  M('orange-tofu-fried-rice', 'Sweet tomato tofu fried rice', 'East Asian-inspired', 'Tofu', 'skillet', 10, 20, [I('tofu-firm', 260), I('basmati-rice', 330), I('eggs', 100), I('mixed-vegetables', 180), I('tomato-paste', 24), I('soy-sauce', 25), I('olive-oil', 10), I('ginger', 10)]),
  M('thai-basil-tofu-rice', 'Garlic tofu vegetable rice skillet', 'Thai-inspired', 'Tofu', 'skillet', 10, 18, [I('tofu-firm', 300), I('basmati-rice', 300), I('peanut-butter', 32), I('soy-sauce', 25), I('bell-pepper', 140), I('onion', 80), I('olive-oil', 7), I('garlic', 9)]),
  M('tempeh-fried-rice', 'Tempeh edamame fried rice', 'East Asian-inspired', 'Tempeh', 'skillet', 10, 18, [I('tempeh', 180), I('basmati-rice', 300), I('eggs', 100), I('edamame', 140), I('mixed-vegetables', 160), I('soy-sauce', 25), I('olive-oil', 7), I('ginger', 10)]),

  // Italian and European-inspired
  M('cottage-cheese-ziti', 'Cottage cheese baked ziti', 'Italian-inspired', 'Cottage cheese', 'bake', 12, 28, [I('pasta', 360), I('cottage-cheese', 220), I('mozzarella', 70), I('tomato-sauce', 240), I('spinach', 120), I('olive-oil', 7), I('garlic', 6)]),
  M('lentil-bolognese', 'Lentil tomato pasta', 'Italian-inspired', 'Lentils', 'pasta', 10, 24, [I('pasta', 360), I('lentils', 260), I('mozzarella', 45), I('tomato-sauce', 240), I('onion', 100), I('olive-oil', 10), I('garlic', 9)]),
  M('bean-gnocchi-style-skillet', 'Creamy bean potato skillet', 'Italian-inspired', 'Pinto beans', 'skillet', 15, 25, [I('potato', 410), I('pinto-beans', 260), I('mozzarella', 80), I('cottage-cheese', 150), I('tomato-sauce', 180), I('olive-oil', 14), I('garlic', 6)]),
  M('broccoli-parmesan-pasta', 'Broccoli mozzarella pasta plate', 'Italian-inspired', 'Mozzarella', 'pasta', 10, 20, [I('pasta', 340), I('mozzarella', 90), I('broccoli', 220), I('chickpeas', 160), I('tomato-sauce', 180), I('olive-oil', 10), I('garlic', 9)]),
  M('spinach-stuffed-shells', 'Spinach cottage cheese pasta bake', 'Italian-inspired', 'Cottage cheese', 'bake', 14, 30, [I('pasta', 360), I('cottage-cheese', 260), I('mozzarella', 65), I('spinach', 180), I('tomato-sauce', 220), I('olive-oil', 7), I('garlic', 6)]),
  M('creamy-chickpea-pasta', 'Creamy tomato chickpea pasta', 'Italian-inspired', 'Chickpeas', 'pasta', 10, 22, [I('pasta', 330), I('chickpeas', 220), I('greek-yogurt', 120), I('mozzarella', 45), I('tomato-sauce', 220), I('olive-oil', 10), I('garlic', 9)]),
  M('tempeh-marinara-pita', 'Tempeh marinara pita melts', 'Italian-inspired', 'Tempeh', 'bake', 12, 22, [I('tempeh', 200), I('pita', 120), I('mozzarella', 70), I('tomato-sauce', 200), I('bell-pepper', 120), I('olive-oil', 7), I('garlic', 6)]),
  M('spinach-tofu-lasagna', 'Spinach tofu pasta bake', 'Italian-inspired', 'Tofu', 'bake', 14, 32, [I('pasta', 285), I('tofu-firm', 220), I('cottage-cheese', 150), I('mozzarella', 60), I('spinach', 180), I('tomato-sauce', 240), I('olive-oil', 7)]),
  M('mushroom-pea-risotto', 'Mushroom pea creamy rice skillet', 'Northern Italian-inspired', 'Green peas', 'skillet', 10, 28, [I('basmati-rice', 360), I('green-peas', 220), I('mozzarella', 70), I('cottage-cheese', 130), I('mushrooms', 180), I('vegetable-broth', 250), I('olive-oil', 14), I('garlic', 6)]),
  M('paneer-naan-pizza', 'Paneer tomato naan pizza', 'Indian-Italian', 'Paneer', 'bake', 12, 18, [I('naan', 180), I('paneer', 140), I('mozzarella', 55), I('tomato-sauce', 160), I('bell-pepper', 120), I('onion', 80), I('olive-oil', 6)]),

  // American comfort
  M('tempeh-mac-cheese', 'Tempeh broccoli mac and cheese', 'American comfort', 'Tempeh', 'pasta', 10, 24, [I('pasta', 330), I('tempeh', 180), I('cheddar', 65), I('cottage-cheese', 120), I('broccoli', 180), I('vegetable-broth', 120)]),
  M('buffalo-tofu-potatoes', 'Spicy tofu loaded potatoes', 'American comfort', 'Tofu', 'tray', 12, 30, [I('tofu-firm', 300), I('potato', 400), I('cheddar', 60), I('greek-yogurt', 120), I('salsa', 100), I('olive-oil', 10), I('broccoli', 160)]),
  M('black-bean-burger-plate', 'Black bean burger pita plate', 'American comfort', 'Black beans', 'skillet', 16, 25, [I('black-beans', 280), I('pita', 120), I('eggs', 50), I('cheddar', 50), I('potato', 200), I('salsa', 100), I('olive-oil', 9), I('onion', 80)]),
  M('broccoli-cheddar-potato', 'Broccoli cheddar chickpea potato', 'American comfort', 'Chickpeas', 'bake', 12, 32, [I('potato', 450), I('chickpeas', 250), I('cheddar', 70), I('greek-yogurt', 100), I('broccoli', 200), I('olive-oil', 7)]),
  M('cheddar-melt-bean-soup', 'Cheddar pita melts with tomato bean soup', 'American comfort', 'Pinto beans', 'stew', 12, 22, [I('pita', 120), I('cheddar', 70), I('pinto-beans', 260), I('tomato-sauce', 250), I('vegetable-broth', 220), I('olive-oil', 10), I('onion', 100), I('garlic', 6)]),
  M('cottage-mac-peas', 'Cottage cheese mac with peas', 'American comfort', 'Cottage cheese', 'pasta', 8, 20, [I('pasta', 380), I('cottage-cheese', 260), I('cheddar', 55), I('green-peas', 180), I('vegetable-broth', 100), I('olive-oil', 7)]),
  M('loaded-sweet-potato-bowl', 'Loaded sweet potato black bean bowl', 'American comfort', 'Black beans', 'bowl', 12, 30, [I('sweet-potato', 400), I('black-beans', 300), I('cheddar', 50), I('greek-yogurt', 120), I('salsa', 120), I('olive-oil', 7)]),
  M('crispy-tofu-mash', 'Crispy tofu mashed potato plate', 'American comfort', 'Tofu', 'tray', 14, 32, [I('tofu-firm', 320), I('potato', 420), I('green-peas', 180), I('cottage-cheese', 160), I('olive-oil', 14), I('vegetable-broth', 120)]),
  M('seitan-pot-pie-bowl', 'Seitan pot pie potato bowl', 'American comfort', 'Seitan', 'stew', 16, 30, [I('seitan', 260), I('potato', 400), I('mixed-vegetables', 220), I('cottage-cheese', 180), I('vegetable-broth', 250), I('olive-oil', 14), I('onion', 100)]),
  M('lentil-shepherd-pie', 'Lentil shepherd-style potato bake', 'European comfort', 'Lentils', 'bake', 16, 35, [I('lentils', 360), I('potato', 480), I('green-peas', 160), I('cottage-cheese', 160), I('vegetable-broth', 180), I('olive-oil', 10), I('onion', 100)]),

  // Globally inspired bowls and stews
  M('greek-chickpea-quinoa', 'Greek-inspired chickpea quinoa bowl', 'Greek-inspired', 'Chickpeas', 'bowl', 12, 16, [I('chickpeas', 260), I('quinoa', 320), I('mozzarella', 65), I('hummus', 70), I('tomato', 150), I('spinach', 100), I('olive-oil', 10)]),
  M('cajun-red-beans-rice', 'Cajun-style kidney beans and rice', 'Cajun-inspired', 'Kidney beans', 'stew', 10, 28, [I('kidney-beans', 360), I('brown-rice', 350), I('bell-pepper', 140), I('onion', 120), I('tomato-sauce', 180), I('olive-oil', 14), I('vegetable-broth', 180)]),
  M('moroccan-chickpea-quinoa', 'Moroccan-style chickpea quinoa bowl', 'Moroccan-inspired', 'Chickpeas', 'stew', 12, 25, [I('chickpeas', 300), I('quinoa', 320), I('sweet-potato', 180), I('tomato-sauce', 180), I('olive-oil', 14), I('onion', 100), I('ginger', 10)]),
  M('ethiopian-red-lentils', 'Berbere-style red lentils and rice', 'Ethiopian-inspired', 'Red lentils', 'stew', 10, 28, [I('red-lentils', 380), I('basmati-rice', 320), I('tomato-sauce', 180), I('onion', 120), I('olive-oil', 18), I('garlic', 9), I('ginger', 10)]),
  M('caribbean-tofu-rice-beans', 'Caribbean-style tofu rice and beans', 'Caribbean-inspired', 'Tofu', 'skillet', 12, 24, [I('tofu-firm', 220), I('black-beans', 220), I('basmati-rice', 280), I('coconut-milk', 120), I('bell-pepper', 120), I('onion', 80), I('garlic', 6)]),
  M('west-african-peanut-stew', 'Peanut chickpea stew with rice', 'West African-inspired', 'Chickpeas', 'stew', 12, 28, [I('chickpeas', 260), I('basmati-rice', 230), I('peanut-butter', 48), I('tomato-sauce', 200), I('sweet-potato', 160), I('vegetable-broth', 200), I('onion', 100), I('garlic', 6)]),
  M('cuban-black-bean-bowl', 'Cuban-style black bean sweet potato bowl', 'Cuban-inspired', 'Black beans', 'bowl', 12, 26, [I('black-beans', 320), I('basmati-rice', 280), I('sweet-potato', 200), I('salsa', 100), I('olive-oil', 10), I('bell-pepper', 120), I('onion', 80)]),
  M('japanese-tofu-curry', 'Japanese-style tofu potato curry', 'Japanese-inspired', 'Tofu', 'curry', 12, 26, [I('tofu-firm', 260), I('basmati-rice', 300), I('potato', 220), I('vegetable-broth', 220), I('tomato-paste', 24), I('coconut-milk', 100), I('onion', 100), I('olive-oil', 7)]),
  M('edamame-poke-bowl', 'Edamame tofu rice bowl', 'Hawaiian-inspired', 'Edamame', 'bowl', 12, 16, [I('edamame', 220), I('tofu-firm', 220), I('basmati-rice', 315), I('hummus', 60), I('soy-sauce', 20), I('tomato', 120), I('spinach', 100), I('olive-oil', 7)]),
  M('peruvian-quinoa-tofu', 'Peruvian-style quinoa tofu bowl', 'Peruvian-inspired', 'Tofu', 'bowl', 12, 20, [I('quinoa', 340), I('tofu-firm', 260), I('black-beans', 180), I('salsa', 100), I('sweet-potato', 160), I('olive-oil', 10), I('garlic', 6)]),

  // Handheld lunch and dinner plates
  M('paneer-shawarma-pita', 'Paneer shawarma-style pitas', 'Middle Eastern-inspired', 'Paneer', 'wrap', 14, 18, [I('paneer', 170), I('pita', 120), I('hummus', 85), I('greek-yogurt', 80), I('tomato', 120), I('onion', 80), I('olive-oil', 7), I('garlic', 6)]),
  M('caprese-chickpea-pitas', 'Mozzarella tomato chickpea pitas', 'Italian-inspired', 'Chickpeas', 'wrap', 12, 15, [I('pita', 120), I('mozzarella', 90), I('chickpeas', 220), I('tomato', 180), I('spinach', 100), I('hummus', 60), I('olive-oil', 7)]),
  M('tempeh-pita-melts', 'Tempeh cheddar pita melts', 'European-inspired', 'Tempeh', 'bake', 12, 18, [I('tempeh', 190), I('pita', 120), I('cheddar', 60), I('tomato-sauce', 120), I('onion', 100), I('spinach', 100), I('olive-oil', 7)]),
  M('chickpea-salad-wrap', 'Creamy chickpea salad wraps', 'Mediterranean', 'Chickpeas', 'wrap', 12, 12, [I('chickpeas', 300), I('whole-wheat-tortilla', 112), I('greek-yogurt', 120), I('hummus', 60), I('tomato', 120), I('spinach', 80), I('olive-oil', 7)]),
  M('spicy-chickpea-wrap', 'Spicy chickpea cheddar wraps', 'American-inspired', 'Chickpeas', 'wrap', 12, 16, [I('chickpeas', 260), I('whole-wheat-tortilla', 112), I('cheddar', 50), I('greek-yogurt', 100), I('salsa', 120), I('bell-pepper', 100), I('olive-oil', 7)]),
  M('egg-lentil-pita', 'Egg and lentil salad pitas', 'Mediterranean', 'Eggs', 'wrap', 14, 14, [I('eggs', 200), I('pita', 120), I('lentils', 260), I('greek-yogurt', 100), I('hummus', 50), I('spinach', 80), I('tomato', 120), I('olive-oil', 7)]),
  M('black-bean-torta', 'Black bean cheddar pita tortas', 'Mexican-inspired', 'Black beans', 'wrap', 12, 15, [I('black-beans', 300), I('pita', 120), I('cheddar', 55), I('salsa', 120), I('tomato', 120), I('onion', 60), I('olive-oil', 7)]),
  M('paneer-hummus-wraps', 'Paneer hummus vegetable wraps', 'Mediterranean', 'Paneer', 'wrap', 12, 18, [I('paneer', 160), I('whole-wheat-tortilla', 112), I('hummus', 80), I('greek-yogurt', 80), I('bell-pepper', 120), I('spinach', 100), I('olive-oil', 7)]),
  M('tofu-banh-mi-pitas', 'Ginger tofu banh mi-style pitas', 'Vietnamese-inspired', 'Tofu', 'wrap', 14, 18, [I('tofu-firm', 280), I('pita', 120), I('edamame', 140), I('greek-yogurt', 80), I('soy-sauce', 20), I('bell-pepper', 120), I('onion', 80), I('ginger', 10)]),
  M('veggie-melt-bean-soup', 'Mozzarella vegetable pitas with bean soup', 'Everyday', 'Pinto beans', 'stew', 14, 22, [I('pita', 120), I('mozzarella', 90), I('pinto-beans', 260), I('tomato-sauce', 220), I('mixed-vegetables', 160), I('vegetable-broth', 220), I('olive-oil', 7), I('garlic', 6)]),

  // One-pan bakes and casseroles
  M('greek-pasta-chickpea-bake', 'Greek-style pasta chickpea bake', 'Greek-inspired', 'Chickpeas', 'bake', 12, 28, [I('pasta', 310), I('chickpeas', 240), I('mozzarella', 75), I('tomato-sauce', 200), I('spinach', 120), I('olive-oil', 7), I('garlic', 6)]),
  M('enchilada-quinoa-casserole', 'Enchilada quinoa bean casserole', 'Tex-Mex', 'Black beans', 'bake', 12, 28, [I('quinoa', 320), I('black-beans', 280), I('corn-tortillas', 78), I('cheddar', 60), I('salsa', 140), I('tomato-sauce', 120)]),
  M('paneer-tomato-rice-bake', 'Paneer tomato rice bake', 'Indian', 'Paneer', 'bake', 12, 26, [I('paneer', 170), I('basmati-rice', 300), I('mozzarella', 35), I('tomato-sauce', 200), I('spinach', 120), I('onion', 80), I('olive-oil', 7), I('garlic', 6)]),
  M('broccoli-cheddar-quinoa', 'Broccoli cheddar quinoa bake', 'American comfort', 'Chickpeas', 'bake', 12, 28, [I('quinoa', 350), I('chickpeas', 220), I('cheddar', 70), I('greek-yogurt', 120), I('broccoli', 220), I('vegetable-broth', 120)]),
  M('tofu-pasta-casserole', 'Tofu vegetable pasta casserole', 'Everyday', 'Tofu', 'bake', 12, 28, [I('pasta', 300), I('tofu-firm', 250), I('mozzarella', 60), I('mixed-vegetables', 200), I('tomato-sauce', 220), I('olive-oil', 7)]),
  M('lentil-sweet-potato-bake', 'Lentil sweet potato mozzarella bake', 'Mediterranean', 'Lentils', 'bake', 14, 32, [I('lentils', 340), I('sweet-potato', 380), I('mozzarella', 75), I('tomato-sauce', 180), I('spinach', 120), I('olive-oil', 10), I('garlic', 6)]),
  M('potato-bean-bake', 'Creamy potato pinto bean bake', 'European comfort', 'Pinto beans', 'bake', 14, 35, [I('potato', 440), I('pinto-beans', 280), I('mozzarella', 80), I('cottage-cheese', 150), I('tomato-sauce', 160), I('olive-oil', 10)]),
  M('spinach-chickpea-pasta-bake', 'Spinach chickpea pasta bake', 'Italian-inspired', 'Chickpeas', 'bake', 12, 30, [I('pasta', 290), I('chickpeas', 240), I('cottage-cheese', 160), I('mozzarella', 60), I('spinach', 160), I('tomato-sauce', 200)]),
  M('tempeh-potato-tray', 'Tempeh potato broccoli tray bake', 'Everyday', 'Tempeh', 'tray', 12, 32, [I('tempeh', 220), I('potato', 400), I('broccoli', 220), I('hummus', 80), I('greek-yogurt', 80), I('olive-oil', 14), I('garlic', 6)]),
  M('mushroom-rice-bake', 'Mushroom cottage cheese rice bake', 'European-inspired', 'Cottage cheese', 'bake', 12, 28, [I('basmati-rice', 340), I('cottage-cheese', 260), I('mozzarella', 70), I('chickpeas', 160), I('mushrooms', 180), I('spinach', 120), I('olive-oil', 7)]),

  // Fast pantry and freezer meals
  M('egg-bhurji-tacos', 'Masala egg lunch tacos', 'Indian-Mexican', 'Eggs', 'skillet', 10, 16, [I('eggs', 250), I('corn-tortillas', 156), I('black-beans', 180), I('cheddar', 45), I('bell-pepper', 120), I('spinach', 100), I('salsa', 100), I('olive-oil', 7)]),
  M('black-bean-quesadilla', 'Black bean freezer quesadilla plate', 'Mexican-inspired', 'Black beans', 'skillet', 10, 16, [I('black-beans', 280), I('whole-wheat-tortilla', 112), I('cheddar', 65), I('mixed-vegetables', 160), I('salsa', 120), I('greek-yogurt', 80)]),
  M('freezer-peanut-noodles', 'Freezer vegetable peanut noodles', 'East Asian-inspired', 'Edamame', 'pasta', 8, 16, [I('pasta', 300), I('edamame', 220), I('peanut-butter', 56), I('mixed-vegetables', 220), I('soy-sauce', 25), I('garlic', 6), I('ginger', 10)]),
  M('frozen-broccoli-paneer-rice', 'Frozen broccoli paneer rice skillet', 'Indian-inspired', 'Paneer', 'skillet', 8, 18, [I('paneer', 180), I('basmati-rice', 300), I('broccoli', 220), I('coconut-milk', 100), I('tomato-paste', 24), I('olive-oil', 7), I('garlic', 6), I('ginger', 10)]),
  M('quick-mozzarella-bean-pasta', 'Quick mozzarella bean pasta skillet', 'Italian-inspired', 'Pinto beans', 'pasta', 8, 18, [I('pasta', 330), I('pinto-beans', 240), I('mozzarella', 75), I('tomato-sauce', 220), I('spinach', 120), I('olive-oil', 7), I('garlic', 6)]),
  M('tortilla-pea-cheddar-skillet', 'Cheddar pea tortilla skillet', 'Tex-Mex', 'Green peas', 'skillet', 8, 16, [I('whole-wheat-tortilla', 112), I('green-peas', 260), I('cheddar', 70), I('black-beans', 180), I('salsa', 120), I('bell-pepper', 100), I('olive-oil', 7)]),
  M('naan-pizza-chickpea-salad', 'Naan pizza with warm chickpea salad', 'Indian-Italian', 'Chickpeas', 'bake', 10, 18, [I('naan', 180), I('mozzarella', 80), I('tomato-sauce', 140), I('chickpeas', 200), I('spinach', 100), I('olive-oil', 7), I('garlic', 6)]),
  M('edamame-rice-skillet', 'Soy edamame tofu rice skillet', 'East Asian-inspired', 'Edamame', 'skillet', 8, 16, [I('edamame', 220), I('tofu-firm', 220), I('basmati-rice', 270), I('mixed-vegetables', 180), I('soy-sauce', 25), I('peanut-butter', 24), I('olive-oil', 6)]),
  M('crispy-tofu-chickpea-pasta', 'Crispy tofu chickpea pasta marinara', 'Italian-inspired', 'Tofu', 'pasta', 10, 20, [I('tofu-firm', 250), I('chickpea-pasta', 112), I('tomato-sauce', 240), I('broccoli', 180), I('mozzarella', 40), I('olive-oil', 10), I('garlic', 6)]),
  M('red-lentil-coconut-curry', 'Red lentil coconut freezer curry', 'Indian', 'Red lentils', 'curry', 8, 22, [I('red-lentils', 360), I('basmati-rice', 300), I('coconut-milk', 150), I('spinach', 160), I('tomato-sauce', 160), I('onion', 80), I('garlic', 6), I('ginger', 10)]),
];

export const STARTER_RECIPES: readonly Recipe[] = Object.freeze(MEAL_SPECS.map(recipe));

export function searchStarterProducts(query: string, limit = 12): Product[] {
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return STARTER_PRODUCTS.slice(0, limit);
  return STARTER_PRODUCTS.map((product) => {
    const text = [product.name, ...product.aliases, ...product.categories].join(' ').toLowerCase();
    const matched = tokens.every((token) => text.includes(token));
    const score = matched ? tokens.reduce((sum, token) => sum + (product.name.toLowerCase().startsWith(token) ? 4 : 1), 0) : -1;
    return { product, score };
  }).filter((entry) => entry.score >= 0)
    .sort((left, right) => right.score - left.score || left.product.name.localeCompare(right.product.name))
    .slice(0, limit).map((entry) => entry.product);
}
