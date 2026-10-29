import { type ProviderId } from './auth/store.js';
export declare const PROVIDER_TOOLS: {
    readonly codex: readonly ["image_generate", "web_search"];
    readonly claude: readonly [];
    readonly grok: readonly ["image_generate", "video_generate", "x_search"];
    readonly copilot: readonly [];
    readonly antigravity: readonly [];
    readonly muse: readonly [];
};
export type SubscriptionTool = 'image_generate' | 'video_generate' | 'x_search' | 'web_search';
/** Mirrors `PromptCacheTtl` in translate/anthropic.ts; kept here so the client bundle needs no translate import. */
export declare const PROMPT_CACHE_TTLS: readonly ["5m", "1h"];
export type PromptCacheTtlSetting = typeof PROMPT_CACHE_TTLS[number];
export type SubagentSpeedTier = 'standard' | 'fast';
export interface AccountPreferences {
    alias?: string;
    /** Absent means included. */
    poolEnabled?: boolean;
    /** Absent means no separate picker entries. */
    independentEntry?: boolean;
    /** Absent allows every model; [] allows none. */
    poolModels?: string[];
    /**
     * One proxy URL used by every request this account makes: `socks5://`,
     * `socks5h://`, `http://` or `https://`, credentials optional and kept in
     * clear text (`socks5://user:pass@proxy.example:1080`). Absent means the
     * account follows the plugin-wide proxy.
     */
    proxy?: string;
}
export interface ProviderPreferences {
    /** Presentation only; never used as a provider or model routing key. */
    displayName?: string;
    modelDisplayNames?: Record<string, string>;
    accounts?: Record<string, AccountPreferences>;
    /** Absent follows discovery; an explicit selection hides newly discovered models. */
    visibleModels?: string[];
    contextWindows?: Record<string, number>;
    /** Codex only: per-model defaults for subagents, independent of main-session speed. */
    subagentSpeeds?: Record<string, SubagentSpeedTier>;
    tools?: Partial<Record<SubscriptionTool, boolean>>;
    /** Claude only: overrides the plugin config's `claudePromptCacheTtl`; absent follows config. */
    promptCacheTtl?: PromptCacheTtlSetting;
}
export declare function validatePreferences(provider: ProviderId, input: unknown): ProviderPreferences;
/** Durable user preferences, independent of expiring discovery caches. */
export declare class ProviderSettingsStore {
    private current;
    private writes;
    readonly path: string;
    constructor(path?: string);
    get(provider: ProviderId): ProviderPreferences;
    visible(provider: ProviderId, model: string): boolean;
    modelName(provider: ProviderId, model: string, fallback: string): string;
    contextWindow(model: string): number | undefined;
    /** Read on every request so saved changes apply to the next subagent request. */
    subagentSpeed(model: string): SubagentSpeedTier;
    /** The Settings-page Claude cache TTL; undefined follows the plugin config. Read per request, so no clone. */
    promptCacheTtl(): PromptCacheTtlSetting | undefined;
    /**
     * One account's own proxy URL; undefined when the account follows the
     * plugin-wide proxy. Read on every request that account makes, so no clone.
     * @param provider - the subscription the account belongs to.
     * @param account - the account key.
     * @returns the configured URL, or undefined.
     */
    accountProxy(provider: ProviderId, account: string): string | undefined;
    /** Creation-time policy survives restarts and never changes an existing session. */
    toolEnabled(provider: ProviderId, tool: SubscriptionTool, createdAt?: number): boolean;
    set(provider: ProviderId, input: unknown): Promise<void>;
}
