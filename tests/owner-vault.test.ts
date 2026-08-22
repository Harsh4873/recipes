import { describe, expect, it } from 'vitest';
import {
  OWNER_VAULT_APP_NAME,
  adoptSharedAuthSession,
  parseOwnerVaultMembership,
} from '../src/owner-vault';

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem'> {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe('owner vault membership', () => {
  it('accepts only active schema-v1 memberships with path-safe opaque ids', () => {
    expect(parseOwnerVaultMembership({
      vaultId: 'owner_vault-123456',
      schemaVersion: 1,
      status: 'active',
    })).toEqual({
      vaultId: 'owner_vault-123456',
      schemaVersion: 1,
      status: 'active',
    });
    expect(parseOwnerVaultMembership({ vaultId: '../private/path', schemaVersion: 1, status: 'active' })).toBeNull();
    expect(parseOwnerVaultMembership({ vaultId: 'owner_vault-123456', schemaVersion: 2, status: 'active' })).toBeNull();
    expect(parseOwnerVaultMembership({ vaultId: 'owner_vault-123456', schemaVersion: 1, status: 'disabled' })).toBeNull();
  });

  it('copies a legacy Recipes auth session without deleting it', () => {
    const storage = new MemoryStorage();
    const apiKey = 'public-api-key';
    const legacyKey = `firebase:authUser:${apiKey}:recipes`;
    const sharedKey = `firebase:authUser:${apiKey}:${OWNER_VAULT_APP_NAME}`;
    storage.setItem(legacyKey, '{"uid":"owner"}');

    adoptSharedAuthSession(apiKey, ['recipes'], storage);

    expect(storage.getItem(sharedKey)).toBe('{"uid":"owner"}');
    expect(storage.getItem(legacyKey)).toBe('{"uid":"owner"}');
  });

  it('never overwrites an existing shared session', () => {
    const storage = new MemoryStorage();
    const apiKey = 'public-api-key';
    const sharedKey = `firebase:authUser:${apiKey}:${OWNER_VAULT_APP_NAME}`;
    storage.setItem(sharedKey, 'shared');
    storage.setItem(`firebase:authUser:${apiKey}:recipes`, 'legacy');
    adoptSharedAuthSession(apiKey, ['recipes'], storage);
    expect(storage.getItem(sharedKey)).toBe('shared');
  });
});
