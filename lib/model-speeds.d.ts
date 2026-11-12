import type { SpeedTier } from './auth/rpc.js';
/** Per-model composer preferences; publish changes only after the atomic save. */
export declare class ModelSpeeds {
    private readonly path;
    private current;
    private writes;
    constructor(path?: string);
    get(model: string): SpeedTier | undefined;
    set(model: string, tier: SpeedTier): Promise<void>;
}
