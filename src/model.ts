export const RECIPES_STATE_VERSION = 1 as const;

export type IsoDateTime = string;
export type DietStatus = 'allowed' | 'review' | 'blocked';
export type DietEvidence = 'curated' | 'provider-label' | 'ingredient-check' | 'owner-approved' | 'unknown';
export type ProductSourceKind = 'starter' | 'open-food-facts' | 'usda' | 'manual';
export type NutritionQuality = 'verified' | 'complete' | 'partial' | 'missing';
export type RecipeOrigin = 'starter' | 'manual';

export interface Nutrition {
  readonly calories: number;
  readonly proteinG: number;
  readonly carbsG: number;
  readonly fatG: number;
  readonly saturatedFatG: number;
  readonly fiberG: number;
  readonly sugarG: number;
  readonly sodiumMg: number;
}

export interface Serving {
  readonly quantity: number;
  readonly unit: string;
  readonly label: string;
  readonly grams?: number;
}

export interface ProductProvenance {
  readonly kind: ProductSourceKind;
  readonly providerName: string;
  readonly externalId?: string;
  readonly sourceUrl?: string;
  readonly fetchedAt?: IsoDateTime;
  readonly quality: NutritionQuality;
  /** True only when calories, protein, carbohydrate, and fat were all present in the source data. */
  readonly coreMacrosComplete: boolean;
  readonly warnings: readonly string[];
}

export interface VegetarianEligibility {
  readonly status: DietStatus;
  readonly evidence: DietEvidence;
  readonly reason: string;
  readonly checkedAt: IsoDateTime;
}

export interface Product {
  readonly id: string;
  readonly name: string;
  readonly brand?: string;
  readonly barcode?: string;
  readonly categories: readonly string[];
  readonly aliases: readonly string[];
  readonly ingredientsText?: string;
  readonly serving: Serving;
  readonly nutritionPerServing: Nutrition;
  readonly provenance: ProductProvenance;
  readonly eligibility: VegetarianEligibility;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface ProductSnapshot {
  readonly productId: string;
  readonly name: string;
  readonly brand?: string;
  readonly serving: Serving;
  readonly servings: number;
  readonly nutritionPerServing: Nutrition;
  readonly nutrition: Nutrition;
  readonly provenance: ProductProvenance;
  readonly eligibility: VegetarianEligibility;
}

export interface RecipeIngredient {
  readonly id: string;
  readonly productId?: string;
  readonly name: string;
  readonly amountLabel: string;
  readonly optional: boolean;
  readonly snapshot?: ProductSnapshot;
}

export interface Recipe {
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
  readonly nutritionPerServing: Nutrition;
  readonly macroCoverage: number;
  readonly dietStatus: 'allowed';
  readonly origin: RecipeOrigin;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface ShoppingItem {
  readonly id: string;
  readonly name: string;
  readonly amountLabel?: string;
  readonly recipeId?: string;
  readonly checked: boolean;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface RecipesSettings {
  readonly theme: 'dark' | 'light' | 'system';
  readonly calorieTarget: number;
  readonly proteinTargetG: number;
  readonly maxCookMinutes: number;
  readonly eggsAllowed: true;
  readonly updatedAt: IsoDateTime;
}

export interface RecipesState {
  readonly version: 1;
  readonly settings: RecipesSettings;
  readonly pantry: readonly Product[];
  readonly recipes: readonly Recipe[];
  readonly shopping: readonly ShoppingItem[];
  readonly updatedAt: IsoDateTime;
  readonly updatedAtMs: number;
  readonly clientId: string;
}

export interface RecipesVaultDocument {
  readonly schemaVersion: 1;
  readonly state: RecipesState;
  readonly updatedAt: IsoDateTime;
  readonly updatedAtMs: number;
  readonly clientId: string;
}

export function createId(prefix = 'item'): string {
  const normalized = prefix.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 14)
    : Math.random().toString(36).slice(2, 16);
  return `${normalized}_${Date.now().toString(36)}_${random}`;
}

export function createClientId(): string {
  return createId('recipes-client');
}

export function createEmptyState(
  now = new Date().toISOString(),
  clientId = createClientId(),
): RecipesState {
  const updatedAtMs = Math.max(1, Date.parse(now) || Date.now());
  return {
    version: RECIPES_STATE_VERSION,
    settings: {
      theme: 'system',
      calorieTarget: 900,
      proteinTargetG: 40,
      maxCookMinutes: 60,
      eggsAllowed: true,
      updatedAt: now,
    },
    pantry: [],
    recipes: [],
    shopping: [],
    updatedAt: now,
    updatedAtMs,
    clientId,
  };
}
