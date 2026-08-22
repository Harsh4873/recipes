import { describe, expect, it } from 'vitest';
import { canUseAiChef } from '../src/ai-access';

describe('AI chef access gate', () => {
  it('requires owner auth, a resolved owner vault, and App Check together', () => {
    expect(canUseAiChef({ signedIn: true, ownerVaultReady: true, appCheckConfigured: true })).toBe(true);

    expect(canUseAiChef({ signedIn: false, ownerVaultReady: true, appCheckConfigured: true })).toBe(false);
    expect(canUseAiChef({ signedIn: true, ownerVaultReady: false, appCheckConfigured: true })).toBe(false);
    expect(canUseAiChef({ signedIn: true, ownerVaultReady: true, appCheckConfigured: false })).toBe(false);
  });
});
