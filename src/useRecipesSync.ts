import { useCallback, useEffect, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import {
  clearIndexedDbPersistence,
  doc,
  getDocFromCache,
  getDocFromServer,
  onSnapshot,
  setDoc,
  terminate,
  waitForPendingWrites,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  authPersistenceReady,
  firebaseAuth,
  googleProvider,
  recipesFirestore,
} from './firebase';
import type { RecipesState, RecipesVaultDocument } from './model';
import { resolveOwnerVault } from './owner-vault';
import {
  parseRecipesState,
  selectNewerRecipesState,
  stableStringify,
  type RecipesStore,
} from './store';

export const RECIPES_VAULT_COLLECTION = 'recipes_vaults';

export type RecipesSyncStatus = 'synced' | 'syncing' | 'offline' | 'signed-out' | 'action-needed';
export type SyncStatus = RecipesSyncStatus;

export interface RecipesSync {
  readonly status: RecipesSyncStatus;
  readonly user: User | null;
  readonly vaultId?: string;
  readonly lastSyncedAt?: string;
  readonly message?: string;
  readonly signingOut: boolean;
  readonly signIn: () => Promise<void>;
  readonly signOut: () => Promise<void>;
}

export interface InitialRecipesSyncResolution {
  readonly state: RecipesState;
  readonly shouldWriteCloud: boolean;
  readonly source: 'local' | 'cloud';
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The cloud copy must be an object.');
  }
  return value as Record<string, unknown>;
}

export function omitUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => omitUndefinedDeep(item)) as unknown as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, omitUndefinedDeep(item)]),
    ) as T;
  }
  return value;
}

export function serializeRecipesVaultDocument(state: RecipesState): RecipesVaultDocument {
  const validated = parseRecipesState(state);
  return omitUndefinedDeep({
    schemaVersion: 1,
    state: validated,
    updatedAt: validated.updatedAt,
    updatedAtMs: validated.updatedAtMs,
    clientId: validated.clientId,
  });
}

export function parseRecipesVaultDocument(value: unknown): RecipesVaultDocument {
  const raw = object(value);
  if (raw.schemaVersion !== 1) throw new Error('The cloud copy has an unsupported schema version.');
  const state = parseRecipesState(raw.state);
  if (
    raw.updatedAt !== state.updatedAt
    || raw.updatedAtMs !== state.updatedAtMs
    || raw.clientId !== state.clientId
  ) {
    throw new Error('The cloud revision metadata does not match its Recipes state.');
  }
  return {
    schemaVersion: 1,
    state,
    updatedAt: state.updatedAt,
    updatedAtMs: state.updatedAtMs,
    clientId: state.clientId,
  };
}

/**
 * First contact never treats an automatically-created empty local state as a
 * real edit. Once a state was persisted (including an intentional reset), the
 * normal deterministic whole-document LWW contract applies.
 */
export function resolveInitialRecipesSync(
  local: RecipesState,
  cloud: RecipesState | null,
  hasPersistedLocal: boolean,
): InitialRecipesSyncResolution {
  if (!cloud) return { state: local, shouldWriteCloud: true, source: 'local' };
  if (!hasPersistedLocal) return { state: cloud, shouldWriteCloud: false, source: 'cloud' };
  const state = selectNewerRecipesState(local, cloud);
  const source = stableStringify(state) === stableStringify(cloud) ? 'cloud' : 'local';
  return {
    state,
    source,
    shouldWriteCloud: source === 'local' && stableStringify(local) !== stableStringify(cloud),
  };
}

export interface RecipesSafeSignOutSteps {
  readonly waitForPendingWrites: () => Promise<void>;
  readonly verifyLatestServerRevision: () => Promise<void>;
  readonly signOutAuth: () => Promise<void>;
  readonly clearLocalData: () => Promise<void>;
  readonly clearFirestoreCache: () => Promise<void>;
}

export type RecipesBootstrapConfirmation = 'unconfirmed' | 'confirmed' | 'failed';

export interface RecipesSyncSafetySnapshot {
  readonly latestLocalRevision?: string;
  readonly acknowledgedServerRevision?: string;
  readonly pendingWriteCount: number;
  readonly failedWriteCount: number;
  readonly bootstrap: RecipesBootstrapConfirmation;
}

function recipesRevisionFingerprint(state: RecipesState): string {
  return stableStringify(parseRecipesState(state));
}

/**
 * Tracks evidence needed before private local data may be removed. A drained
 * SDK queue is not enough: the exact latest whole-state revision must also be
 * observed or acknowledged by the server after a successful bootstrap.
 */
export class RecipesSyncSafetyTracker {
  private latestLocalRevision?: string;
  private acknowledgedServerRevision?: string;
  private readonly pendingWrites = new Map<string, number>();
  private readonly failedWrites = new Set<string>();
  private bootstrap: RecipesBootstrapConfirmation = 'unconfirmed';

  constructor(local?: RecipesState) {
    if (local) this.noteLocalState(local);
  }

  reset(local?: RecipesState): void {
    this.latestLocalRevision = local ? recipesRevisionFingerprint(local) : undefined;
    this.acknowledgedServerRevision = undefined;
    this.pendingWrites.clear();
    this.failedWrites.clear();
    this.bootstrap = 'unconfirmed';
  }

  noteLocalState(state: RecipesState): void {
    this.latestLocalRevision = recipesRevisionFingerprint(state);
  }

  markBootstrapStarted(): void {
    this.bootstrap = 'unconfirmed';
    this.acknowledgedServerRevision = undefined;
  }

  markBootstrapFailed(): void {
    this.bootstrap = 'failed';
    this.acknowledgedServerRevision = undefined;
  }

  markBootstrapConfirmed(serverState?: RecipesState): void {
    this.bootstrap = 'confirmed';
    if (serverState) this.acknowledgeServerState(serverState);
  }

  beginWrite(state: RecipesState): void {
    const revision = recipesRevisionFingerprint(state);
    this.noteLocalState(state);
    this.pendingWrites.set(revision, (this.pendingWrites.get(revision) ?? 0) + 1);
  }

  acknowledgeWrite(state: RecipesState): void {
    const revision = recipesRevisionFingerprint(state);
    this.finishWrite(revision);
    this.acknowledgedServerRevision = revision;
    if (revision === this.latestLocalRevision) this.failedWrites.clear();
  }

  rejectWrite(state: RecipesState): void {
    const revision = recipesRevisionFingerprint(state);
    this.finishWrite(revision);
    this.failedWrites.add(revision);
    this.acknowledgedServerRevision = undefined;
  }

  acknowledgeServerState(state: RecipesState): void {
    const revision = recipesRevisionFingerprint(state);
    this.acknowledgedServerRevision = revision;
    this.bootstrap = 'confirmed';
    if (revision === this.latestLocalRevision) this.failedWrites.clear();
  }

  isLatestServerAcknowledged(state: RecipesState): boolean {
    const revision = recipesRevisionFingerprint(state);
    return this.bootstrap === 'confirmed'
      && this.pendingWriteCount() === 0
      && this.failedWrites.size === 0
      && this.latestLocalRevision === revision
      && this.acknowledgedServerRevision === revision;
  }

  assertLatestServerAcknowledged(state: RecipesState): void {
    this.noteLocalState(state);
    if (this.pendingWriteCount() > 0) {
      throw new Error('Recipes is still sending changes. Keep this tab signed in and try again after sync finishes.');
    }
    if (this.failedWrites.size > 0) {
      throw new Error('A previous recipe sync write failed. Keep this tab signed in, reconnect, and try again after Recipes shows Synced.');
    }
    if (this.bootstrap !== 'confirmed') {
      throw new Error('Recipes could not confirm this owner vault with the server. Keep this tab signed in, reconnect, and try again.');
    }
    const revision = recipesRevisionFingerprint(state);
    if (this.acknowledgedServerRevision !== revision) {
      throw new Error('The latest recipe changes are not confirmed by the server yet. Keep this tab signed in and try again after Recipes shows Synced.');
    }
  }

  snapshot(): RecipesSyncSafetySnapshot {
    return {
      latestLocalRevision: this.latestLocalRevision,
      acknowledgedServerRevision: this.acknowledgedServerRevision,
      pendingWriteCount: this.pendingWriteCount(),
      failedWriteCount: this.failedWrites.size,
      bootstrap: this.bootstrap,
    };
  }

  private finishWrite(revision: string): void {
    const count = this.pendingWrites.get(revision) ?? 0;
    if (count <= 1) this.pendingWrites.delete(revision);
    else this.pendingWrites.set(revision, count - 1);
  }

  private pendingWriteCount(): number {
    return [...this.pendingWrites.values()].reduce((total, count) => total + count, 0);
  }
}

/** No private device copy is removed until the latest state is server-proven. */
export async function finishRecipesSafeSignOut(steps: RecipesSafeSignOutSteps): Promise<void> {
  await steps.waitForPendingWrites();
  await steps.verifyLatestServerRevision();
  await steps.signOutAuth();
  await steps.clearLocalData();
  await steps.clearFirestoreCache();
}

function online(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}

function friendlySyncError(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  if (code.includes('popup-closed-by-user')) return 'Sign-in was cancelled. Your local recipe workspace is unchanged.';
  if (code.includes('popup-blocked')) return 'Allow the Google sign-in window, then try again.';
  if (code.includes('permission-denied')) return 'Recipes could not access this account’s private owner vault. Your local data is still safe.';
  if (code.includes('unavailable') || !online()) return 'You are offline. Changes stay on this device and will sync after reconnection.';
  return error instanceof Error ? error.message : 'Recipes could not finish syncing. Your local data is still safe.';
}

function makeTabId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `recipes-tab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useRecipesSync(store: RecipesStore): RecipesSync {
  const [status, setStatus] = useState<RecipesSyncStatus>(() => online() ? 'syncing' : 'offline');
  const [user, setUser] = useState<User | null>(null);
  const [vaultId, setVaultId] = useState<string>();
  const [lastSyncedAt, setLastSyncedAt] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [signingOut, setSigningOut] = useState(false);
  const localStateRef = useRef(store.state);
  const hasStoredLocalRef = useRef(store.hasStoredState);
  const activeUserRef = useRef<User | null>(null);
  const candidateUserRef = useRef<User | null>(null);
  const pendingWritesRef = useRef(0);
  const pendingWritePromisesRef = useRef(new Set<Promise<void>>());
  const syncSafetyRef = useRef(new RecipesSyncSafetyTracker());
  const stopListenerRef = useRef<() => void>(() => undefined);
  const bootstrapRef = useRef<() => void>(() => undefined);
  const otherTabsOpenRef = useRef<() => Promise<boolean>>(async () => false);
  localStateRef.current = store.state;
  hasStoredLocalRef.current = store.hasStoredState;
  if (store.state) syncSafetyRef.current.noteLocalState(store.state);

  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
    const tabId = makeTabId();
    const channel = new BroadcastChannel('recipes-tab-presence');
    const probes = new Map<string, () => void>();
    channel.onmessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; requestId?: string; source?: string; target?: string };
      if (data.type === 'probe' && data.source !== tabId && data.requestId) {
        channel.postMessage({ type: 'present', requestId: data.requestId, target: data.source });
      }
      if (data.type === 'present' && data.target === tabId && data.requestId) probes.get(data.requestId)?.();
    };
    otherTabsOpenRef.current = () => new Promise((resolve) => {
      const requestId = makeTabId();
      let finished = false;
      const finish = (value: boolean) => {
        if (finished) return;
        finished = true;
        probes.delete(requestId);
        resolve(value);
      };
      probes.set(requestId, () => finish(true));
      channel.postMessage({ type: 'probe', requestId, source: tabId });
      window.setTimeout(() => finish(false), 250);
    });
    return () => {
      otherTabsOpenRef.current = async () => false;
      probes.clear();
      channel.close();
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let authUnsubscribe: Unsubscribe = () => undefined;
    let documentUnsubscribe: Unsubscribe | undefined;
    let activeVaultId: string | null = null;
    let writesEnabled = false;
    let bootstrapInFlight = false;
    let bootstrapAgain = false;
    let bootstrapSequence = 0;
    let authSequence = 0;

    function stopListener(): void {
      bootstrapSequence += 1;
      writesEnabled = false;
      documentUnsubscribe?.();
      documentUnsubscribe = undefined;
    }
    stopListenerRef.current = stopListener;

    function vaultReference(id: string) {
      return doc(recipesFirestore, RECIPES_VAULT_COLLECTION, id);
    }

    function showError(error: unknown): void {
      if (disposed) return;
      const offlineError = !online()
        || (typeof error === 'object' && error && 'code' in error && String(error.code).includes('unavailable'));
      setStatus(offlineError ? 'offline' : 'action-needed');
      setMessage(friendlySyncError(error));
    }

    function markSynced(state?: RecipesState): void {
      if (disposed) return;
      const current = state ?? localStateRef.current;
      if (!current || !syncSafetyRef.current.isLatestServerAcknowledged(current)) {
        setStatus(online() ? 'action-needed' : 'offline');
        setMessage(online()
          ? 'The latest recipe changes still need server confirmation. Keep this tab signed in and try again shortly.'
          : 'Changes stay on this device until the server confirms them.');
        return;
      }
      setStatus(online() ? 'synced' : 'offline');
      setLastSyncedAt(current.updatedAt);
      setMessage(online() ? undefined : 'Changes are saved here and will sync automatically when this device reconnects.');
    }

    function trackWrite(promise: Promise<unknown>, state: RecipesState): Promise<void> {
      pendingWritesRef.current += 1;
      syncSafetyRef.current.beginWrite(state);
      if (online()) setStatus('syncing');
      else setStatus('offline');
      setMessage(online() ? undefined : 'Changes are saved here and queued for sync.');

      const tracked = promise.then(() => {
        pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
        syncSafetyRef.current.acknowledgeWrite(state);
        if (pendingWritesRef.current === 0) markSynced(localStateRef.current ?? undefined);
      }).catch((error) => {
        pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
        syncSafetyRef.current.rejectWrite(state);
        showError(error);
        throw error;
      });
      const safe = tracked.catch(() => undefined).finally(() => pendingWritePromisesRef.current.delete(safe));
      pendingWritePromisesRef.current.add(safe);
      return tracked;
    }

    function queueWrite(id: string, next: RecipesState): void {
      if (!writesEnabled || activeVaultId !== id) return;
      const document = serializeRecipesVaultDocument(next) as unknown as DocumentData;
      void trackWrite(setDoc(vaultReference(id), document), next).catch(() => undefined);
    }

    const unsubscribeMutations = store.subscribeMutations((mutation) => {
      localStateRef.current = mutation.state;
      hasStoredLocalRef.current = true;
      syncSafetyRef.current.noteLocalState(mutation.state);
      if (activeVaultId && writesEnabled) queueWrite(activeVaultId, mutation.state);
    });

    function applyCloudState(cloud: RecipesState, snapshotFromCache: boolean, hasPendingWrites: boolean): void {
      const local = localStateRef.current;
      if (!local) return;
      const winner = selectNewerRecipesState(local, cloud);
      const localText = stableStringify(local);
      const cloudText = stableStringify(cloud);
      if (stableStringify(winner) === cloudText && cloudText !== localText) {
        localStateRef.current = cloud;
        hasStoredLocalRef.current = true;
        syncSafetyRef.current.noteLocalState(cloud);
        store.applySyncedState(cloud);
      } else if (
        writesEnabled
        && activeVaultId
        && localText !== cloudText
        && !snapshotFromCache
        && !hasPendingWrites
      ) {
        // Repair an older remote whole document after a deterministic local win.
        queueWrite(activeVaultId, local);
      }

      if (!online() || snapshotFromCache) {
        setStatus('offline');
        setMessage('Showing the latest recipe workspace available on this device.');
      } else if (hasPendingWrites || pendingWritesRef.current > 0) {
        setStatus('syncing');
        setMessage(undefined);
      } else {
        markSynced(winner);
      }
    }

    function startDocumentListener(id: string): void {
      documentUnsubscribe?.();
      documentUnsubscribe = onSnapshot(
        vaultReference(id),
        { includeMetadataChanges: true },
        (snapshot) => {
          if (!snapshot.exists()) {
            if (!online() || snapshot.metadata.fromCache) {
              setStatus('offline');
              setMessage('Cloud data is unavailable right now; this device copy remains safe.');
            }
            return;
          }
          try {
            const cloud = parseRecipesVaultDocument(snapshot.data()).state;
            if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) {
              syncSafetyRef.current.acknowledgeServerState(cloud);
            }
            applyCloudState(cloud, snapshot.metadata.fromCache, snapshot.metadata.hasPendingWrites);
          } catch (error) {
            syncSafetyRef.current.markBootstrapFailed();
            showError(error);
          }
        },
        (error) => {
          syncSafetyRef.current.markBootstrapFailed();
          showError(error);
        },
      );
    }

    async function readCloud(id: string, requireServer: boolean): Promise<RecipesState | null> {
      let snapshot;
      if (requireServer) {
        snapshot = await getDocFromServer(vaultReference(id));
      } else {
        try {
          snapshot = await getDocFromCache(vaultReference(id));
        } catch {
          return null;
        }
      }
      return snapshot.exists() ? parseRecipesVaultDocument(snapshot.data()).state : null;
    }

    async function bootstrap(): Promise<void> {
      if (bootstrapInFlight) {
        bootstrapAgain = true;
        return;
      }
      if (disposed || !activeVaultId || !localStateRef.current) return;
      bootstrapInFlight = true;
      const sequence = ++bootstrapSequence;
      const id = activeVaultId;
      const requireServer = online();
      syncSafetyRef.current.markBootstrapStarted();
      setStatus(requireServer ? 'syncing' : 'offline');
      setMessage(requireServer ? undefined : 'Showing saved data while offline. Cloud writes are paused until reconnect.');
      try {
        const cloud = await readCloud(id, requireServer);
        if (disposed || sequence !== bootstrapSequence || activeVaultId !== id) return;
        if (requireServer && cloud) syncSafetyRef.current.acknowledgeServerState(cloud);
        const local = localStateRef.current;
        if (!local) return;
        const hadPersistedLocal = hasStoredLocalRef.current;
        const resolution = resolveInitialRecipesSync(local, cloud, hadPersistedLocal);

        // When offline with no cache, leave a pristine empty state explicitly
        // unpersisted. A later server bootstrap will therefore hydrate cloud.
        if (cloud || hadPersistedLocal || requireServer) {
          localStateRef.current = resolution.state;
          hasStoredLocalRef.current = true;
          syncSafetyRef.current.noteLocalState(resolution.state);
          store.applySyncedState(resolution.state);
        }

        writesEnabled = requireServer;
        startDocumentListener(id);
        if (requireServer && resolution.shouldWriteCloud) {
          await trackWrite(setDoc(
            vaultReference(id),
            serializeRecipesVaultDocument(resolution.state) as unknown as DocumentData,
          ), resolution.state);
          if (disposed || sequence !== bootstrapSequence) return;
        }
        if (requireServer) syncSafetyRef.current.markBootstrapConfirmed();
        if (requireServer && pendingWritesRef.current === 0) markSynced(resolution.state);
      } catch (error) {
        writesEnabled = false;
        syncSafetyRef.current.markBootstrapFailed();
        showError(error);
      } finally {
        bootstrapInFlight = false;
        if (bootstrapAgain && !disposed) {
          bootstrapAgain = false;
          void bootstrap();
        }
      }
    }
    bootstrapRef.current = () => { void bootstrap(); };

    async function startSession(authUser: User, sequence: number): Promise<void> {
      try {
        const membership = await resolveOwnerVault(recipesFirestore, authUser);
        if (disposed || sequence !== authSequence) return;
        activeUserRef.current = authUser;
        activeVaultId = membership.vaultId;
        setVaultId(membership.vaultId);
        void bootstrap();
      } catch (error) {
        if (disposed || sequence !== authSequence) return;
        activeUserRef.current = null;
        activeVaultId = null;
        setVaultId(undefined);
        showError(error);
      }
    }

    void authPersistenceReady.catch((error) => {
      // Auth still works in memory when browser persistence is unavailable.
      showError(error);
    }).then(() => {
      if (disposed) return;
      authUnsubscribe = onAuthStateChanged(firebaseAuth, (authUser) => {
        if (disposed) return;
        const sequence = ++authSequence;
        stopListener();
        activeVaultId = null;
        activeUserRef.current = null;
        candidateUserRef.current = authUser;
        syncSafetyRef.current.reset(localStateRef.current ?? undefined);
        setUser(authUser);
        setVaultId(undefined);

        if (!authUser) {
          setStatus(online() ? 'signed-out' : 'offline');
          setMessage(online()
            ? 'Sign in with Google to sync this private workspace.'
            : 'You are offline. Saved recipes and your grocery list still work.');
          return;
        }
        setStatus(online() ? 'syncing' : 'offline');
        setMessage(undefined);
        void startSession(authUser, sequence);
      });
    });

    function handleOffline(): void {
      writesEnabled = false;
      syncSafetyRef.current.markBootstrapStarted();
      setStatus('offline');
      setMessage('Changes stay on this device and will sync after reconnection.');
    }

    function handleOnline(): void {
      const authUser = candidateUserRef.current ?? firebaseAuth.currentUser;
      if (!authUser) {
        setStatus('signed-out');
        setMessage('Sign in with Google to sync this private workspace.');
        return;
      }
      if (!activeVaultId) {
        const sequence = ++authSequence;
        void startSession(authUser, sequence);
        return;
      }
      stopListener();
      setStatus('syncing');
      setMessage(undefined);
      void bootstrap();
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('offline', handleOffline);
      window.addEventListener('online', handleOnline);
    }

    return () => {
      disposed = true;
      authSequence += 1;
      bootstrapSequence += 1;
      authUnsubscribe();
      unsubscribeMutations();
      stopListener();
      if (typeof window !== 'undefined') {
        window.removeEventListener('offline', handleOffline);
        window.removeEventListener('online', handleOnline);
      }
      bootstrapRef.current = () => undefined;
    };
  }, [store.applySyncedState, store.subscribeMutations]);

  useEffect(() => {
    if (store.state) bootstrapRef.current();
  }, [Boolean(store.state)]);

  const signIn = useCallback(async () => {
    if (!online()) {
      setStatus('offline');
      setMessage('Connect to the internet for Google sign-in. Your local workspace remains available.');
      return;
    }
    setStatus('syncing');
    setMessage(undefined);
    try {
      await authPersistenceReady;
      await signInWithPopup(firebaseAuth, googleProvider);
    } catch (error) {
      setStatus('action-needed');
      setMessage(friendlySyncError(error));
    }
  }, []);

  const signOut = useCallback(async () => {
    const authUser = firebaseAuth.currentUser;
    if (!authUser) return;

    // Keep the authenticated session and local workspace intact until an owner
    // vault is resolved and the exact current state can be server-confirmed.
    if (!activeUserRef.current) {
      setStatus('action-needed');
      setMessage('Recipes has not confirmed this account’s owner vault. Keep this session signed in, restore vault access, then try again.');
      return;
    }
    const confirmedVaultId = vaultId;
    if (!confirmedVaultId) {
      setStatus('action-needed');
      setMessage('Recipes is still resolving the private owner vault. Keep this session signed in and try again after sync finishes.');
      return;
    }
    if (!online()) {
      setStatus('action-needed');
      setMessage('Reconnect before signing out so every pending recipe change can reach the cloud.');
      return;
    }
    if (await otherTabsOpenRef.current()) {
      setStatus('action-needed');
      setMessage('Close other open Recipes tabs, then sign out again so every private cache can be removed safely.');
      return;
    }

    setSigningOut(true);
    setStatus('syncing');
    setMessage('Finishing pending writes before removing this device’s private copy…');
    let authSessionEnded = false;
    try {
      await finishRecipesSafeSignOut({
        waitForPendingWrites: async () => {
          await store.flushLocalWrites();
          const drain = (async () => {
            do {
              await Promise.all([...pendingWritePromisesRef.current]);
              await waitForPendingWrites(recipesFirestore);
            } while (pendingWritesRef.current > 0 || pendingWritePromisesRef.current.size > 0);
          })();
          let timeoutId: number | undefined;
          const timeout = new Promise<never>((_, reject) => {
            timeoutId = window.setTimeout(() => reject(new Error(
              'Sync is taking longer than expected. Keep this tab open and try again after it shows Synced.',
            )), 20_000);
          });
          try {
            await Promise.race([drain, timeout]);
          } finally {
            window.clearTimeout(timeoutId);
          }
        },
        verifyLatestServerRevision: async () => {
          let cancelled = false;
          const trackFinalWrite = async (promise: Promise<unknown>, state: RecipesState): Promise<void> => {
            pendingWritesRef.current += 1;
            syncSafetyRef.current.beginWrite(state);
            try {
              await promise;
              syncSafetyRef.current.acknowledgeWrite(state);
            } catch (error) {
              syncSafetyRef.current.rejectWrite(state);
              throw error;
            } finally {
              pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
            }
          };
          const verify = async () => {
            for (let attempt = 0; attempt < 3; attempt += 1) {
              await store.flushLocalWrites();
              if (cancelled) return;
              const local = localStateRef.current;
              if (!local) throw new Error('Recipes could not read the latest local workspace. Keep this tab signed in and try again.');
              syncSafetyRef.current.noteLocalState(local);

              const before = await getDocFromServer(doc(recipesFirestore, RECIPES_VAULT_COLLECTION, confirmedVaultId));
              if (cancelled) return;
              let target = local;
              if (before.exists()) {
                const server = parseRecipesVaultDocument(before.data()).state;
                syncSafetyRef.current.acknowledgeServerState(server);
                const winner = selectNewerRecipesState(local, server);
                if (stableStringify(winner) === stableStringify(server) && stableStringify(server) !== stableStringify(local)) {
                  target = server;
                  localStateRef.current = server;
                  hasStoredLocalRef.current = true;
                  syncSafetyRef.current.noteLocalState(server);
                  store.applySyncedState(server);
                  await store.flushLocalWrites();
                  if (cancelled) return;
                }
              }

              await trackFinalWrite(
                setDoc(
                  doc(recipesFirestore, RECIPES_VAULT_COLLECTION, confirmedVaultId),
                  serializeRecipesVaultDocument(target) as unknown as DocumentData,
                ),
                target,
              );
              if (cancelled) return;
              await waitForPendingWrites(recipesFirestore);
              if (cancelled) return;

              const after = await getDocFromServer(doc(recipesFirestore, RECIPES_VAULT_COLLECTION, confirmedVaultId));
              if (cancelled) return;
              if (!after.exists()) {
                throw new Error('Recipes could not verify a cloud copy. Keep this tab signed in and try again after sync recovers.');
              }
              const confirmed = parseRecipesVaultDocument(after.data()).state;
              syncSafetyRef.current.acknowledgeServerState(confirmed);
              const latest = localStateRef.current;
              if (!latest) throw new Error('Recipes could not read the latest local workspace. Keep this tab signed in and try again.');
              syncSafetyRef.current.noteLocalState(latest);
              if (stableStringify(latest) !== stableStringify(target)) continue;
              if (stableStringify(confirmed) !== stableStringify(target)) {
                throw new Error('The cloud copy changed before sign-out could be confirmed. Keep this tab signed in, let Recipes sync, and try again.');
              }
              syncSafetyRef.current.markBootstrapConfirmed(confirmed);
              syncSafetyRef.current.assertLatestServerAcknowledged(latest);
              stopListenerRef.current();
              return;
            }
            throw new Error('Recipes kept changing during sign-out. Keep this tab signed in, wait for Synced, and try again.');
          };

          let timeoutId: number | undefined;
          const timeout = new Promise<never>((_, reject) => {
            timeoutId = window.setTimeout(() => reject(new Error(
              'Server confirmation is taking longer than expected. Keep this tab signed in and try again after Recipes shows Synced.',
            )), 20_000);
          });
          try {
            await Promise.race([verify(), timeout]);
          } finally {
            cancelled = true;
            window.clearTimeout(timeoutId);
          }
        },
        signOutAuth: async () => {
          const latest = localStateRef.current;
          if (!latest) throw new Error('Recipes could not read the latest local workspace. Keep this tab signed in and try again.');
          syncSafetyRef.current.assertLatestServerAcknowledged(latest);
          await firebaseSignOut(firebaseAuth);
          authSessionEnded = true;
        },
        clearLocalData: store.clearLocalData,
        clearFirestoreCache: async () => {
          await terminate(recipesFirestore);
          await clearIndexedDbPersistence(recipesFirestore);
        },
      });
      if (typeof window !== 'undefined') window.location.reload();
    } catch (error) {
      if (authSessionEnded) await store.clearLocalData().catch(() => undefined);
      setSigningOut(false);
      setStatus('action-needed');
      setMessage(authSessionEnded
        ? 'The account is signed out and local recipe data was removed, but the Firebase cache could not be fully released. Reload after closing other tabs.'
        : friendlySyncError(error));
    }
  }, [store.applySyncedState, store.clearLocalData, store.flushLocalWrites, vaultId]);

  return { status, user, vaultId, lastSyncedAt, message, signingOut, signIn, signOut };
}
