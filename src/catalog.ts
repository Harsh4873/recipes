import { classifyVegetarian } from './diet';
import type { Nutrition, Product, ProductProvenance, Recipe, RecipeIngredient } from './model';
import { hasCompleteCoreMacros, NUTRITION_KEYS, recipeNutrition, snapshotProduct } from './nutrition';

const CATALOG_DATE = '2026-08-22T00:00:00.000Z';
const USDA_URL = 'https://fdc.nal.usda.gov/';

type NutritionInput = Pick<Nutrition, 'calories' | 'proteinG' | 'carbsG' | 'fatG'> & Partial<Nutrition>;

interface StarterSpec {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly servingLabel: string;
  readonly grams?: number;
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
  calories: 'calories',
  proteinG: 'protein',
  carbsG: 'carbohydrate',
  fatG: 'total fat',
  saturatedFatG: 'saturated fat',
  fiberG: 'fiber',
  sugarG: 'sugar',
  sodiumMg: 'sodium',
};

function starterProvenance(spec: StarterSpec): ProductProvenance {
  const missing = NUTRITION_KEYS.filter((key) => spec.nutrition[key] === undefined);
  const warnings = ['Typical USDA portion; compare packaged products with their current label.'];
  if (missing.length > 0) {
    warnings.push(
      `Starter reference does not include ${missing.map((key) => NUTRIENT_LABELS[key]).join(', ')}; missing values are displayed as 0.`,
    );
  }
  return {
    kind: 'starter',
    providerName: 'USDA FoodData Central',
    sourceUrl: USDA_URL,
    externalId: spec.externalId,
    quality: missing.length === 0 ? 'complete' : 'partial',
    coreMacrosComplete: hasCompleteCoreMacros(spec.nutrition),
    warnings: Object.freeze(warnings),
  };
}

function starter(spec: StarterSpec): Product {
  return Object.freeze({
    id: `starter:${spec.id}`,
    name: spec.name,
    categories: Object.freeze([spec.category]),
    aliases: Object.freeze([...(spec.aliases ?? [])]),
    serving: Object.freeze({
      quantity: spec.grams ?? 1,
      unit: spec.grams ? 'g' : 'serving',
      label: spec.servingLabel,
      grams: spec.grams,
    }),
    nutritionPerServing: Object.freeze(nutrition(spec.nutrition)),
    provenance: Object.freeze(starterProvenance(spec)),
    eligibility: Object.freeze(classifyVegetarian({ name: spec.name, categories: [spec.category], curated: true, now: CATALOG_DATE })),
    createdAt: CATALOG_DATE,
    updatedAt: CATALOG_DATE,
  });
}

export const STARTER_PRODUCTS: readonly Product[] = Object.freeze([
  starter({ id: 'paneer', name: 'Paneer', category: 'protein', servingLabel: '100 g', grams: 100, externalId: '2705740', nutrition: { calories: 299, proteinG: 16, carbsG: 22.5, fatG: 15.5, saturatedFatG: 9, fiberG: 0, sodiumMg: 22 } }),
  starter({ id: 'tofu-firm', name: 'Firm tofu', category: 'protein', servingLabel: '100 g', grams: 100, nutrition: { calories: 144, proteinG: 17.3, carbsG: 2.8, fatG: 8.7, saturatedFatG: 1.3, fiberG: 2.3, sodiumMg: 14 } }),
  starter({ id: 'eggs', name: 'Whole eggs', category: 'protein', servingLabel: '2 large eggs', grams: 100, externalId: '2707152', nutrition: { calories: 144, proteinG: 12.4, carbsG: 1, fatG: 10, saturatedFatG: 3.2, sodiumMg: 142 } }),
  starter({ id: 'egg-whites', name: 'Egg whites', category: 'protein', servingLabel: '4 egg whites', grams: 132, externalId: '2707168', nutrition: { calories: 68, proteinG: 14, carbsG: 3.2, fatG: 0.2, sodiumMg: 220 } }),
  starter({ id: 'greek-yogurt', name: 'Plain Greek yogurt', category: 'protein', servingLabel: '1 container (150 g)', grams: 150, externalId: '2705421', nutrition: { calories: 100, proteinG: 15.3, carbsG: 5.4, fatG: 2, saturatedFatG: 1.2, sugarG: 5.4, sodiumMg: 55 } }),
  starter({ id: 'cottage-cheese', name: 'Cottage cheese', category: 'protein', servingLabel: '1/2 cup (105 g)', grams: 105, externalId: '2705747', nutrition: { calories: 86, proteinG: 11.6, carbsG: 4.5, fatG: 2.4, saturatedFatG: 1.5, sugarG: 3.5, sodiumMg: 350 } }),
  starter({ id: 'lentils', name: 'Cooked lentils', category: 'protein', servingLabel: '1/2 cup (90 g)', grams: 90, externalId: '2707425', nutrition: { calories: 104, proteinG: 8, carbsG: 18, fatG: 0.3, fiberG: 7, sodiumMg: 4 } }),
  starter({ id: 'chickpeas', name: 'Cooked chickpeas', category: 'protein', servingLabel: '1/2 cup (90 g)', grams: 90, externalId: '2707416', aliases: ['garbanzo beans', 'chana'], nutrition: { calories: 147, proteinG: 8, carbsG: 24.6, fatG: 2.3, fiberG: 6.8, sodiumMg: 6 } }),
  starter({ id: 'black-beans', name: 'Black beans', category: 'protein', servingLabel: '1/2 cup (86 g)', grams: 86, nutrition: { calories: 114, proteinG: 7.6, carbsG: 20.4, fatG: 0.5, fiberG: 7.5, sodiumMg: 1 } }),
  starter({ id: 'kidney-beans', name: 'Kidney beans', category: 'protein', servingLabel: '1/2 cup (89 g)', grams: 89, aliases: ['rajma'], nutrition: { calories: 113, proteinG: 7.7, carbsG: 20.2, fatG: 0.4, fiberG: 6.5, sodiumMg: 2 } }),
  starter({ id: 'edamame', name: 'Shelled edamame', category: 'protein', servingLabel: '1/2 cup (80 g)', grams: 80, externalId: '2707436', nutrition: { calories: 112, proteinG: 9.2, carbsG: 7, fatG: 6, saturatedFatG: 0.8, fiberG: 4, sodiumMg: 5 } }),
  starter({ id: 'tempeh', name: 'Tempeh', category: 'protein', servingLabel: '100 g', grams: 100, nutrition: { calories: 195, proteinG: 19.9, carbsG: 7.6, fatG: 11.4, saturatedFatG: 3.4, fiberG: 3.9, sodiumMg: 14 } }),
  starter({ id: 'seitan', name: 'Seitan', category: 'protein', servingLabel: '3 oz (85 g)', grams: 85, nutrition: { calories: 120, proteinG: 21, carbsG: 8, fatG: 1.5, fiberG: 1, sodiumMg: 440 } }),
  starter({ id: 'basmati-rice', name: 'Cooked basmati rice', category: 'base', servingLabel: '1 cup (165 g)', grams: 165, aliases: ['rice'], nutrition: { calories: 210, proteinG: 4.4, carbsG: 45, fatG: 0.5, fiberG: 0.6, sodiumMg: 2 } }),
  starter({ id: 'brown-rice', name: 'Cooked brown rice', category: 'base', servingLabel: '1 cup (195 g)', grams: 195, nutrition: { calories: 216, proteinG: 5, carbsG: 44.8, fatG: 1.8, fiberG: 3.5, sodiumMg: 10 } }),
  starter({ id: 'quinoa', name: 'Cooked quinoa', category: 'base', servingLabel: '1 cup (185 g)', grams: 185, externalId: '2708400', nutrition: { calories: 204, proteinG: 7.4, carbsG: 36, fatG: 3.2, fiberG: 5.2, sodiumMg: 13 } }),
  starter({ id: 'whole-wheat-tortilla', name: 'Whole-wheat tortilla', category: 'base', servingLabel: '1 large tortilla (56 g)', grams: 56, externalId: '2707825', nutrition: { calories: 174, proteinG: 5.5, carbsG: 25.7, fatG: 5.5, saturatedFatG: 1.3, fiberG: 4, sodiumMg: 345 } }),
  starter({ id: 'corn-tortillas', name: 'Corn tortillas', category: 'base', servingLabel: '3 tortillas (77 g)', grams: 77, externalId: '2707823', nutrition: { calories: 168, proteinG: 4.4, carbsG: 34.3, fatG: 2.2, fiberG: 4.6, sodiumMg: 35 } }),
  starter({ id: 'naan', name: 'Naan', category: 'base', servingLabel: '1 piece', grams: 90, externalId: '2707613', nutrition: { calories: 260, proteinG: 9, carbsG: 45, fatG: 5, saturatedFatG: 1.5, fiberG: 2, sodiumMg: 420 } }),
  starter({ id: 'paratha', name: 'Paratha', category: 'base', servingLabel: '1 paratha', grams: 80, externalId: '2707715', nutrition: { calories: 228, proteinG: 4.5, carbsG: 31.8, fatG: 9.2, saturatedFatG: 3, fiberG: 3, sodiumMg: 340 } }),
  starter({ id: 'rolled-oats', name: 'Rolled oats', category: 'base', servingLabel: '1/2 cup dry (40 g)', grams: 40, nutrition: { calories: 152, proteinG: 5.1, carbsG: 27.4, fatG: 2.8, fiberG: 4, sugarG: 0.4, sodiumMg: 2 } }),
  starter({ id: 'pasta', name: 'Cooked pasta', category: 'base', servingLabel: '1 cup (140 g)', grams: 140, nutrition: { calories: 221, proteinG: 8.1, carbsG: 43.2, fatG: 1.3, fiberG: 2.5, sodiumMg: 1 } }),
  starter({ id: 'chickpea-pasta', name: 'Chickpea pasta', category: 'base', servingLabel: '2 oz dry (56 g)', grams: 56, nutrition: { calories: 190, proteinG: 11, carbsG: 34, fatG: 3.5, fiberG: 8, sodiumMg: 40 } }),
  starter({ id: 'whole-wheat-bread', name: 'Whole-wheat bread', category: 'base', servingLabel: '2 slices (56 g)', grams: 56, nutrition: { calories: 138, proteinG: 7.2, carbsG: 23, fatG: 2.2, fiberG: 3.8, sodiumMg: 264 } }),
  starter({ id: 'mixed-vegetables', name: 'Frozen mixed vegetables', category: 'produce', servingLabel: '1/2 cup (90 g)', grams: 90, externalId: '2710013', nutrition: { calories: 58, proteinG: 2.6, carbsG: 11.7, fatG: 0.1, fiberG: 3.5, sugarG: 3.5, sodiumMg: 45 } }),
  starter({ id: 'broccoli', name: 'Frozen broccoli', category: 'produce', servingLabel: '1 cup (93 g)', grams: 93, externalId: '2709646', nutrition: { calories: 26, proteinG: 2.9, carbsG: 5, fatG: 0.1, fiberG: 2.6, sodiumMg: 30 } }),
  starter({ id: 'spinach', name: 'Frozen spinach', category: 'produce', servingLabel: '1 cup (108 g)', grams: 108, externalId: '2709616', nutrition: { calories: 37, proteinG: 4.3, carbsG: 5.2, fatG: 1, fiberG: 4, sodiumMg: 125 } }),
  starter({ id: 'green-peas', name: 'Frozen green peas', category: 'produce', servingLabel: '1 cup (134 g)', grams: 134, nutrition: { calories: 134, proteinG: 8.6, carbsG: 25, fatG: 0.5, fiberG: 8.8, sodiumMg: 5 } }),
  starter({ id: 'cauliflower-rice', name: 'Cauliflower rice', category: 'produce', servingLabel: '1 cup (107 g)', grams: 107, nutrition: { calories: 27, proteinG: 2.1, carbsG: 5.3, fatG: 0.3, fiberG: 2.1, sodiumMg: 32 } }),
  starter({ id: 'bell-pepper', name: 'Bell pepper', category: 'produce', servingLabel: '1 medium (119 g)', grams: 119, nutrition: { calories: 37, proteinG: 1.2, carbsG: 7.2, fatG: 0.4, fiberG: 2.5, sugarG: 5, sodiumMg: 5 } }),
  starter({ id: 'onion', name: 'Onion', category: 'produce', servingLabel: '1 medium (110 g)', grams: 110, nutrition: { calories: 44, proteinG: 1.2, carbsG: 10.3, fatG: 0.1, fiberG: 1.9, sugarG: 4.7, sodiumMg: 4 } }),
  starter({ id: 'tomato', name: 'Tomato', category: 'produce', servingLabel: '1 medium (123 g)', grams: 123, nutrition: { calories: 22, proteinG: 1.1, carbsG: 4.8, fatG: 0.2, fiberG: 1.5, sugarG: 3.2, sodiumMg: 6 } }),
  starter({ id: 'mushrooms', name: 'Sliced mushrooms', category: 'produce', servingLabel: '1 cup (70 g)', grams: 70, nutrition: { calories: 15, proteinG: 2.2, carbsG: 2.3, fatG: 0.2, fiberG: 0.7, sugarG: 1.4, sodiumMg: 4 } }),
  starter({ id: 'sweet-potato', name: 'Sweet potato', category: 'produce', servingLabel: '1 medium (130 g)', grams: 130, nutrition: { calories: 112, proteinG: 2, carbsG: 26, fatG: 0.1, fiberG: 3.9, sugarG: 5.4, sodiumMg: 72 } }),
  starter({ id: 'tomato-sauce', name: 'Tomato sauce', category: 'flavor', servingLabel: '1/2 cup (123 g)', grams: 123, nutrition: { calories: 59, proteinG: 2.7, carbsG: 12.6, fatG: 0.5, fiberG: 3, sugarG: 8, sodiumMg: 580 } }),
  starter({ id: 'coconut-milk', name: 'Coconut milk', category: 'flavor', servingLabel: '1/2 cup (120 g)', grams: 120, nutrition: { calories: 230, proteinG: 2.3, carbsG: 3.3, fatG: 24, saturatedFatG: 21, fiberG: 1.3, sugarG: 2, sodiumMg: 18 } }),
  starter({ id: 'salsa', name: 'Salsa', category: 'flavor', servingLabel: '1/2 cup (130 g)', grams: 130, nutrition: { calories: 36, proteinG: 2, carbsG: 7.2, fatG: 0.3, fiberG: 2.3, sugarG: 4, sodiumMg: 950 } }),
  starter({ id: 'hummus', name: 'Hummus', category: 'flavor', servingLabel: '1/4 cup (60 g)', grams: 60, nutrition: { calories: 142, proteinG: 4.7, carbsG: 12, fatG: 9.3, saturatedFatG: 1.3, fiberG: 3.6, sodiumMg: 257 } }),
  starter({ id: 'cheddar', name: 'Cheddar cheese', category: 'flavor', servingLabel: '1 oz (28 g)', grams: 28, nutrition: { calories: 114, proteinG: 6.5, carbsG: 0.9, fatG: 9.4, saturatedFatG: 5.3, sodiumMg: 185 } }),
  starter({ id: 'peanut-butter', name: 'Peanut butter', category: 'flavor', servingLabel: '2 tbsp (32 g)', grams: 32, nutrition: { calories: 190, proteinG: 7, carbsG: 7, fatG: 16, saturatedFatG: 3, fiberG: 2, sugarG: 3, sodiumMg: 140 } }),
  starter({ id: 'olive-oil', name: 'Olive oil', category: 'flavor', servingLabel: '1 tbsp (14 g)', grams: 14, nutrition: { calories: 119, proteinG: 0, carbsG: 0, fatG: 13.5, saturatedFatG: 1.9, sodiumMg: 0 } }),
]);

const productMap = new Map(STARTER_PRODUCTS.map((product) => [product.id, product]));

function ingredient(productId: string, servings = 1, amountLabel?: string): RecipeIngredient {
  const product = productMap.get(`starter:${productId}`);
  if (!product) throw new Error(`Unknown starter product: ${productId}`);
  return {
    id: `ingredient:${productId}`,
    productId: product.id,
    name: product.name,
    amountLabel: amountLabel ?? `${servings} × ${product.serving.label}`,
    optional: false,
    snapshot: snapshotProduct(product, servings),
  };
}

interface RecipeSpec {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly cuisine: string;
  readonly tags: readonly string[];
  readonly prepMinutes: number;
  readonly cookMinutes: number;
  readonly servings: number;
  readonly ingredients: readonly RecipeIngredient[];
  readonly steps: readonly string[];
}

function recipe(spec: RecipeSpec): Recipe {
  const totals = recipeNutrition(spec.ingredients, spec.servings);
  return Object.freeze({
    ...spec,
    id: `starter-recipe:${spec.id}`,
    tags: Object.freeze([...spec.tags]),
    ingredients: Object.freeze([...spec.ingredients]),
    steps: Object.freeze([...spec.steps]),
    nutritionPerServing: Object.freeze(totals.nutritionPerServing),
    macroCoverage: totals.macroCoverage,
    dietStatus: 'allowed',
    origin: 'starter',
    createdAt: CATALOG_DATE,
    updatedAt: CATALOG_DATE,
  });
}

export const STARTER_RECIPES: readonly Recipe[] = Object.freeze([
  recipe({ id: 'paneer-power-bowl', title: 'Paneer power bowl', description: 'Golden paneer, spinach, and basmati with a bright tomato finish.', cuisine: 'Indian-inspired', tags: ['high protein', 'meal prep'], prepMinutes: 10, cookMinutes: 20, servings: 2, ingredients: [ingredient('paneer'), ingredient('basmati-rice', 2), ingredient('spinach'), ingredient('tomato-sauce', 0.5), ingredient('onion', 0.5)], steps: ['Brown the paneer in a wide skillet until the edges turn golden.', 'Add onion, spinach, and tomato sauce; simmer until glossy.', 'Divide warm basmati between bowls and spoon the paneer mixture over it.'] }),
  recipe({ id: 'tofu-stir-fry', title: 'Freezer-aisle tofu stir-fry', description: 'A fast tofu and frozen-vegetable skillet built for weeknights.', cuisine: 'Asian-inspired', tags: ['one pan', 'freezer friendly'], prepMinutes: 8, cookMinutes: 15, servings: 2, ingredients: [ingredient('tofu-firm', 2), ingredient('mixed-vegetables', 2), ingredient('brown-rice', 2), ingredient('olive-oil', 0.5)], steps: ['Pat the tofu dry, cube it, and sear in the oil.', 'Add the frozen vegetables and cook over high heat until hot and lightly charred.', 'Season with salt, black pepper, and dry chili flakes, then serve over brown rice.'] }),
  recipe({ id: 'chana-basmati', title: 'Quick chana masala bowl', description: 'Chickpeas simmered in tomato with spinach and rice.', cuisine: 'Indian-inspired', tags: ['pantry meal', 'fiber rich'], prepMinutes: 8, cookMinutes: 18, servings: 2, ingredients: [ingredient('chickpeas', 2), ingredient('basmati-rice', 2), ingredient('tomato-sauce'), ingredient('spinach'), ingredient('onion', 0.5)], steps: ['Soften the onion with cumin, coriander, and garam masala.', 'Stir in chickpeas, tomato sauce, and a splash of water; simmer for 10 minutes.', 'Fold in spinach and serve with basmati rice.'] }),
  recipe({ id: 'rajma-wrap', title: 'Rajma crunch wraps', description: 'Kidney beans, salsa, and crisp vegetables in a whole-wheat wrap.', cuisine: 'Indian-Mexican', tags: ['high fiber', 'portable'], prepMinutes: 12, cookMinutes: 10, servings: 2, ingredients: [ingredient('kidney-beans', 2), ingredient('whole-wheat-tortilla', 2), ingredient('salsa'), ingredient('bell-pepper'), ingredient('cheddar')], steps: ['Mash half the beans with salsa, then fold in the remaining beans.', 'Fill tortillas with the bean mixture, pepper, and cheddar.', 'Toast seam-side down in a dry skillet until crisp on both sides.'] }),
  recipe({ id: 'egg-bhurji-tacos', title: 'Egg bhurji breakfast tacos', description: 'Soft masala eggs with peppers and spinach in corn tortillas.', cuisine: 'Indian-Mexican', tags: ['breakfast', '30 minutes'], prepMinutes: 8, cookMinutes: 12, servings: 2, ingredients: [ingredient('eggs', 2), ingredient('corn-tortillas', 2), ingredient('bell-pepper'), ingredient('spinach'), ingredient('salsa', 0.5)], steps: ['Sauté pepper and spinach with turmeric, cumin, and black pepper.', 'Add beaten eggs and fold gently until just set.', 'Warm the tortillas and fill with the bhurji and salsa.'] }),
  recipe({ id: 'yogurt-oats', title: 'Protein overnight oats', description: 'Creamy Greek yogurt oats with peanut butter for an easy cold breakfast.', cuisine: 'Everyday', tags: ['no cook', 'breakfast'], prepMinutes: 8, cookMinutes: 0, servings: 1, ingredients: [ingredient('greek-yogurt'), ingredient('rolled-oats'), ingredient('peanut-butter', 0.5)], steps: ['Stir the oats with a splash of water and refrigerate overnight.', 'Fold in Greek yogurt before serving.', 'Swirl peanut butter through the top.'] }),
  recipe({ id: 'lentil-spinach-curry', title: 'Creamy lentil spinach curry', description: 'A high-fiber red-sauce curry rounded out with coconut milk.', cuisine: 'Indian-inspired', tags: ['batch cook', 'high fiber'], prepMinutes: 10, cookMinutes: 25, servings: 2, ingredients: [ingredient('lentils', 3), ingredient('spinach'), ingredient('tomato-sauce'), ingredient('coconut-milk', 0.5), ingredient('basmati-rice', 2)], steps: ['Warm the tomato sauce with curry powder, ground ginger, and a pinch of salt.', 'Add lentils and coconut milk, then simmer until thick.', 'Fold in spinach and serve with rice.'] }),
  recipe({ id: 'edamame-quinoa', title: 'Edamame quinoa crunch bowl', description: 'Quinoa and edamame with colorful vegetables and a creamy hummus dressing.', cuisine: 'Mediterranean-inspired', tags: ['meal prep', 'plant protein'], prepMinutes: 12, cookMinutes: 5, servings: 2, ingredients: [ingredient('quinoa', 2), ingredient('edamame', 2), ingredient('bell-pepper'), ingredient('tomato'), ingredient('hummus')], steps: ['Toss warm quinoa and edamame together.', 'Fold in chopped pepper and tomato.', 'Thin hummus with water, then drizzle over the bowls.'] }),
  recipe({ id: 'palak-paneer-wrap', title: 'Palak paneer skillet wraps', description: 'Paneer and spinach tucked into warm whole-wheat tortillas.', cuisine: 'Indian-inspired', tags: ['high protein', 'handheld'], prepMinutes: 10, cookMinutes: 15, servings: 2, ingredients: [ingredient('paneer'), ingredient('spinach', 2), ingredient('whole-wheat-tortilla', 2), ingredient('tomato-sauce', 0.5), ingredient('onion', 0.5)], steps: ['Brown paneer with onion and garam masala.', 'Add tomato sauce and spinach; cook until the spinach is hot and the sauce clings.', 'Roll into warm tortillas and toast briefly in the skillet.'] }),
  recipe({ id: 'chickpea-pasta', title: 'Chickpea pasta primavera', description: 'Protein-forward pasta with broccoli, mushrooms, and tomato sauce.', cuisine: 'Italian-inspired', tags: ['weeknight', 'high protein'], prepMinutes: 8, cookMinutes: 18, servings: 2, ingredients: [ingredient('chickpea-pasta', 2), ingredient('broccoli', 2), ingredient('mushrooms'), ingredient('tomato-sauce'), ingredient('olive-oil', 0.5)], steps: ['Cook the chickpea pasta until just tender, reserving a splash of water.', 'Sauté broccoli and mushrooms in olive oil.', 'Add tomato sauce and pasta, loosening with reserved water as needed.'] }),
  recipe({ id: 'tofu-scramble', title: 'Masala tofu scramble', description: 'Crumbled tofu with peppers, spinach, and warm spices.', cuisine: 'Indian-inspired', tags: ['breakfast', 'one pan'], prepMinutes: 8, cookMinutes: 14, servings: 2, ingredients: [ingredient('tofu-firm', 2), ingredient('bell-pepper'), ingredient('spinach'), ingredient('onion', 0.5), ingredient('whole-wheat-bread', 2)], steps: ['Sauté onion and pepper with turmeric, cumin, and chili.', 'Crumble in tofu and cook until the edges pick up color.', 'Fold in spinach and serve with toast.'] }),
  recipe({ id: 'black-bean-quesadilla', title: 'Black bean freezer quesadillas', description: 'Crisp tortillas filled with beans, vegetables, salsa, and cheddar.', cuisine: 'Mexican-inspired', tags: ['freezer friendly', 'family'], prepMinutes: 10, cookMinutes: 12, servings: 2, ingredients: [ingredient('black-beans', 2), ingredient('whole-wheat-tortilla', 2), ingredient('mixed-vegetables'), ingredient('cheddar', 2), ingredient('salsa')], steps: ['Mash the beans lightly and combine with hot mixed vegetables.', 'Spread over tortillas, add cheddar, and fold.', 'Toast in a skillet until crisp; serve with salsa.'] }),
]);

export function searchStarterProducts(query: string, limit = 12): Product[] {
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return STARTER_PRODUCTS.slice(0, limit);
  return STARTER_PRODUCTS
    .map((product) => {
      const text = [product.name, ...product.aliases, ...product.categories].join(' ').toLowerCase();
      const matched = tokens.every((token) => text.includes(token));
      const score = matched ? tokens.reduce((sum, token) => sum + (product.name.toLowerCase().startsWith(token) ? 4 : 1), 0) : -1;
      return { product, score };
    })
    .filter((entry) => entry.score >= 0)
    .sort((left, right) => right.score - left.score || left.product.name.localeCompare(right.product.name))
    .slice(0, limit)
    .map((entry) => entry.product);
}
