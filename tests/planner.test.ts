import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { containsBlockedDietTerm } from '../src/diet';
import { NUTRITION_KEYS } from '../src/nutrition';
import { INGREDIENTS, ingredientById } from '../src/planner/ingredients';
import { kcalWithinTolerance, nutritionForGrams, perServing, proteinMeetsFloor, sumNutrition } from '../src/planner/macros';
import { PLANNER_RECIPES, plannerRecipeById } from '../src/planner/recipes';
import { encodeWeekPlan, parseWeekPlan, readWeekPlan, serializeWeekPlan } from '../src/planner/storage';
import { MEAL_SLOTS, recipeSlot } from '../src/planner/types';
import { WeekGrocery } from '../src/planner/WeekGrocery';
import { dayLedger, defaultWeekPlan, estimatedLoggedCalories, formatDayLabel, replaceSlot, resolveMeal, sumLedgers, weekGrocery, weekHeading, weekLedgers } from '../src/planner/week';
import { parseRecipe } from '../src/store';

const BLENDER_RECIPE_IDS = [
  'plan:palak-paneer-daring',
  'plan:daring-tikka-veg',
  'plan:daring-tikka-smooth',
  'plan:night-shake',
  'plan:night-shake-cauli-chia-flax',
  'plan:night-shake-cauli-chia',
] as const;

function withoutLabelWarnings(value: string): string {
  return value.replace(/check the [^.]{0,120}? for gelatin\.?/gi, 'check the yogurt label');
}

function recipeText(recipe: (typeof PLANNER_RECIPES)[number]): string {
  return [
    recipe.id,
    recipe.title,
    recipe.description,
    recipe.cuisine,
    ...recipe.tags,
    ...recipe.steps,
    ...recipe.ingredients.flatMap((ingredient) => [
      ingredient.name,
      ingredient.amountLabel,
      ingredient.sourceLabel,
      ingredient.sourceNote,
      ingredient.sourceUrl ?? '',
      ingredient.walmartUrl ?? '',
    ]),
  ].join(' ');
}

function searchableRecipeText(recipe: (typeof PLANNER_RECIPES)[number]): string {
  return `${recipe.title} ${recipe.cuisine} ${recipe.tags.join(' ')} ${recipe.ingredients.map((ingredient) => ingredient.name).join(' ')}`.toLowerCase();
}

function withinCheck(actual: number, expected: number, calories: boolean): boolean {
  const allowance = Math.max(0.03 * Math.abs(expected), calories ? 10 : 2);
  return Math.abs(actual - expected) <= allowance;
}

describe('weekly planner', () => {
  it('computes every recipe total from ingredient grams', () => {
    for (const recipe of PLANNER_RECIPES) {
      const parts = recipe.ingredients.map((ingredient) => {
        const record = ingredientById(ingredient.ingredientId);
        const scaled = nutritionForGrams(record.nutrition, record.referenceGrams, ingredient.grams);
        expect(ingredient.nutrition).toEqual(scaled);
        return scaled;
      });
      expect(recipe.nutritionPerServing).toEqual(perServing(sumNutrition(parts), recipe.servings));
      expect(recipe.servings).toBeGreaterThan(0);
    }
  });

  it('keeps planner recipes and ingredients inside the vegetarian boundary', () => {
    for (const ingredient of INGREDIENTS) {
      const text = withoutLabelWarnings([ingredient.name, ingredient.sourceLabel, ingredient.sourceNote, ingredient.sourceUrl ?? '', ingredient.walmartUrl ?? ''].join(' '));
      expect(containsBlockedDietTerm(text), ingredient.id).toBe(false);
      expect(ingredient.sourceUrl || ingredient.estimated, ingredient.id).toBeTruthy();
      for (const key of NUTRITION_KEYS) expect(Number.isFinite(ingredient.nutrition[key])).toBe(true);
    }
    for (const recipe of PLANNER_RECIPES) {
      expect(containsBlockedDietTerm(withoutLabelWarnings(recipeText(recipe))), recipe.id).toBe(false);
    }
  });

  it('hits daily targets on planned days and keeps the dated week slots', () => {
    const plan = defaultWeekPlan();
    expect(plan.weekStart).toBe('2026-10-12');
    expect(plan.days.map((day) => day.date)).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
    ]);
    expect(JSON.stringify(plan)).not.toContain('dinner');

    for (const day of plan.days) {
      expect(Object.keys(day.slots).sort()).toEqual([...MEAL_SLOTS].sort());
    }
    expect(MEAL_SLOTS).toEqual(['breakfast', 'lunch', 'snack', 'extraSnack']);

    const tuesday = plan.days[1];
    expect(tuesday.slots.lunch).toMatchObject({
      kind: 'eat-out',
      note: expect.stringContaining('Domino'),
    });
    const tuesdayLedger = dayLedger(tuesday);
    expect(tuesdayLedger.flex).toBe(true);
    const logged = ['breakfast', 'snack', 'extraSnack'] as const;
    const loggedCalories = logged.reduce((total, slotId) => {
      const slot = tuesday.slots[slotId];
      expect(slot.kind).toBe('recipe');
      if (slot.kind !== 'recipe') return total;
      return total + (resolveMeal(slot.recipeId)?.nutrition.calories ?? 0);
    }, 0);
    expect(tuesdayLedger.nutrition.calories).toBeCloseTo(loggedCalories, 5);
    expect(tuesdayLedger.loggedMeals).toBe(3);

    const wednesday = plan.days[2];
    expect(wednesday.slots.lunch).toEqual({ kind: 'recipe', recipeId: 'plan:korean-riblet-bowl' });
    const riblet = plannerRecipeById('plan:korean-riblet-bowl');
    expect(riblet?.ingredients.find((ingredient) => ingredient.ingredientId === 'msf-riblet')?.grams).toBe(142);

    expect(plan.days[3].slots.lunch).toEqual({ kind: 'recipe', recipeId: 'plan:crispy-garlic-butter-chikn', suggestion: true });
    expect(plan.days[4].slots.lunch).toEqual({ kind: 'recipe', recipeId: 'plan:teriyaki-honey-bowl', suggestion: true });
    for (const day of plan.days) {
      for (const slotId of MEAL_SLOTS) {
        const slot = day.slots[slotId];
        const isSuggestionDay = day.date === '2026-10-15' || day.date === '2026-10-16';
        if (slot.kind === 'recipe' && slot.suggestion) {
          expect(isSuggestionDay && slotId === 'lunch').toBe(true);
        }
      }
    }

    for (const day of plan.days) {
      const ledger = dayLedger(day);
      if (ledger.flex) continue;
      expect(ledger.nutrition.calories, day.date).toBeGreaterThanOrEqual(2350 * 0.95);
      expect(ledger.nutrition.calories, day.date).toBeLessThanOrEqual(2350 * 1.05);
      expect(kcalWithinTolerance(ledger.nutrition.calories), day.date).toBe(true);
      expect(ledger.nutrition.proteinG, day.date).toBeGreaterThanOrEqual(155);
      expect(proteinMeetsFloor(ledger.nutrition.proteinG), `${day.date} protein ${ledger.nutrition.proteinG}`).toBe(true);
    }

    for (const line of weekGrocery(plan)) {
      expect(containsBlockedDietTerm(`${line.name} ${line.amountLabel} ${line.sourceLabel} ${line.sourceNote}`), line.name).toBe(false);
    }
  });

  it('round-trips the week plan through a saved recipe record', () => {
    const plan = defaultWeekPlan();
    const stamp = '2026-10-12T15:00:00.000Z';
    const encoded = encodeWeekPlan(plan, stamp, stamp);
    const parsed = parseRecipe(encoded);
    expect(parsed.id).toBe('week-plan');
    expect(parsed.ingredients).toEqual([]);
    expect(parsed.nutritionPerServing.calories).toBe(0);
    expect(readWeekPlan([parsed])).toEqual(plan);
    expect(parseWeekPlan(serializeWeekPlan(plan))).toEqual(plan);
    expect(containsBlockedDietTerm(parsed.description)).toBe(false);
  });

  it('labels weekdays from the date and keeps mixed grocery amounts in text', () => {
    expect(formatDayLabel('2026-10-12', 0)).toEqual({ weekday: 'Monday', monthDay: 'Oct 12' });
    expect(formatDayLabel('2026-10-13', 6).weekday).toBe('Tuesday');
    expect(weekHeading(defaultWeekPlan())).toBe('Week of Oct 12');

    const gramsOnly = weekGrocery(defaultWeekPlan()).find((line) => line.name === 'Garlic');
    expect(gramsOnly?.amountLabel).toMatch(/g this week$/);

    const mixed = replaceSlot(defaultWeekPlan(), '2026-10-12', 'lunch', recipeSlot('starter-recipe:paneer-power-bowl'));
    const garlic = weekGrocery(mixed).find((line) => line.name === 'Garlic');
    expect(garlic?.amountLabel.includes('this week')).toBe(false);
    expect(garlic?.amountLabel).toContain('+');
    expect(garlic?.sourceNote).toContain('same snapshot as the recipe library');
    expect(garlic?.sourceNote).toContain('Typical reference value per 100 g');

    const estimated = estimatedLoggedCalories(defaultWeekPlan());
    const logged = sumLedgers(weekLedgers(defaultWeekPlan())).calories;
    expect(estimated).toBeGreaterThan(0);
    expect(estimated).toBeLessThan(logged);
  });

  it('keeps handoff Walmart buy links exact and separate from nutrition sources', () => {
    const daring = ingredientById('daring-original');
    expect(daring.walmartUrl).toBe('https://www.walmart.com/browse/daring/YnJhbmQ6RGFyaW5n');
    expect(daring.sourceUrl).toBe('https://daring.com/products/');
    expect(ingredientById('gopi-paneer').walmartUrl).toBe('https://www.walmart.com/c/kp/paneer');
    expect(ingredientById('gv-riced-cauliflower').walmartUrl).toBe(
      'https://www.instacart.com/store/walmart/products/22380580-great-value-riced-cauliflower-12-oz',
    );
    expect(ingredientById('gv-nonfat-greek').sourceNote).toMatch(/stored as 0/);
    expect(ingredientById('gv-nonfat-greek').sourceNote).toMatch(/yogurt label for gelatin/i);
    expect(ingredientById('gopi-paneer').nutrition.carbsG).toBe(0);
    expect(ingredientById('gopi-paneer').sourceNote).toMatch(/stored as 0/);
  });

  it('computes blender recipe per-serving macros near the handoff check totals', () => {
    const palak = plannerRecipeById('plan:palak-paneer-daring');
    const tikka = plannerRecipeById('plan:daring-tikka-veg');
    const smooth = plannerRecipeById('plan:daring-tikka-smooth');
    const shake = plannerRecipeById('plan:night-shake');
    const shakeFlax = plannerRecipeById('plan:night-shake-cauli-chia-flax');
    const shakeChia = plannerRecipeById('plan:night-shake-cauli-chia');
    expect(palak && tikka && smooth && shake && shakeFlax && shakeChia).toBeTruthy();
    if (!palak || !tikka || !smooth || !shake || !shakeFlax || !shakeChia) return;

    const checks = [
      { recipe: palak, calories: 280, proteinG: 27.6, carbsG: 19.4, fatG: 12.1, fiberG: 10.4 },
      { recipe: tikka, calories: 369, proteinG: 37.1, carbsG: 44.2, fatG: 8.1, fiberG: 18.5 },
      { recipe: smooth, calories: 263, proteinG: 31.3, carbsG: 24.3, fatG: 6.4, fiberG: 12.2 },
      { recipe: shake, calories: 408, proteinG: 53.6, carbsG: 28.6, fatG: 9.9, fiberG: 0 },
      { recipe: shakeFlax, calories: 408 + 127, proteinG: 53.6 + 6.0, carbsG: 28.6 + 13.3, fatG: 9.9 + 7.1, fiberG: 9.0 },
      { recipe: shakeChia, calories: 408 + 90, proteinG: 53.6 + 4.7, carbsG: 28.6 + 11.3, fatG: 9.9 + 3.7, fiberG: 7.1 },
    ] as const;

    for (const check of checks) {
      expect(check.recipe.estimated, check.recipe.id).toBe(true);
      expect(check.recipe.ingredients.every((ingredient) => ingredient.estimated), check.recipe.id).toBe(true);
      const nutrition = check.recipe.nutritionPerServing;
      expect(withinCheck(nutrition.calories, check.calories, true), `${check.recipe.id} kcal ${nutrition.calories} vs ${check.calories}`).toBe(true);
      expect(withinCheck(nutrition.proteinG, check.proteinG, false), `${check.recipe.id} protein ${nutrition.proteinG} vs ${check.proteinG}`).toBe(true);
      expect(withinCheck(nutrition.carbsG, check.carbsG, false), `${check.recipe.id} carbs ${nutrition.carbsG} vs ${check.carbsG}`).toBe(true);
      expect(withinCheck(nutrition.fatG, check.fatG, false), `${check.recipe.id} fat ${nutrition.fatG} vs ${check.fatG}`).toBe(true);
      expect(withinCheck(nutrition.fiberG, check.fiberG, false), `${check.recipe.id} fiber ${nutrition.fiberG} vs ${check.fiberG}`).toBe(true);
    }
  });

  it('makes blender recipes searchable, grocery-visible, and yogurt-safe', () => {
    for (const id of BLENDER_RECIPE_IDS) {
      const recipe = plannerRecipeById(id);
      expect(recipe, id).toBeDefined();
      expect(PLANNER_RECIPES.some((item) => item.id === id), id).toBe(true);
    }

    const palak = plannerRecipeById('plan:palak-paneer-daring');
    const tikka = plannerRecipeById('plan:daring-tikka-veg');
    const smooth = plannerRecipeById('plan:daring-tikka-smooth');
    const shake = plannerRecipeById('plan:night-shake');
    expect(palak && tikka && smooth && shake).toBeTruthy();
    if (!palak || !tikka || !smooth || !shake) return;

    expect(searchableRecipeText(palak)).toContain('palak paneer');
    expect(searchableRecipeText(tikka)).toContain('daring tikka');
    expect(searchableRecipeText(smooth)).toContain('riced cauliflower');
    expect(searchableRecipeText(shake)).toContain('snack 2');
    expect(PLANNER_RECIPES.filter((recipe) => searchableRecipeText(recipe).includes('night shake')).map((recipe) => recipe.id)).toEqual(
      expect.arrayContaining(['plan:night-shake', 'plan:night-shake-cauli-chia-flax', 'plan:night-shake-cauli-chia']),
    );

    expect(tikka.ingredients.some((ingredient) => ingredient.ingredientId === 'canola-oil')).toBe(true);
    expect(tikka.ingredients.some((ingredient) => /coconut/i.test(ingredient.name))).toBe(false);
    expect(tikka.ingredients.some((ingredient) => ingredient.ingredientId === 'daring-original')).toBe(true);
    for (const recipe of [palak, tikka, smooth]) {
      expect(recipe.tags).toContain('lunch');
      expect(recipe.servings).toBe(4);
      expect(recipe.steps.join(' ')).toMatch(/off the heat for about 1 minute/i);
      expect(recipe.steps.join(' ')).toMatch(/does not curdle/i);
      expect(recipeText(recipe)).toMatch(/yogurt label for gelatin/i);
    }
    expect(shake.tags).toEqual(expect.arrayContaining(['extraSnack', 'snack 2']));
    expect(shake.servings).toBe(1);

    const withPalak = replaceSlot(defaultWeekPlan(), '2026-10-12', 'lunch', recipeSlot('plan:palak-paneer-daring'));
    const withShake = replaceSlot(withPalak, '2026-10-12', 'extraSnack', recipeSlot('plan:night-shake-cauli-chia-flax'));
    const grocery = weekGrocery(withShake);
    expect(grocery.map((line) => line.name)).toEqual(expect.arrayContaining([
      'Great Value frozen chopped spinach',
      'Gopi paneer',
      'Daring Original plant-based pieces',
      'H-E-B Mootopia chocolate 2% milk',
      'Chia seeds',
    ]));
    expect(grocery.find((line) => line.name === 'Great Value frozen chopped spinach')?.walmartUrl).toBe(
      'https://www.walmart.com/ip/Great-Value-Chopped-Spinach-12-oz-Frozen/431513547',
    );
    for (const line of grocery) {
      expect(containsBlockedDietTerm(withoutLabelWarnings(`${line.name} ${line.amountLabel} ${line.sourceLabel} ${line.sourceNote}`)), line.name).toBe(false);
    }
    const html = renderToStaticMarkup(createElement(WeekGrocery, { plan: withShake, onAdd: () => undefined }));
    expect(html).toContain('https://www.walmart.com/ip/Great-Value-Chopped-Spinach-12-oz-Frozen/431513547');
    expect(html).toContain('Buy');
    expect(html).not.toContain('dinner');
    expect(JSON.stringify(defaultWeekPlan())).not.toContain('dinner');
  });
});
