import type { Nutrition } from '../model';
import { ingredientById, type IngredientRecord } from './ingredients';
import { nutritionForGrams, perServing, sumNutrition } from './macros';

export interface PlannerIngredient {
  readonly id: string;
  readonly ingredientId: string;
  readonly name: string;
  readonly grams: number;
  readonly amountLabel: string;
  readonly nutrition: Nutrition;
  readonly estimated: boolean;
  readonly sourceLabel: string;
  readonly sourceUrl?: string;
  readonly sourceNote: string;
}

export interface PlannerRecipe {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly cuisine: string;
  readonly tags: readonly string[];
  readonly prepMinutes: number;
  readonly cookMinutes: number;
  readonly servings: number;
  readonly ingredients: readonly PlannerIngredient[];
  readonly steps: readonly string[];
  readonly nutritionPerServing: Nutrition;
  readonly estimated: boolean;
}

interface LineInput {
  readonly ingredientId: string;
  readonly grams: number;
  readonly amountLabel: string;
}

interface RecipeInput {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly cuisine: string;
  readonly tags: readonly string[];
  readonly prepMinutes: number;
  readonly cookMinutes: number;
  readonly servings?: number;
  readonly lines: readonly LineInput[];
  readonly steps: readonly string[];
}

function lineFrom(input: LineInput, index: number): PlannerIngredient {
  const record: IngredientRecord = ingredientById(input.ingredientId);
  return {
    id: `${input.ingredientId}-${index}`,
    ingredientId: record.id,
    name: record.name,
    grams: input.grams,
    amountLabel: input.amountLabel,
    nutrition: nutritionForGrams(record.nutrition, record.referenceGrams, input.grams),
    estimated: record.estimated,
    sourceLabel: record.sourceLabel,
    ...(record.sourceUrl ? { sourceUrl: record.sourceUrl } : {}),
    sourceNote: record.sourceNote,
  };
}

export function buildPlannerRecipe(input: RecipeInput): PlannerRecipe {
  const servings = input.servings ?? 1;
  const ingredients = input.lines.map(lineFrom);
  return {
    id: input.id,
    title: input.title,
    description: input.description,
    cuisine: input.cuisine,
    tags: input.tags,
    prepMinutes: input.prepMinutes,
    cookMinutes: input.cookMinutes,
    servings,
    ingredients,
    steps: input.steps,
    nutritionPerServing: perServing(sumNutrition(ingredients.map((item) => item.nutrition)), servings),
    estimated: ingredients.some((item) => item.estimated),
  };
}

const L = (ingredientId: string, grams: number, amountLabel: string): LineInput => ({ ingredientId, grams, amountLabel });

export const PLANNER_RECIPES: readonly PlannerRecipe[] = Object.freeze([
  buildPlannerRecipe({
    id: 'plan:cottage-bhurji-toast',
    title: 'Cottage Cheese Bhurji on Toast',
    description: 'Scrambled cottage cheese and eggs on whole-wheat toast. A high-protein breakfast that uses the owner\'s usual dairy and bread.',
    cuisine: 'Indian',
    tags: ['breakfast', 'eggs', 'cottage cheese'],
    prepMinutes: 8,
    cookMinutes: 10,
    lines: [
      L('cottage', 220, '220 g cottage cheese'),
      L('egg', 100, '2 large eggs (100 g)'),
      L('onion', 35, '35 g red onion'),
      L('tomato', 70, '70 g Roma tomato'),
      L('bread', 85, '85 g whole-wheat bread'),
      L('garlic', 5, '5 g garlic'),
      L('butter', 6, '6 g butter'),
    ],
    steps: [
      'Mash 220 g cottage cheese with a fork so the curds break up but stay visible.',
      'Warm 6 g butter in a pan, then soften 35 g red onion and 5 g garlic for about 2 minutes.',
      'Add 2 large eggs (100 g) and the cottage cheese. Stir until the eggs are fully set and the curds are hot.',
      'Fold in 70 g chopped Roma tomato. Toast 85 g whole-wheat bread and spoon the bhurji over it.',
    ],
  }),
  buildPlannerRecipe({
    id: 'plan:egg-spinach-breakfast',
    title: 'Egg and Spinach Breakfast',
    description: 'Eggs scrambled with frozen spinach, whole-wheat toast, and plain Greek yogurt on the side.',
    cuisine: 'Everyday',
    tags: ['breakfast', 'eggs', 'yogurt'],
    prepMinutes: 5,
    cookMinutes: 10,
    lines: [
      L('egg', 150, '3 large eggs (150 g)'),
      L('spinach', 90, '90 g frozen spinach'),
      L('bread', 95, '95 g whole-wheat bread'),
      L('yogurt', 100, '100 g plain Greek yogurt'),
      L('butter', 8, '8 g butter'),
    ],
    steps: [
      'Thaw 90 g frozen spinach and squeeze out the extra water.',
      'Melt 8 g butter, wilt the spinach, then add 3 large eggs (150 g) and scramble until fully set.',
      'Toast 95 g whole-wheat bread.',
      'Serve the eggs with the toast and 100 g plain Greek yogurt.',
    ],
  }),
  buildPlannerRecipe({
    id: 'plan:paneer-bhurji-roti',
    title: 'Paneer Bhurji with Roti',
    description: 'Crumbled paneer cooked with egg, onion, and tomato, with whole-wheat roti. Paneer figures are estimated: verify against the package.',
    cuisine: 'Indian',
    tags: ['lunch', 'paneer', 'roti'],
    prepMinutes: 10,
    cookMinutes: 15,
    lines: [
      L('paneer', 90, '90 g paneer'),
      L('egg', 50, '1 large egg (50 g)'),
      L('onion', 40, '40 g red onion'),
      L('tomato', 60, '60 g Roma tomato'),
      L('roti', 80, '2 whole-wheat roti (80 g)'),
      L('garlic', 6, '6 g garlic'),
      L('yogurt', 50, '50 g plain Greek yogurt'),
    ],
    steps: [
      'Crumble 90 g paneer into small pieces.',
      'Soften 40 g red onion and 6 g garlic in a dry or lightly oiled pan. The yogurt goes on at the end, not in the pan yet.',
      'Add 60 g chopped Roma tomato and the paneer. Stir in 1 large egg (50 g) and cook until the egg is fully set.',
      'Warm 2 whole-wheat roti (80 g). Spoon 50 g plain Greek yogurt on the side.',
    ],
  }),
  buildPlannerRecipe({
    id: 'plan:honey-garlic-chikn-rice',
    title: 'Crispy Honey Garlic Butter Chik\'n and Rice',
    description: 'MorningStar Farms Chik\'n Strips with 90 g dry basmati, teriyaki, soy sauce, honey, garlic, and butter. Recomputed from the plant-based label. Do not copy totals from an animal version of this plate.',
    cuisine: 'Weeknight',
    tags: ['lunch', 'Chik\'n strips', 'rice'],
    prepMinutes: 8,
    cookMinutes: 20,
    lines: [
      L('msf-strips', 160, '160 g MorningStar Farms Chik\'n Strips'),
      L('rice-dry', 90, '90 g dry basmati rice'),
      L('butter', 14, '14 g butter'),
      L('honey', 18, '18 g honey'),
      L('soy-sauce', 16, '16 g soy sauce'),
      L('kikkoman-teriyaki', 15, '1 tbsp Kikkoman teriyaki (15 g)'),
      L('garlic', 8, '8 g garlic'),
      L('gv-veg', 80, '80 g Great Value mixed vegetables'),
    ],
    steps: [
      'Rinse 90 g dry basmati and simmer it in water until the grains are tender. Drain if needed.',
      'Brown 160 g MorningStar Farms Chik\'n Strips in a pan until the edges crisp, then set them aside.',
      'In the same pan, melt 14 g butter with 8 g garlic, 18 g honey, 16 g soy sauce, and 1 tbsp Kikkoman teriyaki.',
      'Toss the strips back through the sauce. Steam 80 g Great Value mixed vegetables and serve them with the rice.',
    ],
  }),
  buildPlannerRecipe({
    id: 'plan:daring-honey-rice',
    title: 'Honey Garlic Daring Rice',
    description: 'The same honey-garlic sauce on Daring Original plant-based pieces, with dry basmati and steamed mixed vegetables.',
    cuisine: 'Weeknight',
    tags: ['lunch', 'Daring', 'rice'],
    prepMinutes: 8,
    cookMinutes: 20,
    lines: [
      L('daring', 175, '175 g Daring Original plant-based pieces'),
      L('rice-dry', 85, '85 g dry basmati rice'),
      L('butter', 12, '12 g butter'),
      L('honey', 16, '16 g honey'),
      L('soy-sauce', 16, '16 g soy sauce'),
      L('kikkoman-teriyaki', 15, '1 tbsp Kikkoman teriyaki (15 g)'),
      L('garlic', 8, '8 g garlic'),
      L('gv-veg', 140, '140 g Great Value mixed vegetables'),
    ],
    steps: [
      'Simmer 85 g dry basmati until tender.',
      'Sear 175 g Daring Original plant-based pieces until browned, then set them aside.',
      'Melt 12 g butter with 8 g garlic, 16 g honey, 16 g soy sauce, and 1 tbsp Kikkoman teriyaki.',
      'Return the pieces to the pan and coat them. Steam 140 g Great Value mixed vegetables and serve with the rice.',
    ],
  }),
  buildPlannerRecipe({
    id: 'plan:grillers-burger',
    title: 'Grillers Burger Plate',
    description: 'Two MorningStar Farms Grillers Original patties on a Nature\'s Own brioche-style bun with a Kraft Single, lettuce, Roma tomato, red onion, dill chips, and Heinz No Sugar Added ketchup. Steamed Great Value mixed vegetables on the side.',
    cuisine: 'American',
    tags: ['lunch', 'Grillers', 'burger'],
    prepMinutes: 8,
    cookMinutes: 12,
    lines: [
      L('msf-grillers', 128, '2 Grillers Original patties (128 g)'),
      L('natures-bun', 64, '1 Nature\'s Own brioche-style bun (64 g)'),
      L('kraft-single', 21, '1 Kraft Single (21 g)'),
      L('heinz-ketchup', 16, '1 tbsp Heinz No Sugar Added ketchup (16 g)'),
      L('lettuce', 40, '40 g iceberg lettuce'),
      L('tomato', 55, '55 g Roma tomato'),
      L('onion', 25, '25 g red onion'),
      L('gv-pickle', 28, '28 g Great Value hamburger dill chips'),
      L('gv-veg', 170, '170 g Great Value mixed vegetables'),
    ],
    steps: [
      'Cook 2 Grillers Original patties (128 g) from frozen until heated through and browned.',
      'Toast 1 Nature\'s Own brioche-style bun (64 g).',
      'Build the burger with 1 Kraft Single, 40 g iceberg, 55 g Roma tomato, 25 g red onion, 28 g dill chips, and 1 tbsp Heinz No Sugar Added ketchup.',
      'Steam 170 g Great Value mixed vegetables and serve them beside the burger.',
    ],
  }),
  buildPlannerRecipe({
    id: 'plan:korean-riblet-bowl',
    title: 'Korean BBQ Riblet Bowl',
    description: 'One MorningStar Farms Korean BBQ riblet (142 g, half the idea of a larger box portion) with steamed Great Value mixed vegetables and dry basmati.',
    cuisine: 'Korean-style',
    tags: ['lunch', 'riblet', 'rice'],
    prepMinutes: 5,
    cookMinutes: 15,
    lines: [
      L('msf-riblet', 142, '1 Korean BBQ riblet with sauce (142 g)'),
      L('gv-veg', 200, '200 g Great Value mixed vegetables'),
      L('rice-dry', 90, '90 g dry basmati rice'),
    ],
    steps: [
      'Simmer 90 g dry basmati until the grains are tender.',
      'Heat 1 Korean BBQ riblet with sauce (142 g) in a pan or the microwave until the sauce is hot and the piece is heated through.',
      'Steam 200 g Great Value mixed vegetables in the bag or a covered pan.',
      'Serve the riblet over the rice with the vegetables on the side. Do not add a second riblet if you are following the default Wednesday plate.',
    ],
  }),
  buildPlannerRecipe({
    id: 'plan:teriyaki-honey-bowl',
    title: 'Teriyaki Honey Chik\'n Rice Bowl',
    description: 'MorningStar Farms Chik\'n Strips tossed with Kikkoman teriyaki, soy sauce, and honey. No butter in the sauce. Served as a rice bowl with mixed vegetables.',
    cuisine: 'Weeknight',
    tags: ['lunch', 'Chik\'n strips', 'rice'],
    prepMinutes: 8,
    cookMinutes: 18,
    lines: [
      L('msf-strips', 155, '155 g MorningStar Farms Chik\'n Strips'),
      L('rice-dry', 80, '80 g dry basmati rice'),
      L('kikkoman-teriyaki', 15, '1 tbsp Kikkoman teriyaki (15 g)'),
      L('soy-sauce', 16, '1 tbsp soy sauce (16 g)'),
      L('honey', 21, '1 tbsp honey (21 g)'),
      L('cholula', 5, '5 g Cholula'),
      L('gv-veg', 110, '110 g Great Value mixed vegetables'),
    ],
    steps: [
      'Simmer 80 g dry basmati until tender.',
      'Cook 155 g MorningStar Farms Chik\'n Strips until browned, then set them aside.',
      'Add 1 tbsp Kikkoman teriyaki, 1 tbsp soy sauce, 1 tbsp honey, and 5 g Cholula to the pan. Do not add butter.',
      'Toss the strips back through the sauce. Steam 110 g Great Value mixed vegetables and serve everything over the rice.',
    ],
  }),
  buildPlannerRecipe({
    id: 'plan:teriyaki-honey-burrito',
    title: 'Teriyaki Honey Chik\'n Burrito',
    description: 'The same no-butter teriyaki-honey method, rolled in one Mission Carb Balance tortilla instead of served as a rice bowl.',
    cuisine: 'Weeknight',
    tags: ['lunch', 'Chik\'n strips', 'tortilla'],
    prepMinutes: 8,
    cookMinutes: 12,
    lines: [
      L('mission-tortilla', 71, '1 Mission Carb Balance tortilla (71 g)'),
      L('msf-strips', 120, '120 g MorningStar Farms Chik\'n Strips'),
      L('kikkoman-teriyaki', 15, '1 tbsp Kikkoman teriyaki (15 g)'),
      L('soy-sauce', 16, '1 tbsp soy sauce (16 g)'),
      L('honey', 21, '1 tbsp honey (21 g)'),
      L('cholula', 5, '5 g Cholula'),
    ],
    steps: [
      'Cook 120 g MorningStar Farms Chik\'n Strips until browned, then set them aside.',
      'Warm 1 tbsp Kikkoman teriyaki, 1 tbsp soy sauce, 1 tbsp honey, and 5 g Cholula in the pan. Do not add butter.',
      'Toss the strips back in the sauce until coated.',
      'Warm 1 Mission Carb Balance tortilla (71 g), fill it, and roll it closed.',
    ],
  }),
  buildPlannerRecipe({
    id: 'plan:crispy-garlic-butter-chikn',
    title: 'Crispy Garlic Butter Chik\'n',
    description: 'Crisped MorningStar Farms Chik\'n Strips finished with garlic-herb butter (butter, garlic, and oregano), plus rice and a large side of steamed mixed vegetables.',
    cuisine: 'Weeknight',
    tags: ['lunch', 'Chik\'n strips', 'suggestion'],
    prepMinutes: 8,
    cookMinutes: 18,
    lines: [
      L('msf-strips', 170, '170 g MorningStar Farms Chik\'n Strips'),
      L('butter', 8, '8 g butter'),
      L('garlic', 10, '10 g garlic'),
      L('gv-oregano', 1, '1 g Great Value oregano'),
      L('rice-dry', 65, '65 g dry basmati rice'),
      L('gv-veg', 280, '280 g Great Value mixed vegetables'),
    ],
    steps: [
      'Simmer 65 g dry basmati until tender.',
      'Crisp 170 g MorningStar Farms Chik\'n Strips in a pan.',
      'Add 8 g butter, 10 g garlic, and 1 g Great Value oregano and toss until the butter smells fragrant. That garlic-herb butter is the finish, not a separate sauce bottle.',
      'Steam 280 g Great Value mixed vegetables and serve them with the rice and strips.',
    ],
  }),
  buildPlannerRecipe({
    id: 'plan:garlic-vodka-rigatoni',
    title: 'Garlic Vodka Rigatoni',
    description: 'One plate from a two-plate batch: half of the owner\'s 2 cup dry Great Value rigatoni (533 kcal for the full 2 cups) and half of 2 cups Bertolli Garlic Vodka Sauce (400 kcal for the full 2 cups), plus MorningStar Farms Chik\'n Strips and spinach.',
    cuisine: 'Italian-style',
    tags: ['lunch', 'pasta', 'meal prep'],
    prepMinutes: 10,
    cookMinutes: 20,
    lines: [
      L('gv-rigatoni', 74.62, '74.62 g dry Great Value rigatoni (half of a 533 kcal / 2 cup batch)'),
      L('bertolli-vodka', 244, '244 g Bertolli Garlic Vodka Sauce (half of 2 cups)'),
      L('msf-strips', 115, '115 g MorningStar Farms Chik\'n Strips'),
      L('spinach', 100, '100 g frozen spinach'),
    ],
    steps: [
      'For two plates, boil 149.24 g dry rigatoni (the owner\'s 2 cup / 533 kcal measure). This plate uses half, 74.62 g.',
      'Warm 244 g Bertolli Garlic Vodka Sauce, which is half of a 2 cup (400 kcal) batch.',
      'Brown 115 g MorningStar Farms Chik\'n Strips and stir them into the sauce.',
      'Fold in 100 g thawed, squeezed frozen spinach and toss with the drained pasta. Save the other half of a full batch for a second plate.',
    ],
  }),
  buildPlannerRecipe({
    id: 'plan:cheesy-garlic-rolls',
    title: 'Cheesy Garlic Chik\'n Rolls',
    description: 'A Mission Carb Balance tortilla rolled around MorningStar Farms Chik\'n Strips, mozzarella, and garlic butter.',
    cuisine: 'Weeknight',
    tags: ['lunch', 'Chik\'n strips', 'cheese'],
    prepMinutes: 8,
    cookMinutes: 12,
    lines: [
      L('mission-tortilla', 71, '1 Mission Carb Balance tortilla (71 g)'),
      L('msf-strips', 115, '115 g MorningStar Farms Chik\'n Strips'),
      L('mozzarella', 35, '35 g mozzarella'),
      L('butter', 10, '10 g butter'),
      L('garlic', 6, '6 g garlic'),
      L('gv-oregano', 1, '1 g Great Value oregano'),
    ],
    steps: [
      'Cook 115 g MorningStar Farms Chik\'n Strips until browned.',
      'Stir 10 g butter with 6 g garlic and 1 g oregano, then toss the strips in that garlic butter.',
      'Lay the strips and 35 g mozzarella on 1 Mission Carb Balance tortilla (71 g).',
      'Roll it tight and toast the seam in a pan until the cheese softens.',
    ],
  }),
  buildPlannerRecipe({
    id: 'plan:paneer-65',
    title: 'Hyderabadi Paneer 65',
    description: 'Paneer tossed with yogurt, onion, garlic, and a whole-wheat roti, plus steamed mixed vegetables. A home-kitchen version, not a deep-fried restaurant plate.',
    cuisine: 'Indian',
    tags: ['lunch', 'paneer'],
    prepMinutes: 12,
    cookMinutes: 15,
    lines: [
      L('paneer', 100, '100 g paneer'),
      L('yogurt', 80, '80 g plain Greek yogurt'),
      L('onion', 45, '45 g red onion'),
      L('garlic', 8, '8 g garlic'),
      L('roti', 40, '1 whole-wheat roti (40 g)'),
      L('gv-veg', 110, '110 g Great Value mixed vegetables'),
    ],
    steps: [
      'Cut 100 g paneer into bite-size cubes and toss them with 80 g plain Greek yogurt and 8 g garlic.',
      'Brown the cubes in a pan until the edges color.',
      'Add 45 g red onion and cook until the onion softens.',
      'Steam 110 g Great Value mixed vegetables and serve with 1 whole-wheat roti (40 g).',
    ],
  }),
  buildPlannerRecipe({
    id: 'plan:tofu-65',
    title: 'Tofu 65',
    description: 'The same yogurt-garlic toss made with firm tofu instead of paneer, with roti and mixed vegetables.',
    cuisine: 'Indian',
    tags: ['lunch', 'tofu'],
    prepMinutes: 12,
    cookMinutes: 15,
    lines: [
      L('tofu', 200, '200 g firm tofu'),
      L('yogurt', 70, '70 g plain Greek yogurt'),
      L('onion', 45, '45 g red onion'),
      L('garlic', 8, '8 g garlic'),
      L('roti', 40, '1 whole-wheat roti (40 g)'),
      L('gv-veg', 90, '90 g Great Value mixed vegetables'),
    ],
    steps: [
      'Press 200 g firm tofu and cut it into cubes.',
      'Toss the cubes with 70 g plain Greek yogurt and 8 g garlic, then brown them in a pan.',
      'Add 45 g red onion and cook until softened.',
      'Steam 90 g Great Value mixed vegetables and serve with 1 whole-wheat roti (40 g).',
    ],
  }),
  buildPlannerRecipe({
    id: 'plan:chikn-strip-wrap',
    title: 'Chik\'n Strip Wrap',
    description: 'MorningStar Farms Chik\'n Strips in a Mission Carb Balance tortilla with yogurt, lettuce, tomato, and onion.',
    cuisine: 'Weeknight',
    tags: ['lunch', 'Chik\'n strips', 'wrap'],
    prepMinutes: 8,
    cookMinutes: 10,
    lines: [
      L('mission-tortilla', 71, '1 Mission Carb Balance tortilla (71 g)'),
      L('msf-strips', 110, '110 g MorningStar Farms Chik\'n Strips'),
      L('yogurt', 80, '80 g plain Greek yogurt'),
      L('lettuce', 40, '40 g iceberg lettuce'),
      L('tomato', 50, '50 g Roma tomato'),
      L('onion', 20, '20 g red onion'),
    ],
    steps: [
      'Cook 110 g MorningStar Farms Chik\'n Strips until browned.',
      'Warm 1 Mission Carb Balance tortilla (71 g).',
      'Spread 80 g plain Greek yogurt on the tortilla.',
      'Add the strips, 40 g iceberg, 50 g Roma tomato, and 20 g red onion, then roll.',
    ],
  }),
  buildPlannerRecipe({
    id: 'plan:chikn-strip-salad',
    title: 'Chik\'n Strip Salad',
    description: 'Crisped MorningStar Farms Chik\'n Strips over iceberg, tomato, onion, yogurt, and mixed vegetables.',
    cuisine: 'Weeknight',
    tags: ['lunch', 'Chik\'n strips', 'salad'],
    prepMinutes: 10,
    cookMinutes: 10,
    lines: [
      L('msf-strips', 170, '170 g MorningStar Farms Chik\'n Strips'),
      L('lettuce', 80, '80 g iceberg lettuce'),
      L('tomato', 90, '90 g Roma tomato'),
      L('onion', 30, '30 g red onion'),
      L('yogurt', 100, '100 g plain Greek yogurt'),
      L('gv-veg', 80, '80 g Great Value mixed vegetables'),
    ],
    steps: [
      'Cook 170 g MorningStar Farms Chik\'n Strips until the edges crisp.',
      'Steam 80 g Great Value mixed vegetables and let them cool slightly.',
      'Toss 80 g iceberg, 90 g Roma tomato, and 30 g red onion in a bowl.',
      'Top with the strips, the vegetables, and 100 g plain Greek yogurt.',
    ],
  }),
  buildPlannerRecipe({
    id: 'plan:yogurt-toast-snack',
    title: 'Yogurt Toast Snack',
    description: 'Plain Greek yogurt with whole-wheat toast, honey, a little butter, and cottage cheese.',
    cuisine: 'Snack',
    tags: ['snack', 'yogurt'],
    prepMinutes: 5,
    cookMinutes: 3,
    lines: [
      L('yogurt', 240, '240 g plain Greek yogurt'),
      L('bread', 75, '75 g whole-wheat bread'),
      L('honey', 16, '16 g honey'),
      L('butter', 8, '8 g butter'),
      L('cottage', 40, '40 g cottage cheese'),
    ],
    steps: [
      'Toast 75 g whole-wheat bread and spread 8 g butter on it.',
      'Stir 16 g honey into 240 g plain Greek yogurt.',
      'Add 40 g cottage cheese on the side or swirl it into the yogurt.',
      'Eat the toast with the yogurt bowl.',
    ],
  }),
  buildPlannerRecipe({
    id: 'plan:cottage-toast-snack',
    title: 'Cottage Toast Snack',
    description: 'Cottage cheese on buttered whole-wheat toast with honey and a side of steamed mixed vegetables.',
    cuisine: 'Snack',
    tags: ['snack', 'cottage cheese'],
    prepMinutes: 5,
    cookMinutes: 6,
    lines: [
      L('cottage', 240, '240 g cottage cheese'),
      L('bread', 65, '65 g whole-wheat bread'),
      L('honey', 12, '12 g honey'),
      L('gv-veg', 90, '90 g Great Value mixed vegetables'),
      L('butter', 6, '6 g butter'),
    ],
    steps: [
      'Toast 65 g whole-wheat bread and spread 6 g butter on it.',
      'Spoon 240 g cottage cheese over the toast and drizzle 12 g honey.',
      'Steam 90 g Great Value mixed vegetables.',
      'Eat the toast and vegetables together.',
    ],
  }),
  buildPlannerRecipe({
    id: 'plan:egg-yogurt-snack',
    title: 'Egg and Yogurt Snack',
    description: 'A fully set egg with Greek yogurt, toast, honey, and a little butter.',
    cuisine: 'Snack',
    tags: ['snack', 'eggs', 'yogurt'],
    prepMinutes: 5,
    cookMinutes: 6,
    lines: [
      L('egg', 100, '2 large eggs (100 g)'),
      L('yogurt', 180, '180 g plain Greek yogurt'),
      L('bread', 55, '55 g whole-wheat bread'),
      L('honey', 14, '14 g honey'),
      L('butter', 6, '6 g butter'),
    ],
    steps: [
      'Cook 2 large eggs (100 g) until the whites and yolks are fully set.',
      'Toast 55 g whole-wheat bread with 6 g butter.',
      'Stir 14 g honey into 180 g plain Greek yogurt.',
      'Serve the eggs, toast, and yogurt together.',
    ],
  }),
  buildPlannerRecipe({
    id: 'plan:cottage-yogurt-snack',
    title: 'Cottage Yogurt Snack',
    description: 'A larger dairy snack: cottage cheese, Greek yogurt, toast, honey, butter, and mixed vegetables.',
    cuisine: 'Snack',
    tags: ['snack', 'cottage cheese', 'yogurt'],
    prepMinutes: 5,
    cookMinutes: 6,
    lines: [
      L('cottage', 180, '180 g cottage cheese'),
      L('yogurt', 160, '160 g plain Greek yogurt'),
      L('bread', 85, '85 g whole-wheat bread'),
      L('honey', 16, '16 g honey'),
      L('gv-veg', 70, '70 g Great Value mixed vegetables'),
      L('butter', 10, '10 g butter'),
    ],
    steps: [
      'Toast 85 g whole-wheat bread and spread 10 g butter on it.',
      'Stir 16 g honey into 160 g plain Greek yogurt and 180 g cottage cheese.',
      'Steam 70 g Great Value mixed vegetables.',
      'Eat the toast with the dairy bowl and the vegetables.',
    ],
  }),
]);

const recipeMap = new Map(PLANNER_RECIPES.map((recipe) => [recipe.id, recipe]));

export function plannerRecipeById(id: string): PlannerRecipe | undefined {
  return recipeMap.get(id);
}
