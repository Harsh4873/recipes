export const MEAL_SLOTS = ['breakfast', 'lunch', 'snack', 'extraSnack'] as const;

export type MealSlotId = (typeof MEAL_SLOTS)[number];

export const MEAL_SLOT_LABELS: Readonly<Record<MealSlotId, string>> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snack: 'Snack',
  extraSnack: 'Snack 2',
};

export interface RecipeSlot {
  readonly kind: 'recipe';
  readonly recipeId: string;
  readonly suggestion?: boolean;
}

export interface EatOutSlot {
  readonly kind: 'eat-out';
  readonly note: string;
}

export interface EmptySlot {
  readonly kind: 'empty';
}

export type MealSlot = RecipeSlot | EatOutSlot | EmptySlot;

export interface DayPlan {
  readonly date: string;
  readonly slots: Readonly<Record<MealSlotId, MealSlot>>;
}

export interface WeekPlan {
  readonly weekStart: string;
  readonly days: readonly DayPlan[];
}

export function recipeSlot(recipeId: string, suggestion = false): RecipeSlot {
  return suggestion ? { kind: 'recipe', recipeId, suggestion: true } : { kind: 'recipe', recipeId };
}

export function emptySlot(): EmptySlot {
  return { kind: 'empty' };
}

export function eatOutSlot(note: string): EatOutSlot {
  return { kind: 'eat-out', note };
}
