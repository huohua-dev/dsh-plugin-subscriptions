import type { ProviderUsage } from './common.js';
export interface ResetConfirmation {
    ticket: string;
    expiresAt: number;
    creditExpiresAt?: number;
    weeklyUsedPercent: number;
}
/** Manual-only redemption. Tickets are single-use; uncertain submissions park the account. */
export declare class ResetRedemption {
    private readonly read;
    private readonly consume;
    private readonly invalidate;
    /**
     * Told the exact instant a redemption is confirmed, so the usage window
     * tracker can split the account's windows there. Never
     * called for a rejected or uncertain outcome: those are left to the
     * tracker's early-reset detection. The caller reports its own
     * errors; any that escape are swallowed, since the credit is already
     * spent and the redemption must still succeed.
     */
    private readonly onRedeemed?;
    private tickets;
    private busy;
    private uncertain;
    constructor(read: (account: string, signal: AbortSignal) => Promise<ProviderUsage>, consume: (account: string, creditId: string, requestId: string, signal: AbortSignal) => Promise<void>, invalidate: (account: string) => void, 
    /**
     * Told the exact instant a redemption is confirmed, so the usage window
     * tracker can split the account's windows there. Never
     * called for a rejected or uncertain outcome: those are left to the
     * tracker's early-reset detection. The caller reports its own
     * errors; any that escape are swallowed, since the credit is already
     * spent and the redemption must still succeed.
     */
    onRedeemed?: ((account: string, at: number) => void) | undefined);
    private eligible;
    prepare(account: string, signal: AbortSignal): Promise<ResetConfirmation>;
    redeem(account: string, ticket: string, signal: AbortSignal): Promise<void>;
}
