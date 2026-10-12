import type { Recipe, RecipesState } from '../model';
import { ZERO_NUTRITION } from '../nutrition';
import { defaultWeekPlan } from './week';
import {
  MEAL_SLOTS,
  type DayPlan,
  type MealSlot,
  type MealSlotId,
  type WeekPlan,
} from './types';

export const WEEK_PLAN_ID = 'week-plan';
const WEEK_PLAN_FORMAT = 'week-plan-v1';

interface StoredSlot {
  readonly kind: string;
  readonly recipeId?: string;
  readonly suggestion?: boolean;
  readonly note?: string;
}

interface StoredDay {
  readonly date?: string;
  readonly slots?: Partial<Record<MealSlotId, StoredSlot>>;
}

interface StoredWeek {
  readonly format?: string;
  readonly weekStart?: string;
  readonly days?: readonly StoredDay[];
}

function storedSlot(slot: MealSlot): StoredSlot {
  if (slot.kind === 'recipe') {
    return slot.suggestion
      ? { kind: 'recipe', recipeId: slot.recipeId, suggestion: true }
      : { kind: 'recipe', recipeId: slot.recipeId };
  }
  if (slot.kind === 'eat-out') return { kind: 'eat-out', note: slot.note };
  return { kind: 'empty' };
}

function parseSlot(value: StoredSlot | undefined): MealSlot | undefined {
  if (!value) return undefined;
  if (value.kind === 'empty') return { kind: 'empty' };
  if (value.kind === 'eat-out' && value.note?.trim()) return { kind: 'eat-out', note: value.note.trim() };
  if (value.kind === 'recipe' && value.recipeId?.trim()) {
    return value.suggestion
      ? { kind: 'recipe', recipeId: value.recipeId.trim(), suggestion: true }
      : { kind: 'recipe', recipeId: value.recipeId.trim() };
  }
  return undefined;
}

export function serializeWeekPlan(plan: WeekPlan): string {
  return JSON.stringify({
    format: WEEK_PLAN_FORMAT,
    weekStart: plan.weekStart,
    days: plan.days.map((day) => ({
      date: day.date,
      slots: {
        breakfast: storedSlot(day.slots.breakfast),
        lunch: storedSlot(day.slots.lunch),
        snack: storedSlot(day.slots.snack),
        extraSnack: storedSlot(day.slots.extraSnack),
      },
    })),
  });
}

export function parseWeekPlan(value: string): WeekPlan | undefined {
  let raw: StoredWeek;
  try {
    raw = JSON.parse(value) as StoredWeek;
  } catch {
    return undefined;
  }
  if (raw.format !== WEEK_PLAN_FORMAT || !Array.isArray(raw.days) || raw.days.length !== 7) return undefined;
  const days: DayPlan[] = [];
  for (const day of raw.days) {
    if (!day?.date || !/^\d{4}-\d{2}-\d{2}$/.test(day.date)) return undefined;
    const slots = {} as Record<MealSlotId, MealSlot>;
    for (const slotId of MEAL_SLOTS) {
      const parsed = parseSlot(day.slots?.[slotId]);
      if (!parsed) return undefined;
      slots[slotId] = parsed;
    }
    days.push({ date: day.date, slots });
  }
  return { weekStart: raw.weekStart || days[0].date, days };
}

export function encodeWeekPlan(plan: WeekPlan, createdAt: string, updatedAt: string): Recipe {
  return {
    id: WEEK_PLAN_ID,
    title: 'Weekly meal plan',
    description: serializeWeekPlan(plan),
    cuisine: 'Planner',
    tags: ['planner'],
    prepMinutes: 0,
    cookMinutes: 0,
    servings: 1,
    ingredients: [],
    steps: ['This record stores the weekly meal plan on this device.'],
    nutritionPerServing: { ...ZERO_NUTRITION },
    macroCoverage: 1,
    dietStatus: 'allowed',
    origin: 'manual',
    createdAt,
    updatedAt,
  };
}

export function readWeekPlan(recipes: readonly Recipe[]): WeekPlan | undefined {
  const record = recipes.find((recipe) => recipe.id === WEEK_PLAN_ID);
  if (!record) return undefined;
  return parseWeekPlan(record.description);
}

export function activeWeekPlan(state: Pick<RecipesState, 'recipes'> | null | undefined): WeekPlan {
  return (state && readWeekPlan(state.recipes)) || defaultWeekPlan();
}
