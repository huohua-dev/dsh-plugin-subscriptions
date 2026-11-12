import type { DiscoveredModel } from './common.js';
declare const EFFORTS: readonly ["low", "medium", "high"];
type Effort = typeof EFFORTS[number];
export interface AntigravityModelGroup extends DiscoveredModel {
    variants?: Partial<Record<Effort, DiscoveredModel>>;
}
/** Internal completion routes and retired/non-chat ids observed in upstream PR #165. */
export declare function isAntigravityChatModel(id: string): boolean;
/** Keep unknown ids distinct; tieredModelIds keys are categories, not model identities. */
export declare function groupAntigravityModels(models: readonly DiscoveredModel[]): AntigravityModelGroup[];
/** Resolve only variants advertised by this account. Old concrete ids remain callable. */
export declare function selectAntigravityVariant(group: AntigravityModelGroup, effort?: string): DiscoveredModel;
export {};
