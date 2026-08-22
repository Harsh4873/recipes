export interface AiAccessState {
  readonly signedIn: boolean;
  readonly ownerVaultReady: boolean;
  readonly appCheckConfigured: boolean;
}

export function canUseAiChef(access: AiAccessState): boolean {
  return access.signedIn && access.ownerVaultReady && access.appCheckConfigured;
}
