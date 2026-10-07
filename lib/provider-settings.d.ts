import { type ProviderId } from './auth/store.js';
export declare const PROVIDER_TOOLS: {
    readonly codex: readonly ["image_generate", "web_search"];
    readonly claude: readonly [];
    readonly grok: readonly ["image_generate", "video_generate", "x_search"];
    readonly copilot: readonly [];
    readonly antigravity: readonly [];
};
export type SubscriptionTool = 'image_generate' | 'video_generate' | 'x_search' | 'web_search';
export interface AccountPreferences {
    alias?: string;
    /** Absent means included. */
    poolEnabled?: boolean;
    /** Absent means no separate picker entries. */
    independentEntry?: boolean;
    /** Absent allows every model; [] allows none. */
    poolModels?: string[];
}
export interface ProviderPreferences {
    accounts?: Record<string, AccountPreferences>;
    /** Absent follows discovery; an explicit selection hides newly discovered models. */
    visibleModels?: string[];
    contextWindows?: Record<string, number>;
    tools?: Partial<Record<SubscriptionTool, boolean>>;
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
    contextWindow(model: string): number | undefined;
    /** Creation-time policy survives restarts and never changes an existing session. */
    toolEnabled(provider: ProviderId, tool: SubscriptionTool, createdAt?: number): boolean;
    set(provider: ProviderId, input: unknown): Promise<void>;
}
