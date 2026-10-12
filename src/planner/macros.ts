import type { Nutrition } from '../model';
import { addNutrition, roundNutrition, scaleNutrition, ZERO_NUTRITION } from '../nutrition';

export const DAILY_TARGETS = Object.freeze({
  calories: 2350,
  proteinG: 160,
  carbsG: 280,
  fatG: 65,
  fiberG: 35,
});

export const KCAL_TOLERANCE = 0.05;
export const PROTEIN_FLOOR_G = 155;

export const LEDGER_KEYS = ['calories', 'proteinG', 'carbsG', 'fatG', 'fiberG'] as const;
export type LedgerKey = (typeof LEDGER_KEYS)[number];

export const LEDGER_LABELS: Readonly<Record<LedgerKey, string>> = {
  calories: 'kcal',
  proteinG: 'protein',
  carbsG: 'carbs',
  fatG: 'fat',
  fiberG: 'fiber',
};

export const LEDGER_UNITS: Readonly<Record<LedgerKey, string>> = {
  calories: 'kcal',
  proteinG: 'g',
  carbsG: 'g',
  fatG: 'g',
  fiberG: 'g',
};

export function nutritionForGrams(nutrition: Nutrition, referenceGrams: number, grams: number): Nutrition {
  const scale = referenceGrams > 0 ? grams / referenceGrams : 0;
  return scaleNutrition(nutrition, scale);
}

export function sumNutrition(parts: readonly Nutrition[]): Nutrition {
  return parts.reduce((total, part) => addNutrition(total, part), ZERO_NUTRITION);
}

export function perServing(total: Nutrition, servings: number): Nutrition {
  return roundNutrition(scaleNutrition(total, 1 / Math.max(1, servings)), 1);
}

export type LedgerTone = 'under' | 'on' | 'over';

export function ledgerTone(actual: number, target: number): LedgerTone {
  if (target <= 0) return 'on';
  const ratio = actual / target;
  if (ratio < 1 - KCAL_TOLERANCE) return 'under';
  if (ratio > 1 + KCAL_TOLERANCE) return 'over';
  return 'on';
}

export function kcalWithinTolerance(calories: number): boolean {
  const low = DAILY_TARGETS.calories * (1 - KCAL_TOLERANCE);
  const high = DAILY_TARGETS.calories * (1 + KCAL_TOLERANCE);
  return calories >= low && calories <= high;
}

export function proteinMeetsFloor(proteinG: number): boolean {
  return proteinG >= PROTEIN_FLOOR_G;
}
