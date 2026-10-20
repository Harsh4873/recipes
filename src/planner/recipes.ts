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
  readonly walmartUrl?: string;
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
  readonly estimated?: boolean;
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
    ...(record.walmartUrl ? { walmartUrl: record.walmartUrl } : {}),
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
    estimated: input.estimated ?? ingredients.some((item) => item.estimated),
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
  buildPlannerRecipe({
    id: 'plan:palak-paneer-daring',
    title: 'Palak Paneer with Daring',
    description: 'Blended spinach gravy with half Gopi paneer and half Daring, finished with nonfat Greek yogurt instead of cream. Estimated from labels and USDA FDC snapshots. Check the yogurt label for gelatin. Basmati or phulka on the side is not in these macros.',
    cuisine: 'Indian',
    tags: ['lunch', 'paneer', 'Daring', 'blender', 'meal-prep'],
    prepMinutes: 20,
    cookMinutes: 30,
    servings: 4,
    estimated: true,
    lines: [
      L('gv-chopped-spinach', 680, '680 g / 2 x 12 oz bags Great Value frozen chopped spinach'),
      L('gopi-paneer', 113, '113 g / 1/2 pack Gopi paneer'),
      L('daring-original', 227, '227 g / 1 bag Daring Original'),
      L('fresh-onion', 150, '150 g / 1 large onion'),
      L('gv-crushed-tomatoes', 121, '121 g / 1/2 cup Great Value crushed tomatoes'),
      L('fresh-garlic', 12, '12 g / 4 cloves garlic'),
      L('fresh-ginger', 10, '10 g / 1-inch piece ginger'),
      L('canola-oil', 9, '9 g / 2 tsp canola oil'),
      L('gv-nonfat-greek', 120, '120 g / about 1/2 cup Great Value nonfat Greek yogurt'),
    ],
    steps: [
      'Thaw 680 g Great Value frozen chopped spinach. Blend it with 1/4 cup water and 1 green chili until smooth.',
      'Sear 227 g Daring Original plant-based pieces until browned. Cube 113 g Gopi paneer.',
      'Heat 9 g canola oil, add 1 tsp cumin seed, then cook 150 g onion 6-7 minutes. Add 12 g garlic and 10 g ginger for 1 minute.',
      'Add 121 g Great Value crushed tomatoes, 1/2 tsp turmeric, 1 tsp coriander, 1/2 tsp Kashmiri chili, and 3/4 tsp salt. Cook 5 minutes.',
      'Stir in the spinach puree and 1/4 cup water. Simmer 5 minutes.',
      'Take the pan off the heat for about 1 minute, then stir in 120 g whisked Great Value nonfat Greek yogurt so it does not curdle. Check the yogurt label for gelatin.',
      'Add the paneer, Daring, 1 tsp garam masala, and 1 tsp kasuri methi. Warm 3-4 minutes without boiling. Spices, cilantro, salt, and chili are not counted in the macros.',
    ],
  }),
  buildPlannerRecipe({
    id: 'plan:daring-tikka-veg',
    title: 'Daring Tikka Masala with Peppers, Cauliflower, and Peas',
    description: 'Chunky tikka masala with Daring, peppers, cauliflower, and peas in a tomato-yogurt sauce. Uses canola oil, not coconut oil. Estimated from labels and USDA FDC snapshots. Check the yogurt label for gelatin. Basmati or phulka on the side is not in these macros.',
    cuisine: 'Indian',
    tags: ['lunch', 'Daring', 'tikka', 'meal-prep'],
    prepMinutes: 20,
    cookMinutes: 30,
    servings: 4,
    estimated: true,
    lines: [
      L('daring-original', 454, '454 g / 2 bags Daring Original'),
      L('gv-nonfat-greek', 85, '85 g / 5 Tbsp Great Value nonfat Greek yogurt for the marinade'),
      L('fresh-ginger', 12, '12 g / 2 Tbsp minced ginger'),
      L('fresh-garlic', 15, '15 g / about 5 cloves garlic'),
      L('canola-oil', 14, '14 g / 1 Tbsp canola oil'),
      L('red-bell-pepper', 164, '164 g / 1 large red bell pepper'),
      L('gv-cauliflower', 340, '340 g / 12 oz bag Great Value frozen cauliflower'),
      L('fresh-onion', 55, '55 g / 1/2 medium onion'),
      L('tomato-paste', 16, '16 g / 1 Tbsp tomato paste'),
      L('gv-crushed-tomatoes', 794, '794 g / 1 x 28 oz can Great Value crushed tomatoes'),
      L('gv-sweet-peas', 283, '283 g / 10 oz Great Value frozen sweet peas'),
      L('gv-nonfat-greek', 113, '113 g / 1/2 cup Great Value nonfat Greek yogurt to finish'),
    ],
    steps: [
      'Marinate 454 g thawed Daring Original with 12 g ginger, 15 g garlic, 1 tsp coriander, garam masala, 1 tsp cumin, salt, and 85 g Great Value nonfat Greek yogurt for 20 minutes or overnight.',
      'Bake the Daring at 400 F for 12-15 minutes, or air-fry at 400 F for 8 minutes.',
      'In 14 g canola oil over medium-low heat, cook 164 g red bell pepper, 340 g Great Value frozen cauliflower, 55 g onion, ginger, garlic, salt, and pepper 12-15 minutes. Do not use coconut oil.',
      'Add 16 g tomato paste, garam masala, 1 1/2 tsp turmeric, and 1/8 tsp cayenne. Stir 30 seconds.',
      'Add 794 g Great Value crushed tomatoes and cook 2 minutes. Add the Daring and 283 g Great Value frozen sweet peas. Cook 2 minutes.',
      'Take the pan off the heat for about 1 minute, then stir in 113 g Great Value nonfat Greek yogurt so it does not curdle. Check the yogurt label for gelatin. Top with 1/4 cup cilantro. Spices and cilantro are not counted in the macros. Optional: blend the sauce smooth and keep the vegetables chunky.',
    ],
  }),
  buildPlannerRecipe({
    id: 'plan:daring-tikka-smooth',
    title: 'Smooth Daring Tikka with Riced Cauliflower',
    description: 'Smooth tikka sauce made with 1% milk, nonfat Greek yogurt, and blended riced cauliflower, with seared Daring. Uses canola oil. Estimated from labels and USDA FDC snapshots. Check the yogurt label for gelatin. Basmati or phulka on the side is not in these macros.',
    cuisine: 'Indian',
    tags: ['lunch', 'Daring', 'tikka', 'blender'],
    prepMinutes: 5,
    cookMinutes: 30,
    servings: 4,
    estimated: true,
    lines: [
      L('canola-oil', 9, '9 g / 2 tsp canola oil'),
      L('fresh-onion', 70, '70 g / 1 small onion'),
      L('fresh-ginger', 6, '6 g / 1 Tbsp grated ginger'),
      L('fresh-garlic', 9, '9 g / 3 cloves garlic'),
      L('gv-crushed-tomatoes', 363, '363 g / 1 1/2 cups Great Value crushed tomatoes'),
      L('milk-1-percent', 122, '122 g / 1/2 cup 1% milk'),
      L('gv-nonfat-greek', 170, '170 g / 3/4 cup Great Value nonfat Greek yogurt'),
      L('daring-original', 454, '454 g / 2 bags Daring Original'),
      L('gv-riced-cauliflower', 340, '340 g / 12 oz bag Great Value frozen riced cauliflower'),
    ],
    steps: [
      'Sear 454 g Daring Original plant-based pieces and set them aside.',
      'Cook 70 g onion in 9 g canola oil for 3 minutes. Add 6 g ginger for 1 minute, then 9 g garlic for 1 minute.',
      'Add 1 Tbsp cumin, 1 Tbsp garam masala, 1 tsp turmeric, 1/2 Tbsp chili powder, and 1/2 tsp salt. Stir 2 minutes. Spices are not counted in the macros.',
      'Add 363 g Great Value crushed tomatoes, 122 g 1% milk, and 340 g Great Value frozen riced cauliflower. Simmer 10 minutes.',
      'Blend the sauce smooth.',
      'Take the pan off the heat for about 1 minute. Temper 170 g Great Value nonfat Greek yogurt with a ladle of sauce, then stir it in so it does not curdle. Check the yogurt label for gelatin.',
      'Add the seared Daring, warm through, and top with 4 Tbsp cilantro.',
    ],
  }),
  buildPlannerRecipe({
    id: 'plan:night-shake',
    title: 'Night Shake',
    description: 'Chocolate Mootopia x2.2 with one scoop Isopure Zero Carb unflavored whey isolate. Meant for the Snack 2 slot. Estimated from the cited labels.',
    cuisine: 'Shake',
    tags: ['extraSnack', 'snack', 'snack 2', 'shake'],
    prepMinutes: 5,
    cookMinutes: 0,
    servings: 1,
    estimated: true,
    lines: [
      L('mootopia-chocolate', 528, '2.2 cups H-E-B Mootopia chocolate 2% milk (528 g)'),
      L('isopure-unflavored', 29, '1 scoop Isopure Zero Carb unflavored (29 g)'),
    ],
    steps: [
      'Pour 2.2 cups H-E-B Mootopia chocolate 2% milk (528 g) into a blender.',
      'Add 1 scoop Isopure Zero Carb unflavored whey isolate (29 g).',
      'Blend until smooth.',
      'Drink right away.',
    ],
  }),
  buildPlannerRecipe({
    id: 'plan:night-shake-cauli-chia-flax',
    title: 'Night Shake with Cauliflower, Chia, and Flax',
    description: 'The Snack 2 night shake plus 1 cup riced cauliflower, 1 Tbsp chia, and 1 Tbsp ground flax. Estimated from labels and USDA FDC snapshots.',
    cuisine: 'Shake',
    tags: ['extraSnack', 'snack', 'snack 2', 'shake', 'hidden veggies'],
    prepMinutes: 5,
    cookMinutes: 0,
    servings: 1,
    estimated: true,
    lines: [
      L('mootopia-chocolate', 528, '2.2 cups H-E-B Mootopia chocolate 2% milk (528 g)'),
      L('isopure-unflavored', 29, '1 scoop Isopure Zero Carb unflavored (29 g)'),
      L('gv-riced-cauliflower', 132, '132 g / 1 cup Great Value frozen riced cauliflower'),
      L('chia-seeds', 12, '12 g / 1 Tbsp chia seeds'),
      L('ground-flax', 7, '7 g / 1 Tbsp ground flaxseed'),
    ],
    steps: [
      'Blend 2.2 cups H-E-B Mootopia chocolate 2% milk (528 g), 1 scoop Isopure Zero Carb unflavored (29 g), and 132 g Great Value frozen riced cauliflower first.',
      'Add 12 g chia seeds and 7 g ground flaxseed.',
      'Blend 30-60 seconds until smooth.',
      'Drink right away, or the chia thickens it.',
    ],
  }),
  buildPlannerRecipe({
    id: 'plan:night-shake-cauli-chia',
    title: 'Night Shake with Cauliflower and Chia',
    description: 'The Snack 2 night shake plus 1 cup riced cauliflower and 1 Tbsp chia, without flax. A lower-fat add-in option for the 65 g fat daily cap. Estimated from labels and USDA FDC snapshots.',
    cuisine: 'Shake',
    tags: ['extraSnack', 'snack', 'snack 2', 'shake', 'hidden veggies'],
    prepMinutes: 5,
    cookMinutes: 0,
    servings: 1,
    estimated: true,
    lines: [
      L('mootopia-chocolate', 528, '2.2 cups H-E-B Mootopia chocolate 2% milk (528 g)'),
      L('isopure-unflavored', 29, '1 scoop Isopure Zero Carb unflavored (29 g)'),
      L('gv-riced-cauliflower', 132, '132 g / 1 cup Great Value frozen riced cauliflower'),
      L('chia-seeds', 12, '12 g / 1 Tbsp chia seeds'),
    ],
    steps: [
      'Blend 2.2 cups H-E-B Mootopia chocolate 2% milk (528 g), 1 scoop Isopure Zero Carb unflavored (29 g), and 132 g Great Value frozen riced cauliflower first.',
      'Add 12 g chia seeds.',
      'Blend 30-60 seconds until smooth.',
      'Drink right away, or the chia thickens it.',
    ],
  }),
]);

const recipeMap = new Map(PLANNER_RECIPES.map((recipe) => [recipe.id, recipe]));

export function plannerRecipeById(id: string): PlannerRecipe | undefined {
  return recipeMap.get(id);
}
