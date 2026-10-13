import { describe, expect, it } from 'vitest';
import { containsBlockedDietTerm } from '../src/diet';
import { NUTRITION_KEYS } from '../src/nutrition';
import { INGREDIENTS, ingredientById } from '../src/planner/ingredients';
import { kcalWithinTolerance, nutritionForGrams, perServing, proteinMeetsFloor, sumNutrition } from '../src/planner/macros';
import { PLANNER_RECIPES, plannerRecipeById } from '../src/planner/recipes';
import { encodeWeekPlan, parseWeekPlan, readWeekPlan, serializeWeekPlan } from '../src/planner/storage';
import { MEAL_SLOTS, recipeSlot } from '../src/planner/types';
import { dayLedger, defaultWeekPlan, estimatedLoggedCalories, formatDayLabel, replaceSlot, resolveMeal, sumLedgers, weekGrocery, weekHeading, weekLedgers } from '../src/planner/week';
import { parseRecipe } from '../src/store';

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
    ]),
  ].join(' ');
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
      const text = [ingredient.name, ingredient.sourceLabel, ingredient.sourceNote, ingredient.sourceUrl ?? ''].join(' ');
      expect(containsBlockedDietTerm(text), ingredient.id).toBe(false);
      expect(ingredient.sourceUrl || ingredient.estimated, ingredient.id).toBeTruthy();
      for (const key of NUTRITION_KEYS) expect(Number.isFinite(ingredient.nutrition[key])).toBe(true);
    }
    for (const recipe of PLANNER_RECIPES) {
      expect(containsBlockedDietTerm(recipeText(recipe)), recipe.id).toBe(false);
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
});
