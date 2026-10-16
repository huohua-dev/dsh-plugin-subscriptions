/** Stored proxy configuration (the proxy.json shape). */
export interface ProxyConfig {
    /** Whether outbound subscription requests route through {@link url}. */
    enabled: boolean;
    /** Proxy origin: `http://host:port`, `https://host:port` or `socks5://host:port`. */
    url: string;
    /** Optional proxy user for basic auth. */
    username?: string;
    /** Optional proxy password for basic auth; never sent back to the client. */
    password?: string;
    /** Hostnames (exact, suffix, or `*.example.com`) that use host routing instead. */
    bypass: string[];
}
/** The proxy config as served to the client: secrets replaced by a flag. */
export interface ProxyConfigView {
    enabled: boolean;
    url: string;
    username?: string;
    /** Whether a password is stored (the password itself never leaves the host). */
    passwordSet: boolean;
    bypass: string[];
    /** Last load/apply failure, when the stored config is unusable. */
    error?: string;
}
/** One `proxySet` payload. */
export interface ProxyInput {
    enabled: boolean;
    url: string;
    username?: string;
    /** `undefined` keeps the stored password, `null`/`''` clears it. */
    password?: string | null;
    bypass?: string[];
}
/** One `proxyTest` result. */
export interface ProxyTestResult {
    /** Whether the destination answered with an HTTP status. */
    ok: boolean;
    /** Whether the plugin proxy was used; false means host routing, not necessarily direct. */
    viaProxy: boolean;
    /** Status of the answered request, when one was received. */
    status?: number;
    /** Round-trip latency in milliseconds. */
    latencyMs?: number;
    /** Failure message, when no response was received. */
    error?: string;
}
/** A draft proxy for one test probe (never persisted). */
export interface ProxyDraft {
    url: string;
    username?: string;
    password?: string;
}
/** Destination the `proxyTest` endpoint probes when none is given. */
export declare const DEFAULT_PROXY_TEST_URL = "https://api.x.ai/v1/models";
/** Probe deadline; a hung proxy must not pin the Settings dialog forever. */
export declare const DEFAULT_PROXY_TEST_TIMEOUT_MS = 15000;
/**
 * Minimum per-address connect attempt budget for Node's Happy Eyeballs
 * (`net.autoSelectFamilyAttemptTimeout`). Node's default is 250ms, which is
 * shorter than one TCP handshake to Cloudflare-fronted hosts (registry.npmjs.org,
 * chatgpt.com) on a high-latency link: every address then fails with
 * ETIMEDOUT and the whole fetch dies even though curl succeeds.
 */
export declare const MIN_CONNECT_ATTEMPT_TIMEOUT_MS = 1500;
/**
 * Raise the process-wide Happy Eyeballs attempt timeout to at least `minMs`.
 * Never lowers a host-configured value. The setting is per process (there is
 * no per-dispatcher knob that survives the host's global dispatcher), so the
 * plugin restores the previous value on dispose.
 * @param minMs - the floor to enforce.
 * @returns the value in effect before the call.
 */
export declare function ensureConnectAttemptTimeout(minMs?: number): number;
/** Restore a value captured by {@link ensureConnectAttemptTimeout}. */
export declare function restoreConnectAttemptTimeout(previous: number): void;
/** Absolute path of the proxy config file. */
export declare function proxyFilePath(): string;
/**
 * Flatten a fetch failure into a readable message: undici wraps the true
 * cause (`connect ECONNREFUSED ...`) behind a bare "fetch failed", so walk
 * the cause chain and append each distinct layer (up to four, cycle-safe).
 * A hostname resolving to several addresses (e.g. `localhost` → ::1 and
 * 127.0.0.1) fails as an `AggregateError` with an empty message, so its
 * per-address `errors` entries are folded in too.
 */
export declare function describeFetchError(error: unknown): string;
/** Whether one parsed proxy URL speaks SOCKS5 rather than HTTP CONNECT. */
export declare function isSocksProxy(url: URL): boolean;
/**
 * Parse and validate a proxy URL. An HTTP(S) proxy speaks CONNECT; a SOCKS5
 * one gets a tunneled dispatcher. Anything else (e.g. `socks4://`) is rejected
 * with a message naming the schemes that do work.
 * @param raw - the URL the user configured.
 * @returns the parsed URL (credentials attached by the caller).
 */
export declare function parseProxyUrl(raw: string): URL;
/**
 * Whether a request hostname bypasses the proxy.
 * @param hostname - the request's hostname.
 * @param entries - configured bypass entries: exact host, plain suffix
 *   (`example.com` also matches `api.example.com`), or `*.example.com`.
 */
export declare function matchesBypass(hostname: string, entries: readonly string[]): boolean;
/**
 * Current proxy config as served to the client (secrets omitted).
 * @returns the view; {@link ProxyConfigView.error} carries the last
 *   load/apply failure when the stored config is unusable.
 */
export declare function proxyGetConfig(): Promise<ProxyConfigView>;
/**
 * Validate, persist, and apply one proxy config. A `password` of `undefined`
 * keeps the stored value; `null` or `''` clears it.
 * @param input - the client's payload.
 * @returns the resulting view (secrets omitted).
 */
export declare function proxySetConfig(input: ProxyInput): Promise<ProxyConfigView>;
/** The account a request belongs to; set by the routing layer, read here. */
export interface AccountRoute {
    provider: string;
    account: string;
}
/** Per-account proxy URLs, read live from the provider settings store. */
type AccountProxyResolver = (provider: string, account: string) => string | undefined;
/**
 * Point the per-account route at the saved provider settings. Passing
 * `undefined` detaches the lookup (the resolver then reports "no proxy").
 * @param resolver - reads one account's configured proxy URL.
 */
export declare function setAccountProxyResolver(resolver: AccountProxyResolver | undefined): void;
/**
 * Close and forget every per-account dispatcher. Called when settings change
 * so a saved URL takes effect on the next request instead of waiting for the
 * cached agent to age out.
 */
export declare function invalidateAccountProxies(): Promise<void>;
/**
 * Run `body` with `route` marked as the current account. Fetches made in that
 * async context — including ones started by awaited callbacks — use that
 * account's proxy.
 * @param route - the serving account.
 * @param body - the work to run.
 * @returns whatever `body` returns.
 */
export declare function runWithAccountProxy<T>(route: AccountRoute, body: () => T): T;
/**
 * Walk an account's async iterable inside its proxy context. The context is
 * re-entered for every step, because a generator's body first runs on the
 * consumer's `next()` call — long after `runWithAccountProxy` returned.
 * @param route - the serving account.
 * @param source - the account's own stream.
 * @returns the same chunks, in order, routed through the account's proxy.
 */
export declare function withAccountProxy<T>(route: AccountRoute, source: AsyncIterable<T>): AsyncIterable<T>;
/** What one {@link runAccountProxyProbe} call did. */
export interface AccountProxyProbeOutcome<T> {
    /** Whether `body` completed; {@link error} carries the reason when it did not. */
    ok: boolean;
    /** Whether the probe's requests went through an account proxy at all. */
    viaProxy: boolean;
    /** The body's value, when it completed. */
    value?: T;
    /** Failure message; a transport failure keeps undici's cause chain. */
    error?: string;
}
/**
 * Run one account probe with the proxy URL its Settings card currently shows,
 * without saving it and without disturbing live routing.
 *
 * The probe gets its own throwaway dispatcher (closed when the call ends) and
 * never touches the per-account dispatcher cache, so a URL that only exists in
 * the dialog cannot leak into the account's real traffic. `url` undefined uses
 * the account's saved proxy like any other account request; an empty string
 * forces "no account proxy", which then follows the plugin-wide config.
 * @param route - the probed account.
 * @param url - the draft proxy URL, `''` for none, or undefined for the saved one.
 * @param body - the probe; the fetches it awaits inherit the forced route.
 * @returns the probe's outcome; failures are reported, never thrown.
 */
export declare function runAccountProxyProbe<T>(route: AccountRoute, url: string | undefined, body: () => Promise<T>): Promise<AccountProxyProbeOutcome<T>>;
/**
 * The fetch caller all subscription code uses. An account-scoped request goes
 * through that account's own proxy when one is configured (the plugin-wide
 * bypass list does not apply to it — the account's proxy is an explicit choice);
 * everything else follows the plugin-wide config, and identity-passthrough
 * means host routing, which may still be an environment-configured proxy.
 *
 * Dispatched requests run on undici's own fetch (not the global one) so the
 * dispatcher always comes from the same undici build the request is issued
 * with — a mismatched dispatcher can be silently ignored by the host's global
 * fetch.
 *
 * A {@link runAccountProxyProbe} scope replaces the per-account branch above
 * with its own throwaway proxy (or with none), so a probe can test an unsaved
 * account proxy without changing what live traffic does.
 */
export declare function proxiedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
/**
 * Probe a destination through a proxy, answering with the HTTP status or a
 * flattened transport error. The probe uses `draft` when given (the dialog's
 * current inputs, without saving) and the stored config otherwise.
 * @param target - `http(s)` URL to fetch; defaults to {@link DEFAULT_PROXY_TEST_URL}.
 * @param draft - unsaved proxy inputs to test; absent means the stored config.
 * @returns the result; any HTTP status counts as a successful connection,
 *   only a transport failure is an error.
 */
export declare function proxyTestConnection(target?: string, draft?: ProxyDraft): Promise<ProxyTestResult>;
export {};
