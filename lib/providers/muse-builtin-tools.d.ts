/**
 * The builtin tool declarations Muse Code 1.4.14 sends on every request to
 * `api.meta.ai/v1/responses`.
 *
 * Meta's gateway refuses subscription-billed keys with
 * `403 client_attestation_denied` ("this request does not carry Muse Code's
 * builtin tool declarations") once a request declares more than a handful of
 * tools, so a third-party client using the subscription must send this `muse`
 * namespace declaration verbatim alongside its own tools. The gateway checks
 * the namespace's name and its individual builtin entries: renaming the
 * namespace or declaring non-builtin entries inside it is rejected, while a
 * subset of the builtin entries is accepted.
 *
 * Extracted from a headless Muse Code 1.4.14 request (`muse exec` pointed at a
 * logging reverse proxy): the single entry of the wire body's `tools` array,
 * byte-for-byte. Re-extract after a Muse Code release that changes its tools.
 */
/** One entry of the Muse Code builtin tool declaration (namespace or function). */
export interface MuseBuiltinTool {
    type: string;
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
    tools?: MuseBuiltinTool[];
    strict?: boolean;
}
/** Muse Code's single top-level `muse` namespace tool, verbatim. */
export declare const MUSE_BUILTIN_TOOL_NAMESPACE: MuseBuiltinTool;
/** Names of the builtin subtools inside the `muse` namespace, in wire order. */
export declare const MUSE_BUILTIN_TOOL_NAMES: readonly string[];
/**
 * Model-facing note appended to `instructions` whenever the attestation
 * namespace rides along. The namespace carries no executable runtime on this
 * route, so the model must keep using the client's own top-level tools.
 */
export declare const MUSE_ATTESTATION_NOTICE: string;
