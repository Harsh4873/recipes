import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFile } from 'node:fs/promises';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';

const PROJECT_ID = 'demo-recipes';
const MEMBER_UID = 'recipes-member';
const VAULT_ID = 'recipes-private-vault';
const TEST_EMAIL = 'recipes.member@example.com';
const EMULATOR_ADDRESS = process.env.FIRESTORE_EMULATOR_HOST;
const INITIAL_STAMP = '2026-08-22T10:00:00.000Z';
const INITIAL_STAMP_MS = Date.parse(INITIAL_STAMP);

function authorizedContext(
  testEnvironment: RulesTestEnvironment,
  uid = MEMBER_UID,
  overrides: Record<string, unknown> = {},
): RulesTestContext {
  return testEnvironment.authenticatedContext(uid, {
    email: TEST_EMAIL,
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
    ...overrides,
  });
}

function validState(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    settings: {
      theme: 'system',
      calorieTarget: 550,
      proteinTargetG: 30,
      maxCookMinutes: 35,
      eggsAllowed: true,
      updatedAt: INITIAL_STAMP,
    },
    pantry: [],
    recipes: [],
    shopping: [],
    updatedAt: INITIAL_STAMP,
    updatedAtMs: INITIAL_STAMP_MS,
    clientId: 'rules-test-client',
    ...overrides,
  };
}

function validVault(
  overrides: Record<string, unknown> = {},
  stateOverrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const updatedAt = overrides.updatedAt ?? INITIAL_STAMP;
  const updatedAtMs = overrides.updatedAtMs ?? INITIAL_STAMP_MS;
  const clientId = overrides.clientId ?? 'rules-test-client';
  return {
    schemaVersion: 1,
    state: validState({ updatedAt, updatedAtMs, clientId, ...stateOverrides }),
    updatedAt,
    updatedAtMs,
    clientId,
    ...overrides,
  };
}

async function provisionMembership(
  testEnvironment: RulesTestEnvironment,
  uid: string,
  vaultId: string,
): Promise<void> {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'owner_vault_members', uid), {
      schemaVersion: 1,
      vaultId,
      status: 'active',
      legacyWritesEnabled: false,
    });
  });
}

describe.skipIf(!EMULATOR_ADDRESS)('Recipes Firestore security rules', () => {
  let testEnvironment: RulesTestEnvironment;

  beforeAll(async () => {
    const [host, rawPort] = EMULATOR_ADDRESS!.split(':');
    const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
    testEnvironment = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { host, port: Number(rawPort), rules },
    });
  });

  beforeEach(async () => {
    await provisionMembership(testEnvironment, MEMBER_UID, VAULT_ID);
  });

  afterEach(async () => testEnvironment.clearFirestore());
  afterAll(async () => testEnvironment.cleanup());

  it('denies unauthenticated, unprovisioned, and wrong-vault access without a legacy UID fallback', async () => {
    const anonymous = testEnvironment.unauthenticatedContext().firestore();
    const unprovisioned = authorizedContext(
      testEnvironment,
      'unprovisioned-member',
      { email: 'unprovisioned@example.com' },
    ).firestore();
    const member = authorizedContext(testEnvironment).firestore();

    await assertFails(getDoc(doc(anonymous, 'recipes_vaults', VAULT_ID)));
    await assertFails(setDoc(doc(anonymous, 'recipes_vaults', VAULT_ID), validVault()));

    await assertFails(getDoc(doc(unprovisioned, 'recipes_vaults', VAULT_ID)));
    await assertFails(setDoc(
      doc(unprovisioned, 'recipes_vaults', 'unprovisioned-member'),
      validVault(),
    ));

    await assertFails(getDoc(doc(member, 'recipes_vaults', MEMBER_UID)));
    await assertFails(setDoc(doc(member, 'recipes_vaults', MEMBER_UID), validVault()));

    await provisionMembership(testEnvironment, 'other-member', 'other-vault');
    const otherMember = authorizedContext(
      testEnvironment,
      'other-member',
      { email: 'other.member@example.com' },
    ).firestore();
    await assertFails(getDoc(doc(otherMember, 'recipes_vaults', VAULT_ID)));
    await assertFails(setDoc(doc(otherMember, 'recipes_vaults', VAULT_ID), validVault()));
  });

  it('allows an active vault member to create, read, and update the single Recipes document', async () => {
    const firestore = authorizedContext(testEnvironment).firestore();
    const reference = doc(firestore, 'recipes_vaults', VAULT_ID);

    await assertSucceeds(setDoc(reference, validVault()));
    await assertSucceeds(getDoc(reference));
    await assertSucceeds(setDoc(reference, validVault({
      updatedAt: '2026-08-22T10:05:00.000Z',
      updatedAtMs: INITIAL_STAMP_MS + 300_000,
      clientId: 'second-device',
    }, {
      pantry: [{ id: 'paneer', servings: 2 }],
      recipes: [{ id: 'paneer-wraps' }],
    })));
  });

  it('rejects documents that do not match the exact bounded schema', async () => {
    const firestore = authorizedContext(testEnvironment).firestore();
    const reference = doc(firestore, 'recipes_vaults', VAULT_ID);
    const missingClientId = validVault();
    delete missingClientId.clientId;

    await assertFails(setDoc(reference, validVault({ schemaVersion: 2 })));
    await assertFails(setDoc(reference, validVault({ state: [] })));
    await assertFails(setDoc(reference, validVault({ unexpected: true })));
    await assertFails(setDoc(reference, validVault({}, { unexpected: true })));
    await assertFails(setDoc(reference, validVault({}, { pantry: {} })));
    await assertFails(setDoc(reference, validVault({}, {
      settings: {
        theme: 'system',
        calorieTarget: 550,
        proteinTargetG: 30,
        maxCookMinutes: 35,
        eggsAllowed: false,
        updatedAt: INITIAL_STAMP,
      },
    })));
    const missingShopping = validState();
    delete missingShopping.shopping;
    await assertFails(setDoc(reference, validVault({ state: missingShopping })));
    await assertFails(setDoc(reference, validVault({
      state: validState({ clientId: 'mismatched-state-client' }),
    })));
    await assertFails(setDoc(reference, missingClientId));
    await assertFails(setDoc(reference, validVault({ updatedAt: '' })));
    await assertFails(setDoc(reference, validVault({
      updatedAtMs: 253_402_300_800_000,
    })));
    await assertFails(setDoc(reference, validVault({ clientId: 'x'.repeat(129) })));
  });

  it('rejects updates when either timestamp moves backward', async () => {
    const firestore = authorizedContext(testEnvironment).firestore();
    const reference = doc(firestore, 'recipes_vaults', VAULT_ID);
    await assertSucceeds(setDoc(reference, validVault()));

    await assertFails(setDoc(reference, validVault({
      updatedAt: '2026-08-22T10:01:00.000Z',
      updatedAtMs: INITIAL_STAMP_MS - 1,
    }, { pantry: [{ id: 'stale-ms' }] })));
    await assertFails(setDoc(reference, validVault({
      updatedAt: '2026-08-22T09:59:59.999Z',
      updatedAtMs: INITIAL_STAMP_MS + 1,
    }, { pantry: [{ id: 'stale-iso' }] })));
  });

  it('denies physical deletion of a Recipes vault', async () => {
    const firestore = authorizedContext(testEnvironment).firestore();
    const reference = doc(firestore, 'recipes_vaults', VAULT_ID);
    await assertSucceeds(setDoc(reference, validVault()));
    await assertFails(deleteDoc(reference));
  });
});
