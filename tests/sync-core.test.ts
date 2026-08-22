import { describe, expect, it, vi } from 'vitest';
import { STARTER_RECIPES } from '../src/catalog';
import { createEmptyState, type RecipesState } from '../src/model';
import { selectNewerRecipesState } from '../src/store';
import {
  finishRecipesSafeSignOut,
  parseRecipesVaultDocument,
  RecipesSyncSafetyTracker,
  resolveInitialRecipesSync,
  serializeRecipesVaultDocument,
} from '../src/useRecipesSync';

const EARLY = '2026-08-22T10:00:00.000Z';
const LATE = '2026-08-22T11:00:00.000Z';

function state(now: string, clientId: string, shoppingName?: string): RecipesState {
  const base = createEmptyState(now, clientId);
  return shoppingName ? {
    ...base,
    shopping: [{
      id: `shopping_${clientId}`,
      name: shoppingName,
      checked: false,
      createdAt: now,
      updatedAt: now,
    }],
  } : base;
}

describe('whole-document Recipes sync', () => {
  it('hydrates an untouched first visit from cloud even if its generated local clock is later', () => {
    const pristine = state(LATE, 'recipes-client-new-device');
    const cloud = state(EARLY, 'recipes-client-laptop', 'Paneer');
    const resolution = resolveInitialRecipesSync(pristine, cloud, false);
    expect(resolution.source).toBe('cloud');
    expect(resolution.shouldWriteCloud).toBe(false);
    expect(resolution.state).toBe(cloud);
  });

  it('lets an intentional persisted reset outrank an older populated cloud copy', () => {
    const reset = state(LATE, 'recipes-client-phone');
    const cloud = state(EARLY, 'recipes-client-laptop', 'Paneer');
    const resolution = resolveInitialRecipesSync(reset, cloud, true);
    expect(resolution.source).toBe('local');
    expect(resolution.shouldWriteCloud).toBe(true);
    expect(resolution.state.shopping).toEqual([]);
  });

  it('uses client id then canonical content to settle exact-clock ties in either argument order', () => {
    const left = state(EARLY, 'recipes-client-a', 'Tofu');
    const right = state(EARLY, 'recipes-client-z', 'Paneer');
    expect(selectNewerRecipesState(left, right)).toBe(right);
    expect(selectNewerRecipesState(right, left)).toBe(right);

    const sameClientLeft = { ...left, clientId: 'recipes-client-same' };
    const sameClientRight = { ...right, clientId: 'recipes-client-same' };
    expect(selectNewerRecipesState(sameClientLeft, sameClientRight))
      .toEqual(selectNewerRecipesState(sameClientRight, sameClientLeft));
  });

  it('keeps wrapper metadata exactly aligned with its complete validated state', () => {
    const original = state(LATE, 'recipes-client-phone', 'Tortillas');
    const document = serializeRecipesVaultDocument(original);
    expect(document.schemaVersion).toBe(1);
    expect(document.updatedAtMs).toBe(original.updatedAtMs);
    expect(parseRecipesVaultDocument(JSON.parse(JSON.stringify(document))).state).toEqual(original);

    expect(() => parseRecipesVaultDocument({ ...document, clientId: 'recipes-client-tampered' }))
      .toThrow(/metadata/i);
  });

  it('rejects forged snapshot-derived macros at both cloud serialization boundaries', () => {
    const original = { ...state(LATE, 'recipes-client-phone'), recipes: [STARTER_RECIPES[0]] };
    const outgoing = JSON.parse(JSON.stringify(original));
    outgoing.recipes[0].nutritionPerServing.proteinG += 10;
    expect(() => serializeRecipesVaultDocument(outgoing)).toThrow(/nutritionPerServing.*snapshots/i);

    const document = JSON.parse(JSON.stringify(serializeRecipesVaultDocument(original)));
    document.state.recipes[0].macroCoverage = 0;
    expect(() => parseRecipesVaultDocument(document)).toThrow(/macroCoverage.*snapshots/i);
  });
});

describe('safe sign-out', () => {
  it('drains writes and verifies the latest server revision before auth and private caches are cleared', async () => {
    const order: string[] = [];
    await finishRecipesSafeSignOut({
      waitForPendingWrites: async () => { order.push('writes'); },
      verifyLatestServerRevision: async () => { order.push('verify'); },
      signOutAuth: async () => { order.push('auth'); },
      clearLocalData: async () => { order.push('recipes-local'); },
      clearFirestoreCache: async () => { order.push('firestore-cache'); },
    });
    expect(order).toEqual(['writes', 'verify', 'auth', 'recipes-local', 'firestore-cache']);
  });

  it('keeps auth and local data intact if pending writes cannot be confirmed', async () => {
    const signOutAuth = vi.fn(async () => undefined);
    const clearLocalData = vi.fn(async () => undefined);
    await expect(finishRecipesSafeSignOut({
      waitForPendingWrites: async () => { throw new Error('offline'); },
      verifyLatestServerRevision: async () => undefined,
      signOutAuth,
      clearLocalData,
      clearFirestoreCache: async () => undefined,
    })).rejects.toThrow('offline');
    expect(signOutAuth).not.toHaveBeenCalled();
    expect(clearLocalData).not.toHaveBeenCalled();
  });

  it('keeps auth and local data after a prior rejected write even when the SDK queue later drains', async () => {
    const local = state(LATE, 'recipes-client-phone', 'Paneer');
    const tracker = new RecipesSyncSafetyTracker(local);
    tracker.markBootstrapConfirmed(state(EARLY, 'recipes-client-laptop'));
    tracker.beginWrite(local);
    tracker.rejectWrite(local);

    expect(tracker.snapshot()).toMatchObject({
      pendingWriteCount: 0,
      failedWriteCount: 1,
      bootstrap: 'confirmed',
    });

    const signOutAuth = vi.fn(async () => undefined);
    const clearLocalData = vi.fn(async () => undefined);
    await expect(finishRecipesSafeSignOut({
      waitForPendingWrites: async () => undefined,
      verifyLatestServerRevision: async () => tracker.assertLatestServerAcknowledged(local),
      signOutAuth,
      clearLocalData,
      clearFirestoreCache: async () => undefined,
    })).rejects.toThrow(/previous recipe sync write failed/i);
    expect(signOutAuth).not.toHaveBeenCalled();
    expect(clearLocalData).not.toHaveBeenCalled();
  });

  it('blocks an unconfirmed bootstrap until the exact latest state is observed from the server', () => {
    const local = state(LATE, 'recipes-client-phone', 'Tofu');
    const tracker = new RecipesSyncSafetyTracker(local);
    tracker.markBootstrapFailed();
    tracker.beginWrite(local);
    tracker.acknowledgeWrite(local);

    expect(() => tracker.assertLatestServerAcknowledged(local)).toThrow(/owner vault/i);

    tracker.acknowledgeServerState(local);
    expect(() => tracker.assertLatestServerAcknowledged(local)).not.toThrow();
  });

  it('blocks while an otherwise confirmed revision still has an unconfirmed write', () => {
    const local = state(LATE, 'recipes-client-phone', 'Tofu');
    const tracker = new RecipesSyncSafetyTracker(local);
    tracker.markBootstrapConfirmed(local);
    tracker.beginWrite(local);

    expect(tracker.snapshot().pendingWriteCount).toBe(1);
    expect(() => tracker.assertLatestServerAcknowledged(local)).toThrow(/still sending changes/i);

    tracker.acknowledgeWrite(local);
    expect(() => tracker.assertLatestServerAcknowledged(local)).not.toThrow();
  });

  it('requires exact whole-state equality rather than matching revision metadata alone', () => {
    const confirmed = state(LATE, 'recipes-client-phone', 'Tofu');
    const changed = state(LATE, 'recipes-client-phone', 'Paneer');
    const tracker = new RecipesSyncSafetyTracker(confirmed);
    tracker.markBootstrapConfirmed(confirmed);

    expect(tracker.isLatestServerAcknowledged(confirmed)).toBe(true);
    expect(tracker.isLatestServerAcknowledged(changed)).toBe(false);
    expect(() => tracker.assertLatestServerAcknowledged(changed)).toThrow(/latest recipe changes/i);
  });
});
