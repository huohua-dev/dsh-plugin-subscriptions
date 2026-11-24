/**
 * On-disk discovered-model-catalog cache at
 * `~/.dsh/plugins/subscriptions/models.json` — the durable half of each
 * provider's {@link ModelCatalogCache}. One entry per provider: the last
 * successfully discovered catalog with its fetch time, so capability metadata
 * (reasoning efforts) survives restarts and network failures.
 *
 * Unlike the auth store, this file is a cache: a missing, corrupt, or
 * malformed file silently reads as absent, because the next successful
 * discovery rewrites it. Loads are strictly validated — a malformed entry
 * passed through `resolveModel` would make the harness's metadata validation
 * throw on every call, which is worse than having no fallback at all.
 */
import type { ProviderId } from '../auth/store.js';
import type { CatalogPersistence, CatalogSnapshot } from './common.js';
/**
 * Absolute path of the catalog store file.
 * @returns `dshHomePath('plugins', 'subscriptions', 'models.json')`.
 */
export declare function modelsFilePath(): string;
/**
 * Validate one persisted snapshot. Strict: any malformed field drops the
 * whole snapshot rather than repairing it — the next successful discovery
 * rewrites the entry anyway.
 * @param value - the raw per-provider file entry.
 * @returns the validated snapshot, or undefined when unusable.
 */
export declare function sanitizeSnapshot(value: unknown): CatalogSnapshot | undefined;
/**
 * `rename` with a short bounded retry on share-mode conflicts. Exported for
 * the usage store, which writes its files the same way through an
 * injectable file system, hence `renameFn`.
 */
export declare function renameWithRetry(from: string, to: string, renameFn?: (from: string, to: string) => Promise<void>): Promise<void>;
/**
 * Wait for one catalog file's pending writes to settle. Stop discovery before
 * calling this for teardown; it does not cancel producers or retry failed writes.
 */
export declare function drainCatalogWrites(path: string): Promise<void>;
/**
 * Build the durable half of one provider's catalog cache over the shared
 * models.json file. Snapshot mutations are serialized across providers/accounts.
 * @param provider - the provider route keying the file entry.
 * @param path - store file path; defaults to {@link modelsFilePath}.
 * @returns the persistence hooks for {@link ModelCatalogCache}.
 */
export declare function catalogStore(provider: ProviderId, path?: string): CatalogPersistence;
/**
 * The durable half of one NON-default account's catalog cache. The provider
 * entry belongs to the default account; every other account keeps its own
 * snapshot under `accounts[provider][account]`, so a working secondary login
 * survives restarts and network failures even when the default login is dead.
 * @param provider - the provider route.
 * @param account - the canonical account key.
 * @param path - store file path; defaults to {@link modelsFilePath}.
 * @returns the persistence hooks for {@link ModelCatalogCache}.
 */
export declare function accountCatalogStore(provider: ProviderId, account: string, path?: string): CatalogPersistence;
