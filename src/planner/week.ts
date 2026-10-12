import type { Nutrition } from '../model';
import { STARTER_RECIPES } from '../catalog';
import { addNutrition, ZERO_NUTRITION } from '../nutrition';
import { DAILY_TARGETS, LEDGER_KEYS, type LedgerKey } from './macros';
import { plannerRecipeById, type PlannerIngredient, type PlannerRecipe } from './recipes';
import {
  eatOutSlot,
  MEAL_SLOTS,
  recipeSlot,
  type DayPlan,
  type MealSlot,
  type MealSlotId,
  type WeekPlan,
} from './types';

export const WEEK_START = '2026-10-12';

const DOMINOS_NOTE = 'Domino\'s. Vegetarian only. Macros are flex and stay out of the logged total.';

function day(date: string, breakfast: string, lunch: MealSlot, snack: string, extraSnack: string, lunchSuggestion = false): DayPlan {
  return {
    date,
    slots: {
      breakfast: recipeSlot(breakfast),
      lunch: lunch.kind === 'recipe' && lunchSuggestion
        ? recipeSlot(lunch.recipeId, true)
        : lunch,
      snack: recipeSlot(snack),
      extraSnack: recipeSlot(extraSnack),
    },
  };
}

export function defaultWeekPlan(): WeekPlan {
  return {
    weekStart: WEEK_START,
    days: [
      day('2026-10-12', 'plan:cottage-bhurji-toast', recipeSlot('plan:daring-honey-rice'), 'plan:yogurt-toast-snack', 'plan:cottage-toast-snack'),
      {
        date: '2026-10-13',
        slots: {
          breakfast: recipeSlot('plan:egg-spinach-breakfast'),
          lunch: eatOutSlot(DOMINOS_NOTE),
          snack: recipeSlot('plan:yogurt-toast-snack'),
          extraSnack: recipeSlot('plan:cottage-toast-snack'),
        },
      },
      day('2026-10-14', 'plan:egg-spinach-breakfast', recipeSlot('plan:korean-riblet-bowl'), 'plan:yogurt-toast-snack', 'plan:cottage-yogurt-snack'),
      day('2026-10-15', 'plan:egg-spinach-breakfast', recipeSlot('plan:crispy-garlic-butter-chikn'), 'plan:yogurt-toast-snack', 'plan:cottage-toast-snack', true),
      day('2026-10-16', 'plan:egg-spinach-breakfast', recipeSlot('plan:teriyaki-honey-bowl'), 'plan:cottage-toast-snack', 'plan:tofu-65', true),
      day('2026-10-17', 'plan:cottage-bhurji-toast', recipeSlot('plan:garlic-vodka-rigatoni'), 'plan:cottage-toast-snack', 'plan:cottage-toast-snack'),
      day('2026-10-18', 'plan:egg-spinach-breakfast', recipeSlot('plan:daring-honey-rice'), 'plan:cottage-toast-snack', 'plan:yogurt-toast-snack'),
    ],
  };
}

export interface ResolvedIngredient {
  readonly name: string;
  readonly amountLabel: string;
  readonly grams?: number;
  readonly estimated: boolean;
  readonly sourceLabel: string;
  readonly sourceUrl?: string;
  readonly sourceNote: string;
}

export interface ResolvedMeal {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly cuisine: string;
  readonly tags: readonly string[];
  readonly prepMinutes: number;
  readonly cookMinutes: number;
  readonly steps: readonly string[];
  readonly ingredients: readonly ResolvedIngredient[];
  readonly nutrition: Nutrition;
  readonly estimated: boolean;
  readonly catalog: 'planner' | 'starter';
}

function fromPlanner(recipe: PlannerRecipe): ResolvedMeal {
  return {
    id: recipe.id,
    title: recipe.title,
    description: recipe.description,
    cuisine: recipe.cuisine,
    tags: recipe.tags,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    steps: recipe.steps,
    ingredients: recipe.ingredients.map(fromPlannerIngredient),
    nutrition: recipe.nutritionPerServing,
    estimated: recipe.estimated,
    catalog: 'planner',
  };
}

function fromPlannerIngredient(ingredient: PlannerIngredient): ResolvedIngredient {
  return {
    name: ingredient.name,
    amountLabel: ingredient.amountLabel,
    grams: ingredient.grams,
    estimated: ingredient.estimated,
    sourceLabel: ingredient.sourceLabel,
    ...(ingredient.sourceUrl ? { sourceUrl: ingredient.sourceUrl } : {}),
    sourceNote: ingredient.sourceNote,
  };
}

export function resolveMeal(recipeId: string): ResolvedMeal | undefined {
  const planner = plannerRecipeById(recipeId);
  if (planner) return fromPlanner(planner);
  const starter = STARTER_RECIPES.find((recipe) => recipe.id === recipeId);
  if (!starter) return undefined;
  return {
    id: starter.id,
    title: starter.title,
    description: starter.description,
    cuisine: starter.cuisine,
    tags: starter.tags,
    prepMinutes: starter.prepMinutes,
    cookMinutes: starter.cookMinutes,
    steps: starter.steps,
    ingredients: starter.ingredients.map((ingredient) => ({
      name: ingredient.name,
      amountLabel: ingredient.amountLabel,
      estimated: false,
      sourceLabel: ingredient.snapshot?.provenance.providerName ?? 'Recipe library snapshot',
      ...(ingredient.snapshot?.provenance.sourceUrl ? { sourceUrl: ingredient.snapshot.provenance.sourceUrl } : {}),
      sourceNote: ingredient.snapshot?.provenance.warnings.join(' ') || 'Included from the substantial-meal catalog.',
    })),
    nutrition: starter.nutritionPerServing,
    estimated: false,
    catalog: 'starter',
  };
}

export interface DayLedger {
  readonly nutrition: Nutrition;
  readonly flex: boolean;
  readonly loggedMeals: number;
  readonly openSlots: number;
}

export function dayLedger(dayPlan: DayPlan): DayLedger {
  const parts: Nutrition[] = [];
  let openSlots = 0;
  let flex = false;
  for (const slotId of MEAL_SLOTS) {
    const slot = dayPlan.slots[slotId];
    if (slot.kind === 'eat-out') {
      flex = true;
      continue;
    }
    if (slot.kind === 'empty') {
      openSlots += 1;
      continue;
    }
    const meal = resolveMeal(slot.recipeId);
    if (!meal) {
      openSlots += 1;
      continue;
    }
    parts.push(meal.nutrition);
  }
  return {
    nutrition: parts.reduce((total, part) => addNutrition(total, part), ZERO_NUTRITION),
    flex,
    loggedMeals: parts.length,
    openSlots,
  };
}

export function weekLedgers(plan: WeekPlan): readonly DayLedger[] {
  return plan.days.map(dayLedger);
}

export function sumLedgers(ledgers: readonly DayLedger[]): Nutrition {
  return ledgers.reduce((total, ledger) => addNutrition(total, ledger.nutrition), ZERO_NUTRITION);
}

export function averageLedger(total: Nutrition, days: number): Nutrition {
  const divisor = Math.max(1, days);
  return {
    calories: total.calories / divisor,
    proteinG: total.proteinG / divisor,
    carbsG: total.carbsG / divisor,
    fatG: total.fatG / divisor,
    saturatedFatG: total.saturatedFatG / divisor,
    fiberG: total.fiberG / divisor,
    sugarG: total.sugarG / divisor,
    sodiumMg: total.sodiumMg / divisor,
  };
}

export interface GroceryLine {
  readonly key: string;
  readonly name: string;
  readonly amountLabel: string;
  readonly estimated: boolean;
  readonly sourceLabel: string;
  readonly sourceNote: string;
}

export function weekGrocery(plan: WeekPlan): GroceryLine[] {
  const grouped = new Map<string, { name: string; labels: string[]; grams: number; estimated: boolean; sourceLabel: string; sourceNote: string }>();
  for (const dayPlan of plan.days) {
    for (const slotId of MEAL_SLOTS) {
      const slot = dayPlan.slots[slotId];
      if (slot.kind !== 'recipe') continue;
      const meal = resolveMeal(slot.recipeId);
      if (!meal) continue;
      for (const ingredient of meal.ingredients) {
        const key = ingredient.name.trim().toLowerCase();
        const current = grouped.get(key) ?? {
          name: ingredient.name,
          labels: [],
          grams: 0,
          estimated: ingredient.estimated,
          sourceLabel: ingredient.sourceLabel,
          sourceNote: ingredient.sourceNote,
        };
        current.labels.push(ingredient.amountLabel);
        current.grams += ingredient.grams ?? 0;
        current.estimated = current.estimated || ingredient.estimated;
        grouped.set(key, current);
      }
    }
  }
  return [...grouped.values()]
    .map((item) => ({
      key: item.name.toLowerCase(),
      name: item.name,
      amountLabel: item.grams > 0 ? `${trimGrams(item.grams)} g this week` : item.labels.join(' + '),
      estimated: item.estimated,
      sourceLabel: item.sourceLabel,
      sourceNote: item.sourceNote,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function trimGrams(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function replaceSlot(plan: WeekPlan, date: string, slotId: MealSlotId, slot: MealSlot): WeekPlan {
  return {
    ...plan,
    days: plan.days.map((dayPlan) => dayPlan.date === date
      ? { ...dayPlan, slots: { ...dayPlan.slots, [slotId]: slot } }
      : dayPlan),
  };
}

export function formatDayLabel(date: string, index: number): { weekday: string; monthDay: string } {
  const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [, monthText, dayText] = date.split('-');
  return {
    weekday: weekdays[index] ?? 'Day',
    monthDay: `${months[Number(monthText) - 1] ?? ''} ${Number(dayText)}`,
  };
}

export function ledgerRows(
  nutrition: Nutrition,
  targets: Readonly<Record<LedgerKey, number>> = DAILY_TARGETS,
): ReadonlyArray<{ key: LedgerKey; actual: number; target: number }> {
  return LEDGER_KEYS.map((key) => ({
    key,
    actual: nutrition[key],
    target: targets[key],
  }));
}

export const PLANNER_CATALOG_NOTE = 'Week recipes are sized for this planner. The substantial catalog is still available when you swap a slot.';
