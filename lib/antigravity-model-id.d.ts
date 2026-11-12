/** Only concrete, explicit effort suffixes establish an Antigravity model family. */
export declare function antigravityModelId(id: string): string;
/** Quota scopes retain concrete upstream ids; selectors use the family id. */
export declare function sameAntigravityModel(left: string | undefined, right: string | undefined): boolean;
export declare const ANTIGRAVITY_QUOTA_SCOPES: readonly ["Gemini Models", "Claude and GPT models", "Gemini 4 Argon"];
export type AntigravityQuotaScope = typeof ANTIGRAVITY_QUOTA_SCOPES[number];
/** Summary labels are account-wide quota families, not model IDs. */
export declare function antigravityQuotaScope(value: string | undefined): AntigravityQuotaScope | undefined;
export declare function antigravityQuotaApplies(scope: string | undefined, model: string | undefined): boolean;
