window.__ModuleLoader__.load({ id: "dsh-plugin-subscriptions", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
//#region rolldown:runtime
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));

//#endregion
let react = require("react");
react = __toESM(react);
let react_jsx_runtime = require("react/jsx-runtime");
react_jsx_runtime = __toESM(react_jsx_runtime);
let __deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
__deepseek_ai_dsh_client_ui_primitives = __toESM(__deepseek_ai_dsh_client_ui_primitives);
let react_dom = require("react-dom");
react_dom = __toESM(react_dom);

//#region src/client/quota-display.tsx
/** Never coerce null, missing or non-finite telemetry into a full allowance. */
function quotaPercent(used, mode) {
	if (typeof used !== "number" || !Number.isFinite(used)) return void 0;
	const percent = Math.min(100, Math.max(0, used));
	return Math.round(mode === "remaining" ? 100 - percent : percent);
}
/** Group a reported credit balance without inventing a currency conversion. */
function formatCreditBalance(value) {
	const amount = Number(value);
	if (!Number.isFinite(amount)) return value;
	const negative = amount < 0;
	const [whole, fraction] = Math.abs(amount).toFixed(2).split(".");
	const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	const text = fraction === "00" ? grouped : `${grouped}.${fraction.replace(/0$/, "")}`;
	return negative ? `-${text}` : text;
}
/** Display line for a disclosed positive Codex credit balance; undefined when absent or non-positive. */
function creditBalanceText(credits, t) {
	if (credits === void 0) return void 0;
	if (credits.overageLimitReached === true) return t("creditsOverage");
	if (credits.unlimited) return t("creditsUnlimited");
	if (credits.balance !== void 0) {
		const amount = Number(credits.balance);
		return Number.isFinite(amount) && amount > 0 ? t("creditsBalance", { balance: formatCreditBalance(credits.balance) }) : void 0;
	}
	return credits.hasCredits ? t("creditsAvailableUnknown") : void 0;
}
function quotaText(used, mode, t) {
	const percent = quotaPercent(used, mode);
	return percent === void 0 ? t("quotaUnknown") : t(mode === "remaining" ? "quotaRemainingPercent" : "quotaUsedPercent", { percent });
}
function quotaIsStale(usage, now = Date.now()) {
	return usage.stale === true || usage.refreshFailed === true || validTimestamp(usage.staleAt) && now >= usage.staleAt;
}
/** Ticks only the local presentation clock; never fetches usage. */
function useQuotaClock() {
	const [now, setNow] = (0, react.useState)(Date.now);
	(0, react.useEffect)(() => {
		const timer = setInterval(() => setNow(Date.now()), 3e4);
		return () => clearInterval(timer);
	}, []);
	return now;
}
/** Availability is separate from the age of an existing quota snapshot. */
function quotaUnavailableText(usage, failed, t) {
	if (usage?.supported === false) return t("quotaUnsupported");
	if (usage?.windows?.length) return void 0;
	if (failed || usage?.refreshFailed) return t("quotaFailedNoData");
	return t("usageEmpty");
}
function validTimestamp(value) {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 && !Number.isNaN(new Date(value).getTime());
}
/** Receipt time is diagnostic only: a successful RPC can still return an old cache. */
function usageFreshnessText(usage, failed, t, now = Date.now()) {
	const unavailable = quotaUnavailableText(usage, failed, t);
	if (unavailable !== void 0) return unavailable;
	const snapshot = usage;
	const time = validTimestamp(snapshot.fetchedAt) ? t("quotaFetchedAt", { date: new Date(snapshot.fetchedAt).toLocaleString() }) : validTimestamp(snapshot.receivedAt) ? t("quotaReceivedAt", { date: new Date(snapshot.receivedAt).toLocaleString() }) : t("quotaUpdateTimeMissing");
	return [
		failed || snapshot.refreshFailed ? t("quotaRefreshFailed") : quotaIsStale(snapshot, now) ? t("quotaStale") : void 0,
		time,
		validTimestamp(snapshot.retryAt) ? t("quotaRetryAt", { date: new Date(snapshot.retryAt).toLocaleString() }) : void 0
	].filter(Boolean).join(" · ");
}
function UsageFreshness({ usage, failed = false, t }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
		style: {
			margin: "4px 0",
			fontSize: 12,
			color: "var(--dsw-alias-label-tertiary)"
		},
		children: usageFreshnessText(usage, failed, t, useQuotaClock())
	});
}

//#endregion
//#region src/client/usage-badge-preferences.ts
const MODE_KEY = "dsh.subscriptions.usageBadgeMode";
const MODE_EVENT = "dsh:subscriptions:usage-badge-mode";
/** Read the browser preference; blocked storage retains the default display. */
function readUsageBadgeMode() {
	if (typeof window === "undefined") return "recent";
	try {
		return window.localStorage.getItem(MODE_KEY) === "hidden" ? "hidden" : "recent";
	} catch (error) {
		if (!(error instanceof DOMException) || error.name !== "SecurityError") throw error;
		return "recent";
	}
}
/** Save first, then notify; the settings control reports a rejected write. */
function setUsageBadgeMode(mode) {
	if (mode !== "recent" && mode !== "hidden") throw new TypeError("Invalid subscription usage display mode");
	window.localStorage.setItem(MODE_KEY, mode);
	window.dispatchEvent(new Event(MODE_EVENT));
}
/** Same-tab writes need a custom event; other tabs use the storage event. */
function subscribeUsageBadgeMode(notify) {
	const onStorage = (event) => {
		if (event.key === MODE_KEY || event.key === null) notify();
	};
	window.addEventListener(MODE_EVENT, notify);
	window.addEventListener("storage", onStorage);
	return () => {
		window.removeEventListener(MODE_EVENT, notify);
		window.removeEventListener("storage", onStorage);
	};
}
/** Shared React snapshot used by the settings control and every mounted badge. */
function useUsageBadgeMode() {
	return (0, react.useSyncExternalStore)(subscribeUsageBadgeMode, readUsageBadgeMode, () => "recent");
}
const QUOTA_KEY = "dsh.subscriptions.quotaDisplayMode";
const QUOTA_EVENT = "dsh:subscriptions:quota-display-mode";
/** Read the browser preference; blocked storage retains the default display. */
function readQuotaDisplayMode() {
	if (typeof window === "undefined") return "used";
	try {
		return window.localStorage.getItem(QUOTA_KEY) === "remaining" ? "remaining" : "used";
	} catch (error) {
		if (!(error instanceof DOMException) || error.name !== "SecurityError") throw error;
		return "used";
	}
}
/** Save first, then notify; the settings control reports a rejected write. */
function setQuotaDisplayMode(mode) {
	if (mode !== "used" && mode !== "remaining") throw new TypeError("Invalid subscription usage display mode");
	window.localStorage.setItem(QUOTA_KEY, mode);
	window.dispatchEvent(new Event(QUOTA_EVENT));
}
/** Same-tab writes need a custom event; other tabs use the storage event. */
function subscribeQuotaDisplayMode(notify) {
	const onStorage = (event) => {
		if (event.key === QUOTA_KEY || event.key === null) notify();
	};
	window.addEventListener(QUOTA_EVENT, notify);
	window.addEventListener("storage", onStorage);
	return () => {
		window.removeEventListener(QUOTA_EVENT, notify);
		window.removeEventListener("storage", onStorage);
	};
}
/** Shared React snapshot used by the settings control and every mounted badge. */
function useQuotaDisplayMode() {
	return (0, react.useSyncExternalStore)(subscribeQuotaDisplayMode, readQuotaDisplayMode, () => "used");
}

//#endregion
//#region src/client/usage-cache.ts
const caches = /* @__PURE__ */ new WeakMap();
function cache(rpc) {
	let value = caches.get(rpc);
	if (!value) {
		value = {
			values: /* @__PURE__ */ new Map(),
			listeners: /* @__PURE__ */ new Set()
		};
		caches.set(rpc, value);
	}
	return value;
}
function readUsageCache(rpc, key) {
	return cache(rpc).values.get(key);
}
function publishUsage(rpc, key, usage) {
	const state = cache(rpc);
	state.values.set(key, usage);
	for (const listener of state.listeners) listener(key, usage);
}
function failUsage(rpc, key) {
	const previous = readUsageCache(rpc, key);
	if (previous) publishUsage(rpc, key, {
		...previous,
		stale: true,
		refreshFailed: true
	});
}
function subscribeUsage(rpc, listener) {
	cache(rpc).listeners.add(listener);
	return () => {
		cache(rpc).listeners.delete(listener);
	};
}
/** Called after a status read so logout cannot leave recoverable account history. */
function retainUsageAccounts(rpc, live) {
	for (const key of cache(rpc).values.keys()) if (!live.has(key)) cache(rpc).values.delete(key);
}

//#endregion
//#region src/client/locales.ts
/** Copy dictionaries for the Subscriptions settings section. */
/** English strings (the key-set source of truth for this pair). */
const en = {
	accountsManage: "Manage",
	accountsTitle: "Manage {provider}",
	subscriptionDisplayName: "Subscription display name",
	subscriptionDisplayNameHint: "Used in the quota bar and subscription headings. Leave blank for the default.",
	modelDisplayName: "Model display name",
	modelDisplayNameHint: "Leave blank for the original name. Reasoning effort stays separate.",
	displayNameReset: "Restore default",
	codexModelDefaults: "Model defaults",
	codexGlobalContext: "Global local context window (tokens)",
	codexGlobalContextHint: "Optional Codex-wide default for local history and compaction. Model-specific settings take precedence; the account’s reported maximum still applies. Leave blank to use existing model and provider defaults.",
	codexOutputReserve: "Global output reserve (tokens)",
	codexOutputReserveHint: "Optional Codex-wide default reservation for local context budgeting; model-specific settings take precedence. Leave blank for existing defaults. This is not an API response limit.",
	codexContextDefault: "Use model default",
	codexBudgetDefault: "Use existing default: {value}",
	codexBudgetInvalid: "Enter a positive whole number within the safe integer range, or leave blank.",
	claudePromptCacheTtl: "Prompt cache lifetime",
	claudePromptCacheTtlHint: "How long Anthropic keeps the conversation cache after its last use. Cache reads cost the same either way; a one-hour cache write costs 2× base input instead of 1.25×. Applies from the next turn.",
	claudePromptCacheTtlDefault: "Follow config ({ttl})",
	claudePromptCacheTtl5m: "5 minutes",
	claudePromptCacheTtl1h: "1 hour",
	accountsHint: "Choose which accounts serve pooled LLM requests. Pool exclusion applies only to LLM routing, not tools or session-wide isolation.",
	accountsTabs: "Connected accounts",
	scrollProvidersLeft: "Scroll providers left",
	scrollProvidersRight: "Scroll providers right",
	scrollAccountsLeft: "Scroll accounts left",
	scrollAccountsRight: "Scroll accounts right",
	accountsLoading: "Loading accounts…",
	accountsLoadFailed: "Could not load account settings: {message}",
	accountsSaveFailed: "Could not save changes: {message}",
	accountsEmpty: "No connected accounts. Add an account on the provider card first.",
	accountsAlias: "Alias (optional)",
	accountsPoolEnabled: "Include in the LLM account pool",
	accountsIndependent: "Show an independent entry in the model picker",
	accountsIndependentHint: "Independent LLM routes use only this account, with no fallback to another account. This does not isolate tools or the whole session.",
	accountsProxy: "Proxy (optional)",
	accountsProxyPlaceholder: "socks5://user:pass@proxy.example:1080",
	accountsProxyHint: "Every request of this account leaves through this proxy: model calls, token refresh, quota lookups and model discovery. SOCKS5 or HTTP, with credentials written in the URL. Leave blank to follow the global proxy setting.",
	accountsProbe: "Test model fetch",
	accountsProbeRunning: "Testing…",
	accountsProbeHint: "Fetches this account’s model list once through the proxy above — the value as typed, saving is not required — and reports what came back. Saved model lists stay untouched.",
	accountsProbeOk: "Fetched {count} model(s) · {ms} ms · through the account proxy",
	accountsProbeOkDirect: "Fetched {count} model(s) · {ms} ms · through DSH network settings",
	accountsProbeFail: "Failed: {message}",
	accountsProbeModels: "Models: {models}",
	accountsModels: "Pool model allowlist",
	accountsModelsAll: "All models",
	accountsModelsCount: "{count} selected",
	accountsModelsHint: "Applies only to pooled LLM routing, not independent entries. An empty selection allows no models. Turning off pool participation keeps this selection for later.",
	accountsModelsAutomatic: "Allow all models, including future models",
	accountsNoModels: "No models reported for this account.",
	accountsCatalogUnavailable: "Model discovery is currently unavailable. Saved model selections are preserved.",
	modelsPartialSave: "Some reasoning defaults were saved. Remaining changes are still in the draft; retry to finish.",
	modelsEdit: "Edit model list",
	modelsExpand: "Expand",
	modelsCollapse: "Collapse",
	modelsHint: "Configure model visibility, default reasoning effort, subagent speed, context and tools here; Save changes below submits them together with the account settings. Hidden models remain usable by existing sessions; tool changes apply to new sessions.",
	modelsAutomatic: "Automatically show all models, including new models",
	modelsSelectAll: "Select all",
	modelsSelectNone: "Clear selection",
	modelsContext: "Context (tokens)",
	modelsContextBounds: "Default {default} · Maximum {max}",
	modelsCodexContextBounds: "Default {default} · Standard {standard} · Maximum {max}",
	modelsGlobalContextBounds: "Global default {default} · Standard {standard} · Maximum {max}",
	modelsContextHint: "Windows count input plus reserved output. Leave blank to inherit the global window or, if unset, the account’s advertised maximum. Requests above the standard window may use more of your plan’s quota. Overrides are capped by the account’s maximum; account pools use the smallest member window. This controls local history and compaction, not the API’s capacity.",
	modelsContextWindow: "Context window",
	modelsContextFollow: "Follow provider ({default})",
	modelsContextUnavailableOption: "{value} (not offered now)",
	modelsContextGrokHint: "Tiers come from the provider’s live model catalog and stay capped at the advertised maximum. A larger window raises the local history budget and delays compaction; the provider decides actual capacity and billing. New sessions pick it up right away; existing sessions update on the next message.",
	modelsContextInvalid: "Enter a positive whole number of tokens for {model}.",
	modelsSubagentSpeed: "Subagent default speed",
	modelsSubagentSpeedHint: "Applies to subsequent subagent requests using this model, regardless of the parent model. Main conversations keep their own Speed setting. Fast requires model support.",
	modelsTools: "Provider tools",
	modelsToolsHint: "Changes apply only to sessions created after saving. Existing sessions keep their tools. Shared tools remain available if any supporting provider is enabled.",
	modelsImage: "Image generation",
	modelsVideo: "Video generation",
	modelsSearch: "X search",
	modelsWebSearch: "Web search",
	modelsSave: "Save changes",
	modelsUnavailable: "Currently unavailable",
	nav: "Subscriptions",
	providerTabs: "Subscription providers",
	intro: "Log a subscription provider in or out. Login opens the provider’s authorization page in a new tab; headless setups can paste the callback URL or code instead.",
	unavailable: "Connection unavailable; subscription status cannot be loaded.",
	checking: "Checking…",
	loginInProgress: "Login in progress…",
	notLoggedIn: "Not logged in",
	loggedInCount: "{count} account(s) connected",
	antigravityDisabledStatus: "Disabled (off by default)",
	antigravitySavedAccounts: "{count} saved account(s) kept locally; enable to view usage or manage them.",
	antigravityNoticeTitle: "Google Antigravity is disabled by default",
	antigravityNoticeBody: "Google Antigravity is off by default. Accessing Google’s private endpoints carries a risk of account suspension, and Google may reject DSH chat requests with HTTP 429. You can check account usage after opting in, but model requests are not guaranteed to work.",
	antigravityEnable: "Enable manually",
	antigravityDisable: "Disable",
	antigravityEnableConfirmTitle: "Confirm enabling Google Antigravity",
	antigravityEnableConfirmBody: "Enabling this provider resumes requests to Google Antigravity endpoints. This can lead to account restrictions or suspension, and Google may still reject model requests.",
	antigravityEnableAcknowledge: "I understand the suspension risk and that model requests may still fail after enabling.",
	antigravityEnableConfirm: "Enable anyway",
	clientVersion: "CLI {version} · {source}",
	clientVersionNpm: "latest on npm",
	clientVersionLocal: "local CLI",
	clientVersionFallback: "built-in",
	clientVersionConfig: "configured",
	clientVersionHint: "Requests present this CLI version, and newer models may require a recent one. It is the latest release on npm, or the local CLI / built-in version while npm is unreachable. Refreshing the model list checks again.",
	accountExpires: "expires {date}",
	defaultBadge: "Default",
	setDefault: "Set as default",
	addAccount: "Add account",
	addAccountOAuth: "Browser authorization",
	addAccountKeychain: "Import Claude Code",
	addAccountHint: "Browser authorization signs in whichever account the browser currently uses — switch accounts there first (or use an incognito window with the manual code below) to add a different one.",
	login: "Log in",
	cancel: "Cancel",
	logout: "Log out",
	logoutAccountConfirm: "Log out {account} of {provider}?",
	manualSummary: "Browser flow not working? Paste the callback URL or code",
	manualPlaceholder: "Paste the callback URL or code",
	submit: "Submit",
	loginMissingUrl: "login answered without an authorizeUrl",
	deviceCodePrompt: "Enter this code on the GitHub verification page:",
	deviceCodeCopy: "Copy code",
	deviceCodeCopied: "Copied",
	deviceCodeOpenPage: "Open GitHub verification page",
	museDeviceCodePrompt: "Open the Meta sign-in page and confirm it shows this code:",
	museDeviceCodeOpenPage: "Open Meta sign-in page",
	usageOpen: "Usage",
	usageDialogTitle: "{provider} usage",
	usageAccount: "Account",
	usageAccountLoggedOut: "{account} · Logged out",
	usageKind: "Window",
	usageMonthly: "Monthly",
	usageNotObservedYet: "Not observed yet",
	usagePrevious: "Previous",
	usageNext: "Next",
	usageRange: "{start} – {end}",
	usageRangeOpen: "From {start}",
	usageCurrentWindow: "Current window",
	usageViewLoading: "Loading usage…",
	usageViewFailed: "Could not load usage: {message}",
	usageRetry: "Retry",
	usageTokens: "{count} tokens",
	usageTotalTokens: "Total: {count} tokens",
	usageTokenBuckets: "Input {input} · Output {output} · Cache read {read} · Cache write {write}",
	usageDailyUtc: "By day within this window (UTC)",
	usageReasoningTokens: "{count} reasoning tokens, included in output",
	usageMarkerWindow0TrackingStart: "Window 0: since tracking started, before the first observed quota window",
	usageMarkerWindow0Cleared: "Window 0: since history was cleared, before the first observed quota window",
	usageMarkerWindow0Pending: "Window 0: since tracking started — quota windows not observed yet",
	usageMarkerSinceFirstObserved: "Since the first observed quota window",
	usageMarkerSinceTracking: "Since per-account tracking started",
	usageMarkerSinceCleared: "Since history was cleared",
	usageMarkerEndedEarly: "Ended early",
	usageMarkerEndedEarlyLaterUsage: "May include up to one quota-refresh interval of later usage",
	usageMarkerResetNotReported: "Reset time not reported",
	usageMarkerBoundariesUnknown: "Boundaries not known yet",
	usageEmptyAccount: "No usage recorded for this account yet.",
	usageEmptyNoAccounts: "No usage recorded. Log in to start tracking.",
	usageEmptyCleared: "Usage history for {provider} was cleared on {date}. New usage will appear here.",
	usageEmptyNotObserved: "Quota windows not observed yet. Usage will show once the provider reports a known window.",
	usageNoWindow: "No stored window at this time.",
	usageTotalTitle: "All accounts — before per-account tracking",
	usageTotalNotComputed: "Earlier history not computed yet",
	usageTotalUnavailable: "Earlier history unavailable in this profile",
	usageDataErrors: "Some stored usage could not be read and was skipped: {list}",
	usageClear: "Clear {provider} usage history",
	usageClearTitle: "Clear {provider} usage history?",
	usageClearRemoved: "Removed",
	usageClearRemovedWindows: "Stored usage windows of {count} account(s), {from} – {to}",
	usageClearRemovedEarlier: "Earlier history (before per-account tracking)",
	usageClearNothingStored: "Nothing stored",
	usageClearKept: "Not touched",
	usageClearKeptList: "DSH sessions, accounts and logins, other providers and the live quota",
	usageClearIrreversible: "This cannot be undone.",
	usageClearConfirm: "Clear history",
	usageClearing: "Clearing…",
	usageClearFailed: "Could not clear usage history: {message}",
	usageClearPartial: "History was cleared, but some stored files could not be removed yet; they stay hidden and are removed later: {list}",
	usageNavigation: "Window navigation",
	usageNav: "Usage",
	usageTabSettings: "Settings",
	usageDashboardTitle: "Subscription Usage",
	usageDashboardSubtitle: "Token activity across connected subscription providers and accounts (UTC daily totals).",
	usageDashboardUnavailable: "Connection unavailable; usage dashboard cannot be loaded.",
	usageSettingsHint: "Detailed token trends, calendar heatmap, and active quota cycles are available in the sidebar Usage page.",
	usageProviderAll: "All",
	usageAccountAll: "All accounts",
	usageRange7d: "7D",
	usageRange30d: "30D",
	usageRange90d: "90D",
	usageRangeAll: "All",
	usageLastUpdated: "Updated {time}",
	usageKpiTotal: "Total tokens",
	usageKpiExact: "{count} exact tokens",
	usageKpiInputOutput: "Input / Output",
	usageKpiCache: "Cache read / write",
	usageKpiCacheHit: "{percent}% cache read share",
	usageKpiActivity: "Active scope",
	usageKpiModelsCount: "{count} models",
	usageKpiDaysCount: "{days} active days",
	usageKpiAccountsCount: "{accounts} accounts",
	usageKpiReasoning: "Incl. {count} reasoning",
	usageKpiInputShort: "In",
	usageKpiOutputShort: "Out",
	usageKpiCacheReadShort: "Read",
	usageKpiCacheWriteShort: "Write",
	usageHeatmapTitle: "Activity heatmap",
	usageHeatmapSubtitle: "Last 26 weeks (UTC) · Click a day to inspect breakdown",
	usageHeatmapLess: "Less",
	usageHeatmapMore: "More",
	usageHeatmapEmptyDay: "No tokens recorded",
	usageHeatmapSelectedDay: "{date} (UTC)",
	usageHeatmapClearDay: "Clear",
	usageHeatmapHint: "Hover or click any day cell to inspect its per-model and per-provider token breakdown.",
	usageHeatmapPeakDay: "Peak day",
	usageHeatmapAvgDay: "Avg / active day",
	usageHeatmapActiveDays: "Active days (26w)",
	usageTrendTitle: "Daily token trend",
	usageTrendSubtitle: "Stacked by token type (UTC)",
	usageTrendEmpty: "No token activity in this time range.",
	usageLegendInput: "Input",
	usageLegendOutput: "Output",
	usageLegendCacheRead: "Cache read",
	usageLegendCacheWrite: "Cache write",
	usageDistributionTitle: "Distribution",
	usageByModel: "By Model",
	usageByProvider: "By Provider",
	usageDistributionEmpty: "No model or provider usage in this range.",
	usageDistributionShowMore: "Show {count} more",
	usageDistributionShowLess: "Show less",
	usageActiveWindowsTitle: "Quota cycles",
	usageActiveWindowsNote: "Bars: cycle token usage (left axis) · Line: quota utilization % (right axis). Separate from deduplicated daily totals above.",
	usageActiveWindowsEmpty: "No quota cycles match this filter yet.",
	usageCyclesFilterCurrent: "Current ({count})",
	usageCyclesFilterHistory: "History ({count})",
	usageCyclesFilterAll: "All ({count})",
	usageCyclesKindAll: "All ({count})",
	usageCyclesKind5h: "5h ({count})",
	usageCyclesKindWeekly: "Weekly ({count})",
	usageCyclesLegendTokens: "Cycle tokens",
	usageCyclesLegendActive: "Active cycle",
	usageCyclesLegendQuota: "Quota used %",
	usageCyclesLegendNa: "Quota % n/a",
	usageCyclesAxisTokens: "Tokens",
	usageCyclesAxisQuota: "Quota %",
	usageCyclesActiveStripLabel: "Active now",
	usageCyclesInspectorHint: "Click any bar or active cycle pill above to pin its full token breakdown, quota bar, and model shares.",
	usageCyclesClearSelection: "Clear",
	usageCycleTokensLabel: "Cycle tokens",
	usageCycleQuotaLabel: "Quota used",
	usageCycleQuotaUsed: "{percent}% used",
	usageCycleQuotaPeak: "Peak {percent}%",
	usageCycleQuotaNa: "Quota % n/a",
	usageCycleResetsIn: "Resets in {time}",
	usageWindowStatusOpen: "Open",
	usageWindowStatusClosed: "Closed",
	usageWindowStatusEndedEarly: "Ended early",
	usageWindowResetAt: "Resets {date}",
	usageEmptyDashboard: "No subscription usage recorded yet.",
	usageEmptyDashboardHint: "Start chatting with a connected Codex, Claude, Grok, Antigravity, or Muse Code model to see token activity here.",
	usageEmptyDashboardCleared: "Usage history was cleared. New token activity will appear here as you use connected subscriptions.",
	usageEmptyFilter: "No usage recorded for this filter.",
	usageEmptyResetFilter: "Show all usage",
	usageClearOpen: "Clear history…",
	usageClearAllProviders: "All providers",
	usageClearScopeLabel: "Provider to clear",
	usageTitle: "Usage",
	usageGeminiModels: "Gemini Models",
	usageClaudeGptModels: "Claude and GPT models",
	usageArgon: "Gemini 4 Argon",
	usageWeeklyLimit: "Weekly limit",
	usageFiveHourLimit: "5h limit",
	usageRemaining: "{percent}% left",
	usageResetsIn: "Resets in {time}",
	usageRefresh: "Refresh",
	usageLoading: "Loading usage…",
	usageEmpty: "No usage windows reported.",
	usageEmptyMuse: "Meta reports no usage while an account is idle. Refresh sends one tiny request (1+1=?) to open its quota window and read the usage.",
	usageNoVisibleModels: "No quota windows match the selected models.",
	usageError: "Usage lookup failed: {message}",
	usageSession: "5-hour window",
	usageWeekly: "Weekly",
	usageWindow: "Window",
	usageResets: "resets {date}",
	usagePlan: "Plan: {plan}",
	creditsBalance: "Credits: {balance}",
	creditsUnlimited: "Credits: unlimited",
	creditsAvailableUnknown: "Credits available",
	creditsOverage: "Credit spending limit reached",
	resetCreditAvailable: "1 available reset",
	resetCreditsAvailable: "{count} available resets",
	resetCreditsError: "Usage limit resets unavailable: {message}",
	resetUseButton: "Use full reset…",
	resetUseChecking: "Checking…",
	resetUseGuard: "You can use this reset when weekly usage reaches at least 80%.",
	resetUseRestart: "Reset details are missing. Restart DSH, reload this page, then refresh usage.",
	resetUseRefresh: "Refresh usage to verify current limits and reset availability.",
	resetUseReady: "Use this reset — the earliest-expiring credit. Confirmation required.",
	resetUseConfirmTitle: "Confirm full reset",
	resetUseWarning: "This consumes one credit and resets weekly + 5-hour limits. This interface cannot undo it. Confirmation expires in 60 seconds.",
	resetUseAcknowledge: "I understand that one credit will be consumed.",
	resetUseConfirm: "Consume 1 reset",
	resetUseSuccess: "Reset confirmed. Usage refreshed.",
	resetCreditExpires: "Expires {date}",
	resetCreditExpiryUnknown: "Expiry date unavailable",
	modelDefaultsTitle: "Default reasoning effort",
	modelDefaultsHint: "The model picker preselects this level when you switch to the model; models without levels always follow the provider.",
	modelDefaultsFollowProvider: "Follow provider",
	modelDefaultsNoLevels: "{count} model(s) advertise no reasoning levels and always follow the provider.",
	modelDefaultsLoading: "Loading models…",
	modelDefaultsLoadFailed: "Failed to load models: {message}",
	modelDefaultsRetry: "Retry",
	modelDefaultsRefresh: "Refresh model lists (all subscriptions)",
	modelDefaultsSaving: "Saving…",
	modelDefaultsSaveFailedNamed: "Save failed for {model}: {message}",
	modelDefaultsSummary: "{total} model(s) · {configured} overridden",
	modelDefaultsSummaryNone: "{total} model(s) · following the provider",
	modelDefaultsSummaryEmpty: "No model advertises reasoning levels",
	modelDefaultsFilterPlaceholder: "Filter models",
	modelDefaultsFilterEmpty: "No model matches “{query}”.",
	modelDefaultsNoModels: "This provider reports no models.",
	modelDefaultsNoAccount: "No connected accounts. Connect one on the provider card first.",
	modelDefaultsDiscoveryFailed: "Model discovery failed or timed out. Use Refresh to try again.",
	generating: "Generating image…",
	image: "image",
	viewImage: "View image",
	viewImageNamed: "View {name}",
	imageLoading: "Loading…",
	imageLoadFailed: "Retry",
	imagePreview: "Image preview",
	imageClose: "Close",
	generatingVideo: "Generating video…",
	videoLoading: "Loading video…",
	videoLoadFailed: "Video failed to load: {message}",
	quotaDisplay: "Quota percentages",
	quotaUsed: "Used (default)",
	quotaRemaining: "Remaining",
	settingsHelpLabel: "About {setting}",
	quotaDisplayHint: "Applies to Settings and the status bar, independently of hiding. Warning colors always indicate high usage.",
	quotaUsedPercent: "{percent}% used",
	quotaRemainingPercent: "{percent}% remaining",
	quotaUnknown: "Unknown quota",
	quotaStale: "Last known usage (stale)",
	quotaRefreshFailed: "Last known usage; refresh unavailable",
	quotaUnsupported: "Quota queries are not supported for this provider.",
	quotaFailedNoData: "Quota refresh failed; no previous quota data is available.",
	quotaReceivedAt: "Response received: {date}; quota update time was not provided. Receiving a response does not confirm fresh quota.",
	quotaUpdateTimeMissing: "Quota update time was not provided.",
	quotaFetchedAt: "Fetched: {date}",
	quotaRetryAt: "Retry allowed after: {date}",
	quotaSignedIn: "{count} signed-in accounts",
	quotaDefaultAccount: "Default account",
	quotaAccountsHint: "Signed-in accounts are not necessarily members of the current model pool. Default does not identify the account serving this session.",
	quotaExpiredWindow: "Reset time passed; awaiting refresh",
	usageBadgeTitle: "Subscription usage",
	usageBadgeDisplay: "Status-bar quota display",
	usageBadgeDisplayRecent: "Current subscription only",
	usageBadgeDisplayHidden: "Hidden",
	usageBadgeDisplayHint: "Saved automatically in this browser. At most one subscription is shown, and only while the session uses a subscription model; a non-subscription model shows nothing instead of the last subscription used here. Hiding does not affect usage details here.",
	usageBadgeDisplaySaveFailed: "Could not save the display preference. Check browser storage permissions.",
	usageBadgeAllCodexExhausted: "All displayed Codex accounts last reported an exhausted subscription window. The model pool skips exhausted accounts and stops if no candidate remains, regardless of credit balance. Based on cached usage; refresh in Settings → Subscriptions to check for updates. A failed lookup may delay updates.",
	usageBadgeCurrent: "current",
	usageBadgeModelCount: "{count} model quotas",
	usageBadgeModelUnavailable: "Current model quota unavailable",
	usageBadgeMoreWindows: "More quota windows ({count})",
	speed: "Speed",
	speedStandard: "Standard",
	speedStandardDescription: "Default speed",
	speedFast: "Fast",
	speedFastDescription: "1.5x speed, more usage",
	commandFast: "Switch the Codex speed tier (Standard/Fast)",
	commandFastUnavailable: "The current model has no fast tier; /fast only works on Codex models whose catalog advertises one",
	proxyTitle: "Proxy",
	proxyStatusNone: "Plugin proxy disabled — using DSH network settings.",
	proxyStatusEnabled: "Enabled · {url}",
	proxyStatusError: "Config error: {message}",
	proxyConfigure: "Configure…",
	proxyDialogTitle: "Proxy settings",
	proxyDialogClose: "Close",
	proxyEnabled: "Route subscription requests through a proxy",
	proxyUrl: "Proxy URL",
	proxyUrlPlaceholder: "http://localhost:7890",
	proxyUrlHint: "HTTP or SOCKS5 proxy (Clash/mihomo, v2rayN…), e.g. http://host:port or socks5://user:pass@host:port.",
	proxyUsername: "Username (optional)",
	proxyUsernamePlaceholder: "Proxy username",
	proxyPassword: "Password",
	proxyPasswordPlaceholder: "Leave blank to keep the saved password",
	proxyClearPassword: "Clear the saved password",
	proxyBypass: "Bypass hosts",
	proxyBypassPlaceholder: "127.0.0.1, localhost, *.example.com",
	proxyBypassHint: "Comma-separated hostnames that skip this plugin proxy and use DSH network settings.",
	proxyTest: "Test",
	proxyTesting: "Testing…",
	proxyTestOk: "OK · HTTP {status} · {ms} ms",
	proxyTestOkDirect: "OK (DSH network settings) · HTTP {status} · {ms} ms",
	proxyTestFail: "Failed: {message}",
	proxySave: "Save",
	proxyCancel: "Cancel",
	proxySaving: "Saving…",
	proxyLoading: "Loading proxy settings…",
	proxyLoadFailed: "Failed to load proxy settings: {message}",
	proxySaved: "Saved — new requests use the updated network settings.",
	proxySaveFailed: "Save failed: {message}",
	proxyNote: "On DSH v0.1.3-alpha.1, prefer the host HTTP_PROXY / HTTPS_PROXY / ALL_PROXY / NO_PROXY settings and leave this plugin proxy disabled. This optional override is retained for older hosts and subscription-only routing. Disabled or bypassed requests use DSH network settings; they are not necessarily direct. Applies to token exchange, model APIs, usage and tools. Browser OAuth follows the browser/system proxy."
};
/** zh strings, one per {@link en} key. */
const zh = {
	accountsManage: "管理",
	accountsTitle: "管理 {provider}",
	subscriptionDisplayName: "订阅显示名",
	subscriptionDisplayNameHint: "用于底部额度栏与订阅标题，留空使用默认名称。",
	modelDisplayName: "模型显示名",
	modelDisplayNameHint: "留空使用原名，推理档位仍单独显示。",
	displayNameReset: "恢复默认",
	codexModelDefaults: "模型默认设置",
	codexGlobalContext: "全局本地上下文窗口（token）",
	codexGlobalContextHint: "可选的 Codex 全局默认值，控制本地历史和压缩。模型专属设置优先，仍受账号报告的最大值限制。留空使用现有模型和服务商默认值。",
	codexOutputReserve: "全局输出预留（token）",
	codexOutputReserveHint: "可选的 Codex 全局默认值，用于本地上下文预算中的输出预留；模型专属设置优先。留空使用现有默认值。这不是 API 响应长度限制。",
	codexContextDefault: "使用模型默认值",
	codexBudgetDefault: "使用现有默认值：{value}",
	codexBudgetInvalid: "请输入安全整数范围内的正整数，或留空。",
	claudePromptCacheTtl: "提示缓存有效期",
	claudePromptCacheTtlHint: "Anthropic 在最后一次使用后保留对话缓存的时长。两种时长的缓存读取价格相同；1 小时的缓存写入按基础输入价的 2 倍计费（5 分钟为 1.25 倍）。保存后从下一轮对话生效。",
	claudePromptCacheTtlDefault: "跟随配置（{ttl}）",
	claudePromptCacheTtl5m: "5 分钟",
	claudePromptCacheTtl1h: "1 小时",
	accountsHint: "选择参与账号池 LLM 请求的账号。退出账号池仅影响 LLM 路由，不影响工具，也不代表整个会话隔离。",
	accountsTabs: "已连接账号",
	scrollProvidersLeft: "向左滚动服务商",
	scrollProvidersRight: "向右滚动服务商",
	scrollAccountsLeft: "向左滚动账号",
	scrollAccountsRight: "向右滚动账号",
	accountsLoading: "加载账号中…",
	accountsLoadFailed: "账号设置加载失败：{message}",
	accountsSaveFailed: "保存失败：{message}",
	accountsEmpty: "暂无已连接账号，请先在服务商卡片中添加账号。",
	accountsAlias: "别名（可选）",
	accountsPoolEnabled: "参与 LLM 账号池",
	accountsIndependent: "在模型选择器中显示独立入口",
	accountsIndependentHint: "独立 LLM 路由仅使用此账号，失败时不会回退到其他账号。这不代表工具或整个会话的隔离。",
	accountsProxy: "代理（可选）",
	accountsProxyPlaceholder: "socks5://user:pass@proxy.example:1080",
	accountsProxyHint: "此账号的所有请求都走该代理：模型请求、令牌刷新、用量查询和模型目录发现。支持 socks5 与 http，账号密码直接写在地址里。留空则跟随全局代理设置。",
	accountsProbe: "测试拉取模型",
	accountsProbeRunning: "测试中…",
	accountsProbeHint: "用上面填写的代理（按当前输入，不必先保存）实时拉取一次该账号的模型列表并报告结果，不会改动已保存的模型列表。",
	accountsProbeOk: "成功 · {count} 个模型 · {ms} 毫秒 · 走账号代理",
	accountsProbeOkDirect: "成功 · {count} 个模型 · {ms} 毫秒 · 走 DSH 网络设置",
	accountsProbeFail: "失败：{message}",
	accountsProbeModels: "模型：{models}",
	accountsModels: "账号池模型白名单",
	accountsModelsAll: "全部模型",
	accountsModelsCount: "已选 {count} 个",
	accountsModelsHint: "仅影响账号池 LLM 路由，不限制独立入口。清空选择表示不允许任何模型。关闭参与账号池后仍保留此选择。",
	accountsModelsAutomatic: "允许全部模型（包含以后新增的模型）",
	accountsNoModels: "此账号暂未返回模型。",
	accountsCatalogUnavailable: "暂时无法获取模型目录，已保存的模型选择会被保留。",
	modelsPartialSave: "部分推理档已保存，其余更改仍保留在草稿中，请重试完成保存。",
	modelsEdit: "编辑模型列表",
	modelsExpand: "展开",
	modelsCollapse: "收起",
	modelsHint: "在此配置模型显示、默认推理档、子代理速度、上下文与工具，底部的「保存更改」会连同账号设置一起提交。隐藏模型不影响已有会话；工具开关对新建会话生效。",
	modelsAutomatic: "自动显示全部模型（包含以后新增的模型）",
	modelsSelectAll: "全选",
	modelsSelectNone: "清空选择",
	modelsContext: "上下文（token）",
	modelsContextBounds: "默认 {default} · 最大 {max}",
	modelsCodexContextBounds: "默认 {default} · 标准 {standard} · 最大 {max}",
	modelsGlobalContextBounds: "全局默认 {default} · 标准 {standard} · 最大 {max}",
	modelsContextHint: "窗口按输入加预留输出计算。留空时继承全局窗口；若未设置全局值，则使用账号返回的最大窗口。超出标准窗口的请求可能消耗更多套餐额度。配置值受账号最大窗口限制，账号池取各成员的最小窗口。此设置控制本地历史和压缩时机，不会扩大 API 容量。",
	modelsContextWindow: "上下文窗口",
	modelsContextFollow: "跟随服务商（{default}）",
	modelsContextUnavailableOption: "{value}（当前目录未提供）",
	modelsContextGrokHint: "可选档位来自服务商的实时模型目录，实际值不会超过目录公布的最大窗口。调大窗口只会增加本地历史预算、推迟压缩；真实容量与计费由服务商决定。新建会话会立即生效；已有会话会在下一条消息更新上下文预算。",
	modelsContextInvalid: "请为 {model} 输入正整数 token 数。",
	modelsSubagentSpeed: "子代理默认速度",
	modelsSubagentSpeedHint: "对使用此模型的子代理后续请求生效，与父会话模型无关。主会话仍使用自己的速度设置；快速档仅在模型支持时生效。",
	modelsTools: "Provider 工具",
	modelsToolsHint: "仅对保存后新建的会话生效，已有会话保留原工具。任一支持的服务商启用共享工具时，该工具仍会显示。",
	modelsImage: "图片生成",
	modelsVideo: "视频生成",
	modelsSearch: "X 搜索",
	modelsWebSearch: "网页搜索",
	modelsSave: "保存更改",
	modelsUnavailable: "当前不可用",
	nav: "订阅",
	providerTabs: "订阅服务商",
	intro: "在此登录或退出订阅服务商。点击登录会在新标签页打开服务商的授权页面；无浏览器环境可改为粘贴回调 URL 或授权码。",
	unavailable: "连接不可用，无法加载订阅状态。",
	checking: "查询中…",
	loginInProgress: "登录中…",
	notLoggedIn: "未登录",
	loggedInCount: "已连接 {count} 个账号",
	antigravityDisabledStatus: "已禁用（默认关闭）",
	antigravitySavedAccounts: "本地保留了 {count} 个已登录账号，启用后可查看用量或管理。",
	antigravityNoticeTitle: "Google Antigravity 当前默认禁用",
	antigravityNoticeBody: "Google Antigravity 默认关闭。访问 Google 的私有端点有账号封禁风险，Google 也可能以 HTTP 429 拒绝 DSH 对话请求。手动启用后可查看账号用量，但不保证模型请求成功。",
	antigravityEnable: "手动启用",
	antigravityDisable: "停用",
	antigravityEnableConfirmTitle: "确认手动启用 Google Antigravity",
	antigravityEnableConfirmBody: "启用后，本插件会恢复访问 Google Antigravity 端点。这可能导致账号受限或被封禁，Google 也可能继续拒绝模型请求。",
	antigravityEnableAcknowledge: "我了解账号封禁风险，并知晓启用后模型请求仍可能失败。",
	antigravityEnableConfirm: "确认启用",
	clientVersion: "CLI {version} · {source}",
	clientVersionNpm: "npm 最新",
	clientVersionLocal: "本机 CLI",
	clientVersionFallback: "内置版本",
	clientVersionConfig: "手动配置",
	clientVersionHint: "请求以这个 CLI 版本号发出，新模型可能要求较新的版本。默认使用 npm 上的最新版本；npm 无法访问时使用本机 CLI 或内置版本。刷新模型列表会重新检查。",
	accountExpires: "过期时间 {date}",
	defaultBadge: "默认",
	setDefault: "设为默认",
	addAccount: "添加账号",
	addAccountOAuth: "浏览器授权",
	addAccountKeychain: "导入 Claude Code",
	addAccountHint: "浏览器授权以浏览器当前登录的账号为准；要添加不同账号，请先在浏览器里切换账号，或用无痕窗口走下方手动授权码。",
	login: "登录",
	cancel: "取消",
	logout: "退出登录",
	logoutAccountConfirm: "确定退出 {provider} 的账号 {account} 吗？",
	manualSummary: "浏览器流程无法完成？粘贴回调 URL 或授权码",
	manualPlaceholder: "粘贴回调 URL 或授权码",
	submit: "提交",
	loginMissingUrl: "login 响应缺少 authorizeUrl",
	deviceCodePrompt: "在 GitHub 验证页面输入此验证码：",
	deviceCodeCopy: "复制验证码",
	deviceCodeCopied: "已复制",
	deviceCodeOpenPage: "打开 GitHub 验证页面",
	museDeviceCodePrompt: "打开 Meta 登录页面，确认页面显示的是此验证码：",
	museDeviceCodeOpenPage: "打开 Meta 登录页面",
	usageOpen: "用量",
	usageDialogTitle: "{provider} 用量",
	usageAccount: "账号",
	usageAccountLoggedOut: "{account} · 已退出登录",
	usageKind: "窗口",
	usageMonthly: "每月",
	usageNotObservedYet: "尚未观察到",
	usagePrevious: "上一个",
	usageNext: "下一个",
	usageRange: "{start} – {end}",
	usageRangeOpen: "自 {start} 起",
	usageCurrentWindow: "当前窗口",
	usageViewLoading: "正在加载用量…",
	usageViewFailed: "无法加载用量：{message}",
	usageRetry: "重试",
	usageTokens: "{count} 个 token",
	usageTotalTokens: "合计：{count} 个 token",
	usageTokenBuckets: "输入 {input} · 输出 {output} · 缓存读取 {read} · 缓存写入 {write}",
	usageDailyUtc: "此窗口内按日统计（UTC）",
	usageReasoningTokens: "其中 {count} 个推理 token，已含在输出中",
	usageMarkerWindow0TrackingStart: "窗口 0：自开始追踪起，至首次观察到额度窗口前",
	usageMarkerWindow0Cleared: "窗口 0：自清空历史起，至首次观察到额度窗口前",
	usageMarkerWindow0Pending: "窗口 0：自开始追踪起 — 尚未观察到额度窗口",
	usageMarkerSinceFirstObserved: "自首次观察到额度窗口起",
	usageMarkerSinceTracking: "自开始按账号追踪起",
	usageMarkerSinceCleared: "自清空历史起",
	usageMarkerEndedEarly: "提前结束",
	usageMarkerEndedEarlyLaterUsage: "可能包含最多一个额度刷新间隔内的后续用量",
	usageMarkerResetNotReported: "未报告重置时间",
	usageMarkerBoundariesUnknown: "窗口边界暂未知",
	usageEmptyAccount: "此账号尚无用量记录。",
	usageEmptyNoAccounts: "尚无用量记录。登录后开始追踪。",
	usageEmptyCleared: "{provider} 的用量历史已于 {date} 清空。新的用量将显示在这里。",
	usageEmptyNotObserved: "尚未观察到额度窗口。服务商报告已知窗口后将显示用量。",
	usageNoWindow: "此时间没有已保存的窗口。",
	usageTotalTitle: "所有账号 — 按账号追踪之前",
	usageTotalNotComputed: "更早的历史尚未计算",
	usageTotalUnavailable: "此配置无法获取更早的历史",
	usageDataErrors: "部分已保存的用量无法读取，已跳过：{list}",
	usageClear: "清空 {provider} 用量历史",
	usageClearTitle: "清空 {provider} 用量历史？",
	usageClearRemoved: "将删除",
	usageClearRemovedWindows: "{count} 个账号已保存的用量窗口，{from} – {to}",
	usageClearRemovedEarlier: "更早的历史（按账号追踪之前）",
	usageClearNothingStored: "没有已保存的数据",
	usageClearKept: "不受影响",
	usageClearKeptList: "DSH 会话、账号与登录、其他服务商以及实时额度",
	usageClearIrreversible: "此操作无法撤销。",
	usageClearConfirm: "清空历史",
	usageClearing: "正在清空…",
	usageClearFailed: "无法清空用量历史：{message}",
	usageClearPartial: "历史已清空，但部分已保存的文件暂时无法删除；它们不会再显示，之后会被删除：{list}",
	usageNavigation: "窗口导航",
	usageNav: "用量",
	usageTabSettings: "设置",
	usageDashboardTitle: "订阅用量",
	usageDashboardSubtitle: "跨订阅服务商与账号的 Token 消耗概览（按 UTC 日期统计）。",
	usageDashboardUnavailable: "连接不可用，无法加载用量仪表盘。",
	usageSettingsHint: "完整的 Token 趋势、日历热力图与活跃额度周期已移至侧边栏「用量」页面。",
	usageProviderAll: "全部",
	usageAccountAll: "全部账号",
	usageRange7d: "7 天",
	usageRange30d: "30 天",
	usageRange90d: "90 天",
	usageRangeAll: "全部",
	usageLastUpdated: "更新于 {time}",
	usageKpiTotal: "总 Token",
	usageKpiExact: "精确 {count} tokens",
	usageKpiInputOutput: "输入 / 输出",
	usageKpiCache: "缓存读取 / 写入",
	usageKpiCacheHit: "缓存读取占比 {percent}%",
	usageKpiActivity: "活跃范围",
	usageKpiModelsCount: "{count} 个模型",
	usageKpiDaysCount: "{days} 个活跃日",
	usageKpiAccountsCount: "{accounts} 个账号",
	usageKpiReasoning: "含 {count} 推理",
	usageKpiInputShort: "输入",
	usageKpiOutputShort: "输出",
	usageKpiCacheReadShort: "读取",
	usageKpiCacheWriteShort: "写入",
	usageHeatmapTitle: "活跃热力图",
	usageHeatmapSubtitle: "近 26 周（UTC）· 点击日期查看当日明细",
	usageHeatmapLess: "少",
	usageHeatmapMore: "多",
	usageHeatmapEmptyDay: "无用量记录",
	usageHeatmapSelectedDay: "{date}（UTC）",
	usageHeatmapClearDay: "清除选中",
	usageHeatmapHint: "悬停或点击任意日期方块，查看当日按模型与服务商拆分的 Token 明细。",
	usageHeatmapPeakDay: "峰值单日",
	usageHeatmapAvgDay: "活跃日均",
	usageHeatmapActiveDays: "活跃天数（26 周）",
	usageTrendTitle: "每日 Token 趋势",
	usageTrendSubtitle: "按 Token 类型堆叠（UTC）",
	usageTrendEmpty: "当前时间范围内暂无用量数据。",
	usageLegendInput: "输入",
	usageLegendOutput: "输出",
	usageLegendCacheRead: "缓存读取",
	usageLegendCacheWrite: "缓存写入",
	usageDistributionTitle: "用量分布",
	usageByModel: "按模型",
	usageByProvider: "按服务商",
	usageDistributionEmpty: "当前筛选范围内暂无模型或服务商用量。",
	usageDistributionShowMore: "展开其余 {count} 项",
	usageDistributionShowLess: "收起",
	usageActiveWindowsTitle: "额度周期统计",
	usageActiveWindowsNote: "柱状：周期 Token 用量（左轴）· 折线：额度消耗百分比（右轴）。与上方去重后的按日总计相互独立。",
	usageActiveWindowsEmpty: "当前筛选条件下暂无额度周期记录。",
	usageCyclesFilterCurrent: "当前周期（{count}）",
	usageCyclesFilterHistory: "历史周期（{count}）",
	usageCyclesFilterAll: "全部周期（{count}）",
	usageCyclesKindAll: "全部（{count}）",
	usageCyclesKind5h: "5 小时（{count}）",
	usageCyclesKindWeekly: "每周（{count}）",
	usageCyclesLegendTokens: "周期 Token 用量",
	usageCyclesLegendActive: "当前进行中",
	usageCyclesLegendQuota: "额度消耗 %",
	usageCyclesLegendNa: "未采集 %",
	usageCyclesAxisTokens: "Token 用量",
	usageCyclesAxisQuota: "额度 %",
	usageCyclesActiveStripLabel: "进行中",
	usageCyclesInspectorHint: "点击任意周期柱状条或上方进行中胶囊，固定查看该周期的完整模型占比与额度详情。",
	usageCyclesClearSelection: "清除选中",
	usageCycleTokensLabel: "本周期用量",
	usageCycleQuotaLabel: "额度消耗",
	usageCycleQuotaUsed: "已用 {percent}%",
	usageCycleQuotaPeak: "峰值 {percent}%",
	usageCycleQuotaNa: "未采集额度占比",
	usageCycleResetsIn: "{time} 后重置",
	usageWindowStatusOpen: "进行中",
	usageWindowStatusClosed: "已结束",
	usageWindowStatusEndedEarly: "提前结束",
	usageWindowResetAt: "{date} 重置",
	usageEmptyDashboard: "尚无订阅用量记录。",
	usageEmptyDashboardHint: "使用已连接的 Codex、Claude、Grok、Antigravity 或 Muse Code 模型对话后，Token 消耗会显示在这里。",
	usageEmptyDashboardCleared: "用量历史已清空。继续使用已连接的订阅模型后，新的用量将自动显示在此处。",
	usageEmptyFilter: "当前筛选条件下暂无用量记录。",
	usageEmptyResetFilter: "查看全部用量",
	usageClearOpen: "清空历史…",
	usageClearAllProviders: "全部服务商",
	usageClearScopeLabel: "清空范围",
	usageTitle: "用量",
	usageGeminiModels: "Gemini 模型",
	usageClaudeGptModels: "Claude 和 GPT 模型",
	usageArgon: "Gemini 4 Argon",
	usageWeeklyLimit: "每周限额",
	usageFiveHourLimit: "5 小时限额",
	usageRemaining: "剩余 {percent}%",
	usageResetsIn: "{time} 后重置",
	usageRefresh: "刷新",
	usageLoading: "用量加载中…",
	usageEmpty: "服务商未返回任何用量窗口。",
	usageEmptyMuse: "Meta 账号闲置时不返回用量。点击「刷新」会发送一条极短请求（1+1=?）激活额度窗口并读取用量。",
	usageNoVisibleModels: "当前选中的模型没有可显示的用量窗口。",
	usageError: "用量查询失败：{message}",
	usageSession: "5 小时窗口",
	usageWeekly: "每周",
	usageWindow: "窗口",
	usageResets: "{date} 重置",
	usagePlan: "计划：{plan}",
	creditsBalance: "剩余 credits：{balance}",
	creditsUnlimited: "credits：无限制",
	creditsAvailableUnknown: "仍有可用 credits",
	creditsOverage: "credits 消费已达上限",
	resetCreditAvailable: "可用 1 次重置",
	resetCreditsAvailable: "可用 {count} 次重置",
	resetCreditsError: "用量限制重置查询失败：{message}",
	resetUseButton: "使用完整重置…",
	resetUseChecking: "正在检查…",
	resetUseGuard: "每周用量达到 80% 后才可使用此重置。",
	resetUseRestart: "缺少重置详情。请重启 DSH、重新加载页面并刷新用量。",
	resetUseRefresh: "请刷新用量以验证当前限制和重置可用性。",
	resetUseReady: "使用此最早到期的重置额度，操作前需要确认。",
	resetUseConfirmTitle: "确认完整重置",
	resetUseWarning: "将消耗一次额度并重置每周和 5 小时限制，无法撤销。确认将在 60 秒后过期。",
	resetUseAcknowledge: "我理解将消耗一次额度。",
	resetUseConfirm: "消耗一次重置",
	resetUseSuccess: "重置已确认，用量已刷新。",
	resetCreditExpires: "{date} 到期",
	resetCreditExpiryUnknown: "到期时间不可用",
	modelDefaultsTitle: "默认推理档",
	modelDefaultsHint: "切换到该模型时，模型选择器会预选此档位；没有推理档的模型始终跟随服务商默认。",
	modelDefaultsFollowProvider: "跟随服务商",
	modelDefaultsNoLevels: "{count} 个模型未声明推理档，始终跟随服务商默认。",
	modelDefaultsLoading: "加载模型中…",
	modelDefaultsLoadFailed: "模型加载失败：{message}",
	modelDefaultsRetry: "重试",
	modelDefaultsRefresh: "刷新模型列表（全部订阅）",
	modelDefaultsSaving: "保存中…",
	modelDefaultsSaveFailedNamed: "{model} 保存失败：{message}",
	modelDefaultsSummary: "{total} 个模型 · {configured} 个已覆盖",
	modelDefaultsSummaryNone: "{total} 个模型 · 全部跟随服务商",
	modelDefaultsSummaryEmpty: "没有模型声明推理档",
	modelDefaultsFilterPlaceholder: "筛选模型",
	modelDefaultsFilterEmpty: "没有匹配「{query}」的模型。",
	modelDefaultsNoModels: "这个服务商没有报告任何模型。",
	modelDefaultsNoAccount: "还没有连接账号。请先在卡片上连接一个账号。",
	modelDefaultsDiscoveryFailed: "模型列表发现失败或超时。可以点「刷新」重试。",
	generating: "正在生成图片…",
	image: "图片",
	viewImage: "查看图片",
	viewImageNamed: "查看 {name}",
	imageLoading: "加载中…",
	imageLoadFailed: "重试",
	imagePreview: "图片预览",
	imageClose: "关闭",
	generatingVideo: "正在生成视频…",
	videoLoading: "视频加载中…",
	videoLoadFailed: "视频加载失败：{message}",
	quotaDisplay: "额度百分比",
	quotaUsed: "已用（默认）",
	quotaRemaining: "剩余",
	settingsHelpLabel: "关于{setting}",
	quotaDisplayHint: "应用于设置页和状态栏，与隐藏选项独立。告警颜色始终表示用量偏高。",
	quotaUsedPercent: "已用 {percent}%",
	quotaRemainingPercent: "剩余 {percent}%",
	quotaUnknown: "额度未知",
	quotaStale: "最后已知额度（已过期）",
	quotaRefreshFailed: "最后已知额度；刷新暂不可用",
	quotaUnsupported: "此服务商不支持额度查询。",
	quotaFailedNoData: "额度刷新失败，暂无历史额度数据。",
	quotaReceivedAt: "收到响应：{date}；未提供额度更新时间。收到响应不代表额度已刷新。",
	quotaUpdateTimeMissing: "未提供额度更新时间。",
	quotaFetchedAt: "获取时间：{date}",
	quotaRetryAt: "可重试时间：{date}",
	quotaSignedIn: "{count} 个已登录账号",
	quotaDefaultAccount: "默认账号",
	quotaAccountsHint: "已登录账号不一定属于当前模型的账号池。默认账号不代表本会话实际服务账号。",
	quotaExpiredWindow: "重置时间已过，等待刷新",
	usageBadgeTitle: "订阅用量",
	usageBadgeDisplay: "状态栏额度显示",
	usageBadgeDisplayRecent: "仅显示当前订阅",
	usageBadgeDisplayHidden: "不显示",
	usageBadgeDisplayHint: "自动保存到当前浏览器。状态栏最多显示一家，且仅当会话使用订阅模型时显示；切到非订阅模型即隐藏，不保留上一次的订阅。关闭不影响本页的额度详情。",
	usageBadgeDisplaySaveFailed: "显示设置保存失败，请检查浏览器存储权限。",
	usageBadgeAllCodexExhausted: "当前显示的 Codex 账号最近报告的适用订阅窗口均已耗尽。无论 credits 余额如何，模型账号池都会跳过满额账号，没有剩余候选时停止请求。此提示基于缓存用量；请在设置 → 订阅中刷新对应账号，查询失败时更新可能延迟。",
	usageBadgeCurrent: "当前",
	usageBadgeModelCount: "{count} 个模型配额",
	usageBadgeModelUnavailable: "当前模型暂无配额数据",
	usageBadgeMoreWindows: "更多配额窗口（{count}）",
	speed: "速度",
	speedStandard: "标准",
	speedStandardDescription: "默认速度",
	speedFast: "快速",
	speedFastDescription: "约 1.5 倍速度，消耗更多用量",
	commandFast: "切换 Codex 速度档（标准/快速）",
	commandFastUnavailable: "当前模型不支持快速档；/fast 仅对目录声明了 fast tier 的 Codex 模型可用",
	proxyTitle: "代理",
	proxyStatusNone: "插件代理未启用 —— 使用 DSH 网络设置。",
	proxyStatusEnabled: "已启用 · {url}",
	proxyStatusError: "配置错误：{message}",
	proxyConfigure: "配置…",
	proxyDialogTitle: "代理设置",
	proxyDialogClose: "关闭",
	proxyEnabled: "让订阅相关请求走代理",
	proxyUrl: "代理地址",
	proxyUrlPlaceholder: "http://localhost:7890",
	proxyUrlHint: "支持 HTTP 与 SOCKS5 代理（Clash/mihomo、v2rayN 等），例如 http://host:port 或 socks5://user:pass@host:port。",
	proxyUsername: "用户名（可选）",
	proxyUsernamePlaceholder: "代理用户名",
	proxyPassword: "密码",
	proxyPasswordPlaceholder: "留空则保留已保存的密码",
	proxyClearPassword: "清除已保存的密码",
	proxyBypass: "绕过主机",
	proxyBypassPlaceholder: "127.0.0.1, localhost, *.example.com",
	proxyBypassHint: "逗号分隔的主机名，命中则跳过插件代理，使用 DSH 网络设置。",
	proxyTest: "测试",
	proxyTesting: "测试中…",
	proxyTestOk: "成功 · HTTP {status} · {ms} ms",
	proxyTestOkDirect: "成功（DSH 网络设置）· HTTP {status} · {ms} ms",
	proxyTestFail: "失败：{message}",
	proxySave: "保存",
	proxyCancel: "取消",
	proxySaving: "保存中…",
	proxyLoading: "代理设置加载中…",
	proxyLoadFailed: "代理设置加载失败：{message}",
	proxySaved: "已保存 —— 后续请求使用更新后的网络设置。",
	proxySaveFailed: "保存失败：{message}",
	proxyNote: "DSH v0.1.3-alpha.1 建议使用宿主的 HTTP_PROXY / HTTPS_PROXY / ALL_PROXY / NO_PROXY 设置，并关闭插件代理。此可选覆盖设置为旧版宿主及仅订阅请求使用独立代理的场景保留。关闭或绕过插件代理后使用 DSH 网络设置，不一定直连。作用于 token 交换、模型 API、用量和工具请求；浏览器 OAuth 使用浏览器/系统代理。"
};

//#endregion
//#region src/client/reset-action.ts
/** Explain client-side gating; the server independently revalidates before spending. */
function resetActionBlock(usage, now = Date.now()) {
	const weekly = usage.windows?.find((w) => w.kind === "weekly" && w.scope === void 0);
	if (!weekly || !Number.isFinite(weekly.usedPercent)) return "resetUseRefresh";
	if (weekly.usedPercent < 80) return "resetUseGuard";
	if (weekly.resetsAt === void 0 || weekly.resetsAt <= now || usage.resetCreditsError) return "resetUseRefresh";
	if (!usage.resetCredits?.some((c) => c.id)) return "resetUseRestart";
	if (!usage.resetCredits.some((c) => c.id && (c.expiresAt === void 0 || c.expiresAt > now))) return "resetUseRefresh";
}

//#endregion
//#region src/antigravity-model-id.ts
/** Only concrete, explicit effort suffixes establish an Antigravity model family. */
function antigravityModelId(id) {
	return id.replace(/^((?:gemini|claude|gpt-oss)-.+)-(?:low|medium|high|xhigh)$/, "$1");
}
/** Map a retired effort selection only when its family replaces it in this account's catalog. */
function antigravitySelectionId(id, models) {
	if (models.some((model) => model.id === id)) return id;
	const family = antigravityModelId(id);
	return models.some((model) => model.id === family) ? family : id;
}
/** Quota scopes retain concrete upstream ids; selectors use the family id. */
function sameAntigravityModel(left, right) {
	return left !== void 0 && right !== void 0 && antigravityModelId(left) === antigravityModelId(right);
}
const ANTIGRAVITY_QUOTA_SCOPES = [
	"Gemini Models",
	"Claude and GPT models",
	"Gemini 4 Argon"
];
/** Summary labels are account-wide quota families, not model IDs. */
function antigravityQuotaScope(value) {
	return ANTIGRAVITY_QUOTA_SCOPES.find((scope) => scope.toLowerCase() === value?.trim().toLowerCase());
}
function antigravityQuotaApplies(scope, model) {
	if (model === void 0) return false;
	switch (antigravityQuotaScope(scope)) {
		case "Gemini Models": return /^gemini-/.test(model);
		case "Claude and GPT models": return /^(?:claude-|gpt-oss-)/.test(model);
		case "Gemini 4 Argon": return /^gemini-4-argon(?:-|$)/.test(model);
		default: return sameAntigravityModel(scope, model);
	}
}

//#endregion
//#region src/client/AntigravityQuotaSummary.tsx
/** Same 4px track as the other subscription rows; fill and value follow the active quota display mode. */
function QuotaBar({ label, percent, valueText, color }) {
	const width = percent ?? 0;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		role: "progressbar",
		"aria-label": label,
		"aria-valuemin": 0,
		"aria-valuemax": 100,
		"aria-valuenow": percent,
		"aria-valuetext": valueText,
		style: {
			height: 4,
			borderRadius: 2,
			overflow: "hidden",
			background: "var(--dsw-alias-border-l2)",
			marginBottom: 2
		},
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { style: {
			width: `${width}%`,
			height: "100%",
			borderRadius: 2,
			background: color
		} })
	});
}
function resetDuration(at) {
	const minutes = Math.max(1, Math.ceil((at - Date.now()) / 6e4));
	const hours = Math.floor(minutes / 60);
	return hours >= 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h` : hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}
/** Provider-defined shared limits, unified with the global used/remaining quota display mode. */
function AntigravityQuotaSummary({ windows, t, mode }) {
	const selectedMode = useQuotaDisplayMode();
	const quotaMode = mode ?? selectedMode;
	const titles = [
		"usageGeminiModels",
		"usageClaudeGptModels",
		"usageArgon"
	];
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		style: {
			display: "grid",
			gap: 22,
			paddingTop: 10
		},
		children: [ANTIGRAVITY_QUOTA_SCOPES.map((scope, index) => {
			const rows = windows.filter((window$1) => window$1.scope === scope).sort((a, b) => (a.kind === "weekly" ? 0 : 1) - (b.kind === "weekly" ? 0 : 1));
			if (!rows.length) return null;
			const title = t(titles[index]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				"aria-label": title,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
					style: {
						margin: "0 0 10px",
						fontSize: 13,
						fontWeight: 600
					},
					children: title
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						display: "grid",
						gap: 14
					},
					children: rows.map((window$1, index$1) => {
						const percent = quotaPercent(window$1.usedPercent, quotaMode);
						const color = usageBarColor(window$1.usedPercent);
						const label = t(window$1.kind === "weekly" ? "usageWeeklyLimit" : "usageFiveHourLimit");
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "grid",
								gap: 4
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									justifyContent: "space-between",
									alignItems: "baseline",
									gap: 16,
									fontSize: 12
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: { color: "var(--dsw-alias-label-secondary)" },
									children: label
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									style: {
										textAlign: "right",
										fontVariantNumeric: "tabular-nums",
										color
									},
									children: [quotaText(window$1.usedPercent, quotaMode, t), window$1.resetsAt !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: { color: "var(--dsw-alias-label-tertiary)" },
										children: ` · ${window$1.resetsAt <= Date.now() ? t("quotaExpiredWindow") : resetDuration(window$1.resetsAt)}`
									})]
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuotaBar, {
								label: `${title} · ${label}`,
								percent,
								valueText: quotaText(window$1.usedPercent, quotaMode, t),
								color
							})]
						}, `${window$1.kind}-${index$1}`);
					})
				})]
			}, scope);
		}), windows.filter((window$1) => !antigravityQuotaScope(window$1.scope)).map((window$1, index) => {
			const percent = quotaPercent(window$1.usedPercent, quotaMode);
			const color = usageBarColor(window$1.usedPercent);
			const label = t(window$1.kind === "weekly" ? "usageWeeklyLimit" : window$1.kind === "session" ? "usageFiveHourLimit" : "usageWindow");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				"aria-label": `${window$1.scope ?? ""} · ${label}`,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
						style: {
							margin: "0 0 10px",
							fontSize: 13,
							fontWeight: 600
						},
						children: window$1.scope
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							justifyContent: "space-between",
							gap: 16,
							fontSize: 12
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: { color },
							children: quotaText(window$1.usedPercent, quotaMode, t)
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: { marginTop: 4 },
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuotaBar, {
							label: `${window$1.scope ?? ""} · ${label}`,
							percent,
							valueText: quotaText(window$1.usedPercent, quotaMode, t),
							color
						})
					}),
					window$1.resetsAt !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							marginTop: 4,
							textAlign: "right",
							fontSize: 12,
							color: "var(--dsw-alias-label-tertiary)"
						},
						children: window$1.resetsAt <= Date.now() ? t("quotaExpiredWindow") : t("usageResetsIn", { time: resetDuration(window$1.resetsAt) })
					})
				]
			}, `model-${index}`);
		})]
	});
}

//#endregion
//#region src/client/usage-window-filter.ts
/** Presentation only: never trim the raw snapshots used by quota/routing logic. */
function visibleUsageWindows(provider, windows, visibleModels) {
	const all = windows ?? [];
	if (provider !== "antigravity" || visibleModels === void 0) return all;
	return all.filter((window$1) => !window$1.scope || antigravityQuotaScope(window$1.scope) || visibleModels.some((model) => antigravityQuotaApplies(window$1.scope, model)));
}

//#endregion
//#region src/client/subscriptions-rpc.ts
/**
* The node half mounts every endpoint as an exact POST route on the shared
* `/api` channel (`/api/subscriptions-auth.<endpoint>`), so the browser
* reaches it through the `/api` channel with a prefixed endpoint name.
* A dedicated channel is no longer used: since dsh 0.1.5 `rpc.handle`
* cannot register one from a plugin (see `src/auth/rpc.ts`).
*/
const SUBSCRIPTIONS_AUTH_CHANNEL = "/api";
const SUBSCRIPTIONS_AUTH_PREFIX = "subscriptions-auth.";
/** Business error returned by a `subscriptions-auth` endpoint (error branch message). */
var SubscriptionsAuthError = class extends Error {};
/**
* Call one `subscriptions-auth` endpoint and unwrap the business result.
* Shared by the settings section, the composer Speed toggle, the usage
* badge, and the image/video toolviews.
* @param rpc - Connection RPC caller.
* @param endpoint - endpoint name (`status`, `usage`, `image`, ...).
* @param payload - endpoint-owned request payload.
* @returns the success value, cast by the caller to the endpoint's shape.
*/
async function callSubscriptionsAuth(rpc, endpoint, payload) {
	const request = payload;
	const usageKey = endpoint === "usage" && request?.provider && request.account ? `${request.provider}:${request.account}` : void 0;
	let result;
	try {
		result = await rpc.call(SUBSCRIPTIONS_AUTH_CHANNEL, `${SUBSCRIPTIONS_AUTH_PREFIX}${endpoint}`, payload);
	} catch (error) {
		if (usageKey) failUsage(rpc, usageKey);
		throw new SubscriptionsAuthError(error instanceof Error ? error.message : String(error));
	}
	if (!result.ok) {
		if (usageKey) failUsage(rpc, usageKey);
		throw new SubscriptionsAuthError(result.error.message);
	}
	let value = result.value;
	if (usageKey) {
		value = {
			...value,
			receivedAt: Date.now()
		};
		publishUsage(rpc, usageKey, value);
	}
	if (endpoint === "status") {
		const status = result.value;
		retainUsageAccounts(rpc, new Set(Object.entries(status.providers).flatMap(([provider, state]) => state.accounts.map((account) => `${provider}:${account.key}`))));
	}
	return value;
}

//#endregion
//#region src/client/account-preferences.ts
/** Missing allowlist follows discovery; explicit [] must remain empty. */
function accountPoolSelection(account, models, provider) {
	const selected = account.poolModels ?? models.map((model) => model.id);
	return new Set(provider === "antigravity" ? selected.map((id) => antigravitySelectionId(id, models)) : selected);
}
/** Retain unavailable saved IDs so a temporary catalog failure cannot erase them. */
function accountModelRows(account, preferences, provider) {
	const known = new Set(account.models.map((model) => model.id));
	return [...account.models.map((model) => ({
		...model,
		unavailable: false
	})), ...[...accountPoolSelection(preferences, account.models, provider)].filter((id) => !known.has(id)).map((id) => ({
		id,
		name: id,
		unavailable: true
	}))];
}
/** The model editor owns everything except the separately managed accounts. */
function mergeLatestAccounts(draft, latest) {
	const { accounts: _stale,...settings } = draft;
	return {
		...settings,
		...latest.accounts === void 0 ? {} : { accounts: latest.accounts }
	};
}
/** Only touched accounts replace their latest preferences; other settings survive. */
function mergeAccountChanges(latest, changes) {
	return {
		...latest,
		accounts: {
			...latest.accounts,
			...changes
		}
	};
}

//#endregion
//#region src/client/model-filter.ts
/**
* Which empty state the model list is in.
*
* `provider-empty` means the provider shows NO rows at all — the filter box cannot match
* anything in that state, and printing `No model matches “”.` next to it reads like a broken
* control rather than like an explanation (issue #147).
*
* `filter-empty` keeps the existing message for a query that filtered everything out of a
* provider that does have rows.
*/
function modelListState(total, matched) {
	if (total === 0) return "provider-empty";
	return matched === 0 ? "filter-empty" : "rows";
}
/**
* Row ids the editor can still show when discovery returned nothing: saved visibility,
* display names and subagent speeds must count towards the total —
* otherwise a temporary catalog failure would hide the rows that edit them.
*/
function savedModelIds(visibleModels, displayNames, subagentSpeeds = void 0) {
	return [...new Set([
		...visibleModels ?? [],
		...Object.keys(displayNames ?? {}),
		...Object.keys(subagentSpeeds ?? {})
	])];
}
/**
* Why the provider has no models — read from the data the host already sends.
*
* `total === 0` alone cannot tell these apart, and guessing wrong re-creates the very
* defect issue #147 is about: telling a user who IS logged in to go and log in. The
* catalog payload carries one row per connected account with `unavailable: true` when that
* account's discovery failed or timed out (src/index.ts).
*
*  · no account at all                       → `noAccount`;
*  · accounts exist, every discovery failed  → `discoveryFailed` (retry, not log in);
*  · a connected account answered (possibly with an empty catalog) → `noModels`.
*/
function modelEditorNotice(accounts) {
	if (accounts.length === 0) return "noAccount";
	return accounts.every((account) => account.unavailable === true) ? "discoveryFailed" : "noModels";
}
/** Locale keys for the three honest empty states. */
const NOTICE_KEYS = {
	noAccount: "modelDefaultsNoAccount",
	discoveryFailed: "modelDefaultsDiscoveryFailed",
	noModels: "modelDefaultsNoModels"
};
/**
* The editor's whole empty-state decision, in one testable place: how many rows exist
* (discovered + the user's saved ids), whether a query filtered them all out, and which
* notice to show when there are none.
*/
function modelEditorState(input) {
	return {
		listState: modelListState(input.discovered + input.saved, input.matched),
		noticeKey: NOTICE_KEYS[modelEditorNotice(input.accounts)]
	};
}
/** Compact window label for the model editor: 500000 → `500K`, 1000000 → `1M`. */
function formatWindowLabel(tokens) {
	if (tokens === void 0) return "";
	if (tokens >= 1e6 && tokens % 1e6 === 0) return `${tokens / 1e6}M`;
	if (tokens >= 1e3 && tokens % 1e3 === 0) return `${tokens / 1e3}K`;
	return String(tokens);
}
/** The catalog tiers a window picker offers for one model, default tier excluded. */
function contextWindowTiers(model) {
	return (model.contextWindowOptions ?? []).filter((tier) => tier !== model.defaultContextWindow);
}
/**
* Select state for one model's window picker.
*
* `value` is what the `<select>` should show: `''` for follow-provider,
* otherwise the saved tier. `unavailable` is set when a saved tier is no
* longer offered, so the picker can keep showing (disabled) what the user
* saved instead of silently rewriting the preference (issue #149).
*/
function contextWindowChoice(saved, model) {
	const tiers = contextWindowTiers(model);
	const trimmed = saved.trim();
	const savedValue = trimmed === "" ? void 0 : Number(trimmed);
	if (savedValue === void 0 || !Number.isSafeInteger(savedValue) || savedValue <= 0) return {
		value: "",
		tiers
	};
	if (savedValue === model.defaultContextWindow) return {
		value: "",
		tiers
	};
	if (tiers.includes(savedValue)) return {
		value: String(savedValue),
		tiers
	};
	return {
		value: String(savedValue),
		tiers,
		unavailable: savedValue
	};
}
/**
* Overrides to persist for one save.
*
* An explicit value equal to the advertised default is the same choice as
* following the provider, so it is dropped instead of stored as a pinned
* override. Keeping such a key would display "follow provider" while the
* pinned value survives a later default increase (Codex review on #213).
*/
function pruneDefaultContextOverrides(windows, models) {
	const defaults = new Map(models.map((model) => [model.id, model.defaultContextWindow]));
	const kept = Object.create(null);
	for (const [model, value] of Object.entries(windows)) {
		if (defaults.get(model) === value) continue;
		kept[model] = value;
	}
	return kept;
}

//#endregion
//#region src/client/SettingHelp.tsx
/** A separate button avoids nesting interactive help inside a control label. */
function SettingHelp({ title, hint, t, portal = true }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Tooltip, {
		label: hint,
		side: "bottom",
		portal,
		openOnClick: true,
		maxWidth: 340,
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
			type: "button",
			className: "dsh-subscription-setting-help",
			"aria-label": t("settingsHelpLabel", { setting: title }),
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				"aria-hidden": "true",
				width: "16",
				height: "16",
				viewBox: "0 0 16 16",
				fill: "none",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "8",
					cy: "8",
					r: "6.25",
					stroke: "currentColor",
					strokeWidth: "1.3"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M8 7v4M8 4.75v.1",
					stroke: "currentColor",
					strokeWidth: "1.5",
					strokeLinecap: "round"
				})]
			})
		})
	});
}

//#endregion
//#region src/client/ProviderActionIcon.tsx
function ProviderActionIcon({ icon }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
		"aria-hidden": "true",
		width: "16",
		height: "16",
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: "1.7",
		strokeLinecap: "round",
		strokeLinejoin: "round",
		children: icon === "add" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 5v14M5 12h14" }) : icon === "refresh" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M20 7v5h-5M4 17v-5h5" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M5.6 9a7 7 0 0 1 11.7-2L20 12M4 12l2.7 5a7 7 0 0 0 11.7-2" })] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M10 3h4l.6 2.6 1.5.9 2.6-.8 2 3.5-2 1.8v2l2 1.8-2 3.5-2.6-.8-1.5.9L14 21h-4l-.6-2.6-1.5-.9-2.6.8-2-3.5 2-1.8v-2l-2-1.8 2-3.5 2.6.8 1.5-.9z" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
			cx: "12",
			cy: "12",
			r: "2.7"
		})] })
	});
}

//#endregion
//#region src/client/ProviderRefreshButton.tsx
function ProviderRefreshButton({ label, disabled, onClick }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
		type: "button",
		className: "dsh-subscription-quiet",
		style: {
			gap: 6,
			marginLeft: "auto"
		},
		disabled,
		onClick,
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderActionIcon, { icon: "refresh" }), label]
	});
}

//#endregion
//#region src/client/ProviderModelEditor.tsx
const border$2 = "0.5px solid var(--dsw-alias-border-l2, #ddd)";
const actions$2 = {
	display: "flex",
	flexWrap: "wrap",
	gap: 8,
	alignItems: "center"
};
/** Decorative symbols complement the existing translated labels. */
function ToolIcon({ tool }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
		"aria-hidden": "true",
		width: "16",
		height: "16",
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: "1.7",
		strokeLinecap: "round",
		strokeLinejoin: "round",
		style: {
			flex: "0 0 auto",
			marginTop: 2
		},
		children: tool === "image_generate" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
				x: "3",
				y: "4",
				width: "18",
				height: "16",
				rx: "2"
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
				cx: "8",
				cy: "9",
				r: "1.5"
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m4 18 5-5 3 3 3-4 5 6" })
		] }) : tool === "video_generate" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
			x: "3",
			y: "5",
			width: "13",
			height: "14",
			rx: "2"
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m16 10 5-3v10l-5-3z" })] }) : tool === "web_search" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
			cx: "12",
			cy: "12",
			r: "9"
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" })] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M5 4 19 20M19 4 5 20" }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
				cx: "18",
				cy: "18",
				r: "3"
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m20.2 20.2 1.8 1.8" })
		] })
	});
}
/**
* Embedded section of the account manager dialog. It owns the model draft
* (visibility, effort, context, tools) but not its submission: the dialog
* collects the draft through the handle and saves it with the account edits
* in one go, so there is a single Save/Cancel pair.
*/
const ProviderModelEditor = (0, react.forwardRef)(function ProviderModelEditor$1({ provider, rpc, t, disabled = false, globalContextWindow, onDirtyChange }, ref) {
	const [catalog, setCatalog] = (0, react.useState)();
	const [draft, setDraft] = (0, react.useState)({});
	const [contexts, setContexts] = (0, react.useState)({});
	const [efforts, setEfforts] = (0, react.useState)({});
	const [query, setQuery] = (0, react.useState)("");
	const [expanded, setExpanded] = (0, react.useState)(() => /* @__PURE__ */ new Set());
	const [revealedInvalidModel, setRevealedInvalidModel] = (0, react.useState)();
	const [editingName, setEditingName] = (0, react.useState)();
	const idPrefix = (0, react.useId)();
	const [busy, setBusy] = (0, react.useState)(false);
	const [dirty, setDirty] = (0, react.useState)(false);
	const [error, setError] = (0, react.useState)("");
	const generation = (0, react.useRef)(0);
	(0, react.useEffect)(() => () => {
		generation.current++;
	}, []);
	(0, react.useEffect)(() => {
		onDirtyChange?.(dirty);
	}, [dirty]);
	function reset(data) {
		setCatalog(data);
		setExpanded(/* @__PURE__ */ new Set());
		setRevealedInvalidModel(void 0);
		setDraft(data.settings);
		setEfforts(Object.fromEntries(data.models.map((model) => [model.id, model.configured ?? ""])));
		setContexts(Object.fromEntries(Object.entries(data.settings.contextWindows ?? {}).map(([id, value]) => [id, String(value)])));
		setDirty(false);
	}
	async function load(force = false) {
		const request = ++generation.current;
		setBusy(true);
		setError("");
		try {
			const data = await callSubscriptionsAuth(rpc, "providerSettings", {
				provider,
				force
			});
			if (generation.current === request) reset(data);
		} catch (error$1) {
			if (generation.current === request) setError(String(error$1 instanceof Error ? error$1.message : error$1));
		} finally {
			if (generation.current === request) setBusy(false);
		}
	}
	function edit(next) {
		setDraft(next);
		setDirty(true);
	}
	/** A saved grok context override that differs from the advertised default. */
	function hasGrokContextOverride(model) {
		const saved = Object.hasOwn(draft.contextWindows ?? {}, model.id) ? draft.contextWindows[model.id] : void 0;
		return saved !== void 0 && saved !== model.defaultContextWindow;
	}
	/** Catalog-driven window picker (issue #149): tiers come from the live grok catalog. */
	function grokContextPicker(model) {
		const choice = contextWindowChoice(contexts[model.id] ?? "", model);
		return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			style: actions$2,
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				style: actions$2,
				children: [t("modelsContextWindow"), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
					"aria-label": `${model.name} ${t("modelsContextWindow")}`,
					value: choice.value,
					onChange: (event) => {
						setContexts({
							...contexts,
							[model.id]: event.target.value
						});
						setDirty(true);
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: "",
							children: t("modelsContextFollow", { default: formatWindowLabel(model.defaultContextWindow) })
						}),
						choice.tiers.map((tier) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: String(tier),
							children: formatWindowLabel(tier)
						}, tier)),
						choice.unavailable !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: String(choice.unavailable),
							disabled: true,
							children: t("modelsContextUnavailableOption", { value: formatWindowLabel(choice.unavailable) })
						})
					]
				})]
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("modelsContextBounds", {
				default: formatWindowLabel(model.defaultContextWindow),
				max: formatWindowLabel(model.maxContextWindow)
			}) })]
		});
	}
	(0, react.useEffect)(() => {
		load();
	}, [provider, rpc]);
	(0, react.useImperativeHandle)(ref, () => ({ collect() {
		if (!catalog || !dirty) return { efforts: [] };
		const windows = Object.create(null);
		for (const [model, text] of Object.entries(contexts)) {
			if (!text.trim()) continue;
			const value = Number(text);
			if (!/^\d+$/.test(text.trim()) || !Number.isSafeInteger(value) || value <= 0) {
				setExpanded((previous) => new Set(previous).add(model));
				setRevealedInvalidModel(model);
				setError(t("modelsContextInvalid", { model }));
				return;
			}
			windows[model] = value;
		}
		setError("");
		setRevealedInvalidModel(void 0);
		const keptWindows = provider === "grok" ? pruneDefaultContextOverrides(windows, catalog.models) : windows;
		const { accounts: _accounts,...settings } = {
			...draft,
			...provider === "codex" || provider === "grok" ? { contextWindows: keptWindows } : {}
		};
		return {
			settings,
			efforts: catalog.models.flatMap((model) => {
				const effort = efforts[model.id] ?? "";
				return effort === (model.configured ?? "") || !model.efforts?.length ? [] : [{
					model: model.id,
					effort
				}];
			})
		};
	} }), [
		catalog,
		dirty,
		draft,
		contexts,
		efforts,
		provider
	]);
	const allModels = catalog?.models ?? [];
	const known = new Set(allModels.map((model) => model.id));
	const missing = savedModelIds(draft.visibleModels, draft.modelDisplayNames, draft.subagentSpeeds).filter((id) => !known.has(id)).map((id) => ({
		id,
		name: id
	}));
	const customName = (id) => Object.hasOwn(draft.modelDisplayNames ?? {}, id) ? draft.modelDisplayNames[id] : "";
	const editName = (id, value) => {
		const names = Object.assign(Object.create(null), draft.modelDisplayNames);
		if (value.trim()) names[id] = value;
		else delete names[id];
		edit({
			...draft,
			modelDisplayNames: names
		});
	};
	const displayName = (model) => customName(model.id).trim() || model.name;
	const models = [...allModels, ...missing].filter((model) => model.id === editingName || model.id === revealedInvalidModel || `${model.name} ${model.id} ${customName(model.id)}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => displayName(b).localeCompare(displayName(a), void 0, {
		sensitivity: "base",
		numeric: true
	}) || b.id.localeCompare(a.id));
	const editorState = modelEditorState({
		discovered: allModels.length,
		saved: missing.length,
		matched: models.length,
		accounts: catalog?.accounts ?? []
	});
	const selected = new Set(draft.visibleModels ?? allModels.map((model) => model.id));
	const codexContextDefault = (max, effective) => globalContextWindow === void 0 ? effective ?? max : Math.min(globalContextWindow ?? max, max);
	const modelDescriptionId = (id) => idPrefix + "-model-id-" + Array.from({ length: id.length }, (_, i) => id.charCodeAt(i).toString(16).padStart(4, "0")).join("");
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		style: {
			borderTop: border$2,
			marginTop: 12,
			paddingTop: 12
		},
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			style: {
				...actions$2,
				gap: 4
			},
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
					style: { margin: 0 },
					children: t("modelsEdit")
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingHelp, {
					title: t("modelsEdit"),
					hint: t("modelsHint"),
					t,
					portal: false
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderRefreshButton, {
					label: t("usageRefresh"),
					disabled: busy || disabled || dirty,
					onClick: () => {
						load(true);
					}
				}),
				busy && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					role: "status",
					children: t("modelDefaultsLoading")
				})
			]
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			style: {
				display: "grid",
				gap: 12,
				marginTop: 12
			},
			children: [error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				role: "alert",
				children: error
			}), catalog && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("fieldset", {
				disabled: busy || disabled,
				style: {
					border: 0,
					padding: 0,
					margin: 0,
					minWidth: 0,
					display: "grid",
					gap: 12
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							checked: draft.visibleModels === void 0,
							onChange: (event) => {
								const next = { ...draft };
								if (event.target.checked) delete next.visibleModels;
								else next.visibleModels = allModels.map((model) => model.id);
								edit(next);
							}
						}),
						" ",
						t("modelsAutomatic")
					] }),
					editorState.listState === "provider-empty" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dsh-subscription-hint",
						children: t(editorState.noticeKey)
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: actions$2,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								style: { flex: "1 1 180px" },
								value: query,
								onChange: (event) => {
									setQuery(event.target.value);
									setRevealedInvalidModel(void 0);
								},
								placeholder: t("modelDefaultsFilterPlaceholder"),
								"aria-label": t("modelDefaultsFilterPlaceholder")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => edit({
									...draft,
									visibleModels: allModels.map((model) => model.id)
								}),
								children: t("modelsSelectAll")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => edit({
									...draft,
									visibleModels: []
								}),
								children: t("modelsSelectNone")
							})
						]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							maxHeight: 360,
							overflowY: "auto",
							display: "grid",
							gap: 0,
							alignContent: "start"
						},
						children: [models.map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								borderBottom: expanded.has(model.id) ? border$2 : "none",
								padding: expanded.has(model.id) ? "2px 2px 10px" : "2px",
								display: "grid",
								gap: expanded.has(model.id) ? 8 : 0
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									...actions$2,
									flexWrap: "nowrap",
									minWidth: 0
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									"aria-describedby": modelDescriptionId(model.id),
									"aria-label": `${displayName(model)}${!known.has(model.id) ? ` (${t("modelsUnavailable")})` : ""}`,
									checked: selected.has(model.id),
									onChange: (event) => {
										const next = new Set(selected);
										if (event.target.checked) next.add(model.id);
										else next.delete(model.id);
										edit({
											...draft,
											visibleModels: [...next]
										});
									}
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									"aria-labelledby": modelDescriptionId(model.id) + "-name",
									"aria-describedby": modelDescriptionId(model.id),
									"aria-expanded": expanded.has(model.id),
									onClick: () => setExpanded((previous) => {
										const next = new Set(previous);
										if (next.has(model.id)) next.delete(model.id);
										else next.add(model.id);
										return next;
									}),
									className: "dsh-subscription-model-toggle",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: "dsh-subscription-model-name",
											id: modelDescriptionId(model.id) + "-name",
											children: [displayName(model), !known.has(model.id) && ` (${t("modelsUnavailable")})`]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: "dsh-subscription-model-id",
											id: modelDescriptionId(model.id),
											children: ["ID: ", model.id]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: "dsh-subscription-model-action",
											"aria-hidden": "true",
											children: [t(expanded.has(model.id) ? "modelsCollapse" : "modelsExpand"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
												width: "16",
												height: "16",
												viewBox: "0 0 16 16",
												fill: "none",
												stroke: "currentColor",
												strokeWidth: "1.7",
												strokeLinecap: "round",
												strokeLinejoin: "round",
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: expanded.has(model.id) ? "m4 10 4-4 4 4" : "m4 6 4 4 4-4" })
											})]
										})
									]
								})]
							}), expanded.has(model.id) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: actions$2,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										style: {
											display: "grid",
											gap: 6,
											flex: "1 1 200px",
											minWidth: 0
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: { fontSize: 12 },
											children: t("modelDisplayName")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											maxLength: 80,
											"aria-label": `${model.name} ${t("modelDisplayName")}`,
											placeholder: model.name,
											value: customName(model.id),
											onFocus: () => setEditingName(model.id),
											onBlur: () => setEditingName(void 0),
											onChange: (event) => editName(model.id, event.target.value)
										})]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										style: { alignSelf: "end" },
										"aria-label": `${model.name} ${t("displayNameReset")}`,
										disabled: !customName(model.id),
										onClick: () => editName(model.id, ""),
										children: t("displayNameReset")
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", {
									style: { color: "var(--dsw-alias-label-tertiary)" },
									children: t("modelDisplayNameHint")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: actions$2,
									children: [
										(model.efforts?.length ?? 0) > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
											style: actions$2,
											children: [t("modelDefaultsTitle"), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
												"aria-label": `${model.name} ${t("modelDefaultsTitle")}`,
												value: efforts[model.id] ?? "",
												onChange: (event) => {
													setEfforts({
														...efforts,
														[model.id]: event.target.value
													});
													setDirty(true);
												},
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
														value: "",
														children: t("modelDefaultsFollowProvider")
													}),
													model.configured && !model.efforts?.some((effort) => effort.id === model.configured) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
														value: model.configured,
														disabled: true,
														children: [
															model.configured,
															" (",
															t("modelsUnavailable"),
															")"
														]
													}),
													model.efforts?.map((effort) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
														value: effort.id,
														children: effort.name
													}, effort.id))
												]
											})]
										}),
										provider === "codex" && model.maxContextWindow !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											style: actions$2,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
												style: actions$2,
												children: [t("modelsContext"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													style: { width: 140 },
													inputMode: "numeric",
													value: contexts[model.id] ?? "",
													"aria-label": `${model.name} ${t("modelsContext")}`,
													placeholder: String(codexContextDefault(model.maxContextWindow, model.defaultContextWindow)),
													onChange: (event) => {
														setContexts({
															...contexts,
															[model.id]: event.target.value
														});
														setDirty(true);
													}
												})]
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t(typeof globalContextWindow === "number" ? "modelsGlobalContextBounds" : "modelsCodexContextBounds", {
												default: codexContextDefault(model.maxContextWindow, model.defaultContextWindow),
												standard: model.standardContextWindow ?? model.defaultContextWindow ?? model.maxContextWindow,
												max: model.maxContextWindow
											}) })]
										}),
										provider === "grok" && model.defaultContextWindow !== void 0 && ((model.contextWindowOptions?.length ?? 0) > 1 || hasGrokContextOverride(model)) && grokContextPicker(model)
									]
								}),
								provider === "codex" && (model.fastTier || Object.hasOwn(draft.subagentSpeeds ?? {}, model.id)) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: {
										display: "grid",
										gap: 6
									},
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: actions$2,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
											style: actions$2,
											children: [t("modelsSubagentSpeed"), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
												"aria-label": `${model.name} ${t("modelsSubagentSpeed")}`,
												value: Object.hasOwn(draft.subagentSpeeds ?? {}, model.id) ? draft.subagentSpeeds[model.id] : "standard",
												onChange: (event) => edit({
													...draft,
													subagentSpeeds: {
														...draft.subagentSpeeds,
														[model.id]: event.target.value
													}
												}),
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: "standard",
													children: t("speedStandard")
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
													value: "fast",
													disabled: !model.fastTier,
													children: [t("speedFast"), !model.fastTier && ` (${t("modelsUnavailable")})`]
												})]
											})]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingHelp, {
											title: `${model.name} ${t("modelsSubagentSpeed")}`,
											hint: t("modelsSubagentSpeedHint"),
											t,
											portal: false
										})]
									})
								})
							] })]
						}, model.id)), models.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("modelDefaultsFilterEmpty", { query }) })]
					})] }),
					provider === "codex" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("modelsContextHint") }),
					provider === "grok" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("modelsContextGrokHint") }),
					catalog.tools.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "grid",
							gap: 8
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 4
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("modelsTools") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingHelp, {
								title: t("modelsTools"),
								hint: t("modelsToolsHint"),
								t,
								portal: false
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsh-subscription-tools",
							children: catalog.tools.map((tool) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: draft.tools?.[tool] !== false,
									onChange: (event) => edit({
										...draft,
										tools: {
											...draft.tools,
											[tool]: event.target.checked
										}
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToolIcon, { tool }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(tool === "image_generate" ? "modelsImage" : tool === "video_generate" ? "modelsVideo" : tool === "web_search" ? "modelsWebSearch" : "modelsSearch") })
							] }, tool))
						})]
					})
				]
			})]
		})]
	});
});

//#endregion
//#region src/client/display-name-events.ts
/** Notify mounted views after a successful save, without another quota request. */
const DISPLAY_NAME_CHANGED = "dsh-subscriptions-display-name-changed";
function notifyDisplayNameChange(provider, displayName) {
	window.dispatchEvent(new CustomEvent(DISPLAY_NAME_CHANGED, { detail: {
		provider,
		...displayName?.trim() ? { displayName: displayName.trim() } : {}
	} }));
}

//#endregion
//#region src/client/provider-settings-styles.ts
/**
* The host loads one JS client bundle, so keep this small, scoped stylesheet
* with the dialog instead of relying on a separate CSS asset. Geometry and
* theme tokens follow the host's settings-form and ui-primitives controls.
*/
const formScope = ":is(.dsh-subscription-manager, .dsh-subscriptions-settings)";
const dialogLayout = {
	border: "0.5px solid var(--dsw-alias-border-l2)",
	stack: {
		display: "grid",
		gap: 12,
		minWidth: 0
	},
	actions: {
		display: "flex",
		flexWrap: "wrap",
		gap: 8,
		alignItems: "center"
	}
};
const providerSettingsCss = `
.dsh-subscription-manager {
  box-sizing: border-box;
  padding: 0;
  border: 0;
  border-radius: var(--dsw-radius-panel, 16px);
  background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1));
  color: var(--dsw-alias-label-primary);
  box-shadow: var(--dsw-elevation-prominent, 0 20px 70px #0004);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  color-scheme: light;
}
.dsh-subscriptions-settings {
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  color-scheme: light;
}
.dsh-subscription-provider-area { min-width: 0; }
.dsh-subscription-provider-header {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 8px 12px;
}
.dsh-subscription-provider-identity { flex: 1 1 12rem; min-width: 0; overflow-wrap: anywhere; }
.dsh-subscription-provider-actions,
.dsh-subscription-add-account {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.dsh-subscription-provider-actions { margin-left: auto; }
.dsh-subscription-add-account { gap: 2px; }
.dsh-subscription-provider-actions button { gap: 5px; }
.subscriptions-credit-summary { padding-top: 8px; }
.subscriptions-credit-line,
.subscriptions-reset-credits > summary {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 12px;
}
.subscriptions-reset-count {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
}
.subscriptions-credit-line > :not(.subscriptions-reset-count) ~ .subscriptions-reset-count,
.subscriptions-reset-credits > summary > :not(.subscriptions-reset-count) ~ .subscriptions-reset-count {
  margin-inline-start: auto;
}
.subscriptions-reset-credits > summary { list-style: none; cursor: pointer; }
.subscriptions-reset-credits > summary::-webkit-details-marker { display: none; }
.subscriptions-reset-disclosure { display: inline-flex; align-items: center; gap: 3px; }
.subscriptions-reset-credits:not([open]) .subscriptions-reset-collapse,
.subscriptions-reset-credits[open] .subscriptions-reset-expand { display: none; }
.subscriptions-reset-credits[open] .subscriptions-reset-disclosure svg { transform: rotate(180deg); }
.subscriptions-reset-list { display: grid; gap: 4px; margin-top: 6px; }
.subscriptions-reset-row { display: flex; align-items: center; gap: 8px; min-height: 28px; }
.subscriptions-reset-row > span { min-width: 0; overflow-wrap: anywhere; }
.dsh-subscription-tabs-shell {
  position: relative;
  min-width: 0;
  margin-bottom: 4px;
  --tabs-surface: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1, Canvas));
}
.dsh-subscription-tabs {
  overflow-x: auto;
  scrollbar-width: none;
}
.dsh-subscription-tabs::-webkit-scrollbar { display: none; }
.dsh-subscription-tabs-track {
  display: flex;
  width: max-content;
  gap: 6px;
  padding: 4px 4px 10px;
}
.dsh-subscription-tabs-shell::before,
.dsh-subscription-tabs-shell::after {
  position: absolute;
  z-index: 1;
  top: 4px;
  bottom: 10px;
  width: 44px;
  content: '';
  pointer-events: none;
  opacity: 0;
  transition: opacity 120ms ease;
}
.dsh-subscription-tabs-shell::before {
  left: 0;
  background: linear-gradient(to right, var(--tabs-surface) 24px, transparent);
}
.dsh-subscription-tabs-shell::after {
  right: 0;
  background: linear-gradient(to left, var(--tabs-surface) 24px, transparent);
}
.dsh-subscription-tabs-shell[data-left]::before,
.dsh-subscription-tabs-shell[data-right]::after { opacity: 1; }
${formScope} button.dsh-subscription-tabs-arrow {
  position: absolute;
  z-index: 2;
  top: 6px;
  width: 24px;
  height: 24px;
  min-height: 24px;
  padding: 0;
  border: 1px solid var(--dsw-alias-border-l2, #8884);
  border-radius: 9px;
  color: var(--dsw-alias-label-secondary, inherit);
  background: var(--tabs-surface);
  box-shadow: 0 1px 3px #0002;
  transition: opacity 120ms ease, visibility 120ms;
}
${formScope} button.dsh-subscription-tabs-arrow-left { left: 0; }
${formScope} button.dsh-subscription-tabs-arrow-right { right: 0; }
${formScope} button.dsh-subscription-tabs-arrow:disabled {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}
${formScope} .dsh-subscription-tabs button {
  gap: 6px;
  white-space: nowrap;
  transition: background-color 120ms ease, border-color 120ms ease;
}
${formScope} .dsh-subscription-tabs button:focus-visible { outline-offset: -2px; }
@media (prefers-reduced-motion: reduce) {
  .dsh-subscription-tabs-shell::before,
  .dsh-subscription-tabs-shell::after,
  ${formScope} button.dsh-subscription-tabs-arrow,
  ${formScope} .dsh-subscription-tabs button { transition: none; }
}
${formScope} .dsh-subscription-tabs button[aria-selected="true"] {
  background: var(--dsw-alias-interactive-bg-active, var(--dsw-alias-bg-layer-3));
  border-color: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary));
}
body[data-ds-dark-theme] ${formScope} {
  color-scheme: dark;
}
.dsh-subscription-manager::backdrop {
  background: var(--dsw-alias-bg-mask-1, #0006);
  backdrop-filter: var(--dsw-mask-blur, none);
}
${formScope} h2 {
  font-size: 16px;
  line-height: 24px;
  font-weight: 500;
}
${formScope} h3 {
  font-size: 14px;
  line-height: 22px;
  font-weight: 500;
}
${formScope} strong,
${formScope} .dsh-subscription-label {
  font-size: 13px;
  line-height: 1.5;
  font-weight: 500;
}
${formScope} legend {
  font-size: 14px;
  line-height: 22px;
  font-weight: 500;
}
${formScope} small,
${formScope} .dsh-subscription-hint,
${formScope} [role="status"] {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--dsw-alias-label-tertiary);
}
${formScope} [role="alert"] {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--dsw-alias-state-error-primary, #b42318);
}
${formScope} input:not([type="checkbox"]),
${formScope} select {
  box-sizing: border-box;
  min-width: 0;
  height: 34px;
  padding: 0 12px;
  border: 0.5px solid var(--dsw-alias-border-l4, var(--dsw-alias-border-l2));
  border-radius: var(--dsw-radius-md, 8px);
  background: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-layer-1));
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  font-weight: 400;
  line-height: 1.5;
}
.dsh-subscription-select-wrap {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
}
${formScope} select.dsh-subscription-select {
  appearance: none;
  -webkit-appearance: none;
  height: 36px;
  padding: 0 34px 0 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-base));
  cursor: pointer;
}
.dsh-subscription-select-chevron {
  position: absolute;
  right: 11px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  color: var(--dsw-alias-label-tertiary);
}
${formScope} input::placeholder {
  color: var(--dsw-alias-label-tertiary);
  opacity: 1;
}
${formScope} input:not([type="checkbox"]):focus-visible,
${formScope} select:focus-visible {
  outline: none;
  border-color: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary));
}
${formScope} input:not([type="checkbox"]):disabled,
${formScope} select:disabled {
  color: var(--dsw-alias-label-tertiary);
  cursor: default;
}
${formScope} input[aria-invalid="true"] {
  border-color: var(--dsw-alias-state-error-primary, #b42318);
}
${formScope} option {
  background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1));
  color: var(--dsw-alias-label-primary);
}
${formScope} label:has(> input[type="checkbox"]) {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 14px;
  line-height: 20px;
  cursor: pointer;
}
${formScope} input[type="checkbox"] {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  margin: 2px 0;
  accent-color: var(--dsw-alias-brand-primary);
  cursor: inherit;
}
${formScope} label:has(> input[type="checkbox"]:disabled) {
  cursor: default;
  opacity: 0.5;
}
${formScope} button {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  min-height: 28px;
  padding: 0 10px;
  border: 0.5px solid var(--dsw-alias-border-l3, var(--dsw-alias-border-l2));
  border-radius: var(--dsw-radius-sm, 6px);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
}
${formScope} button:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-3));
}
${formScope} button:active:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-active, var(--dsw-alias-bg-layer-3));
}
${formScope} button:disabled {
  opacity: 0.4;
  cursor: default;
}
${formScope} button.dsh-subscription-setting-help {
  min-height: 24px;
  width: 24px;
  padding: 4px;
  border: 0;
  border-radius: 50%;
  color: var(--dsw-alias-label-tertiary);
}
${formScope} button.dsh-subscription-setting-help:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary));
  outline-offset: 2px;
}

${formScope} button.dsh-subscription-model-toggle {
  flex: 1 1 0;
  min-width: 0;
  justify-content: flex-start;
  gap: 6px;
  padding: 4px 6px;
  border: 0;
  text-align: left;
  overflow-wrap: anywhere;
  font-size: 13px;
}
.dsh-subscription-model-name { min-width: 0; overflow-wrap: anywhere; }
.dsh-subscription-model-id {
  min-width: 0;
  padding-left: 6px;
  color: var(--dsw-alias-label-tertiary, #888);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-subscription-model-action {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  color: var(--dsw-alias-label-tertiary, #888);
  font-size: 12px;
}
.dsh-subscription-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  min-width: 0;
}
.dsh-subscription-tools label { min-width: 0; overflow-wrap: anywhere; }

${formScope} button.dsh-subscription-quiet {
  border-color: transparent;
  color: var(--dsw-alias-label-secondary, var(--dsw-alias-label-primary));
}
${formScope} :is(footer, .dsh-subscription-dialog-actions) button {
  min-height: 34px;
  padding: 0 14px;
  border-radius: var(--dsw-radius-md, 8px);
  font-size: 13px;
  line-height: 1.5;
}
${formScope} button.dsh-subscription-primary {
  border-color: transparent;
  background: var(--dsw-alias-button-primary-fill, var(--dsw-alias-label-primary));
  color: var(--dsw-alias-label-primary-foreground, var(--dsw-alias-bg-layer-1));
  font-weight: 500;
}
${formScope} button.dsh-subscription-primary:hover:not(:disabled) {
  background: var(--dsw-alias-button-primary-hover, var(--dsw-alias-label-secondary));
}
${formScope} button:focus-visible,
${formScope} input[type="checkbox"]:focus-visible,
${formScope} summary:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 2px;
}
${formScope} summary {
  border-radius: var(--dsw-radius-sm, 6px);
}
${formScope} summary:hover {
  color: var(--dsw-alias-label-secondary, var(--dsw-alias-label-primary));
}
`;
/** Composer controls retain their own geometry, separate from settings forms. */
const subscriptionChromeCss = `
.dsh-subscription-usage-pill { corner-shape: round; }
.dsh-subscription-usage-panel {
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1);
  backdrop-filter: var(--dsw-menu-backdrop-filter, none);
}
.dsh-subscription-speed button:hover:not(:disabled) {
  --dsh-subscription-speed-hover: var(--dsw-alias-interactive-bg-hover);
}
.dsh-subscription-speed button:active:not(:disabled) {
  --dsh-subscription-speed-hover: var(--dsw-alias-interactive-bg-active);
}
.dsh-subscription-speed button:disabled { opacity: 0.4; cursor: default; }
.dsh-subscription-speed button:focus-visible,
.dsh-subscription-usage-pill:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 2px;
}
`;

//#endregion
//#region src/client/SubscriptionTabs.tsx
const EDGE = 44;
const EPSILON = 1;
function revealDelta(el, tab) {
	const viewport = el.getBoundingClientRect();
	const item = tab.getBoundingClientRect();
	const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
	const overflow = maxScroll > EPSILON;
	if (overflow && !tab.previousElementSibling) return -el.scrollLeft;
	if (overflow && !tab.nextElementSibling) return maxScroll - el.scrollLeft;
	const inset = overflow ? Math.min(EDGE + 4, Math.max(4, (viewport.width - item.width) / 2)) : 4;
	const left = item.left - viewport.left - inset;
	const right = item.right - viewport.right + inset;
	const raw = left < -EPSILON ? left : right > EPSILON ? right : 0;
	return Math.max(-el.scrollLeft, Math.min(maxScroll - el.scrollLeft, raw));
}
function Chevron({ direction }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
		"aria-hidden": "true",
		width: "14",
		height: "14",
		viewBox: "0 0 16 16",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: "1.8",
		strokeLinecap: "round",
		strokeLinejoin: "round",
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: direction === -1 ? "M10 3.5 5.5 8l4.5 4.5" : "M6 3.5 10.5 8 6 12.5" })
	});
}
/** Automatic-activation horizontal tabs, shared by provider and account settings. */
function SubscriptionTabs({ tabs, active, onSelect, prefix, label, scrollLeftLabel, scrollRightLabel, tabRefs }) {
	const internalRefs = (0, react.useRef)({});
	const refs = tabRefs ?? internalRefs;
	const list = (0, react.useRef)(null);
	const track = (0, react.useRef)(null);
	const [edges, setEdges] = (0, react.useState)({
		left: false,
		right: false
	});
	const updateEdges = (0, react.useCallback)(() => {
		const el = list.current;
		if (!el) return;
		const left = el.scrollLeft > EPSILON;
		const right = el.scrollWidth - el.clientWidth - el.scrollLeft > EPSILON;
		setEdges((previous) => previous.left === left && previous.right === right ? previous : {
			left,
			right
		});
	}, []);
	const activeRef = (0, react.useRef)(active);
	activeRef.current = active;
	const tabOrder = tabs.map((tab) => tab.key).join("\0");
	const lastOrderRef = (0, react.useRef)(tabOrder);
	const reveal = (0, react.useCallback)((tab, behavior = "auto") => {
		const el = list.current;
		if (!el || !tab) return;
		const delta = revealDelta(el, tab);
		if (Math.abs(delta) > EPSILON) el.scrollBy({
			left: delta,
			behavior
		});
	}, []);
	(0, react.useLayoutEffect)(() => {
		updateEdges();
		let lastWidth = list.current?.clientWidth ?? 0;
		const observer = new ResizeObserver(() => {
			const width = list.current?.clientWidth ?? 0;
			if (width !== lastWidth) {
				lastWidth = width;
				const tab = activeRef.current === void 0 ? void 0 : refs.current?.[activeRef.current];
				if (tab) reveal(tab);
			}
			updateEdges();
		});
		if (list.current) observer.observe(list.current);
		if (track.current) observer.observe(track.current);
		return () => observer.disconnect();
	}, [
		refs,
		reveal,
		updateEdges
	]);
	(0, react.useLayoutEffect)(() => {
		const orderChanged = lastOrderRef.current !== tabOrder;
		lastOrderRef.current = tabOrder;
		const tab = active === void 0 ? void 0 : refs.current?.[active];
		if (orderChanged || tab !== document.activeElement) reveal(tab);
	}, [
		active,
		tabOrder,
		refs,
		reveal
	]);
	const scrollTab = (direction) => {
		const el = list.current;
		if (!el || !track.current) return;
		const viewport = el.getBoundingClientRect();
		const buttons = Array.from(track.current.children);
		const next = (direction === 1 ? buttons : buttons.reverse()).find((tab) => {
			const rect = tab.getBoundingClientRect();
			if (!(direction === 1 ? rect.right > viewport.right - EDGE + EPSILON : rect.left < viewport.left + EDGE - EPSILON)) return false;
			const delta = revealDelta(el, tab);
			return direction === 1 ? delta > EPSILON : delta < -EPSILON;
		});
		const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
		if (next) reveal(next, behavior);
		else el.scrollTo({
			left: direction === 1 ? el.scrollWidth - el.clientWidth : 0,
			behavior
		});
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "dsh-subscription-tabs-shell",
		"data-left": edges.left || void 0,
		"data-right": edges.right || void 0,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: "dsh-subscription-tabs-arrow dsh-subscription-tabs-arrow-left",
				"aria-label": scrollLeftLabel,
				disabled: !edges.left,
				onClick: () => scrollTab(-1),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Chevron, { direction: -1 })
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dsh-subscription-tabs",
				ref: list,
				role: "tablist",
				"aria-label": label,
				onScroll: updateEdges,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dsh-subscription-tabs-track",
					role: "presentation",
					ref: track,
					children: tabs.map((tab, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						role: "tab",
						"data-subscription-provider": tab.provider,
						id: prefix + "-tab-" + tab.id,
						ref: (node) => {
							if (node) refs.current[tab.key] = node;
							else delete refs.current[tab.key];
						},
						"aria-controls": prefix + "-panel-" + tab.id,
						"aria-selected": active === tab.key,
						"aria-label": tab.ariaLabel,
						tabIndex: active === tab.key ? 0 : -1,
						onFocus: (event) => {
							onSelect(tab.key);
							reveal(event.currentTarget, event.currentTarget.matches(":focus-visible") && !window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "auto");
						},
						onClick: () => onSelect(tab.key),
						onKeyDown: (event) => {
							let next = index;
							if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
							else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
							else if (event.key === "Home") next = 0;
							else if (event.key === "End") next = tabs.length - 1;
							else return;
							event.preventDefault();
							refs.current?.[tabs[next].key]?.focus({ preventScroll: true });
						},
						children: tab.content ?? tab.label
					}, tab.key))
				})
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: "dsh-subscription-tabs-arrow dsh-subscription-tabs-arrow-right",
				"aria-label": scrollRightLabel,
				disabled: !edges.right,
				onClick: () => scrollTab(1),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Chevron, { direction: 1 })
			})
		]
	});
}

//#endregion
//#region src/codex-budget-defaults.ts
const CODEX_DEFAULT_MAX_TOKENS = 8192;

//#endregion
//#region src/client/ProviderAccountManager.tsx
const PROMPT_CACHE_TTLS = ["5m", "1h"];
const { border: border$1, stack: stack$1, actions: actions$1 } = dialogLayout;
/** Model ids listed inline after a successful probe; the rest are only counted. */
const PROBE_PREVIEW = 6;
/** Native top-layer dialog provides keyboard containment, Escape and focus restoration. */
function ProviderAccountManager({ provider, name, accountsVersion, rpc, t, onClose }) {
	const dialog = (0, react.useRef)(null);
	const title = (0, react.useId)();
	const description = (0, react.useId)();
	const cacheTtlId = (0, react.useId)();
	const displayNameId = (0, react.useId)();
	const tabIdPrefix = (0, react.useId)();
	const [selectedAccount, setSelectedAccount] = (0, react.useState)();
	const selectedAccountRef = (0, react.useRef)();
	selectedAccountRef.current = selectedAccount;
	const tabRefs = (0, react.useRef)({});
	const restoreAccountFocus = (0, react.useRef)(false);
	const initialized = (0, react.useRef)(false);
	const contextWindowId = (0, react.useId)();
	const outputReserveId = (0, react.useId)();
	const [catalog, setCatalog] = (0, react.useState)();
	const [changes, setChanges] = (0, react.useState)({});
	const [loading, setLoading] = (0, react.useState)(true);
	const [saving, setSaving] = (0, react.useState)(false);
	const [error, setError] = (0, react.useState)("");
	const [saveError, setSaveError] = (0, react.useState)("");
	const [attempt, setAttempt] = (0, react.useState)(0);
	const [modelsDirty, setModelsDirty] = (0, react.useState)(false);
	const [displayName, setDisplayName] = (0, react.useState)("");
	const [nameDirty, setNameDirty] = (0, react.useState)(false);
	/** '' follows the plugin config; otherwise an explicit TTL. */
	const [cacheTtl, setCacheTtl] = (0, react.useState)("");
	const [cacheTtlDirty, setCacheTtlDirty] = (0, react.useState)(false);
	const [probes, setProbes] = (0, react.useState)({});
	const [contextWindow, setContextWindow] = (0, react.useState)("");
	const [outputReserve, setOutputReserve] = (0, react.useState)("");
	const [contextDirty, setContextDirty] = (0, react.useState)(false);
	const [reserveDirty, setReserveDirty] = (0, react.useState)(false);
	const [budgetSubmitted, setBudgetSubmitted] = (0, react.useState)(false);
	const alive = (0, react.useRef)(true);
	const saveLock = (0, react.useRef)(false);
	/** One in-flight probe per account; a second click while one runs is a no-op. */
	const probeLocks = (0, react.useRef)(/* @__PURE__ */ new Set());
	const editor = (0, react.useRef)(null);
	(0, react.useEffect)(() => {
		alive.current = true;
		const element = dialog.current;
		const previous = document.activeElement;
		element.showModal();
		return () => {
			alive.current = false;
			element.close();
			if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
		};
	}, []);
	(0, react.useEffect)(() => {
		let current = true;
		setLoading(true);
		setError("");
		callSubscriptionsAuth(rpc, "providerSettings", { provider }).then((data) => {
			if (current) {
				if (!initialized.current) {
					setDisplayName(data.settings.displayName ?? "");
					setCacheTtl(data.settings.promptCacheTtl ?? "");
					setContextWindow(data.settings.contextWindow?.toString() ?? "");
					setOutputReserve(data.settings.defaultMaxTokens?.toString() ?? "");
					initialized.current = true;
				}
				const previous = selectedAccountRef.current;
				if (previous !== void 0 && !data.accounts.some((account) => account.key === previous)) {
					const focus = document.activeElement;
					const oldTab = tabRefs.current[previous];
					const oldPanel = oldTab?.getAttribute("aria-controls");
					restoreAccountFocus.current = focus === oldTab || !!(oldPanel && document.getElementById(oldPanel)?.contains(focus));
					setSelectedAccount(data.accounts[0]?.key);
				} else if (previous === void 0) setSelectedAccount(data.accounts[0]?.key);
				setCatalog(data);
			}
		}).catch((error$1) => {
			if (current) setError(t("accountsLoadFailed", { message: error$1 instanceof Error ? error$1.message : String(error$1) }));
		}).finally(() => {
			if (current) setLoading(false);
		});
		return () => {
			current = false;
		};
	}, [
		provider,
		rpc,
		attempt,
		accountsVersion
	]);
	(0, react.useLayoutEffect)(() => {
		if (!restoreAccountFocus.current) return;
		restoreAccountFocus.current = false;
		if (selectedAccount !== void 0 && tabRefs.current[selectedAccount]) tabRefs.current[selectedAccount].focus();
		else dialog.current?.querySelector("header button")?.focus();
	}, [catalog, selectedAccount]);
	function parseBudget(value) {
		if (!/^[0-9]+$/.test(value)) return void 0;
		const parsed = Number(value);
		return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : void 0;
	}
	const contextInvalid = contextWindow !== "" && parseBudget(contextWindow) === void 0;
	const reserveInvalid = outputReserve !== "" && parseBudget(outputReserve) === void 0;
	function edit(key, next) {
		setChanges((current) => ({
			...current,
			[key]: next
		}));
	}
	/**
	* Fetch one account's model list live, through the proxy typed above it. The
	* draft goes out with the request, so a new proxy can be proven before it is
	* saved; the host answers with what came back rather than throwing.
	*/
	async function probe(key) {
		if (probeLocks.current.has(key)) return;
		probeLocks.current.add(key);
		const field = changes[key] ?? catalog?.settings.accounts?.[key] ?? {};
		setProbes((current) => ({
			...current,
			[key]: { running: true }
		}));
		try {
			const result = await callSubscriptionsAuth(rpc, "accountModelsTest", {
				provider,
				account: key,
				proxy: field.proxy ?? ""
			});
			if (alive.current) setProbes((current) => ({
				...current,
				[key]: {
					running: false,
					result
				}
			}));
		} catch (error$1) {
			const result = {
				ok: false,
				viaProxy: false,
				models: [],
				latencyMs: 0,
				error: error$1 instanceof Error ? error$1.message : String(error$1)
			};
			if (alive.current) setProbes((current) => ({
				...current,
				[key]: {
					running: false,
					result
				}
			}));
		} finally {
			probeLocks.current.delete(key);
		}
	}
	/**
	* One submit for both drafts: the model editor's (visibility, effort,
	* context, tools) and this dialog's account edits. A failure keeps the
	* dialog open with every edit intact.
	*/
	async function save() {
		if (saveLock.current) return;
		if (provider === "codex" && (contextInvalid || reserveInvalid)) {
			setBudgetSubmitted(true);
			return;
		}
		const models = editor.current === null ? { efforts: [] } : editor.current.collect();
		if (models === void 0) return;
		saveLock.current = true;
		setSaving(true);
		setSaveError("");
		let savedEfforts = 0;
		try {
			for (const { model, effort } of models.efforts) {
				await callSubscriptionsAuth(rpc, "setModelDefault", {
					provider,
					model,
					...effort ? { effort } : {}
				});
				savedEfforts++;
				if (!alive.current) return;
			}
			const latest = await callSubscriptionsAuth(rpc, "providerSettings", { provider });
			if (!alive.current) return;
			const { displayName: _staleName, promptCacheTtl: _staleTtl, contextWindow: _staleContext, defaultMaxTokens: _staleReserve, enabled: _enabled,...rest } = mergeAccountChanges(models.settings === void 0 ? latest.settings : mergeLatestAccounts(models.settings, latest.settings), changes);
			const savedName = nameDirty ? displayName.trim() : latest.settings.displayName;
			const savedTtl = cacheTtlDirty ? cacheTtl : latest.settings.promptCacheTtl;
			const savedContext = contextDirty ? parseBudget(contextWindow) : latest.settings.contextWindow;
			const savedReserve = reserveDirty ? parseBudget(outputReserve) : latest.settings.defaultMaxTokens;
			const settings = {
				...rest,
				...savedName ? { displayName: savedName } : {},
				...savedTtl ? { promptCacheTtl: savedTtl } : {},
				...savedContext === void 0 ? {} : { contextWindow: savedContext },
				...savedReserve === void 0 ? {} : { defaultMaxTokens: savedReserve }
			};
			await callSubscriptionsAuth(rpc, "setProviderSettings", {
				provider,
				settings
			});
			notifyDisplayNameChange(provider, settings.displayName);
			if (alive.current) onClose();
		} catch (error$1) {
			if (alive.current) {
				const message = error$1 instanceof Error ? error$1.message : String(error$1);
				setSaveError((savedEfforts ? t("modelsPartialSave") + " " : "") + t("accountsSaveFailed", { message }));
			}
		} finally {
			saveLock.current = false;
			if (alive.current) setSaving(false);
		}
	}
	const activeAccount = catalog?.accounts.some((account) => account.key === selectedAccount) ? selectedAccount : catalog?.accounts[0]?.key;
	const accountId = (key) => Array.from({ length: key.length }, (_, index) => key.charCodeAt(index).toString(16).padStart(4, "0")).join("") || "empty";
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dialog", {
		className: "dsh-subscription-manager",
		ref: dialog,
		"aria-labelledby": title,
		"aria-describedby": description,
		onCancel: (event) => {
			if (saveLock.current) event.preventDefault();
		},
		onClose,
		style: {
			width: 900,
			maxWidth: "calc(100vw - 32px)",
			maxHeight: "calc(100dvh - 32px)",
			overflow: "auto"
		},
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: providerSettingsCss }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			style: {
				...stack$1,
				padding: 20
			},
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
					style: {
						...actions$1,
						justifyContent: "space-between"
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						id: title,
						style: { margin: 0 },
						children: t("accountsTitle", { provider: name })
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						autoFocus: true,
						disabled: saving,
						onClick: onClose,
						children: t("imageClose")
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					id: description,
					className: "dsh-subscription-hint",
					children: t("accountsHint")
				}),
				error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					role: "alert",
					children: error
				}),
				loading && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					role: "status",
					className: "dsh-subscription-hint",
					children: t("accountsLoading")
				}),
				!loading && (!catalog || !!error) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => setAttempt((value) => value + 1),
					children: t("modelDefaultsRetry")
				}),
				catalog && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("fieldset", {
					disabled: saving,
					style: {
						...stack$1,
						border: 0,
						margin: 0,
						padding: 0
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							style: {
								...stack$1,
								gap: 6,
								paddingBottom: 8
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									...actions$1,
									gap: 4
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
									htmlFor: displayNameId,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("subscriptionDisplayName") })
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingHelp, {
									title: t("subscriptionDisplayName"),
									hint: t("subscriptionDisplayNameHint"),
									t,
									portal: false
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: actions$1,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									id: displayNameId,
									maxLength: 80,
									value: displayName,
									placeholder: name,
									style: { flex: "1 1 200px" },
									onChange: (event) => {
										setDisplayName(event.target.value);
										setNameDirty(true);
									}
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									disabled: !displayName,
									onClick: () => {
										setDisplayName("");
										setNameDirty(true);
									},
									children: t("displayNameReset")
								})]
							})]
						}),
						provider === "claude" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							style: {
								...stack$1,
								gap: 6,
								paddingBottom: 8
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
									htmlFor: cacheTtlId,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("claudePromptCacheTtl") })
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									id: cacheTtlId,
									value: cacheTtl,
									style: { justifySelf: "start" },
									onChange: (event) => {
										setCacheTtl(event.target.value);
										setCacheTtlDirty(true);
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "",
										children: t("claudePromptCacheTtlDefault", { ttl: catalog.promptCacheTtlDefault ?? "5m" })
									}), PROMPT_CACHE_TTLS.map((ttl) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: ttl,
										children: t(`claudePromptCacheTtl${ttl}`)
									}, ttl))]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", {
									className: "dsh-subscription-hint",
									children: t("claudePromptCacheTtlHint")
								})
							]
						}),
						catalog.accounts.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dsh-subscription-hint",
							children: t("accountsEmpty")
						}),
						catalog.accounts.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SubscriptionTabs, {
							prefix: tabIdPrefix,
							label: t("accountsTabs"),
							scrollLeftLabel: t("scrollAccountsLeft"),
							scrollRightLabel: t("scrollAccountsRight"),
							active: activeAccount,
							onSelect: setSelectedAccount,
							tabRefs,
							tabs: catalog.accounts.map((account) => {
								const alias = (changes[account.key] ?? catalog.settings.accounts?.[account.key])?.alias?.trim();
								return {
									key: account.key,
									id: accountId(account.key),
									label: alias || account.label,
									ariaLabel: alias ? alias + " — " + account.label : account.label
								};
							})
						}),
						catalog.accounts.map((account) => {
							const preferences = changes[account.key] ?? catalog.settings.accounts?.[account.key] ?? {};
							const selected = accountPoolSelection(preferences, account.models, provider);
							const models = accountModelRows(account, preferences, provider).sort((a, b) => b.name.localeCompare(a.name, void 0, {
								sensitivity: "base",
								numeric: true
							}) || b.id.localeCompare(a.id));
							const probeState = probes[account.key];
							const probeResult = probeState?.running === false ? probeState.result : void 0;
							return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								role: "tabpanel",
								id: `${tabIdPrefix}-panel-${accountId(account.key)}`,
								"aria-labelledby": `${tabIdPrefix}-tab-${accountId(account.key)}`,
								hidden: activeAccount !== account.key,
								tabIndex: 0,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("fieldset", {
									style: {
										...stack$1,
										border: border$1,
										borderRadius: "var(--dsw-radius-lg, 12px)",
										padding: 14,
										margin: 0
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("legend", {
											style: {
												padding: "0 6px",
												overflowWrap: "anywhere",
												maxWidth: "100%"
											},
											children: account.label
										}),
										account.unavailable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: "dsh-subscription-hint",
											children: t("accountsCatalogUnavailable")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
											style: {
												...stack$1,
												gap: 6
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "dsh-subscription-label",
												children: t("accountsAlias")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												value: preferences.alias ?? "",
												placeholder: account.label,
												onChange: (event) => {
													const next = { ...preferences };
													if (event.target.value.trim()) next.alias = event.target.value;
													else delete next.alias;
													edit(account.key, next);
												}
											})]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
											style: {
												...stack$1,
												gap: 6
											},
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "dsh-subscription-label",
													children: t("accountsProxy")
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													value: preferences.proxy ?? "",
													placeholder: t("accountsProxyPlaceholder"),
													spellCheck: false,
													autoComplete: "off",
													autoCapitalize: "off",
													autoCorrect: "off",
													onChange: (event) => {
														const next = { ...preferences };
														if (event.target.value.trim()) next.proxy = event.target.value;
														else delete next.proxy;
														edit(account.key, next);
													}
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", {
													className: "dsh-subscription-hint",
													children: t("accountsProxyHint")
												})
											]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											style: {
												...actions$1,
												justifyContent: "space-between"
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												disabled: probeState?.running === true,
												onClick: () => {
													probe(account.key);
												},
												children: probeState?.running === true ? t("accountsProbeRunning") : t("accountsProbe")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", {
												className: "dsh-subscription-hint",
												children: t("accountsProbeHint")
											})]
										}),
										probeResult !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											role: probeResult.ok ? "status" : "alert",
											children: probeResult.ok ? t(probeResult.viaProxy ? "accountsProbeOk" : "accountsProbeOkDirect", {
												count: String(probeResult.models.length),
												ms: String(probeResult.latencyMs)
											}) : t("accountsProbeFail", { message: probeResult.error ?? "" })
										}), probeResult.ok && probeResult.models.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", {
											className: "dsh-subscription-hint",
											style: { overflowWrap: "anywhere" },
											children: t("accountsProbeModels", { models: `${probeResult.models.slice(0, PROBE_PREVIEW).join(", ")}${probeResult.models.length > PROBE_PREVIEW ? ` (+${probeResult.models.length - PROBE_PREVIEW})` : ""}` })
										})] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												type: "checkbox",
												checked: preferences.poolEnabled !== false,
												onChange: (event) => edit(account.key, {
													...preferences,
													poolEnabled: event.target.checked
												})
											}),
											" ",
											t("accountsPoolEnabled")
										] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												type: "checkbox",
												checked: preferences.independentEntry === true,
												onChange: (event) => edit(account.key, {
													...preferences,
													independentEntry: event.target.checked
												})
											}),
											" ",
											t("accountsIndependent")
										] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: "dsh-subscription-hint",
											children: t("accountsIndependentHint")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", {
											style: {
												cursor: "pointer",
												fontSize: 13
											},
											children: [
												t("accountsModels"),
												" · ",
												preferences.poolModels === void 0 ? t("accountsModelsAll") : t("accountsModelsCount", { count: selected.size })
											]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											style: {
												...stack$1,
												marginTop: 12
											},
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
													className: "dsh-subscription-hint",
													children: t("accountsModelsHint")
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
														type: "checkbox",
														checked: preferences.poolModels === void 0,
														onChange: (event) => {
															const next = { ...preferences };
															if (event.target.checked) delete next.poolModels;
															else next.poolModels = account.models.map((model) => model.id);
															edit(account.key, next);
														}
													}),
													" ",
													t("accountsModelsAutomatic")
												] }),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													style: actions$1,
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
														type: "button",
														onClick: () => edit(account.key, {
															...preferences,
															poolModels: models.map((model) => model.id)
														}),
														children: t("modelsSelectAll")
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
														type: "button",
														onClick: () => edit(account.key, {
															...preferences,
															poolModels: []
														}),
														children: t("modelsSelectNone")
													})]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													style: {
														...stack$1,
														gap: 8,
														maxHeight: 240,
														overflowY: "auto"
													},
													children: [models.map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
														style: { overflowWrap: "anywhere" },
														children: [
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
																type: "checkbox",
																checked: selected.has(model.id),
																onChange: (event) => {
																	const next = new Set(selected);
																	if (event.target.checked) next.add(model.id);
																	else next.delete(model.id);
																	edit(account.key, {
																		...preferences,
																		poolModels: [...next]
																	});
																}
															}),
															" ",
															model.name,
															model.unavailable && ` (${t("modelsUnavailable")})`
														]
													}, model.id)), models.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
														className: "dsh-subscription-hint",
														children: t("accountsNoModels")
													})]
												})
											]
										})] })
									]
								})
							}, account.key);
						}),
						provider === "codex" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							style: {
								...stack$1,
								gap: 10,
								paddingBottom: 8
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
								style: { margin: 0 },
								children: t("codexModelDefaults")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "grid",
									gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
									gap: 12,
									alignItems: "start"
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										...stack$1,
										gap: 6
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											style: {
												...actions$1,
												gap: 4
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
												htmlFor: contextWindowId,
												children: t("codexGlobalContext")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingHelp, {
												title: t("codexGlobalContext"),
												hint: t("codexGlobalContextHint"),
												t,
												portal: false
											})]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											id: contextWindowId,
											type: "text",
											inputMode: "numeric",
											value: contextWindow,
											placeholder: t("codexContextDefault"),
											"aria-describedby": budgetSubmitted && contextInvalid ? contextWindowId + "-error" : void 0,
											"aria-invalid": budgetSubmitted && contextInvalid || void 0,
											onChange: (event) => {
												setContextWindow(event.target.value);
												setContextDirty(true);
											}
										}),
										budgetSubmitted && contextInvalid && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", {
											id: contextWindowId + "-error",
											role: "alert",
											children: t("codexBudgetInvalid")
										})
									]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										...stack$1,
										gap: 6
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											style: {
												...actions$1,
												gap: 4
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
												htmlFor: outputReserveId,
												children: t("codexOutputReserve")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingHelp, {
												title: t("codexOutputReserve"),
												hint: t("codexOutputReserveHint"),
												t,
												portal: false
											})]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											id: outputReserveId,
											type: "text",
											inputMode: "numeric",
											value: outputReserve,
											placeholder: t("codexBudgetDefault", { value: CODEX_DEFAULT_MAX_TOKENS.toLocaleString() }),
											"aria-describedby": budgetSubmitted && reserveInvalid ? outputReserveId + "-error" : void 0,
											"aria-invalid": budgetSubmitted && reserveInvalid || void 0,
											onChange: (event) => {
												setOutputReserve(event.target.value);
												setReserveDirty(true);
											}
										}),
										budgetSubmitted && reserveInvalid && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", {
											id: outputReserveId + "-error",
											role: "alert",
											children: t("codexBudgetInvalid")
										})
									]
								})]
							})]
						})
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderModelEditor, {
					ref: editor,
					provider,
					rpc,
					t,
					disabled: saving,
					...catalog === void 0 ? {} : { globalContextWindow: parseBudget(contextWindow) ?? null },
					onDirtyChange: setModelsDirty
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", {
					style: {
						...stack$1,
						gap: 8,
						borderTop: border$1,
						padding: "14px 0 8px",
						position: "sticky",
						bottom: 0,
						background: "var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1))"
					},
					children: [saveError && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						children: saveError
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							...actions$1,
							justifyContent: "flex-end"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							disabled: saving,
							onClick: onClose,
							children: t("cancel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dsh-subscription-primary",
							disabled: loading || saving || !Object.keys(changes).length && !modelsDirty && !nameDirty && !cacheTtlDirty && !contextDirty && !reserveDirty,
							onClick: () => {
								save();
							},
							children: saving ? t("modelDefaultsSaving") : t("modelsSave")
						})]
					})]
				})
			]
		})]
	});
}

//#endregion
//#region src/client/UsageBadgeDisplaySetting.tsx
function SelectChevron() {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
		"aria-hidden": "true",
		className: "dsh-subscription-select-chevron",
		width: "14",
		height: "14",
		viewBox: "0 0 16 16",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: "1.6",
		strokeLinecap: "round",
		strokeLinejoin: "round",
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m4 6 4 4 4-4" })
	});
}
/** Browser-local display preference; never changes provider or account settings. */
function UsageBadgeDisplaySetting({ t }) {
	const mode = useUsageBadgeMode();
	const quotaMode = useQuotaDisplayMode();
	const [failed, setFailed] = (0, react.useState)(false);
	const badgeId = (0, react.useId)();
	const quotaId = (0, react.useId)();
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "dsh-subscription-settings-card",
		style: styles$6.card,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: styles$6.field,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: styles$6.labelRow,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
						htmlFor: badgeId,
						children: t("usageBadgeDisplay")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingHelp, {
						title: t("usageBadgeDisplay"),
						hint: t("usageBadgeDisplayHint"),
						t
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-subscription-select-wrap",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
						id: badgeId,
						className: "dsh-subscription-select",
						style: styles$6.select,
						"aria-label": t("usageBadgeDisplay"),
						value: mode,
						onChange: (event) => {
							const value = event.currentTarget.value;
							if (value !== "recent" && value !== "hidden") return;
							try {
								setUsageBadgeMode(value);
								setFailed(false);
							} catch (error) {
								if (!(error instanceof DOMException) || !["SecurityError", "QuotaExceededError"].includes(error.name)) throw error;
								setFailed(true);
							}
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: "recent",
							children: t("usageBadgeDisplayRecent")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: "hidden",
							children: t("usageBadgeDisplayHidden")
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SelectChevron, {})]
				})]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: styles$6.field,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: styles$6.labelRow,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
						htmlFor: quotaId,
						children: t("quotaDisplay")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingHelp, {
						title: t("quotaDisplay"),
						hint: t("quotaDisplayHint"),
						t
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-subscription-select-wrap",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
						id: quotaId,
						className: "dsh-subscription-select",
						style: styles$6.select,
						"aria-label": t("quotaDisplay"),
						value: quotaMode,
						onChange: (event) => {
							const value = event.currentTarget.value;
							if (value !== "used" && value !== "remaining") return;
							try {
								setQuotaDisplayMode(value);
								setFailed(false);
							} catch (error) {
								if (!(error instanceof DOMException) || !["SecurityError", "QuotaExceededError"].includes(error.name)) throw error;
								setFailed(true);
							}
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: "used",
							children: t("quotaUsed")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: "remaining",
							children: t("quotaRemaining")
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SelectChevron, {})]
				})]
			}),
			failed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				role: "alert",
				style: {
					...styles$6.hint,
					color: "var(--dsw-alias-state-error-primary)"
				},
				children: t("usageBadgeDisplaySaveFailed")
			})
		]
	});
}
const styles$6 = {
	card: {
		border: "0.5px solid var(--dsw-alias-settings-card-stroke, var(--dsw-alias-border-l4))",
		borderRadius: "var(--dsw-radius-xl, 20px)",
		background: "var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-2))",
		padding: "14px 16px",
		display: "flex",
		flexDirection: "column",
		gap: 12
	},
	field: {
		display: "flex",
		flexDirection: "column",
		gap: 6,
		fontSize: 13,
		fontWeight: 500,
		lineHeight: "20px"
	},
	labelRow: {
		display: "flex",
		alignItems: "center",
		gap: 4
	},
	select: { width: "100%" },
	hint: {
		margin: 0,
		fontSize: 12,
		lineHeight: "18px",
		color: "var(--dsw-alias-label-tertiary)"
	}
};

//#endregion
//#region src/client/SubscriptionsSection.tsx
/** Poll cadence while a provider login attempt is busy. */
const POLL_INTERVAL_MS$1 = 2e3;
const CLIENT_VERSION_SOURCES = {
	npm: "clientVersionNpm",
	local: "clientVersionLocal",
	fallback: "clientVersionFallback",
	config: "clientVersionConfig"
};
/** Card display metadata, in page order (names are brand names, not translated). */
const PROVIDERS = [
	{
		id: "codex",
		name: "Codex (ChatGPT)"
	},
	{
		id: "claude",
		name: "Claude"
	},
	{
		id: "grok",
		name: "Grok (X Premium)"
	},
	{
		id: "copilot",
		name: "GitHub Copilot"
	},
	{
		id: "antigravity",
		name: "Google Antigravity"
	},
	{
		id: "muse",
		name: "Muse Code (Meta)"
	}
];
/** Whether a provider is currently disabled via the opt-in gate (Antigravity defaults to false). */
function isProviderDisabled(status) {
	return status?.enabled === false;
}
/** Sort the visible provider names within connected, disconnected, and disabled groups. */
function sortedSubscriptionProviders(statuses) {
	const rank = (status) => {
		if (isProviderDisabled(status)) return 2;
		return hasAccount(status) ? 0 : 1;
	};
	return [...PROVIDERS].sort((a, b) => {
		return rank(statuses[a.id]) - rank(statuses[b.id]) || (statuses[a.id]?.displayName || a.name).localeCompare(statuses[b.id]?.displayName || b.name) || a.id.localeCompare(b.id);
	});
}
/** Human text of an action failure, SubscriptionsAuthError or not. */
function messageOf$1(error) {
	return error instanceof Error ? error.message : String(error);
}
/** Copy a keyed map without the entries whose key is not in `live`. */
function dropStale(map, live) {
	const stale = Object.keys(map).filter((key) => !live.has(key));
	if (stale.length === 0) return map;
	const next = { ...map };
	for (const key of stale) delete next[key];
	return next;
}
/**
* English-dictionary fallback for a missing inject `t` (standalone renders);
* the slot inject always supplies the locale-bound one.
* @param key - dictionary key.
* @param params - `{name}` template params.
* @returns the template with params substituted.
*/
function fallbackTranslate$6(key, params) {
	let text = en[key];
	for (const [name, value] of Object.entries(params ?? {})) text = text.replaceAll(`{${name}}`, String(value));
	return text;
}
const styles$5 = {
	section: {
		display: "flex",
		flexDirection: "column",
		gap: 12,
		maxWidth: 560,
		color: "var(--dsw-alias-label-primary)"
	},
	intro: {
		margin: 0,
		color: "var(--dsw-alias-label-tertiary)",
		fontSize: 14,
		lineHeight: "22px"
	},
	card: {
		border: "0.5px solid var(--dsw-alias-settings-card-stroke, var(--dsw-alias-border-l4))",
		borderRadius: "var(--dsw-radius-xl, 20px)",
		background: "var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-2))",
		padding: "12px 14px",
		display: "flex",
		flexDirection: "column",
		gap: 6
	},
	proxyCard: {
		padding: "12px 14px",
		display: "flex",
		flexDirection: "column",
		gap: 6
	},
	separator: { borderTop: "0.5px solid var(--dsw-alias-border-l2)" },
	cardHeader: {
		display: "flex",
		alignItems: "center",
		gap: 8
	},
	dot: {
		width: 8,
		height: 8,
		borderRadius: "50%",
		flexShrink: 0
	},
	name: {
		fontWeight: 500,
		fontSize: 14,
		lineHeight: "22px",
		color: "var(--dsw-alias-label-primary)"
	},
	statusLine: {
		margin: 0,
		fontSize: 12,
		lineHeight: "18px",
		color: "var(--dsw-alias-label-tertiary)"
	},
	clientVersion: {
		fontSize: 12,
		lineHeight: "18px",
		color: "var(--dsw-alias-label-tertiary)",
		fontVariantNumeric: "tabular-nums"
	},
	errorLine: {
		margin: 0,
		fontSize: 12,
		lineHeight: "18px",
		color: "var(--dsw-alias-state-error-primary)"
	},
	actions: {
		display: "flex",
		gap: 8,
		marginTop: 4,
		alignItems: "center",
		flexWrap: "wrap"
	},
	usage: {
		display: "flex",
		flexDirection: "column",
		gap: 6,
		marginTop: 4,
		borderTop: "0.5px solid var(--dsw-alias-border-l2)",
		paddingTop: 8
	},
	usageHeader: {
		display: "flex",
		alignItems: "center",
		gap: 8
	},
	usageTitle: {
		fontSize: 12,
		lineHeight: "18px",
		fontWeight: 500,
		color: "var(--dsw-alias-label-secondary)"
	},
	usagePlan: {
		fontSize: 12,
		lineHeight: "18px",
		color: "var(--dsw-alias-label-tertiary)"
	},
	usageRow: {
		display: "flex",
		flexDirection: "column",
		gap: 3
	},
	usageMeta: {
		display: "flex",
		justifyContent: "space-between",
		gap: 8,
		fontSize: 12,
		lineHeight: "18px",
		color: "var(--dsw-alias-label-tertiary)"
	},
	accountRow: {
		display: "flex",
		flexDirection: "column",
		gap: 6,
		border: "0.5px solid var(--dsw-alias-border-l2)",
		borderRadius: "var(--dsw-radius-lg, 16px)",
		padding: "8px 10px",
		marginTop: 4
	},
	accountHeader: {
		display: "flex",
		alignItems: "center",
		gap: 8
	},
	accountName: {
		fontSize: 13,
		lineHeight: "20px",
		color: "var(--dsw-alias-label-primary)",
		userSelect: "all"
	},
	starButton: {
		border: "none",
		padding: 0,
		width: 28,
		font: "inherit",
		fontSize: 14,
		lineHeight: "20px",
		cursor: "pointer",
		color: "var(--dsw-alias-state-warn-label)"
	},
	usageTrack: {
		height: 6,
		borderRadius: 3,
		overflow: "hidden",
		background: "var(--dsw-alias-bg-layer-1)",
		border: "0.5px solid var(--dsw-alias-border-l2)"
	},
	usageFill: {
		height: "100%",
		borderRadius: 3
	},
	deviceCode: {
		marginTop: 4,
		display: "flex",
		flexDirection: "column",
		gap: 6,
		border: "0.5px solid var(--dsw-alias-border-l2)",
		borderRadius: "var(--dsw-radius-lg, 16px)",
		padding: "10px 12px",
		background: "var(--dsw-alias-bg-layer-1)"
	},
	deviceCodeText: {
		fontFamily: "monospace",
		fontSize: 18,
		lineHeight: "24px",
		letterSpacing: 2,
		color: "var(--dsw-alias-label-primary)",
		userSelect: "all"
	},
	proxyField: {
		display: "flex",
		flexDirection: "column",
		gap: 4
	},
	proxyLabel: {
		fontSize: 13,
		fontWeight: 500,
		lineHeight: "20px",
		color: "var(--dsw-alias-label-primary)"
	},
	proxyInput: { width: "100%" },
	manual: {
		fontSize: 13,
		lineHeight: "20px"
	},
	manualRow: {
		display: "flex",
		flexWrap: "wrap",
		gap: 8,
		alignItems: "center",
		marginTop: 8
	},
	manualInput: {
		flex: "1 1 200px",
		minWidth: 0
	},
	proxyHint: {
		margin: 0,
		fontSize: 12,
		lineHeight: "18px",
		color: "var(--dsw-alias-label-tertiary)"
	},
	proxyCheck: {
		display: "flex",
		alignItems: "center",
		gap: 8,
		fontSize: 13,
		lineHeight: "20px",
		color: "var(--dsw-alias-label-primary)",
		cursor: "pointer"
	},
	proxyMessage: {
		margin: 0,
		fontSize: 12,
		lineHeight: "18px"
	},
	proxyActions: {
		display: "flex",
		gap: 8,
		alignItems: "center",
		justifyContent: "flex-end",
		marginTop: 2
	},
	modalOverlay: {
		position: "fixed",
		inset: 0,
		zIndex: 1e3,
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		padding: 16,
		background: "var(--dsw-alias-bg-mask-1, #0006)",
		backdropFilter: "var(--dsw-mask-blur, none)"
	},
	modal: {
		width: 460,
		maxWidth: "100%",
		maxHeight: "90vh",
		overflowY: "auto",
		boxSizing: "border-box",
		display: "flex",
		flexDirection: "column",
		gap: 12,
		padding: "16px 18px",
		borderRadius: "var(--dsw-radius-panel, 28px)",
		background: "var(--dsw-alias-bg-layer-2)",
		border: 0,
		boxShadow: "var(--dsw-elevation-prominent)"
	},
	modalHeader: {
		display: "flex",
		alignItems: "center",
		gap: 8
	},
	modalTitle: {
		fontWeight: 500,
		fontSize: 16,
		lineHeight: "24px",
		color: "var(--dsw-alias-label-primary)"
	},
	warnBanner: {
		display: "flex",
		flexDirection: "column",
		gap: 4,
		marginTop: 4,
		padding: "10px 12px",
		borderRadius: "var(--dsw-radius-lg, 12px)",
		border: "0.5px solid var(--dsw-alias-state-warn-label, #d97706)",
		background: "color-mix(in srgb, var(--dsw-alias-state-warn-label, #d97706) 8%, transparent)"
	},
	warnBannerTitle: {
		fontSize: 12,
		lineHeight: "18px",
		fontWeight: 600,
		color: "var(--dsw-alias-state-warn-label, #b45309)"
	},
	warnBannerBody: {
		margin: 0,
		fontSize: 12,
		lineHeight: "18px",
		color: "var(--dsw-alias-label-secondary)"
	}
};
/** Status dot color for one provider state. */
function dotColor(status) {
	if (isProviderDisabled(status)) return "var(--dsw-alias-label-dimmed)";
	if (status?.busy === true) return "var(--dsw-alias-state-warn-label)";
	if ((status?.accounts.length ?? 0) > 0) return "var(--dsw-alias-state-success-primary)";
	return "var(--dsw-alias-label-dimmed)";
}
/**
* Whether a provider has at least one connected account. Multi-account made
* "logged in" a property of the account list rather than a flag, so every
* logged-in test goes through this one predicate.
* @param status - the provider's last reported state, possibly absent.
* @returns true when the provider serves at least one account.
*/
function hasAccount(status) {
	return !isProviderDisabled(status) && (status?.accounts.length ?? 0) > 0;
}
/** Persistent risk & availability banner shown inside the Google Antigravity panel. */
function AntigravityRiskNotice({ t }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		role: "note",
		className: "dsh-subscription-antigravity-notice",
		style: styles$5.warnBanner,
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
			style: styles$5.warnBannerTitle,
			children: t("antigravityNoticeTitle")
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
			style: styles$5.warnBannerBody,
			children: t("antigravityNoticeBody")
		})]
	});
}
/**
* The device code to render for one provider: what this page learned from its
* own `login` answer first, then what the server still reports. The local copy
* answers instantly; the reported one is what survives a reload of the
* Settings page, after which the local one is gone but the attempt is not.
* @param status - the provider's last reported state, possibly absent.
* @param local - the code this page received from its own login attempt.
* @returns the code to show, or `undefined` when no attempt is waiting.
*/
function pendingDeviceCode(status, local) {
	return local ?? status?.pendingLogin;
}
/** The CLI version a route presents, beside the provider name; nothing for routes without one. */
function ClientVersionTag({ clientVersion, t }) {
	if (clientVersion === void 0) return null;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
		style: styles$5.clientVersion,
		title: t("clientVersionHint"),
		children: t("clientVersion", {
			version: clientVersion.version,
			source: t(CLIENT_VERSION_SOURCES[clientVersion.source])
		})
	});
}
/**
* One-line status text for one provider state.
* @param t - section translate.
* @param status - the provider's last reported state.
* @returns the localized status line.
*/
function statusText(t, status) {
	if (status === void 0) return t("checking");
	if (isProviderDisabled(status)) return t("antigravityDisabledStatus");
	if (status.busy) return t("loginInProgress");
	if (status.accounts.length > 0) return t("loggedInCount", { count: status.accounts.length });
	return t("notLoggedIn");
}
/**
* Localized label of one usage window (kind, plus the model scope when named).
* @param t - section translate.
* @param window - the reported window.
* @returns e.g. "5-hour window" or "Weekly · Opus".
*/
function usageWindowLabel$1(t, window$1) {
	const base = window$1.kind === "session" ? t("usageSession") : window$1.kind === "weekly" ? t("usageWeekly") : t("usageWindow");
	return window$1.scope !== void 0 && window$1.scope !== "" ? `${base} · ${window$1.scope}` : base;
}
/** Bar fill color: success normally, warn from 80%, error from 95%. Shared with the composer badge. */
function usageBarColor(usedPercent) {
	if (!Number.isFinite(usedPercent)) return "var(--dsw-alias-label-dimmed)";
	if (usedPercent >= 95) return "var(--dsw-alias-state-error-primary)";
	if (usedPercent >= 80) return "var(--dsw-alias-state-warn-label)";
	return "var(--dsw-alias-state-success-primary)";
}
/** One-line status text of the proxy config card. */
function proxyStatusText(t, proxy, loadError) {
	if (loadError !== void 0) return t("proxyLoadFailed", { message: loadError });
	if (proxy === void 0) return t("proxyLoading");
	if (proxy.error !== void 0) return t("proxyStatusError", { message: proxy.error });
	if (proxy.enabled) return t("proxyStatusEnabled", { url: proxy.url });
	return t("proxyStatusNone");
}
/** Feedback-line color of the proxy dialog. */
function messageColor(tone) {
	return tone === "error" ? "var(--dsw-alias-state-error-primary)" : "var(--dsw-alias-state-success-primary)";
}
/**
* Whether a provider's login attempt has settled, i.e. nothing is waiting on
* the authorization server any more — the poll loop has served its purpose
* and the device-code card can go.
*
* Only `busy` decides this. The server keeps a provider busy for the whole
* attempt *and* the exchange + store write that follows it, so a settled
* attempt always has its session (or its error) already in the status the poll
* just read. The account list must not take part: reading "it has accounts" as
* "the attempt finished" made adding a *second* account end one poll tick in —
* the first account was already there, so the card lost the user code and the
* "open the page" button within ~2s and the poller stopped, leaving a login
* that finished in the browser invisible until the page was reloaded.
* @param status - the provider's last reported state.
* @returns true when no login attempt is running for the provider.
*/
function attemptSettled(status) {
	return !status.busy;
}
/**
* The Subscriptions settings page component.
* @param props - the slot inject face ({@link SubscriptionsSectionInjected}).
* @returns the section body, or a notice while the RPC face is absent.
*/
function SubscriptionsSection(props) {
	const quotaMode = useQuotaDisplayMode();
	const quotaNow = useQuotaClock();
	const { rpc, hideUsageHint = false, embedded = false } = props;
	const t = props.t ?? fallbackTranslate$6;
	const [statuses, setStatuses] = (0, react.useState)({});
	const [selectedProvider, setSelectedProvider] = (0, react.useState)();
	const tabIdPrefix = (0, react.useId)();
	const tabRefs = (0, react.useRef)({});
	const focusToRestore = (0, react.useRef)(null);
	(0, react.useLayoutEffect)(() => {
		const previous = focusToRestore.current;
		focusToRestore.current = null;
		if (!previous || document.activeElement !== document.body && document.activeElement !== previous.element) return;
		if (previous.element.isConnected) previous.element.focus();
		else tabRefs.current[previous.provider]?.focus();
	}, [statuses]);
	const sortedProviders = sortedSubscriptionProviders(statuses);
	const activeProvider = selectedProvider ?? sortedProviders[0].id;
	const [errors, setErrors] = (0, react.useState)({});
	const [manualDrafts, setManualDrafts] = (0, react.useState)({
		codex: "",
		claude: "",
		grok: "",
		copilot: "",
		antigravity: "",
		muse: ""
	});
	/**
	* Device-flow codes this page learned from its own `login` answers, shown
	* while the attempt polls. The server reports the live attempt in `status`
	* too, so a reloaded page keeps the card; this only spares the first paint
	* after the click and is dropped once the attempt settles.
	*/
	const [deviceCodes, setDeviceCodes] = (0, react.useState)({});
	const [copiedCode, setCopiedCode] = (0, react.useState)(void 0);
	/** Usage snapshots keyed `${provider}:${accountKey}` — every account tracks its own windows. */
	const [usages, setUsages] = (0, react.useState)({});
	const [usageErrors, setUsageErrors] = (0, react.useState)({});
	const [usageLoading, setUsageLoading] = (0, react.useState)({});
	const [resetConfirmation, setResetConfirmation] = (0, react.useState)();
	const [resetBusy, setResetBusy] = (0, react.useState)(false);
	const [resetAcknowledged, setResetAcknowledged] = (0, react.useState)(false);
	const [resetMessage, setResetMessage] = (0, react.useState)("");
	const [resetAccount, setResetAccount] = (0, react.useState)();
	const resetDialogRef = (0, react.useRef)(null);
	(0, react.useEffect)(() => {
		if (resetConfirmation) resetDialogRef.current?.showModal();
		else resetDialogRef.current?.close();
	}, [resetConfirmation]);
	const [antigravityConfirmOpen, setAntigravityConfirmOpen] = (0, react.useState)(false);
	const [antigravityAcknowledged, setAntigravityAcknowledged] = (0, react.useState)(false);
	const [antigravityToggleBusy, setAntigravityToggleBusy] = (0, react.useState)(false);
	const antigravityDialogRef = (0, react.useRef)(null);
	(0, react.useEffect)(() => {
		if (antigravityConfirmOpen) antigravityDialogRef.current?.showModal();
		else antigravityDialogRef.current?.close();
	}, [antigravityConfirmOpen]);
	const resetInflight = (0, react.useRef)(false);
	const mountedRef = (0, react.useRef)(true);
	const pollersRef = (0, react.useRef)(/* @__PURE__ */ new Map());
	/** Accounts with a `usage` call in flight; guards the auto-fetch effect against re-entry. */
	const usageInflightRef = (0, react.useRef)(/* @__PURE__ */ new Set());
	/** Proxy config as last answered by `proxyGet`/`proxySet`. */
	const [proxy, setProxy] = (0, react.useState)(void 0);
	const [proxyLoadError, setProxyLoadError] = (0, react.useState)(void 0);
	/** Proxy dialog state (draft fields; the password never pre-fills). */
	const [proxyOpen, setProxyOpen] = (0, react.useState)(false);
	const [managedProvider, setManagedProvider] = (0, react.useState)();
	const [proxyEnabled, setProxyEnabled] = (0, react.useState)(false);
	const [proxyUrl, setProxyUrl] = (0, react.useState)("");
	const [proxyUsername, setProxyUsername] = (0, react.useState)("");
	const [proxyPassword, setProxyPassword] = (0, react.useState)("");
	const [proxyClearPassword, setProxyClearPassword] = (0, react.useState)(false);
	const [proxyBypass, setProxyBypass] = (0, react.useState)("");
	const [proxySaving, setProxySaving] = (0, react.useState)(false);
	const [proxyTesting, setProxyTesting] = (0, react.useState)(false);
	const [proxyMessage, setProxyMessage] = (0, react.useState)(void 0);
	const [proxyTestResult, setProxyTestResult] = (0, react.useState)(void 0);
	const setProviderError = (0, react.useCallback)((provider, message) => {
		if (!mountedRef.current) return;
		setErrors((prev) => {
			const next = { ...prev };
			if (message === void 0) delete next[provider];
			else next[provider] = message;
			return next;
		});
	}, []);
	const stopPolling = (0, react.useCallback)((provider) => {
		const poller = pollersRef.current.get(provider);
		if (poller !== void 0) {
			clearInterval(poller);
			pollersRef.current.delete(provider);
		}
	}, []);
	/** Refetch every provider's status; stop a provider's poller once its attempt settles. */
	const refresh = (0, react.useCallback)(async () => {
		if (rpc === void 0) return;
		let response;
		try {
			response = await callSubscriptionsAuth(rpc, "status", {});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			for (const { id } of PROVIDERS) setProviderError(id, message);
			return;
		}
		if (!mountedRef.current) return;
		const focused = document.activeElement;
		const provider = focused instanceof HTMLElement ? focused.closest("[data-subscription-provider]")?.dataset.subscriptionProvider : void 0;
		focusToRestore.current = focused instanceof HTMLElement && provider ? {
			element: focused,
			provider
		} : null;
		setStatuses(response.providers);
		setSelectedProvider((current) => current ?? sortedSubscriptionProviders(response.providers)[0].id);
		for (const { id } of PROVIDERS) setProviderError(id, void 0);
		for (const { id } of PROVIDERS) {
			const status = response.providers[id];
			if (status !== void 0 && (isProviderDisabled(status) || attemptSettled(status))) {
				stopPolling(id);
				setDeviceCodes((prev) => {
					if (prev[id] === void 0) return prev;
					const next = { ...prev };
					delete next[id];
					return next;
				});
			}
		}
	}, [
		rpc,
		stopPolling,
		setProviderError
	]);
	const startPolling = (0, react.useCallback)((provider) => {
		if (pollersRef.current.has(provider)) return;
		pollersRef.current.set(provider, setInterval(() => {
			refresh();
		}, POLL_INTERVAL_MS$1));
	}, [refresh]);
	(0, react.useEffect)(() => {
		mountedRef.current = true;
		refresh().then(() => {
			if (!mountedRef.current) return;
			setStatuses((current) => {
				for (const { id } of PROVIDERS) if (current[id]?.busy === true && !isProviderDisabled(current[id])) startPolling(id);
				return current;
			});
		});
		return () => {
			mountedRef.current = false;
			for (const poller of pollersRef.current.values()) clearInterval(poller);
			pollersRef.current.clear();
		};
	}, [refresh, startPolling]);
	const loadUsage = (0, react.useCallback)(async (provider, account, force = false) => {
		const key = `${provider}:${account}`;
		if (rpc === void 0 || usageInflightRef.current.has(key)) return;
		usageInflightRef.current.add(key);
		setUsageLoading((prev) => ({
			...prev,
			[key]: true
		}));
		try {
			const usage = await callSubscriptionsAuth(rpc, "usage", {
				provider,
				account,
				...force ? { force: true } : {}
			});
			if (!mountedRef.current) return;
			setUsages((prev) => ({
				...prev,
				[key]: usage
			}));
			setUsageErrors((prev) => {
				const next = { ...prev };
				delete next[key];
				return next;
			});
		} catch (error) {
			if (mountedRef.current) setUsageErrors((prev) => ({
				...prev,
				[key]: messageOf$1(error)
			}));
		} finally {
			usageInflightRef.current.delete(key);
			if (mountedRef.current) setUsageLoading((prev) => ({
				...prev,
				[key]: false
			}));
		}
	}, [rpc]);
	(0, react.useEffect)(() => {
		if (!rpc) return;
		const sync = (key, usage) => {
			if (!PROVIDERS.some(({ id }) => statuses[id]?.accounts.some((account) => `${id}:${account.key}` === key))) return;
			setUsages((previous) => ({
				...previous,
				[key]: usage
			}));
			if (!usage.refreshFailed) setUsageErrors((previous) => {
				const next = { ...previous };
				delete next[key];
				return next;
			});
		};
		const focus = () => {
			for (const { id } of PROVIDERS) for (const account of statuses[id]?.accounts ?? []) {
				const key = `${id}:${account.key}`;
				const usage = readUsageCache(rpc, key);
				if (usage) sync(key, usage);
			}
		};
		const unsubscribe = subscribeUsage(rpc, sync);
		focus();
		window.addEventListener("focus", focus);
		return () => {
			unsubscribe();
			window.removeEventListener("focus", focus);
		};
	}, [rpc, statuses]);
	async function prepareReset(account) {
		if (!rpc || resetInflight.current) return;
		resetInflight.current = true;
		setResetBusy(true);
		setResetAccount(account);
		setResetConfirmation(void 0);
		setResetMessage("");
		try {
			const result = await callSubscriptionsAuth(rpc, "prepareReset", { account });
			setResetAcknowledged(false);
			setResetConfirmation({
				...result,
				account
			});
		} catch (error) {
			setResetMessage(messageOf$1(error));
		} finally {
			resetInflight.current = false;
			setResetBusy(false);
		}
	}
	async function consumeReset() {
		if (!rpc || !resetConfirmation || !resetAcknowledged || resetInflight.current) return;
		const { account, ticket } = resetConfirmation;
		resetInflight.current = true;
		setResetBusy(true);
		setResetConfirmation(void 0);
		try {
			await callSubscriptionsAuth(rpc, "consumeReset", {
				account,
				ticket
			});
			setResetMessage(t("resetUseSuccess"));
		} catch (error) {
			setResetMessage(messageOf$1(error));
		} finally {
			await loadUsage("codex", account, true);
			resetInflight.current = false;
			setResetBusy(false);
		}
	}
	(0, react.useEffect)(() => {
		const live = /* @__PURE__ */ new Set();
		for (const { id } of PROVIDERS) {
			if (isProviderDisabled(statuses[id])) continue;
			for (const account of statuses[id]?.accounts ?? []) {
				const key = `${id}:${account.key}`;
				live.add(key);
				if (usages[key] === void 0 && usageErrors[key] === void 0) loadUsage(id, account.key);
			}
		}
		setUsages((prev) => dropStale(prev, live));
		setUsageErrors((prev) => dropStale(prev, live));
	}, [
		statuses,
		usages,
		usageErrors,
		loadUsage
	]);
	const toggleProviderEnabled = (0, react.useCallback)(async (provider, enabled) => {
		if (rpc === void 0 || antigravityToggleBusy) return;
		setAntigravityToggleBusy(true);
		setProviderError(provider, void 0);
		try {
			await callSubscriptionsAuth(rpc, "setProviderEnabled", {
				provider,
				enabled
			});
			if (mountedRef.current) setAntigravityConfirmOpen(false);
			await refresh();
		} catch (error) {
			setProviderError(provider, messageOf$1(error));
		} finally {
			if (mountedRef.current) setAntigravityToggleBusy(false);
		}
	}, [
		rpc,
		antigravityToggleBusy,
		setProviderError,
		refresh
	]);
	const login = (0, react.useCallback)(async (provider, method) => {
		if (rpc === void 0) return;
		setProviderError(provider, void 0);
		try {
			const response = await callSubscriptionsAuth(rpc, "login", {
				provider,
				...method === void 0 ? {} : { method }
			});
			if (typeof response.authorizeUrl === "string" && response.authorizeUrl === "") {
				await refresh();
				return;
			}
			if (typeof response.authorizeUrl !== "string") throw new SubscriptionsAuthError(t("loginMissingUrl"));
			if (!mountedRef.current) return;
			setStatuses((prev) => ({
				...prev,
				[provider]: {
					accounts: prev[provider]?.accounts ?? [],
					...prev[provider],
					busy: true
				}
			}));
			if (typeof response.userCode === "string" && response.userCode.length > 0) setDeviceCodes((prev) => ({
				...prev,
				[provider]: {
					userCode: response.userCode,
					verificationUrl: response.authorizeUrl
				}
			}));
			else window.open(response.authorizeUrl, "_blank", "noopener");
			startPolling(provider);
		} catch (error) {
			setProviderError(provider, messageOf$1(error));
		}
	}, [
		rpc,
		t,
		setProviderError,
		startPolling
	]);
	const cancel = (0, react.useCallback)(async (provider) => {
		if (rpc === void 0) return;
		stopPolling(provider);
		try {
			await callSubscriptionsAuth(rpc, "cancel", { provider });
		} catch (error) {
			setProviderError(provider, messageOf$1(error));
		}
		await refresh();
	}, [
		rpc,
		stopPolling,
		setProviderError,
		refresh
	]);
	const submitManual = (0, react.useCallback)(async (provider) => {
		if (rpc === void 0) return;
		const input = manualDrafts[provider].trim();
		if (input === "") return;
		setProviderError(provider, void 0);
		try {
			await callSubscriptionsAuth(rpc, "manual", {
				provider,
				input
			});
			if (mountedRef.current) setManualDrafts((prev) => ({
				...prev,
				[provider]: ""
			}));
		} catch (error) {
			setProviderError(provider, messageOf$1(error));
		}
		await refresh();
	}, [
		rpc,
		manualDrafts,
		setProviderError,
		refresh
	]);
	const logout = (0, react.useCallback)(async (provider, account, display, name) => {
		if (rpc === void 0) return;
		if (!window.confirm(t("logoutAccountConfirm", {
			provider: name,
			account: display
		}))) return;
		setProviderError(provider, void 0);
		try {
			await callSubscriptionsAuth(rpc, "logout", {
				provider,
				account
			});
		} catch (error) {
			setProviderError(provider, messageOf$1(error));
		}
		await refresh();
	}, [
		rpc,
		t,
		setProviderError,
		refresh
	]);
	const setDefault = (0, react.useCallback)(async (provider, account) => {
		if (rpc === void 0) return;
		setProviderError(provider, void 0);
		try {
			await callSubscriptionsAuth(rpc, "setDefault", {
				provider,
				account
			});
		} catch (error) {
			setProviderError(provider, messageOf$1(error));
		}
		await refresh();
	}, [
		rpc,
		setProviderError,
		refresh
	]);
	const copyDeviceCode = (0, react.useCallback)((provider, userCode) => {
		navigator.clipboard?.writeText(userCode).then(() => {
			if (!mountedRef.current) return;
			setCopiedCode(provider);
			setTimeout(() => {
				if (mountedRef.current) setCopiedCode((current) => current === provider ? void 0 : current);
			}, 1500);
		}).catch(() => void 0);
	}, []);
	(0, react.useEffect)(() => {
		if (rpc === void 0) return;
		let alive = true;
		callSubscriptionsAuth(rpc, "proxyGet", {}).then((view) => {
			if (!alive) return;
			setProxy(view);
			setProxyLoadError(void 0);
		}).catch((error) => {
			if (alive) setProxyLoadError(messageOf$1(error));
		});
		return () => {
			alive = false;
		};
	}, [rpc]);
	(0, react.useEffect)(() => {
		if (!proxyOpen) return;
		const onKey = (event) => {
			if (event.key === "Escape") setProxyOpen(false);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [proxyOpen]);
	const openProxyDialog = (0, react.useCallback)(() => {
		if (proxy === void 0) return;
		setProxyEnabled(proxy.enabled);
		setProxyUrl(proxy.url);
		setProxyUsername(proxy.username ?? "");
		setProxyPassword("");
		setProxyClearPassword(false);
		setProxyBypass(proxy.bypass.join(", "));
		setProxyMessage(void 0);
		setProxyTestResult(void 0);
		setProxyOpen(true);
	}, [proxy]);
	const saveProxy = (0, react.useCallback)(async () => {
		if (rpc === void 0) return;
		setProxySaving(true);
		setProxyMessage(void 0);
		try {
			setProxy(await callSubscriptionsAuth(rpc, "proxySet", {
				enabled: proxyEnabled,
				url: proxyUrl.trim(),
				username: proxyUsername,
				...proxyClearPassword ? { password: null } : proxyPassword !== "" ? { password: proxyPassword } : {},
				bypass: proxyBypass.split(/[,\n]/).map((entry) => entry.trim()).filter((entry) => entry !== "")
			}));
			setProxyLoadError(void 0);
			setProxyMessage({
				tone: "success",
				text: t("proxySaved")
			});
			setProxyOpen(false);
		} catch (error) {
			setProxyMessage({
				tone: "error",
				text: t("proxySaveFailed", { message: messageOf$1(error) })
			});
		} finally {
			setProxySaving(false);
		}
	}, [
		rpc,
		proxyEnabled,
		proxyUrl,
		proxyUsername,
		proxyPassword,
		proxyClearPassword,
		proxyBypass,
		t
	]);
	const testProxy = (0, react.useCallback)(async () => {
		if (rpc === void 0 || proxyTesting) return;
		setProxyTesting(true);
		setProxyTestResult(void 0);
		try {
			setProxyTestResult(await callSubscriptionsAuth(rpc, "proxyTest", { proxy: {
				url: proxyUrl.trim(),
				...proxyUsername.trim() !== "" ? { username: proxyUsername.trim() } : {},
				...proxyPassword !== "" ? { password: proxyPassword } : {}
			} }));
		} catch (error) {
			setProxyTestResult({
				ok: false,
				viaProxy: false,
				error: messageOf$1(error)
			});
		} finally {
			setProxyTesting(false);
		}
	}, [
		rpc,
		proxyTesting,
		proxyUrl,
		proxyUsername,
		proxyPassword
	]);
	if (rpc === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
		style: styles$5.intro,
		children: t("unavailable")
	});
	const providerPanels = sortedProviders.map(({ id, name }) => {
		const status = statuses[id];
		const providerDisabled = isProviderDisabled(status);
		const busy = !providerDisabled && status?.busy === true;
		const deviceCode = pendingDeviceCode(status, deviceCodes[id]);
		const accounts = status?.accounts ?? [];
		return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			role: "tabpanel",
			"data-subscription-provider": id,
			id: `${tabIdPrefix}-panel-${id}`,
			"aria-labelledby": `${tabIdPrefix}-tab-${id}`,
			hidden: activeProvider !== id,
			tabIndex: 0,
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsh-subscription-settings-card",
				style: styles$5.card,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-subscription-provider-header",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-subscription-provider-identity",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									...styles$5.cardHeader,
									flexWrap: "wrap"
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: {
										...styles$5.dot,
										background: dotColor(status)
									} }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: styles$5.name,
										children: status?.displayName || name
									}),
									status?.displayName && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", {
										style: styles$5.statusLine,
										children: name
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ClientVersionTag, {
										clientVersion: status?.clientVersion,
										t
									})
								]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: styles$5.statusLine,
								children: statusText(t, status)
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsh-subscription-provider-actions",
							children: providerDisabled ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								disabled: antigravityToggleBusy,
								"aria-haspopup": "dialog",
								onClick: () => {
									setAntigravityAcknowledged(false);
									setAntigravityConfirmOpen(true);
								},
								children: t("antigravityEnable")
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								!busy && accounts.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => {
										login(id);
									},
									children: t("login")
								}),
								!busy && accounts.length > 0 && id === "claude" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "dsh-subscription-add-account",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingHelp, {
										title: t("addAccountOAuth"),
										hint: t("addAccountHint"),
										t
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										onClick: () => {
											login(id, "oauth");
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderActionIcon, { icon: "add" }), t("addAccountOAuth")]
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => {
										login(id, "keychain");
									},
									children: t("addAccountKeychain")
								})] }),
								!busy && accounts.length > 0 && id !== "claude" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "dsh-subscription-add-account",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingHelp, {
										title: t("addAccount"),
										hint: t("addAccountHint"),
										t
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										onClick: () => {
											login(id);
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderActionIcon, { icon: "add" }), t("addAccount")]
									})]
								}),
								!busy && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									"aria-haspopup": "dialog",
									onClick: () => setManagedProvider({
										id,
										name
									}),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderActionIcon, { icon: "manage" }), t("accountsManage")]
								}),
								!busy && id === "antigravity" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									disabled: antigravityToggleBusy,
									onClick: () => {
										toggleProviderEnabled("antigravity", false);
									},
									children: t("antigravityDisable")
								}),
								busy && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => {
										cancel(id);
									},
									children: t("cancel")
								})
							] })
						})]
					}),
					id === "antigravity" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AntigravityRiskNotice, { t }),
					!providerDisabled && status?.detail !== void 0 && status.detail !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: styles$5.statusLine,
						children: status.detail
					}),
					errors[id] !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: styles$5.errorLine,
						children: errors[id]
					}),
					providerDisabled && accounts.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: styles$5.statusLine,
						children: t("antigravitySavedAccounts", { count: accounts.length })
					}), accounts.map((account) => {
						const display = account.account ?? account.key;
						return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: styles$5.accountRow,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: styles$5.accountHeader,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: styles$5.accountName,
									children: display
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: {
										marginLeft: "auto",
										flexShrink: 0
									},
									onClick: () => {
										logout(id, account.key, display, name);
									},
									children: t("logout")
								})]
							})
						}, account.key);
					})] }),
					!providerDisabled && accounts.map((account) => {
						const usageKey = `${id}:${account.key}`;
						const usage = usages[usageKey];
						const shownWindows = visibleUsageWindows(id, usage?.windows, status?.visibleModels);
						const usageError = usageErrors[usageKey];
						const display = account.account ?? account.key;
						const sortedCredits = [...usage?.resetCredits ?? []].sort((a, b) => (a.expiresAt ?? Infinity) - (b.expiresAt ?? Infinity));
						const balance = id === "codex" ? creditBalanceText(usage?.credits, t) : void 0;
						const resetCount = sortedCredits.length === 1 ? t("resetCreditAvailable") : t("resetCreditsAvailable", { count: sortedCredits.length });
						const nextReset = sortedCredits.find((c) => c.expiresAt === void 0 || c.expiresAt > Date.now());
						const resetBlock = usage ? resetActionBlock(usage) : "resetUseRefresh";
						const resetDisabled = resetBusy || resetBlock !== void 0;
						const showUsage = usage !== void 0 || usageError !== void 0 || usageLoading[usageKey] === true;
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: styles$5.accountRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: styles$5.accountHeader,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										style: styles$5.starButton,
										title: account.isDefault ? t("defaultBadge") : t("setDefault"),
										onClick: () => {
											if (!account.isDefault) setDefault(id, account.key);
										},
										children: account.isDefault ? "★" : "☆"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: styles$5.accountName,
										children: display
									}),
									account.plan !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: styles$5.usagePlan,
										children: account.plan
									}),
									account.expiresAt !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: styles$5.statusLine,
										children: t("accountExpires", { date: new Date(account.expiresAt).toLocaleString() })
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										style: {
											marginLeft: "auto",
											flexShrink: 0
										},
										onClick: () => {
											logout(id, account.key, display, name);
										},
										children: t("logout")
									})
								]
							}), showUsage && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: styles$5.usage,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: styles$5.usageHeader,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: styles$5.usageTitle,
												children: t("usageTitle")
											}),
											usage?.plan !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: styles$5.usagePlan,
												children: t("usagePlan", { plan: usage.plan })
											}),
											usage?.supported !== false && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderRefreshButton, {
												label: t("usageRefresh"),
												disabled: usageLoading[usageKey] === true,
												onClick: () => {
													loadUsage(id, account.key, true);
												}
											})
										]
									}),
									usage && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageFreshness, {
										usage,
										t
									}),
									usage === void 0 && usageError === void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										style: styles$5.statusLine,
										children: t("usageLoading")
									}),
									usageError !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										style: styles$5.errorLine,
										children: t("usageError", { message: usageError })
									}),
									id === "muse" && usage?.windows !== void 0 && usage.windows.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										style: styles$5.statusLine,
										children: t(id === "muse" ? "usageEmptyMuse" : "usageEmpty")
									}),
									usage?.windows !== void 0 && usage.windows.length > 0 && shownWindows.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										style: styles$5.statusLine,
										children: t("usageNoVisibleModels")
									}),
									id === "antigravity" && shownWindows.some((window$1) => antigravityQuotaScope(window$1.scope)) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AntigravityQuotaSummary, {
										windows: shownWindows,
										t,
										mode: quotaMode
									}) : shownWindows.map((window$1, index) => {
										const percent = quotaPercent(window$1.usedPercent, quotaMode);
										return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											style: styles$5.usageRow,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												style: styles$5.usageMeta,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: usageWindowLabel$1(t, window$1) }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													style: { color: usageBarColor(window$1.usedPercent) },
													children: [quotaText(window$1.usedPercent, quotaMode, t), window$1.resetsAt !== void 0 && ` · ${t("usageResets", { date: new Date(window$1.resetsAt).toLocaleString() })}${window$1.resetsAt <= quotaNow ? ` · ${t("quotaExpiredWindow")}` : ""}`]
												})]
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												style: styles$5.usageTrack,
												"aria-hidden": true,
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { style: {
													...styles$5.usageFill,
													width: `${percent ?? 0}%`,
													background: usageBarColor(window$1.usedPercent)
												} })
											})]
										}, index);
									}),
									id === "codex" && (balance !== void 0 || usage?.resetCredits !== void 0 || resetAccount === account.key && !!resetMessage) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "subscriptions-credit-summary",
										style: styles$5.statusLine,
										children: [sortedCredits.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
											className: "subscriptions-reset-credits",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", { children: [balance !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: balance }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: "subscriptions-reset-count",
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: resetCount }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													className: "subscriptions-reset-disclosure",
													children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															className: "subscriptions-reset-expand",
															children: t("modelsExpand")
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															className: "subscriptions-reset-collapse",
															children: t("modelsCollapse")
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
															"aria-hidden": "true",
															width: "12",
															height: "12",
															viewBox: "0 0 16 16",
															children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
																d: "m4 6 4 4 4-4",
																fill: "none",
																stroke: "currentColor",
																strokeWidth: "1.5",
																strokeLinecap: "round",
																strokeLinejoin: "round"
															})
														})
													]
												})]
											})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: "subscriptions-reset-list",
												children: sortedCredits.map((credit, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: "subscriptions-reset-row",
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: credit.expiresAt === void 0 ? t("resetCreditExpiryUnknown") : t("resetCreditExpires", { date: new Date(credit.expiresAt).toLocaleString() }) }), credit === nextReset && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
														type: "button",
														"aria-disabled": resetDisabled,
														title: t(resetBusy ? "resetUseChecking" : resetBlock ?? "resetUseReady"),
														style: {
															height: 22,
															minHeight: 22,
															padding: "0 7px",
															opacity: resetDisabled ? .35 : 1,
															cursor: resetDisabled ? "not-allowed" : "pointer"
														},
														onClick: () => {
															if (!resetDisabled) prepareReset(account.key);
														},
														children: resetBusy && resetAccount === account.key ? t("resetUseChecking") : t("resetUseButton")
													})]
												}, credit.id ?? index))
											})]
										}) : (balance !== void 0 || usage?.resetCredits !== void 0) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "subscriptions-credit-line",
											children: [balance !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: balance }), usage?.resetCredits !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "subscriptions-reset-count",
												children: resetCount
											})]
										}), resetAccount === account.key && resetMessage && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											role: "status",
											style: styles$5.statusLine,
											children: resetMessage
										})]
									}),
									id === "codex" && usage?.resetCreditsError !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										style: styles$5.errorLine,
										children: t("resetCreditsError", { message: usage.resetCreditsError })
									})
								]
							})]
						}, account.key);
					}),
					busy && deviceCode !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: styles$5.deviceCode,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: styles$5.statusLine,
								children: t(id === "muse" ? "museDeviceCodePrompt" : "deviceCodePrompt")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: styles$5.deviceCodeText,
								children: deviceCode.userCode
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: styles$5.actions,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => {
										copyDeviceCode(id, deviceCode.userCode);
									},
									children: copiedCode === id ? t("deviceCodeCopied") : t("deviceCodeCopy")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => {
										window.open(deviceCode.verificationUrl, "_blank", "noopener");
									},
									children: t(id === "muse" ? "museDeviceCodeOpenPage" : "deviceCodeOpenPage")
								})]
							})
						]
					}),
					busy && deviceCode === void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
						style: styles$5.manual,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("manualSummary") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: styles$5.manualRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								style: styles$5.manualInput,
								value: manualDrafts[id],
								placeholder: t("manualPlaceholder"),
								onChange: (event) => setManualDrafts((prev) => ({
									...prev,
									[id]: event.target.value
								}))
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => {
									submitManual(id);
								},
								children: t("submit")
							})]
						})]
					})
				]
			})
		}, id);
	});
	const proxyCardNode = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: embedded ? "dsh-subscription-settings-card" : void 0,
		style: embedded ? {
			...styles$5.card,
			padding: "14px 16px",
			gap: 8
		} : styles$5.proxyCard,
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			style: styles$5.cardHeader,
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: {
					...styles$5.dot,
					background: proxy?.enabled === true ? "var(--dsw-alias-state-success-primary)" : "var(--dsw-alias-label-dimmed)"
				} }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: styles$5.name,
					children: t("proxyTitle")
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					style: {
						marginLeft: "auto",
						flexShrink: 0
					},
					onClick: openProxyDialog,
					children: t("proxyConfigure")
				})
			]
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
			style: styles$5.statusLine,
			children: proxyStatusText(t, proxy, proxyLoadError)
		})]
	});
	const providerTabsNode = /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SubscriptionTabs, {
		prefix: tabIdPrefix,
		label: t("providerTabs"),
		active: activeProvider,
		scrollLeftLabel: t("scrollProvidersLeft"),
		scrollRightLabel: t("scrollProvidersRight"),
		onSelect: setSelectedProvider,
		tabRefs,
		tabs: sortedProviders.map(({ id, name }) => {
			const status = statuses[id];
			const displayName = status?.displayName || name;
			return {
				key: id,
				id,
				label: displayName,
				provider: id,
				ariaLabel: displayName + " — " + statusText(t, status),
				content: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					"aria-hidden": "true",
					style: {
						...styles$5.dot,
						background: dotColor(status)
					}
				}), displayName] })
			};
		})
	});
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: embedded ? "dsh-subscriptions-settings dsh-subscriptions-settings-embedded" : "dsh-subscriptions-settings",
		style: embedded ? {
			...styles$5.section,
			maxWidth: "none",
			width: "100%"
		} : styles$5.section,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: providerSettingsCss }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				style: styles$5.intro,
				children: t("intro")
			}),
			!hideUsageHint && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				style: styles$5.statusLine,
				children: t("usageSettingsHint")
			}),
			embedded ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dsh-subscription-provider-area",
				children: providerTabsNode
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsh-subscriptions-embedded-grid",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dsh-subscriptions-embedded-main",
					children: providerPanels
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
					className: "dsh-subscriptions-embedded-aside",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageBadgeDisplaySetting, { t }), proxyCardNode]
				})]
			})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-subscription-provider-area",
					children: [providerTabsNode, providerPanels]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { style: styles$5.separator }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageBadgeDisplaySetting, { t }),
				proxyCardNode
			] }),
			managedProvider && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderAccountManager, {
				provider: managedProvider.id,
				name: managedProvider.name,
				rpc,
				t,
				accountsVersion: JSON.stringify((statuses[managedProvider.id]?.accounts ?? []).map((account) => account.key).sort()),
				onClose: () => {
					setManagedProvider(void 0);
					refresh();
				}
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: ".subscriptions-reset-dialog::backdrop { background: var(--dsw-alias-bg-mask-1, #0006); backdrop-filter: var(--dsw-mask-blur, none); }" }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dialog", {
				ref: resetDialogRef,
				className: "subscriptions-reset-dialog",
				"aria-labelledby": "subscriptions-reset-title",
				onCancel: () => setResetConfirmation(void 0),
				onClose: () => setResetConfirmation(void 0),
				style: {
					...styles$5.modal,
					display: resetConfirmation ? "flex" : "none",
					margin: "auto",
					color: "var(--dsw-alias-label-primary)"
				},
				children: resetConfirmation && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						id: "subscriptions-reset-title",
						style: {
							...styles$5.modalTitle,
							margin: 0
						},
						children: t("resetUseConfirmTitle")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: {
							...styles$5.statusLine,
							overflowWrap: "anywhere"
						},
						children: statuses.codex?.accounts.find((a) => a.key === resetConfirmation.account)?.account ?? resetConfirmation.account
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							...styles$5.usageMeta,
							gap: 12
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("usageWeekly") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("strong", { children: [Math.round(resetConfirmation.weeklyUsedPercent), "%"] })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: styles$5.usageMeta,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: resetConfirmation.creditExpiresAt === void 0 ? t("resetCreditExpiryUnknown") : t("resetCreditExpires", { date: new Date(resetConfirmation.creditExpiresAt).toLocaleString() }) })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: {
							...styles$5.statusLine,
							margin: "4px 0"
						},
						children: t("resetUseWarning")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						style: {
							display: "flex",
							gap: 8,
							alignItems: "flex-start",
							fontSize: 12
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							checked: resetAcknowledged,
							onChange: (e) => setResetAcknowledged(e.target.checked)
						}), t("resetUseAcknowledge")]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-subscription-dialog-actions",
						style: {
							...styles$5.actions,
							justifyContent: "flex-end",
							marginTop: 8
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							autoFocus: true,
							onClick: () => setResetConfirmation(void 0),
							children: t("cancel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dsh-subscription-primary",
							style: {
								opacity: resetAcknowledged ? 1 : .35,
								cursor: resetAcknowledged ? "pointer" : "not-allowed"
							},
							disabled: !resetAcknowledged || resetBusy,
							onClick: () => {
								consumeReset();
							},
							children: t("resetUseConfirm")
						})]
					})
				] })
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dialog", {
				ref: antigravityDialogRef,
				className: "subscriptions-reset-dialog",
				"aria-labelledby": "subscriptions-antigravity-enable-title",
				onCancel: () => setAntigravityConfirmOpen(false),
				onClose: () => setAntigravityConfirmOpen(false),
				style: {
					...styles$5.modal,
					display: antigravityConfirmOpen ? "flex" : "none",
					margin: "auto",
					color: "var(--dsw-alias-label-primary)"
				},
				children: antigravityConfirmOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						id: "subscriptions-antigravity-enable-title",
						style: {
							...styles$5.modalTitle,
							margin: 0
						},
						children: t("antigravityEnableConfirmTitle")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: {
							...styles$5.statusLine,
							margin: "4px 0",
							color: "var(--dsw-alias-label-secondary)"
						},
						children: t("antigravityEnableConfirmBody")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						style: {
							display: "flex",
							gap: 8,
							alignItems: "flex-start",
							fontSize: 12
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							checked: antigravityAcknowledged,
							onChange: (e) => setAntigravityAcknowledged(e.target.checked)
						}), t("antigravityEnableAcknowledge")]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-subscription-dialog-actions",
						style: {
							...styles$5.actions,
							justifyContent: "flex-end",
							marginTop: 8
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							autoFocus: true,
							onClick: () => setAntigravityConfirmOpen(false),
							children: t("cancel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dsh-subscription-primary",
							style: {
								opacity: antigravityAcknowledged ? 1 : .35,
								cursor: antigravityAcknowledged ? "pointer" : "not-allowed"
							},
							disabled: !antigravityAcknowledged || antigravityToggleBusy,
							onClick: () => {
								toggleProviderEnabled("antigravity", true);
							},
							children: t("antigravityEnableConfirm")
						})]
					})
				] })
			}),
			proxyOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: styles$5.modalOverlay,
				onClick: () => setProxyOpen(false),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: styles$5.modal,
					onClick: (event) => event.stopPropagation(),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: styles$5.modalHeader,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: styles$5.modalTitle,
								children: t("proxyDialogTitle")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: { marginLeft: "auto" },
								onClick: () => setProxyOpen(false),
								children: t("proxyDialogClose")
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							style: styles$5.proxyCheck,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: proxyEnabled,
								onChange: (event) => setProxyEnabled(event.target.checked)
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("proxyEnabled") })]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							style: styles$5.proxyField,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: styles$5.proxyLabel,
									children: t("proxyUrl")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									style: styles$5.proxyInput,
									value: proxyUrl,
									placeholder: t("proxyUrlPlaceholder"),
									onChange: (event) => setProxyUrl(event.target.value)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									style: styles$5.proxyHint,
									children: t("proxyUrlHint")
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							style: styles$5.proxyField,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: styles$5.proxyLabel,
								children: t("proxyUsername")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								style: styles$5.proxyInput,
								value: proxyUsername,
								placeholder: t("proxyUsernamePlaceholder"),
								onChange: (event) => setProxyUsername(event.target.value)
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: styles$5.proxyField,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: styles$5.proxyLabel,
									children: t("proxyPassword")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "password",
									style: styles$5.proxyInput,
									value: proxyPassword,
									placeholder: t("proxyPasswordPlaceholder"),
									onChange: (event) => setProxyPassword(event.target.value)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									style: styles$5.proxyCheck,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "checkbox",
										checked: proxyClearPassword,
										onChange: (event) => setProxyClearPassword(event.target.checked)
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("proxyClearPassword") })]
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							style: styles$5.proxyField,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: styles$5.proxyLabel,
									children: t("proxyBypass")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									style: styles$5.proxyInput,
									value: proxyBypass,
									placeholder: t("proxyBypassPlaceholder"),
									onChange: (event) => setProxyBypass(event.target.value)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									style: styles$5.proxyHint,
									children: t("proxyBypassHint")
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: styles$5.proxyHint,
							children: t("proxyNote")
						}),
						proxyMessage !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: {
								...styles$5.proxyMessage,
								color: messageColor(proxyMessage.tone)
							},
							children: proxyMessage.text
						}),
						proxyTestResult !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: {
								...styles$5.proxyMessage,
								color: proxyTestResult.ok ? "var(--dsw-alias-state-success-primary)" : "var(--dsw-alias-state-error-primary)"
							},
							children: proxyTestResult.ok ? proxyTestResult.viaProxy ? t("proxyTestOk", {
								status: String(proxyTestResult.status),
								ms: String(proxyTestResult.latencyMs)
							}) : t("proxyTestOkDirect", {
								status: String(proxyTestResult.status),
								ms: String(proxyTestResult.latencyMs)
							}) : t("proxyTestFail", { message: proxyTestResult.error ?? "" })
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-subscription-dialog-actions",
							style: styles$5.proxyActions,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									disabled: proxyTesting,
									onClick: () => {
										testProxy();
									},
									children: proxyTesting ? t("proxyTesting") : t("proxyTest")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsh-subscription-primary",
									disabled: proxySaving,
									onClick: () => {
										saveProxy();
									},
									children: proxySaving ? t("proxySaving") : t("proxySave")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => setProxyOpen(false),
									children: t("proxyCancel")
								})
							]
						})
					]
				})
			})
		]
	});
}

//#endregion
//#region src/client/ImageGallery.tsx
/** Display box for a lone image (platform rule): long edge 240px with the
* rendered aspect ratio clamped to [0.25, 4] — the overflow is cropped by
* `object-fit: cover` — and never upscaled past the image's natural size. The
* crop anchor keeps the top of very tall images and the left of very wide
* ones, where the informative content usually starts. */
function singleFit(attachment) {
	const natural = attachment.width / attachment.height;
	const ratio = Math.min(4, Math.max(.25, natural));
	const box = ratio >= 1 ? {
		width: 240,
		height: 240 / ratio
	} : {
		width: 240 * ratio,
		height: 240
	};
	const scale = Math.min(1, attachment.width / box.width, attachment.height / box.height);
	return {
		width: Math.max(1, Math.round(box.width * scale)),
		height: Math.max(1, Math.round(box.height * scale)),
		objectPosition: natural < .25 ? "center top" : natural > 4 ? "left center" : "center"
	};
}
const styles$4 = {
	gallery: {
		display: "flex",
		flexWrap: "wrap",
		gap: 8,
		justifyContent: "flex-start"
	},
	frame: {
		display: "grid",
		placeItems: "center",
		overflow: "hidden",
		padding: 0,
		border: "1px solid var(--dsw-alias-border-l2-darkmode-thin)",
		borderRadius: 8,
		background: "var(--dsw-alias-interactive-bg-hover-solid)",
		cursor: "zoom-in"
	},
	tile: {
		width: 64,
		height: 64
	},
	img: {
		width: "100%",
		height: "100%",
		objectFit: "cover",
		display: "block"
	},
	loading: {
		fontSize: 12,
		color: "var(--dsw-alias-label-tertiary)",
		padding: "0 8px"
	},
	error: {
		fontSize: 12,
		color: "var(--dsw-alias-state-error-primary)",
		cursor: "pointer",
		border: "1px solid var(--dsw-alias-border-l2-darkmode-thin)",
		borderRadius: 8,
		background: "transparent",
		padding: "6px 10px"
	},
	overlay: {
		position: "fixed",
		inset: 0,
		zIndex: 1e3,
		display: "grid",
		placeItems: "center",
		background: "rgba(0, 0, 0, 0.72)",
		padding: 24
	},
	overlayImg: {
		maxWidth: "92vw",
		maxHeight: "92vh",
		objectFit: "contain",
		borderRadius: 4
	},
	close: {
		position: "absolute",
		top: 12,
		right: 12,
		width: 32,
		height: 32,
		display: "grid",
		placeItems: "center",
		border: "none",
		borderRadius: "50%",
		cursor: "pointer",
		background: "rgba(255, 255, 255, 0.16)",
		color: "#fff",
		fontSize: 16,
		lineHeight: 1
	}
};
/**
* Full-viewport original-image preview: backdrop or close-control click and
* Escape all dismiss; the image itself is inert so a click on it does not
* fall through to the backdrop dismissal.
*/
function ImageLightbox({ src, alt, labels, onClose }) {
	(0, react.useEffect)(() => {
		const onKey = (event) => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => {
			window.removeEventListener("keydown", onKey);
		};
	}, [onClose]);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		role: "dialog",
		"aria-label": labels.dialog,
		style: styles$4.overlay,
		onClick: onClose,
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
			src,
			alt,
			style: styles$4.overlayImg,
			onClick: (event) => {
				event.stopPropagation();
			}
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
			type: "button",
			"aria-label": labels.close,
			style: styles$4.close,
			onClick: onClose,
			children: "×"
		})]
	});
}
/**
* Compact history renderer with retryable loading and click-to-open original
* preview. A lone image renders at its `singleFit` size; an image among
* several renders as a fixed 64px square tile.
*/
function MessageImage({ attachment, load, variant, labels }) {
	const [src, setSrc] = (0, react.useState)(null);
	const [error, setError] = (0, react.useState)(false);
	const [open, setOpen] = (0, react.useState)(false);
	const [attempt, setAttempt] = (0, react.useState)(0);
	const retry = (0, react.useCallback)(() => {
		setAttempt((a) => a + 1);
	}, []);
	const close = (0, react.useCallback)(() => {
		setOpen(false);
	}, []);
	const fit = (0, react.useMemo)(() => variant === "single" ? singleFit(attachment) : void 0, [attachment, variant]);
	(0, react.useEffect)(() => {
		let live = true;
		setError(false);
		setSrc(null);
		load(attachment).then((url) => {
			if (live) setSrc(url);
		}).catch(() => {
			if (live) setError(true);
		});
		return () => {
			live = false;
		};
	}, [
		attachment,
		load,
		attempt
	]);
	const label = attachment.name ?? labels.image;
	if (error) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
		type: "button",
		style: styles$4.error,
		onClick: retry,
		children: labels.loadFailed
	});
	const box = fit === void 0 ? styles$4.tile : {
		width: fit.width,
		height: fit.height
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
		type: "button",
		style: {
			...styles$4.frame,
			...box
		},
		title: labels.open,
		"aria-label": labels.openNamed(label),
		onClick: () => {
			if (src !== null) setOpen(true);
		},
		children: src === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			style: styles$4.loading,
			children: labels.loading
		}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
			src,
			alt: label,
			style: {
				...styles$4.img,
				objectPosition: fit?.objectPosition
			}
		})
	}), open && src !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ImageLightbox, {
		src,
		alt: label,
		labels: labels.lightbox,
		onClose: close
	})] });
}
/** Wrapping image group: a lone image renders large, several render as 64px
* square tiles (same rule as the platform gallery). */
function ImageGallery({ images, load, labels }) {
	if (images.length === 0) return null;
	const variant = images.length === 1 ? "single" : "tile";
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		style: styles$4.gallery,
		children: images.map((image, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MessageImage, {
			attachment: image.attachment,
			load,
			variant,
			labels
		}, `${image.attachment.attachmentId}:${index}`))
	});
}

//#endregion
//#region src/client/host-icons.ts
/** A decorative glyph the host lacks renders nothing rather than crashing. */
const NoIcon = () => null;
/**
* Resolve one 16px glyph under either host naming.
* @param icons - the host primitives module (`import * as`), read by name.
* @param name - the glyph name without prefix or size, e.g. `Sparkle`.
* @returns the host's component, or one rendering nothing.
*/
function hostIcon(icons, name) {
	const exports$1 = icons;
	return exports$1[`Icon${name}Regular`] ?? exports$1[`Icon${name}16`] ?? NoIcon;
}

//#endregion
//#region src/client/media-arguments.ts
const PROMPT_MAX_LENGTH = 60;
/** Read during render: the host republishes preparing calls when observed answers change. */
function mediaArguments(block) {
	const args = block.args;
	const raw = "kind" in block ? block.call?.argsRaw : "argsRaw" in block ? block.argsRaw : void 0;
	let prompt;
	let references;
	if (args !== void 0) {
		prompt = args.textPrefix("prompt", PROMPT_MAX_LENGTH + 1);
		if (!prompt) for (const key of args.keys()) {
			const candidate = args.textPrefix(key, PROMPT_MAX_LENGTH + 1);
			if (candidate) {
				prompt = candidate;
				break;
			}
		}
		references = args.value("referenceImages");
	} else if (raw !== void 0) try {
		const parsed = JSON.parse(raw);
		if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
			const fields = parsed;
			if (typeof fields.prompt === "string" && fields.prompt !== "") prompt = fields.prompt;
			else prompt = Object.values(fields).find((value) => typeof value === "string" && value !== "");
			references = fields.referenceImages;
		}
	} catch {}
	const line = (prompt ?? raw ?? "").split("\n", 1)[0] ?? "";
	return {
		prompt: line.length > PROMPT_MAX_LENGTH ? line.slice(0, PROMPT_MAX_LENGTH) + "…" : line,
		references: Array.isArray(references) ? references.length : 0
	};
}

//#endregion
//#region src/client/ImageGenerateToolview.tsx
/** DSH 0.1.7 renamed IconSparkle16; resolving it by name keeps older hosts working too. */
const SparkleIcon$1 = hostIcon(__deepseek_ai_dsh_client_ui_primitives, "Sparkle");
/**
* Build the ImageGallery loader over the `image` endpoint.
* @param rpc - Connection RPC caller.
* @returns loader resolving an attachment ref to a data URL.
*/
function createImageLoader(rpc) {
	return (attachment) => callSubscriptionsAuth(rpc, "image", { ...attachment }).then((result) => `data:${result.mediaType};base64,${result.dataBase64}`);
}
/**
* English-dictionary fallback for a missing locale seat (standalone renders);
* the framework always supplies the namespace-bound one.
* @param key - dictionary key.
* @param params - `{name}` template params.
* @returns the template with params substituted.
*/
function fallbackTranslate$5(key, params) {
	let text = en[key];
	for (const [name, value] of Object.entries(params ?? {})) text = text.replaceAll(`{${name}}`, String(value));
	return text;
}
/** Flatten a settled result's text blocks (the degraded text-only route and the error line). */
function resultText$1(block) {
	if (!("kind" in block)) return "";
	const parts = [];
	for (const part of block.content) if (part.type === "text") parts.push(part.text);
	if (parts.length === 0 && block.error !== void 0) parts.push(`${block.error.name}: ${block.error.code}`);
	return parts.join("\n");
}
/** Image attachments of a settled result; empty while running or on the text-only route. */
function resultImages(block) {
	if (!("kind" in block)) return [];
	const images = [];
	for (const part of block.content) if (part.type === "image") images.push({ attachment: part.attachment });
	return images;
}
const styles$3 = {
	container: {
		display: "flex",
		flexDirection: "column",
		gap: 6,
		padding: "4px 0"
	},
	row: {
		display: "flex",
		alignItems: "center",
		gap: 6,
		minWidth: 0
	},
	icon: {
		display: "inline-flex",
		flexShrink: 0,
		color: "var(--dsw-alias-label-tertiary)"
	},
	title: {
		fontSize: 13,
		lineHeight: "20px",
		color: "var(--dsw-alias-label-primary)",
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap"
	},
	subtle: {
		margin: 0,
		fontSize: 12,
		lineHeight: "18px",
		color: "var(--dsw-alias-label-tertiary)"
	},
	output: {
		margin: 0,
		fontSize: 12,
		lineHeight: "18px",
		color: "var(--dsw-alias-label-secondary)",
		whiteSpace: "pre-wrap",
		overflowWrap: "anywhere"
	},
	error: {
		margin: 0,
		fontSize: 12,
		lineHeight: "18px",
		color: "var(--dsw-alias-state-error-primary)"
	}
};
/**
* The `image_generate` keyed toolview component.
* @param props - owner share, inject face, and locale seat (spread flat).
* @returns the call row plus, once settled, the gallery / text / error body.
*/
function ImageGenerateToolview(props) {
	const { block, load } = props;
	const t = props.t ?? fallbackTranslate$5;
	if (block === void 0) return null;
	const settled = "kind" in block;
	const { prompt, references } = mediaArguments(block);
	const title = `image_generate${references > 0 ? ` (${references} ref)` : ""}: ${prompt}`;
	const images = resultImages(block);
	const text = settled ? resultText$1(block) : "";
	const labels = {
		image: t("image"),
		open: t("viewImage"),
		openNamed: (name) => t("viewImageNamed", { name }),
		loading: t("imageLoading"),
		loadFailed: t("imageLoadFailed"),
		lightbox: {
			dialog: t("imagePreview"),
			close: t("imageClose")
		}
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		style: styles$3.container,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: styles$3.row,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: styles$3.icon,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SparkleIcon$1, { size: 14 })
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: styles$3.title,
					children: title
				})]
			}),
			!settled && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				style: styles$3.subtle,
				children: t("generating")
			}),
			settled && block.isError && text !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				style: styles$3.error,
				children: text.split("\n", 1)[0]
			}),
			settled && !block.isError && images.length > 0 && load !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ImageGallery, {
				images,
				load,
				labels
			}),
			settled && !block.isError && images.length === 0 && text !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				style: styles$3.output,
				children: text
			})
		]
	});
}

//#endregion
//#region src/client/VideoGenerateToolview.tsx
/** DSH 0.1.7 renamed IconSparkle16; resolving it by name keeps older hosts working too. */
const SparkleIcon = hostIcon(__deepseek_ai_dsh_client_ui_primitives, "Sparkle");
/**
* Build the video loader over the `/subscriptions-auth` `video` endpoint.
* @param rpc - Connection RPC caller.
* @returns loader resolving a bare file name to the decoded bytes.
*/
function createVideoLoader(rpc) {
	return (name) => callSubscriptionsAuth(rpc, "video", { name });
}
/**
* English-dictionary fallback for a missing locale seat (standalone renders);
* the framework always supplies the namespace-bound one.
*/
function fallbackTranslate$4(key, params) {
	let text = en[key];
	for (const [name, value] of Object.entries(params ?? {})) text = text.replaceAll(`{${name}}`, String(value));
	return text;
}
/** Flatten a settled result's text blocks (the fallback body and the error line). */
function resultText(block) {
	if (!("kind" in block)) return "";
	const parts = [];
	for (const part of block.content) if (part.type === "text") parts.push(part.text);
	if (parts.length === 0 && block.error !== void 0) parts.push(`${block.error.name}: ${block.error.code}`);
	return parts.join("\n");
}
/**
* The generated video's bare file name: presentation meta first (top-level
* dispatches), then the render text's "Saved video to …" line (nested
* dispatches compute no meta).
*/
function resolveFileName(block) {
	if (!("kind" in block)) return void 0;
	const meta = block.meta;
	if (typeof meta === "object" && meta !== null) {
		const fileName = meta.fileName;
		if (typeof fileName === "string" && fileName.length > 0) return fileName;
	}
	const match = /^Saved video to (.+\.mp4)/m.exec(resultText(block));
	if (match === null) return void 0;
	const path = match[1];
	return path.slice(path.lastIndexOf("/") + 1);
}
/** Decode a base64 payload into bytes (browser-side; no Buffer). */
function base64Bytes(dataBase64) {
	const binary = atob(dataBase64);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
	return bytes;
}
const styles$2 = {
	container: {
		display: "flex",
		flexDirection: "column",
		gap: 6,
		padding: "4px 0"
	},
	row: {
		display: "flex",
		alignItems: "center",
		gap: 6,
		minWidth: 0
	},
	icon: {
		display: "inline-flex",
		flexShrink: 0,
		color: "var(--dsw-alias-label-tertiary)"
	},
	title: {
		fontSize: 13,
		lineHeight: "20px",
		color: "var(--dsw-alias-label-primary)",
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap"
	},
	subtle: {
		margin: 0,
		fontSize: 12,
		lineHeight: "18px",
		color: "var(--dsw-alias-label-tertiary)"
	},
	output: {
		margin: 0,
		fontSize: 12,
		lineHeight: "18px",
		color: "var(--dsw-alias-label-secondary)",
		whiteSpace: "pre-wrap",
		overflowWrap: "anywhere"
	},
	error: {
		margin: 0,
		fontSize: 12,
		lineHeight: "18px",
		color: "var(--dsw-alias-state-error-primary)"
	},
	video: {
		display: "block",
		maxWidth: 480,
		width: "100%",
		borderRadius: 8,
		backgroundColor: "var(--dsw-alias-fill-tertiary)"
	}
};
/**
* The `video_generate` keyed toolview component.
* @param props - owner share, inject face, and locale seat (spread flat).
* @returns the call row plus, once settled, the player / text / error body.
*/
function VideoGenerateToolview(props) {
	const { block, loadVideo } = props;
	const t = props.t ?? fallbackTranslate$4;
	const settled = block !== void 0 && "kind" in block;
	const isError = settled && block.isError;
	const fileName = block !== void 0 && settled && !isError ? resolveFileName(block) : void 0;
	const [load, setLoad] = (0, react.useState)({ phase: "loading" });
	(0, react.useEffect)(() => {
		if (fileName === void 0 || loadVideo === void 0) return;
		let cancelled = false;
		let objectUrl;
		setLoad({ phase: "loading" });
		loadVideo(fileName).then((video) => {
			if (cancelled) return;
			objectUrl = URL.createObjectURL(new Blob([base64Bytes(video.dataBase64).slice()], { type: video.mediaType }));
			setLoad({
				phase: "ready",
				url: objectUrl
			});
		}, (error) => {
			if (cancelled) return;
			setLoad({
				phase: "failed",
				message: error instanceof Error ? error.message : String(error)
			});
		});
		return () => {
			cancelled = true;
			if (objectUrl !== void 0) URL.revokeObjectURL(objectUrl);
		};
	}, [fileName, loadVideo]);
	if (block === void 0) return null;
	const { prompt } = mediaArguments(block);
	const title = `video_generate: ${prompt}`;
	const text = settled ? resultText(block) : "";
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		style: styles$2.container,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: styles$2.row,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: styles$2.icon,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SparkleIcon, { size: 14 })
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: styles$2.title,
					children: title
				})]
			}),
			!settled && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				style: styles$2.subtle,
				children: t("generatingVideo")
			}),
			settled && isError && text !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				style: styles$2.error,
				children: text.split("\n", 1)[0]
			}),
			settled && !isError && fileName !== void 0 && load.phase === "loading" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				style: styles$2.subtle,
				children: t("videoLoading")
			}),
			settled && !isError && fileName !== void 0 && load.phase === "failed" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				style: styles$2.error,
				children: t("videoLoadFailed", { message: load.message })
			}),
			settled && !isError && fileName !== void 0 && load.phase === "ready" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("video", {
				style: styles$2.video,
				src: load.url,
				controls: true,
				preload: "metadata"
			}),
			settled && !isError && fileName === void 0 && text !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				style: styles$2.output,
				children: text
			})
		]
	});
}

//#endregion
//#region src/client/SpeedSelect.tsx
/**
* The `loadSpeed` half of the inject face: the plugin's own speed state plus
* the host's current model selection (the visibility gate). A model-RPC
* failure throws rather than answering "hidden" — the caller keeps its last
* known state, so a transient failure never locks the toggle away.
*
* `sessionId` is a plain string: slot and command contexts brand it through
* different dsh-session copies, and only the service boundary needs one.
*
* `models` resolves lazily per call: the ui-model-selection service may
* register after this plugin applies, and a shell without it (no model seat
* at all) simply keeps the toggle hidden.
*/
function createSpeedLoader(connection, models, sessionId) {
	return async () => {
		const directory = models()?.directoryFor(sessionId);
		const current = (await directory?.load())?.current ?? null;
		const state = await callSubscriptionsAuth(connection.rpc, "speed", {
			sessionId,
			...current?.provider === "codex" ? { model: current.model } : {}
		});
		const visible = current !== null && current.provider === "codex" && state.fastModels.includes(current.model);
		const latest = (await directory?.load())?.current ?? null;
		if (latest?.provider !== current?.provider || latest?.model !== current?.model) throw new Error("Model changed while loading speed");
		return {
			visible,
			tier: state.tier,
			...visible && current ? { model: current.model } : {}
		};
	};
}
/** The `setSpeed` half of the inject face: boolean outcome for the component's busy state. */
function createSpeedSetter(connection, sessionId, models) {
	return async (tier, displayedModel) => {
		try {
			const directories = models?.();
			const current = directories === void 0 ? null : (await directories.directoryFor(sessionId).load()).current;
			if (models !== void 0 && current?.provider !== "codex") return false;
			if (displayedModel !== void 0 && current?.model !== displayedModel) return false;
			await callSubscriptionsAuth(connection.rpc, "setSpeed", {
				sessionId,
				tier,
				...current?.provider === "codex" ? { model: current.model } : {}
			});
			return true;
		} catch {
			return false;
		}
	};
}
/** English-dictionary fallback for a missing inject `t` (standalone renders). */
function fallbackTranslate$3(key) {
	return en[key];
}
const TIERS = ["standard", "fast"];
/**
* The composer Speed control: a trigger reading `速度 · 快速`/`速度 · 标准`
* that opens a two-row menu (standard/fast with descriptions, check mark on
* the current tier). Mount and every open reload the host state so a model
* switch made since the last open self-corrects.
*/
/** How often the control re-reads the host state (model switches arrive only by asking). */
const POLL_INTERVAL_MS = 3e3;
/**
* The composer Speed control: a trigger reading `速度 · 快速`/`速度 · 标准`
* that opens a two-row menu (standard/fast with descriptions, check mark on
* the current tier). The host pushes nothing on a model switch, so the
* control re-reads on a slow poll with a single-flight guard; a failed read
* keeps the last known state, so a transient RPC failure can never lock the
* toggle away (the earlier mount-only load had no recovery path).
*/
function SpeedSelect({ loadSpeed, setSpeed, t }) {
	const translate = t ?? fallbackTranslate$3;
	const [state, setState] = (0, react.useState)(null);
	const [open, setOpen] = (0, react.useState)(false);
	const [busy, setBusy] = (0, react.useState)(false);
	const rootRef = (0, react.useRef)(null);
	const loadRef = (0, react.useRef)(loadSpeed);
	loadRef.current = loadSpeed;
	const generation = (0, react.useRef)(0);
	const mounted = (0, react.useRef)(false);
	const refresh = async () => {
		if (!mounted.current) return;
		const id = ++generation.current;
		try {
			const loaded = await loadRef.current?.();
			if (loaded && id === generation.current) setState(loaded);
		} catch {}
	};
	(0, react.useEffect)(() => {
		if (loadRef.current === void 0) return;
		mounted.current = true;
		let cancelled = false;
		let inflight = false;
		const reload$1 = () => {
			if (loadRef.current === void 0 || inflight || cancelled) return;
			inflight = true;
			refresh().finally(() => {
				inflight = false;
			});
		};
		reload$1();
		const timer = setInterval(reload$1, POLL_INTERVAL_MS);
		return () => {
			mounted.current = false;
			++generation.current;
			cancelled = true;
			clearInterval(timer);
		};
	}, []);
	(0, react.useEffect)(() => {
		if (!open) return;
		const closeOutside = (event) => {
			if (!rootRef.current?.contains(event.target)) setOpen(false);
		};
		document.addEventListener("mousedown", closeOutside);
		return () => {
			document.removeEventListener("mousedown", closeOutside);
		};
	}, [open]);
	if (loadSpeed === void 0 || setSpeed === void 0 || state === null || !state.visible) return null;
	const choose = (tier) => {
		if (busy) return;
		if (tier === state.tier) {
			setOpen(false);
			return;
		}
		setBusy(true);
		setSpeed(tier, state.model).then((ok) => {
			if (!mounted.current) return;
			setBusy(false);
			if (ok) setOpen(false);
			refresh();
		}, () => {
			if (mounted.current) {
				setBusy(false);
				refresh();
			}
		});
	};
	const show = () => {
		setOpen(true);
		refresh();
	};
	const tierName = (tier) => translate(tier === "fast" ? "speedFast" : "speedStandard");
	const tierDescription = (tier) => translate(tier === "fast" ? "speedFastDescription" : "speedStandardDescription");
	const triggerLabel = `${translate("speed")} · ${tierName(state.tier)}`;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		ref: rootRef,
		className: "dsh-subscription-speed",
		style: styles$1.root,
		onKeyDown: (event) => {
			if (event.key === "Escape" && open) {
				event.preventDefault();
				setOpen(false);
			}
		},
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: subscriptionChromeCss }),
			open && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: styles$1.menu,
				role: "menu",
				"aria-label": translate("speed"),
				children: TIERS.map((tier) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					role: "menuitemradio",
					"aria-checked": tier === state.tier,
					style: styles$1.item,
					disabled: busy,
					onClick: () => {
						choose(tier);
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: styles$1.itemCheck,
						children: tier === state.tier ? "✓" : ""
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						style: styles$1.itemText,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: styles$1.itemName,
							children: tierName(tier)
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: styles$1.itemDescription,
							children: tierDescription(tier)
						})]
					})]
				}, tier))
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				style: styles$1.trigger,
				"aria-haspopup": "menu",
				"aria-expanded": open,
				title: triggerLabel,
				disabled: busy,
				onClick: () => {
					if (open) setOpen(false);
					else show();
				},
				children: triggerLabel
			})
		]
	});
}
const styles$1 = {
	root: {
		position: "relative",
		display: "inline-flex"
	},
	trigger: {
		border: "0.5px solid var(--dsw-alias-border-l3)",
		borderRadius: "var(--dsw-radius-sm, 8px)",
		background: "var(--dsh-subscription-speed-hover, transparent)",
		color: "var(--dsw-alias-label-secondary)",
		font: "inherit",
		fontSize: 12,
		lineHeight: "18px",
		padding: "2px 8px",
		cursor: "pointer",
		whiteSpace: "nowrap"
	},
	menu: {
		position: "absolute",
		bottom: "100%",
		right: 0,
		marginBottom: 4,
		minWidth: 180,
		padding: 4,
		zIndex: 20,
		background: "var(--dsw-specific-menu, var(--dsw-alias-bg-layer-2))",
		border: 0,
		boxShadow: "var(--dsw-elevation-prominent)",
		borderRadius: "var(--dsw-radius-lg, 16px)",
		display: "flex",
		flexDirection: "column",
		gap: 2
	},
	item: {
		display: "flex",
		alignItems: "flex-start",
		gap: 6,
		width: "100%",
		border: "none",
		borderRadius: "var(--dsw-radius-sm, 8px)",
		background: "var(--dsh-subscription-speed-hover, transparent)",
		padding: "6px 8px",
		cursor: "pointer",
		font: "inherit",
		textAlign: "left"
	},
	itemCheck: {
		width: 14,
		flexShrink: 0,
		fontSize: 12,
		lineHeight: "18px",
		color: "var(--dsw-alias-label-primary)"
	},
	itemText: {
		display: "flex",
		flexDirection: "column"
	},
	itemName: {
		fontSize: 12,
		lineHeight: "18px",
		color: "var(--dsw-alias-label-primary)"
	},
	itemDescription: {
		fontSize: 11,
		lineHeight: "16px",
		color: "var(--dsw-alias-label-tertiary)"
	}
};

//#endregion
//#region src/client/anchored-panel.ts
/**
* Place a panel against its trigger and keep it inside the viewport.
* @param input - trigger box, measured panel size, viewport, side/alignment and distances.
* @returns fixed `left`/`top` for the panel.
*/
function placePanel(input) {
	const { anchor, panel, viewport, side, align, gap, margin, topMargin } = input;
	let left = align === "end" ? anchor.right - panel.width : anchor.left;
	let top = side === "top" ? anchor.top - gap - panel.height : anchor.bottom + gap;
	if (panel.width > 0) left = Math.min(Math.max(left, margin), viewport.width - panel.width - margin);
	if (panel.height > 0) top = Math.min(Math.max(top, topMargin), viewport.height - panel.height - margin);
	return {
		left,
		top
	};
}
/**
* Top inset an overlay keeps from the viewport edge. The desktop frame reserves
* a strip at the top (traffic lights / caption) and publishes its height as
* `--dsh-frame-top-clearance`; overlays stay 20px below it, or 20px from the
* edge in native fullscreen. Without a published clearance (plain browser) only
* the overlay's own margin applies.
* @param min - the overlay's own viewport margin, used as the floor.
* @param clearance - the raw `--dsh-frame-top-clearance` value (`'48px'`, `''` when unset).
* @param fullscreen - whether the frame reports native fullscreen (`data-fullscreen` on the root).
* @returns the top margin in px.
*/
function topMarginFor(min, clearance, fullscreen) {
	const reserved = Number.parseFloat(clearance);
	if (Number.isNaN(reserved)) return min;
	return Math.max(min, (fullscreen ? 0 : reserved) + 20);
}
/**
* Read the live top inset from the document root.
* @param min - the overlay's own viewport margin, used as the floor.
* @returns the top margin in px.
*/
function overlayTopMargin(min) {
	const root = document.documentElement;
	return topMarginFor(min, getComputedStyle(root).getPropertyValue("--dsh-frame-top-clearance"), root.hasAttribute("data-fullscreen"));
}
/**
* Layout effects warn when React renders on the server; the browser bundle
* never does, but the markup tests do, and a plain effect is equivalent there
* because nothing is open yet.
*/
const useIsomorphicLayoutEffect = typeof window === "undefined" ? react.useEffect : react.useLayoutEffect;
/**
* Track a trigger and return the fixed coordinates of its panel: measured
* before paint when the panel opens, then again on scroll (capture phase, so
* scrollers nested inside the page count), on resize, and whenever the panel
* or the trigger changes size.
* @param options - open state, the two refs, placement side/alignment and distances.
* @returns `left`/`top` for the panel, or `null` until the first measurement.
*/
function useAnchoredPanelPosition(options) {
	const { open, anchorRef, panelRef, side = "bottom", align = "start", gap, margin } = options;
	const [position, setPosition] = (0, react.useState)(null);
	useIsomorphicLayoutEffect(() => {
		if (!open) {
			setPosition(null);
			return;
		}
		const place = () => {
			const anchor = anchorRef.current;
			if (anchor === null) return;
			const panel = panelRef.current;
			const next = placePanel({
				anchor: anchor.getBoundingClientRect(),
				panel: {
					width: panel?.offsetWidth ?? 0,
					height: panel?.offsetHeight ?? 0
				},
				viewport: {
					width: window.innerWidth,
					height: window.innerHeight
				},
				side,
				align,
				gap,
				margin,
				topMargin: overlayTopMargin(margin)
			});
			setPosition((previous) => previous !== null && previous.left === next.left && previous.top === next.top ? previous : next);
		};
		place();
		window.addEventListener("scroll", place, true);
		window.addEventListener("resize", place);
		let observer = null;
		if (typeof ResizeObserver !== "undefined") {
			observer = new ResizeObserver(place);
			if (panelRef.current !== null) observer.observe(panelRef.current);
			if (anchorRef.current !== null) observer.observe(anchorRef.current);
		}
		return () => {
			observer?.disconnect();
			window.removeEventListener("scroll", place, true);
			window.removeEventListener("resize", place);
		};
	}, [
		open,
		anchorRef,
		panelRef,
		side,
		align,
		gap,
		margin
	]);
	return position;
}
/**
* Close an open popover when the pointer goes down outside it. The portaled
* panel counts as inside, and so does the trigger root. A click outside closes
* too, in the capture phase: keyboard activation of a sibling control fires
* `click` without `pointerdown`, and the sibling's own dialog must not open
* beside this one (the host's stat pills close each other the same way).
* @param root - element holding the trigger.
* @param open - whether the surface is showing; false detaches the listeners.
* @param setOpen - state setter invoked with `false` on an outside interaction.
* @param portal - the panel portaled outside `root`, if any.
*/
function useDismissOnOutsidePointer(root, open, setOpen, portal) {
	(0, react.useEffect)(() => {
		if (!open) return;
		const closeOutside = (event) => {
			const target = event.target;
			if (target instanceof Node && root.current?.contains(target) !== true && portal?.current?.contains(target) !== true) setOpen(false);
		};
		document.addEventListener("pointerdown", closeOutside);
		document.addEventListener("click", closeOutside, true);
		return () => {
			document.removeEventListener("pointerdown", closeOutside);
			document.removeEventListener("click", closeOutside, true);
		};
	}, [
		root,
		open,
		setOpen,
		portal
	]);
}

//#endregion
//#region src/client/SubscriptionUsageBadge.tsx
/** DSH renamed the data icon in 0.1.7; retain older supported hosts too. */
function usageBadgeIcon(icons) {
	return hostIcon(icons, "DataOutline");
}
const UsageBadgeIcon = usageBadgeIcon(__deepseek_ai_dsh_client_ui_primitives);
/** How often the badge re-reads usage; the server also shares its own cache/negative-cache across UI surfaces. */
const USAGE_POLL_INTERVAL_MS = 15 * 6e4;
/** How often the badge re-reads the session's current model (model switches arrive only by asking). */
const MODEL_POLL_INTERVAL_MS = 3e3;
/** Distance between the trigger's top edge and the dialog's bottom (host stat dialogs use the same). */
const PANEL_GAP = 8;
/** Distance kept between the dialog and each viewport edge. */
const PANEL_MARGIN = 12;
/** Display-only warning; does not infer model eligibility or uncached accounts. */
function accountWindowExhausted(account) {
	return account.windows.some((window$1) => window$1.scope === void 0 && Number.isFinite(window$1.usedPercent) && window$1.usedPercent >= 100);
}
function CodexExhaustionNotice({ display, translate }) {
	if (display.provider !== "codex" || display.accounts.length === 0 || !display.accounts.every(accountWindowExhausted)) return null;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
		role: "status",
		children: translate("usageBadgeAllCodexExhausted")
	});
}
/** The account the collapsed pill reads: the default one, else the first listed. */
function pillAccountOf(d) {
	return d.accounts.find((a) => a.isDefault) ?? d.accounts[0];
}
/** Connected accounts eligible for composer badge polling (skips disabled providers). */
function enabledBadgeRoster(providers) {
	const roster = [];
	for (const provider of Object.keys(providers)) {
		const status = providers[provider];
		if (status?.enabled === false) continue;
		for (const account of accountsOf(status)) roster.push({
			provider,
			account
		});
	}
	return roster;
}
const PROVIDER_NAMES = {
	codex: "Codex",
	claude: "Claude",
	grok: "Grok",
	copilot: "Copilot",
	antigravity: "Antigravity",
	muse: "Muse"
};
/**
* The `currentModel` half of the inject face: the session's effective
* model selection through ui-model-selection's `modelDirectories` service,
* resolved lazily per call (the service may register after this plugin, and
* a shell without it reports "unknown"; an unknown model keeps whatever
* subscription this view already showed, while a model that is known and is
* not a subscription hides the badge).
*/
function createCurrentModelReader(models, sessionId) {
	return async () => {
		const directories = models();
		if (directories === void 0) return void 0;
		const { current } = await directories.directoryFor(sessionId).load();
		return current ?? void 0;
	};
}
/**
* Compact time-remaining label derived from the window's `resetsAt` timestamp:
* "6d 18h" (days+hours), "1h 58m" (hours+minutes), or "42m" (minutes only).
* Falls back to the scope/kind abbreviation when no reset time is known.
*/
function windowLabel(w) {
	if (w.resetsAt === void 0) {
		if (w.scope !== void 0 && w.scope !== "") return w.scope;
		switch (w.kind) {
			case "session": return "5h";
			case "weekly": return "Wk";
			default: return "W";
		}
	}
	const ms = Math.max(0, w.resetsAt - Date.now());
	const minutes = Math.floor(ms / 6e4);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);
	if (days > 0) return `${days}d ${hours % 24}h`;
	if (hours > 0) return `${hours}h ${minutes % 60}m`;
	return `${Math.max(1, minutes)}m`;
}
/** Keep model quotas separate: matching percentages do not imply a shared pool. */
function prioritizeWindows(windows, model, provider) {
	return model === void 0 ? [...windows] : [...windows.filter((w) => provider === "antigravity" ? antigravityQuotaApplies(w.scope, model) : w.scope === model), ...windows.filter((w) => provider === "antigravity" ? !antigravityQuotaApplies(w.scope, model) : w.scope !== model)];
}
/** Small previews keep a live model catalog from taking over the dialog. */
const WINDOW_PREVIEW_LIMIT = 4;
function previewWindows(windows, model, provider) {
	const ordered = prioritizeWindows(windows, model, provider);
	const limit = provider === "antigravity" ? Math.min(2, model === void 0 ? 0 : windows.filter((w) => antigravityQuotaApplies(w.scope, model)).length) : WINDOW_PREVIEW_LIMIT;
	return {
		shown: ordered.slice(0, limit),
		hidden: ordered.slice(limit)
	};
}
/**
* Order the pill's percentages by how soon they bind: the rolling session
* window first, then the weekly window, then anything else. Catalog order holds
* within a rank.
*/
function compactWindows(windows) {
	const rank = (w) => w.kind === "session" ? 0 : w.kind === "weekly" ? 1 : 2;
	return [...windows].sort((a, b) => rank(a) - rank(b));
}
/** At most two percentages, session window first; the rest of the readout lives in the dialog. */
function compactPercentages(windows, t, mode) {
	return compactWindows(windows).slice(0, 2).map((w) => quotaText(w.usedPercent, mode, t)).join(" / ");
}
/**
* Bounded readout; Antigravity quotas belong to individual models, not the
* account. The composer stats row is narrow, so the pill carries only the
* provider name and at most two percentages ("Gemini · 13% used / 15% used"):
* the default/listed source, the window labels, the freshness note and the
* remaining windows are all one click away in the dialog.
*/
function compactSegment(d, model, t = fallbackTranslate$2, mode = "used") {
	if (d.accounts.length > 1) return `${d.name} · ${t("quotaSignedIn", { count: d.accounts.length })}`;
	const account = pillAccountOf(d);
	if (!account) return `${d.name} · ${t("quotaUnknown")}`;
	const windows = account.windows;
	if (windows.length === 0) return `${d.name} · ${quotaUnavailableText(account.usage, account.loadFailed === true, t) ?? t("usageNoVisibleModels")}`;
	if (d.provider === "antigravity") {
		const matching = model === void 0 ? [] : windows.filter((w) => antigravityQuotaApplies(w.scope, model));
		if (matching.length === 0) return `${d.name} · ${t(model === void 0 ? "usageBadgeModelCount" : "usageBadgeModelUnavailable", { count: new Set(windows.map((w) => w.scope).filter(Boolean)).size })}`;
		return `${d.name} · ${compactPercentages(matching, t, mode)}`;
	}
	return `${d.name} · ${compactPercentages(windows, t, mode)}`;
}
/**
* Remember the most recent subscription in this view, including its model
* scope, and drop it as soon as the session settles on a provider that is not
* a subscription: a pill naming a provider the session stopped using is noise,
* not history. An unknown current model (the shell may not report one yet)
* keeps the last known selection so the pill does not flicker between polls.
*/
function retainSubscriptionSelection(previous, current) {
	if (current === void 0) return previous;
	return Object.hasOwn(PROVIDER_NAMES, current.provider) ? current : void 0;
}
/** At most one provider; no known selection or no usage means no badge. */
function collapsedDisplays(displays, current) {
	const match = displays.find((d) => d.provider === current);
	return match === void 0 ? [] : [match];
}
/** Order for the expanded dialog: the current provider first, the rest in poll order. */
function expandedDisplays(displays, current) {
	const match = displays.find((d) => d.provider === current);
	return match === void 0 ? displays : [match, ...displays.filter((d) => d !== match)];
}
/**
* A provider's logged-in accounts, configured default first. Do not invent a
* default flag when the server does not report one.
*/
function accountsOf(status) {
	if (status === void 0 || status.accounts.length === 0) return [];
	return [...status.accounts].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}
/** English-dictionary fallback for a missing inject `t` (standalone renders). */
function fallbackTranslate$2(key, params) {
	return en[key].replace(/\{(\w+)\}/g, (_, name) => String(params?.[name] ?? ""));
}
/** Localized label of one usage window (kind, plus the model scope when named). */
function usageWindowLabel(t, window$1) {
	const base = window$1.kind === "session" ? t("usageSession") : window$1.kind === "weekly" ? t("usageWeekly") : t("usageWindow");
	return window$1.scope !== void 0 && window$1.scope !== "" ? `${base} · ${window$1.scope}` : base;
}
/**
* The composer subscription-usage badge: a pill reading e.g. `Codex · 13% used / 25% used`
* for the current model's provider, opening a dialog with every provider's
* accounts and their windows, including unavailable telemetry.
*/
function SubscriptionUsageBadge({ rpc, currentModel, t }) {
	const translate = t ?? fallbackTranslate$2;
	const [displays, setDisplays] = (0, react.useState)([]);
	const [selection, setSelection] = (0, react.useState)(void 0);
	const [lastSubscription, setLastSubscription] = (0, react.useState)(void 0);
	const displayMode = useUsageBadgeMode();
	const quotaMode = useQuotaDisplayMode();
	useQuotaClock();
	const current = selection?.provider;
	const badgeSelection = retainSubscriptionSelection(lastSubscription, selection);
	const [open, setOpen] = (0, react.useState)(false);
	const [hover, setHover] = (0, react.useState)(false);
	const inflightRef = (0, react.useRef)(false);
	const cacheSyncRequested = (0, react.useRef)(false);
	const mountedRef = (0, react.useRef)(true);
	const rootRef = (0, react.useRef)(null);
	const panelRef = (0, react.useRef)(null);
	const seatRef = (0, react.useRef)(null);
	const currentRef = (0, react.useRef)(currentModel);
	currentRef.current = currentModel;
	const lastKnownRef = (0, react.useRef)(/* @__PURE__ */ new Map());
	const failedAccountsRef = (0, react.useRef)(/* @__PURE__ */ new Set());
	const namesRevision = (0, react.useRef)(0);
	const recentNames = (0, react.useRef)(/* @__PURE__ */ new Map());
	const statusRef = (0, react.useRef)();
	const refresh = (0, react.useCallback)(async (cacheOnly = false) => {
		if (rpc === void 0) return;
		if (inflightRef.current) {
			if (cacheOnly) cacheSyncRequested.current = true;
			return;
		}
		inflightRef.current = true;
		const revision = namesRevision.current;
		try {
			const statusResp = cacheOnly ? statusRef.current : await callSubscriptionsAuth(rpc, "status", {});
			if (!statusResp) return;
			statusRef.current = statusResp;
			if (!mountedRef.current) return;
			const roster = enabledBadgeRoster(statusResp.providers);
			const keyOf = (provider, account) => `${provider}:${account.key}`;
			const lastKnown = lastKnownRef.current;
			const failedAccounts = failedAccountsRef.current;
			const live = new Set(roster.map(({ provider, account }) => keyOf(provider, account)));
			for (const key of failedAccounts) if (!live.has(key)) failedAccounts.delete(key);
			for (const key of lastKnown.keys()) if (!live.has(key)) lastKnown.delete(key);
			if (roster.length === 0) {
				setDisplays([]);
				return;
			}
			const results = await Promise.allSettled(roster.map(async ({ provider, account }) => {
				const usage = cacheOnly ? readUsageCache(rpc, keyOf(provider, account)) : await callSubscriptionsAuth(rpc, "usage", {
					provider,
					account: account.key
				});
				if (!usage) throw new Error("No cached quota");
				return {
					provider,
					account,
					usage
				};
			}));
			if (!mountedRef.current) return;
			for (const [index, result] of results.entries()) {
				const { provider, account } = roster[index];
				const key = keyOf(provider, account);
				if (result.status === "fulfilled") {
					lastKnown.set(key, result.value.usage);
					failedAccounts.delete(key);
				} else {
					if (!cacheOnly) failedAccounts.add(key);
					const previous = lastKnown.get(key);
					if (previous) lastKnown.set(key, {
						...previous,
						stale: true,
						refreshFailed: true
					});
				}
			}
			const byProvider = /* @__PURE__ */ new Map();
			for (const { provider, account } of roster) {
				const key = keyOf(provider, account);
				const usage = lastKnown.get(key);
				const windows = usage?.windows ?? [];
				const plan = usage?.plan ?? account.plan;
				const row = {
					key: account.key,
					loadFailed: failedAccounts.has(key),
					...usage === void 0 ? {} : { usage },
					isDefault: account.isDefault,
					...account.account === void 0 ? {} : { account: account.account },
					...plan === void 0 ? {} : { plan },
					windows: visibleUsageWindows(provider, windows, statusResp.providers[provider]?.visibleModels)
				};
				const display = byProvider.get(provider);
				if (display === void 0) byProvider.set(provider, {
					provider,
					name: statusResp.providers[provider]?.displayName || PROVIDER_NAMES[provider],
					accounts: [row]
				});
				else display.accounts.push(row);
			}
			setDisplays([...byProvider.values()].map((row) => {
				const saved = recentNames.current.get(row.provider);
				return saved && saved.revision > revision ? {
					...row,
					name: saved.name
				} : row;
			}));
		} catch {
			for (const key of lastKnownRef.current.keys()) failUsage(rpc, key);
			if (mountedRef.current) setDisplays((previous) => previous.map((display) => ({
				...display,
				accounts: display.accounts.map((account) => ({
					...account,
					...account.usage ? { usage: {
						...account.usage,
						stale: true,
						refreshFailed: true
					} } : {}
				}))
			})));
		} finally {
			inflightRef.current = false;
			if (cacheSyncRequested.current && mountedRef.current) {
				cacheSyncRequested.current = false;
				queueMicrotask(() => {
					refresh(true);
				});
			}
		}
	}, [rpc]);
	(0, react.useEffect)(() => {
		if (!rpc || displayMode === "hidden") return;
		const sync = () => {
			refresh(true);
		};
		const unsubscribe = subscribeUsage(rpc, sync);
		window.addEventListener("focus", sync);
		return () => {
			unsubscribe();
			window.removeEventListener("focus", sync);
		};
	}, [
		rpc,
		displayMode,
		refresh
	]);
	(0, react.useEffect)(() => {
		const update = (event) => {
			const { provider, displayName } = event.detail;
			recentNames.current.set(provider, {
				revision: ++namesRevision.current,
				name: displayName || PROVIDER_NAMES[provider]
			});
			setDisplays((current$1) => current$1.map((row) => row.provider === provider ? {
				...row,
				name: displayName || PROVIDER_NAMES[provider]
			} : row));
		};
		window.addEventListener(DISPLAY_NAME_CHANGED, update);
		return () => {
			window.removeEventListener(DISPLAY_NAME_CHANGED, update);
		};
	}, []);
	(0, react.useEffect)(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);
	(0, react.useEffect)(() => {
		if (displayMode === "hidden") return;
		refresh();
		const timer = setInterval(() => {
			refresh();
		}, USAGE_POLL_INTERVAL_MS);
		return () => {
			clearInterval(timer);
		};
	}, [refresh, displayMode]);
	(0, react.useEffect)(() => {
		if (currentRef.current === void 0) return;
		let cancelled = false;
		let inflight = false;
		const reload$1 = () => {
			const read = currentRef.current;
			if (read === void 0 || inflight) return;
			inflight = true;
			read().then((model) => {
				if (cancelled) return;
				setLastSubscription((previous) => retainSubscriptionSelection(previous, model));
				setSelection(model);
			}, () => {}).finally(() => {
				inflight = false;
			});
		};
		reload$1();
		const timer = setInterval(reload$1, MODEL_POLL_INTERVAL_MS);
		return () => {
			cancelled = true;
			clearInterval(timer);
		};
	}, []);
	const pos = useAnchoredPanelPosition({
		open,
		anchorRef: rootRef,
		panelRef,
		side: "top",
		gap: PANEL_GAP,
		margin: PANEL_MARGIN
	});
	useDismissOnOutsidePointer(rootRef, open, setOpen, panelRef);
	(0, react.useEffect)(() => {
		if (!open) return;
		const onKeyDown = (event) => {
			if (event.key === "Escape") setOpen(false);
		};
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [open]);
	const [statsRow, setStatsRow] = (0, react.useState)(null);
	(0, react.useEffect)(() => {
		const seat$1 = seatRef.current;
		if (seat$1 === null) return;
		const scope = statsScopeOf(seat$1);
		if (scope === null) return;
		const find = () => scope.querySelector("[data-composer-stats]");
		setStatsRow(find());
		const observer = new MutationObserver(() => {
			setStatsRow(find());
		});
		observer.observe(scope, {
			childList: true,
			subtree: true
		});
		return () => {
			observer.disconnect();
		};
	}, []);
	const seat = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
		ref: seatRef,
		style: styles.seat,
		"aria-hidden": true
	});
	const collapsed = collapsedDisplays(displays, badgeSelection?.provider);
	const visible = displayMode !== "hidden" && collapsed.length > 0;
	(0, react.useEffect)(() => {
		if (!visible) setOpen(false);
	}, [visible]);
	if (!visible) return seat;
	const label = compactSegment(collapsed[0], badgeSelection?.model, translate, quotaMode);
	const expanded = expandedDisplays(displays, badgeSelection?.provider);
	const title = translate("usageBadgeTitle");
	const toggle = () => {
		const next = !open;
		setOpen(next);
		if (next) refresh();
	};
	const pill = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
		ref: rootRef,
		style: styles.anchor,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: subscriptionChromeCss }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: "dsh-subscription-usage-pill",
				style: {
					...styles.pill,
					...hover || open ? styles.pillActive : {}
				},
				"aria-haspopup": "dialog",
				"aria-expanded": open,
				"aria-label": `${title} · ${label}`,
				title,
				onMouseEnter: () => {
					setHover(true);
				},
				onMouseLeave: () => {
					setHover(false);
				},
				onClick: toggle,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageBadgeIcon, {}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: styles.label,
					children: label
				})]
			}),
			open && (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: panelRef,
				role: "dialog",
				"aria-label": title,
				className: "dsh-subscription-usage-panel",
				style: {
					...styles.panel,
					...pos ?? MEASURE_STYLE
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: styles.title,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: styles.titleLabel,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageBadgeIcon, {}), title]
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: styles.titleRule,
						"aria-hidden": true
					}),
					expanded.map((d, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						style: index === 0 ? void 0 : styles.section,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: styles.providerRow,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									style: styles.providerName,
									children: [d.name, d.provider === current && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: styles.currentTag,
										children: translate("usageBadgeCurrent")
									})]
								}), d.accounts.length === 1 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountMeta, {
									account: d.accounts[0],
									translate
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: {
									...styles.providerMeta,
									whiteSpace: "normal",
									overflow: "visible"
								},
								children: translate("quotaAccountsHint")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CodexExhaustionNotice, {
								display: d,
								translate
							}),
							d.accounts.map((account, accountIndex) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: accountIndex === 0 ? void 0 : styles.accountBlock,
								children: [
									d.accounts.length > 1 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										style: styles.accountRow,
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountMeta, {
											account,
											translate
										})
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageFreshness, {
										usage: account.usage,
										failed: account.loadFailed === true,
										t: translate
									}),
									d.provider === "codex" && creditBalanceText(account.usage?.credits, translate) !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										style: styles.providerMeta,
										children: creditBalanceText(account.usage?.credits, translate)
									}),
									!!account.usage?.windows?.length && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountWindows, {
										windows: account.windows,
										model: d.provider === badgeSelection?.provider ? badgeSelection.model : void 0,
										provider: d.provider,
										translate,
										mode: quotaMode
									}, `${d.provider}:${badgeSelection?.model ?? ""}`)
								]
							}, account.key))
						]
					}, d.provider))
				]
			}), document.body)
		]
	});
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [seat, statsRow !== null && statsRow.isConnected ? (0, react_dom.createPortal)(pill, statsRow) : pill] });
}
/**
* Nearest ancestor of the dock seat that can contain the host's stats row:
* the composer bar. Bounded so a badge in an unfamiliar layout never adopts
* some other composer's pills.
*/
function statsScopeOf(seat) {
	let node = seat.parentElement;
	for (let depth = 0; node !== null && depth < 4; depth++) {
		if (node.querySelector("[data-composer-stats]") !== null) return node;
		node = node.parentElement;
	}
	return seat.parentElement;
}
/**
* One account's handle and plan: `★ ys@example.com · 计划：pro`. The star
* marks the configured default, not the serving account. Settings uses the
* same glyph.
*/
function AccountMeta({ account, translate }) {
	const parts = [account.account ?? account.key, account.plan === void 0 ? void 0 : translate("usagePlan", { plan: account.plan })].filter((part) => part !== void 0 && part !== "");
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
		style: styles.providerMeta,
		title: account.account,
		children: [account.isDefault && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			style: styles.defaultStar,
			"aria-label": translate("quotaDefaultAccount"),
			title: translate("quotaDefaultAccount"),
			children: "★ "
		}), parts.join(" · ")]
	});
}
/** Preview each account independently; remaining visible quotas stay accessible. */
function AccountWindows({ windows, model, provider, translate, mode }) {
	if (windows.length === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
		style: styles.providerMeta,
		children: translate("usageNoVisibleModels")
	});
	if (provider === "antigravity" && windows.some((window$1) => antigravityQuotaScope(window$1.scope))) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AntigravityQuotaSummary, {
		windows,
		t: translate,
		mode
	});
	const { shown, hidden } = previewWindows(windows, model, provider);
	const rows = (items) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dl", {
		style: styles.details,
		children: items.map((w, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WindowRow, {
			label: `${usageWindowLabel(translate, w)}${model !== void 0 && (provider === "antigravity" ? antigravityQuotaApplies(w.scope, model) : w.scope === model) ? ` · ${translate("usageBadgeCurrent")}` : ""}`,
			window: w,
			translate,
			mode
		}, i))
	});
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [rows(shown), hidden.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
		style: styles.moreWindows,
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", {
			style: styles.moreSummary,
			children: translate("usageBadgeMoreWindows", { count: hidden.length })
		}), rows(hidden)]
	})] });
}
/** One `dt`/`dd` pair: window name → `25% · 6d 1h`, with the bar underneath. */
function WindowRow({ label, window: w, translate, mode }) {
	const selectedMode = useQuotaDisplayMode();
	const quotaMode = mode ?? selectedMode;
	const percent = quotaPercent(w.usedPercent, quotaMode);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", {
			style: styles.dt,
			children: label
		}),
		/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dd", {
			style: {
				...styles.dd,
				color: usageBarColor(w.usedPercent)
			},
			children: [quotaText(w.usedPercent, quotaMode, translate), w.resetsAt !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				style: styles.reset,
				children: [" · ", w.resetsAt <= Date.now() ? translate("quotaExpiredWindow") : windowLabel(w)]
			})]
		}),
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			style: styles.bar,
			"aria-hidden": true,
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { style: {
				...styles.barFill,
				width: `${percent ?? 0}%`,
				background: usageBarColor(w.usedPercent)
			} })
		})
	] });
}
/**
* Unplaced portal panel: hidden but laid out so the clamp measures real
* dimensions (the `useAnchoredPanelPosition` measure pass).
*/
const MEASURE_STYLE = {
	visibility: "hidden",
	left: 0,
	top: 0
};
const styles = {
	seat: { display: "none" },
	anchor: {
		minWidth: 0,
		maxWidth: "100%",
		display: "inline-flex"
	},
	pill: {
		boxSizing: "border-box",
		maxWidth: "100%",
		color: "var(--dsw-alias-label-tertiary)",
		font: "inherit",
		fontSize: "calc(var(--dsh-content-font-size-secondary, 13px) - 1px)",
		fontVariantNumeric: "tabular-nums",
		lineHeight: "calc(20px + var(--dsh-content-font-delta-secondary, 0px))",
		whiteSpace: "nowrap",
		background: "transparent",
		border: "none",
		borderRadius: 999,
		alignItems: "center",
		gap: 6,
		padding: "1px 8px",
		display: "inline-flex",
		cursor: "pointer"
	},
	pillActive: {
		background: "var(--dsw-alias-interactive-bg-hover)",
		color: "var(--dsw-alias-label-secondary)"
	},
	label: {
		textOverflow: "ellipsis",
		minWidth: 0,
		overflow: "hidden"
	},
	panel: {
		position: "fixed",
		zIndex: 1100,
		boxSizing: "border-box",
		background: "var(--dsw-specific-menu)",
		width: "max-content",
		minWidth: "min(300px, 100vw - 24px)",
		maxWidth: "min(440px, 100vw - 24px)",
		maxHeight: "min(560px, 100dvh - 24px)",
		overflowY: "auto",
		overscrollBehavior: "contain",
		boxShadow: "var(--dsw-elevation-prominent)",
		color: "var(--dsw-alias-label-secondary)",
		cursor: "default",
		border: 0,
		borderRadius: "var(--dsw-radius-lg, 16px)",
		padding: 16,
		fontSize: 12,
		lineHeight: "18px"
	},
	title: {
		color: "var(--dsw-alias-label-primary)",
		display: "flex",
		justifyContent: "space-between",
		gap: 16,
		marginBottom: 8,
		fontWeight: 500
	},
	titleLabel: {
		alignItems: "center",
		gap: 6,
		minWidth: 0,
		display: "inline-flex"
	},
	titleRule: {
		borderTop: "0.5px solid var(--dsw-alias-border-l2)",
		marginBottom: 10
	},
	section: {
		marginTop: 12,
		paddingTop: 10,
		borderTop: "0.5px solid var(--dsw-alias-border-l2)"
	},
	providerRow: {
		display: "flex",
		justifyContent: "space-between",
		alignItems: "baseline",
		gap: 16,
		marginBottom: 6
	},
	providerName: {
		color: "var(--dsw-alias-label-primary)",
		fontWeight: 500,
		display: "inline-flex",
		alignItems: "center",
		gap: 6
	},
	currentTag: {
		fontSize: 10,
		lineHeight: "14px",
		fontWeight: 400,
		padding: "0 5px",
		borderRadius: 7,
		color: "var(--dsw-alias-label-secondary)",
		background: "var(--dsw-alias-interactive-bg-hover)"
	},
	providerMeta: {
		color: "var(--dsw-alias-label-tertiary)",
		minWidth: 0,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap"
	},
	defaultStar: { color: "var(--dsw-alias-state-warn-label)" },
	accountBlock: { marginTop: 8 },
	accountRow: {
		display: "flex",
		marginBottom: 4
	},
	details: {
		color: "var(--dsw-alias-label-tertiary)",
		display: "grid",
		gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
		gap: "4px 16px",
		margin: 0
	},
	moreWindows: { marginTop: 8 },
	moreSummary: {
		cursor: "pointer",
		color: "var(--dsw-alias-label-secondary)",
		marginBottom: 8
	},
	dt: {
		minWidth: 0,
		margin: 0,
		overflowWrap: "anywhere"
	},
	dd: {
		minWidth: 0,
		margin: 0,
		color: "var(--dsw-alias-label-secondary)",
		fontVariantNumeric: "tabular-nums",
		textAlign: "right",
		overflowWrap: "anywhere"
	},
	reset: { color: "var(--dsw-alias-label-tertiary)" },
	bar: {
		gridColumn: "1 / -1",
		height: 4,
		borderRadius: 2,
		overflow: "hidden",
		background: "var(--dsw-alias-border-l2)",
		marginBottom: 2
	},
	barFill: {
		height: "100%",
		borderRadius: 2
	}
};

//#endregion
//#region src/client/fast-command.ts
/** Build the locale resolver used by the /fast command contribution. */
function fastCommandDescription(t) {
	return () => t();
}

//#endregion
//#region src/client/SubscriptionNavIcon.tsx
/** Decorative subscription-card glyph; the settings shell supplies its size. */
function SubscriptionNavIcon({ size }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
		"aria-hidden": "true",
		width: size,
		height: size,
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: "1.7",
		strokeLinecap: "round",
		strokeLinejoin: "round",
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
			x: "3",
			y: "5",
			width: "18",
			height: "14",
			rx: "2.5"
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M3 9h18M7 15h4" })]
	});
}

//#endregion
//#region src/client/usage-dashboard-styles.ts
/**
* Scoped stylesheet for the Usage Dashboard sidebar page.
* The host loads a single client JS bundle, so keep CSS inline and scoped
* to `.dsh-usage-dashboard`, deriving colors from `@deepseek-ai/dsh-client-ui-theme`
* semantic tokens (which flip automatically under `body[data-ds-dark-theme]`).
*/
const usageDashboardCss = `
.dsh-usage-dashboard {
  --dsh-heat-0: var(--dsw-alias-bg-layer-2, #eef1f5);
  --dsh-heat-1: #cde3ff;
  --dsh-heat-2: #8bc0ff;
  --dsh-heat-3: #4c8dff;
  --dsh-heat-4: #1f5eff;
  --dsh-tok-input: #3b82f6;
  --dsh-tok-output: #10b981;
  --dsh-tok-cache-read: #8b5cf6;
  --dsh-tok-cache-write: #f59e0b;
  --dsh-provider-codex: #10a37f;
  --dsh-provider-claude: #d97757;
  --dsh-provider-grok: #7c6cff;
  --dsh-provider-antigravity: #3b82f6;
  --dsh-provider-muse: #db2777;

  box-sizing: border-box;
  width: 100%;
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  color-scheme: light;
  padding: calc(28px + var(--dsh-frame-top-clearance, 0px)) 28px 44px calc(28px + var(--dsh-frame-leading-clearance, 0px));
}
.dsh-usage-dashboard.dsh-usage-dashboard-embedded {
  height: auto;
  overflow: visible;
  background: transparent;
  padding: 0;
}
.dsh-subscriptions-page {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  color-scheme: light;
  padding: calc(28px + var(--dsh-frame-top-clearance, 0px)) 28px 44px calc(28px + var(--dsh-frame-leading-clearance, 0px));
}
body[data-ds-dark-theme] .dsh-subscriptions-page {
  color-scheme: dark;
}
.dsh-subscriptions-page *,
.dsh-subscriptions-page *::before,
.dsh-subscriptions-page *::after {
  box-sizing: border-box;
}
.dsh-subscriptions-page-inner {
  max-width: 1120px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}
.dsh-subscriptions-page-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px 20px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
  padding-bottom: 0;
}
.dsh-subscriptions-page-brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 10px;
  font-size: 15px;
  font-weight: 600;
  line-height: 22px;
  color: var(--dsw-alias-label-primary);
}
.dsh-subscriptions-page-tabs {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.dsh-subscriptions-page-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 14px 11px;
  border: 0;
  border-bottom: 2px solid transparent;
  margin-bottom: -0.5px;
  border-radius: var(--dsw-radius-sm, 6px) var(--dsw-radius-sm, 6px) 0 0;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
  cursor: pointer;
  white-space: nowrap;
  transition: color 120ms ease, background-color 120ms ease, border-color 120ms ease;
}
.dsh-subscriptions-page-tab:hover {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover, rgba(128, 128, 128, 0.08));
}
.dsh-subscriptions-page-tab[aria-selected="true"] {
  color: var(--dsw-alias-label-primary);
  border-bottom-color: var(--dsw-alias-state-business-primary, var(--dsw-alias-label-primary));
}
.dsh-subscriptions-page-tab:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, #3b82f6));
  outline-offset: -2px;
}
.dsh-subscriptions-page-panel {
  min-width: 0;
}
.dsh-subscriptions-page .dsh-subscription-tabs-shell {
  --tabs-surface: var(--dsw-alias-bg-base);
}
.dsh-subscriptions-settings-embedded {
  width: 100%;
  max-width: none;
}
.dsh-subscriptions-settings-embedded .dsh-subscription-tabs-shell {
  margin-bottom: 0;
}
.dsh-subscriptions-settings-embedded .dsh-subscription-tabs-track {
  padding: 2px 2px 4px;
}
.dsh-subscriptions-embedded-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 20px;
  align-items: start;
  min-width: 0;
}
.dsh-subscriptions-embedded-main {
  min-width: 0;
}
.dsh-subscriptions-embedded-aside {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.dsh-subscriptions-page .dsh-subscription-settings-card {
  border: 0.5px solid var(--dsw-alias-border-l2) !important;
  border-radius: var(--dsw-radius-xl, 16px) !important;
  background: var(--dsw-alias-card-fill, var(--dsw-alias-bg-layer-1)) !important;
  padding: 16px 18px !important;
}
body[data-ds-dark-theme] .dsh-usage-dashboard {
  --dsh-heat-0: rgba(255, 255, 255, 0.055);
  --dsh-heat-1: #16335b;
  --dsh-heat-2: #1f4f94;
  --dsh-heat-3: #3374d6;
  --dsh-heat-4: #60a5fa;
  --dsh-tok-input: #60a5fa;
  --dsh-tok-output: #34d399;
  --dsh-tok-cache-read: #a78bfa;
  --dsh-tok-cache-write: #fbbf24;
  color-scheme: dark;
}
.dsh-usage-dashboard *,
.dsh-usage-dashboard *::before,
.dsh-usage-dashboard *::after {
  box-sizing: border-box;
}
.dsh-usage-container {
  max-width: 1120px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}
.dsh-usage-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px 16px;
}
.dsh-usage-title-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.dsh-usage-title {
  margin: 0;
  font-size: 22px;
  line-height: 30px;
  font-weight: 600;
  letter-spacing: -0.015em;
  color: var(--dsw-alias-label-primary);
}
.dsh-usage-subtitle {
  margin: 0;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-usage-header-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.dsh-usage-updated {
  font-size: 12px;
  color: var(--dsw-alias-label-caption, var(--dsw-alias-label-tertiary));
  font-variant-numeric: tabular-nums;
  margin-right: 4px;
}
.dsh-usage-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 12px;
  border: 0.5px solid var(--dsw-alias-border-l3, var(--dsw-alias-border-l2));
  border-radius: var(--dsw-radius-md, 8px);
  background: var(--dsw-alias-card-fill, var(--dsw-alias-bg-layer-1));
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
  cursor: pointer;
  transition: background-color 120ms ease, border-color 120ms ease, opacity 120ms ease;
}
.dsh-usage-btn:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2));
}
.dsh-usage-btn:active:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-active, var(--dsw-alias-bg-layer-2));
}
.dsh-usage-btn:disabled {
  opacity: 0.45;
  cursor: default;
}
.dsh-usage-btn:focus-visible,
.dsh-usage-select:focus-visible,
.dsh-usage-pill:focus-visible,
.dsh-usage-heat-cell:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, #3b82f6));
  outline-offset: 2px;
}
.dsh-usage-btn-danger {
  color: var(--dsw-alias-state-error-primary, #d92d20);
}
.dsh-usage-btn-quiet {
  border-color: transparent;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
}

/* Filter Bar */
.dsh-usage-filters {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px 12px;
  padding: 10px 12px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-xl, 16px);
  background: var(--dsw-alias-card-fill, var(--dsw-alias-bg-layer-1));
}
.dsh-usage-filter-right {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}
.dsh-usage-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 28px;
  padding: 0 11px;
  border: 0.5px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease, box-shadow 120ms ease;
}
.dsh-usage-pill:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2));
  color: var(--dsw-alias-label-primary);
}
.dsh-usage-pill[aria-pressed="true"] {
  background: var(--dsw-alias-card-fill, var(--dsw-alias-bg-layer-1));
  border-color: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2));
  color: var(--dsw-alias-label-primary);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}
.dsh-usage-pill-badge {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  font-weight: 400;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-usage-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  align-self: center;
}
.dsh-usage-segmented {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  min-height: 36px;
  padding: 3px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-base));
  gap: 2px;
}
.dsh-usage-segmented-compact {
  min-height: 30px;
  padding: 2px;
  border-radius: 8px;
}
.dsh-usage-segmented-compact .dsh-usage-pill {
  height: 24px;
  padding: 0 9px;
  border-radius: 6px;
}
.dsh-usage-select {
  min-width: 150px;
  max-width: 260px;
  height: 36px;
  padding: 0 28px 0 11px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-base));
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
}
.dsh-usage-select option,
.dsh-usage-select optgroup {
  background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1));
  color: var(--dsw-alias-label-primary);
}

/* Banners */
.dsh-usage-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
  padding: 10px 14px;
  border-radius: var(--dsw-radius-lg, 12px);
  border: 0.5px solid var(--dsw-alias-border-l2);
  font-size: 12px;
  line-height: 18px;
}
.dsh-usage-banner-error {
  background: rgba(217, 45, 32, 0.08);
  border-color: rgba(217, 45, 32, 0.3);
  color: var(--dsw-alias-state-error-primary, #d92d20);
}
.dsh-usage-banner-warn {
  background: var(--dsw-alias-state-warn-tertiary, rgba(245, 158, 11, 0.1));
  border-color: rgba(245, 158, 11, 0.3);
  color: var(--dsw-alias-label-primary);
}

/* Cards */
.dsh-usage-card {
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-xl, 16px);
  background: var(--dsw-alias-card-fill, var(--dsw-alias-bg-layer-1));
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.dsh-usage-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
  min-width: 0;
}
.dsh-usage-card-title {
  margin: 0;
  font-size: 14px;
  line-height: 20px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.dsh-usage-card-subtitle {
  margin: 2px 0 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}

/* KPI Grid */
.dsh-usage-kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.dsh-usage-kpi-card {
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-xl, 16px);
  background: var(--dsw-alias-card-fill, var(--dsw-alias-bg-layer-1));
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.dsh-usage-kpi-label {
  font-size: 12px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
  font-weight: 500;
}
.dsh-usage-kpi-value {
  font-size: 24px;
  line-height: 30px;
  font-weight: 600;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-primary);
  overflow-wrap: anywhere;
}
.dsh-usage-kpi-sub {
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
  display: flex;
  flex-wrap: wrap;
  gap: 2px 8px;
}
.dsh-usage-split-bar {
  display: flex;
  height: 5px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--dsw-alias-bg-layer-2);
  gap: 1px;
  margin-top: 2px;
}

/* Heatmap */
.dsh-usage-heatmap-body {
  display: grid;
  grid-template-columns: minmax(0, auto) minmax(260px, 1fr);
  gap: 18px 24px;
  align-items: start;
}
.dsh-usage-heatmap-scroll {
  overflow-x: auto;
  padding-bottom: 4px;
  max-width: 100%;
}
.dsh-usage-heatmap-inner {
  display: inline-flex;
  flex-direction: column;
  gap: 4px;
}
.dsh-usage-heatmap-months {
  display: grid;
  grid-auto-flow: column;
  gap: 3px;
  padding-left: 30px;
  height: 16px;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-usage-heatmap-month-label {
  white-space: nowrap;
  overflow: visible;
}
.dsh-usage-heatmap-matrix {
  display: flex;
  gap: 6px;
  align-items: flex-start;
}
.dsh-usage-heatmap-weekdays {
  display: grid;
  grid-template-rows: repeat(7, 14px);
  gap: 3px;
  width: 24px;
  font-size: 10px;
  line-height: 14px;
  color: var(--dsw-alias-label-tertiary);
  text-align: right;
  user-select: none;
}
.dsh-usage-heatmap-weeks {
  display: flex;
  gap: 3px;
}
.dsh-usage-heatmap-col {
  display: grid;
  grid-template-rows: repeat(7, 14px);
  gap: 3px;
}
.dsh-usage-heat-cell {
  width: 14px;
  height: 14px;
  padding: 0;
  border: 0.5px solid rgba(128, 128, 128, 0.14);
  border-radius: 3px;
  cursor: pointer;
  transition: transform 90ms ease, outline-color 90ms ease;
}
.dsh-usage-heat-cell:hover {
  transform: scale(1.16);
}
.dsh-usage-heat-cell[data-empty="true"] {
  visibility: hidden;
  pointer-events: none;
}
.dsh-usage-heat-cell[data-level="0"] { background: var(--dsh-heat-0); }
.dsh-usage-heat-cell[data-level="1"] { background: var(--dsh-heat-1); }
.dsh-usage-heat-cell[data-level="2"] { background: var(--dsh-heat-2); }
.dsh-usage-heat-cell[data-level="3"] { background: var(--dsh-heat-3); }
.dsh-usage-heat-cell[data-level="4"] { background: var(--dsh-heat-4); }
.dsh-usage-heat-cell[aria-pressed="true"] {
  outline: 2px solid var(--dsw-alias-label-primary);
  outline-offset: 1px;
}
.dsh-usage-heat-legend {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-usage-heat-swatch {
  width: 11px;
  height: 11px;
  border-radius: 2.5px;
  border: 0.5px solid rgba(128, 128, 128, 0.14);
}
.dsh-usage-day-inspector {
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-lg, 12px);
  background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-base));
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.dsh-usage-day-inspector-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.dsh-usage-day-models {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.dsh-usage-day-model-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  min-width: 0;
}
.dsh-usage-day-model-name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--dsw-alias-label-primary);
}
.dsh-usage-day-model-val {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  color: var(--dsw-alias-label-secondary);
}

/* Charts Row */
.dsh-usage-charts-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr);
  gap: 16px;
}
.dsh-usage-legend {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-usage-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.dsh-usage-legend-swatch {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  flex-shrink: 0;
}
.dsh-usage-chart-wrap {
  position: relative;
  width: 100%;
  min-width: 0;
}
.dsh-usage-chart-svg {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}
.dsh-usage-tooltip {
  position: absolute;
  top: 6px;
  z-index: 10;
  pointer-events: none;
  min-width: 175px;
  max-width: 240px;
  padding: 9px 11px;
  border-radius: var(--dsw-radius-md, 10px);
  background: var(--dsw-alias-tooltip-bg, var(--dsw-alias-bg-layer-2));
  color: var(--dsw-alias-tooltip-label, var(--dsw-alias-label-primary));
  border: 0.5px solid var(--dsw-alias-border-l2);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  font-size: 11px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
}
.dsh-usage-tooltip-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

/* Distribution Bars */
.dsh-usage-dist-list {
  display: flex;
  flex-direction: column;
  gap: 11px;
  min-width: 0;
}
.dsh-usage-dist-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.dsh-usage-dist-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}
.dsh-usage-dist-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 12px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}
.dsh-usage-dist-val {
  flex-shrink: 0;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-secondary);
}
.dsh-usage-dist-track {
  height: 7px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-2);
  overflow: hidden;
  display: flex;
}
.dsh-usage-dist-sub {
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
}

/* Quota Cycles Dual-Axis Combo Chart */
.dsh-usage-cycle-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.dsh-usage-cycles-legend-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 16px;
}
.dsh-usage-legend-line {
  display: inline-block;
  width: 14px;
  height: 2px;
  border-radius: 2px;
  background: var(--dsw-alias-label-primary);
  opacity: 0.85;
  flex-shrink: 0;
}
.dsh-usage-legend-hollow {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1.5px solid var(--dsw-alias-label-tertiary);
  background: transparent;
  flex-shrink: 0;
}
.dsh-usage-legend-active-bar {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 2px;
  border: 1.5px solid var(--dsw-alias-state-success-primary, #10b981);
  background: rgba(16, 185, 129, 0.25);
  flex-shrink: 0;
}
.dsh-usage-active-strip {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.dsh-usage-active-strip-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--dsw-alias-label-tertiary);
  margin-right: 2px;
  white-space: nowrap;
}
.dsh-usage-active-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  max-width: 100%;
  padding: 0 10px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-base));
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 11.5px;
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease;
}
.dsh-usage-active-pill:hover {
  background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2));
  border-color: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2));
}
.dsh-usage-active-pill[aria-pressed="true"] {
  border-color: var(--dsw-alias-state-business-primary, var(--dsw-alias-label-primary));
  background: var(--dsw-alias-interactive-bg-active, var(--dsw-alias-bg-layer-2));
  box-shadow: 0 0 0 1px var(--dsw-alias-state-business-primary, transparent);
}
.dsh-usage-active-pill:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, #3b82f6));
  outline-offset: 2px;
}
.dsh-usage-active-pill-kind {
  color: var(--dsw-alias-label-tertiary);
  font-weight: 400;
}
.dsh-usage-active-pill-tok {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.dsh-usage-active-pill-pct {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.dsh-usage-active-pill-pct[data-tone="ok"] { color: var(--dsw-alias-state-success-primary, #10b981); }
.dsh-usage-active-pill-pct[data-tone="warn"] { color: var(--dsw-alias-state-warn-primary, #d97706); }
.dsh-usage-active-pill-pct[data-tone="danger"] { color: var(--dsw-alias-state-error-primary, #ef4444); }
.dsh-usage-active-pill-pct[data-tone="na"] { color: var(--dsw-alias-label-tertiary); font-weight: 400; }

.dsh-usage-combo-wrap {
  position: relative;
  width: 100%;
  min-width: 0;
}
.dsh-usage-combo-svg {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}

/* Inline Pinned Cycle Inspector */
.dsh-usage-cycle-inspector {
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-lg, 12px);
  background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-base));
  padding: 13px 15px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.dsh-usage-cycle-inspector-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  gap: 12px 20px;
  align-items: start;
}
.dsh-usage-cycle-inspector-col {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.dsh-usage-window-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px 8px;
  min-width: 0;
}
.dsh-usage-window-id {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 1 1 160px;
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
}
.dsh-usage-window-provider {
  white-space: nowrap;
  flex-shrink: 0;
}
.dsh-usage-window-sep {
  color: var(--dsw-alias-label-tertiary);
  font-weight: 400;
  flex-shrink: 0;
}
.dsh-usage-window-account {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  color: var(--dsw-alias-label-secondary);
}
.dsh-usage-window-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 8px;
}
.dsh-usage-cycle-metrics {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 16px;
}
.dsh-usage-cycle-metric-label {
  font-size: 11px;
  line-height: 15px;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-usage-cycle-quota-col {
  text-align: right;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
}
.dsh-usage-cycle-quota-val {
  font-size: 16px;
  line-height: 22px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.dsh-usage-cycle-quota-val[data-tone="ok"] {
  color: var(--dsw-alias-state-success-primary, #10b981);
}
.dsh-usage-cycle-quota-val[data-tone="warn"] {
  color: var(--dsw-alias-state-warn-primary, #d97706);
}
.dsh-usage-cycle-quota-val[data-tone="danger"] {
  color: var(--dsw-alias-state-error-primary, #ef4444);
}
.dsh-usage-cycle-quota-val[data-tone="na"] {
  font-size: 12px;
  font-weight: 500;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-usage-quota-track {
  position: relative;
  height: 7px;
  border-radius: 999px;
  background: var(--dsw-alias-card-fill, var(--dsw-alias-bg-layer-1));
  border: 0.5px solid var(--dsw-alias-border-l2);
  overflow: hidden;
}
.dsh-usage-quota-track[data-na="true"] {
  background: repeating-linear-gradient(
    -45deg,
    transparent,
    transparent 5px,
    rgba(128, 128, 128, 0.1) 5px,
    rgba(128, 128, 128, 0.1) 10px
  );
}
.dsh-usage-quota-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 180ms ease;
}
.dsh-usage-quota-fill[data-tone="ok"] {
  background: var(--dsw-alias-state-success-primary, #10b981);
}
.dsh-usage-quota-fill[data-tone="warn"] {
  background: var(--dsw-alias-state-warn-primary, #f59e0b);
}
.dsh-usage-quota-fill[data-tone="danger"] {
  background: var(--dsw-alias-state-error-primary, #ef4444);
}
.dsh-usage-quota-peak-mark {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--dsw-alias-label-primary);
  opacity: 0.55;
}
.dsh-usage-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  line-height: 18px;
  white-space: nowrap;
  background: var(--dsw-alias-card-fill, var(--dsw-alias-bg-layer-1));
  border: 0.5px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
}
.dsh-usage-badge-open {
  color: var(--dsw-alias-state-success-primary, #10b981);
  border-color: rgba(16, 185, 129, 0.35);
}
.dsh-usage-badge-warn {
  color: var(--dsw-alias-state-warn-primary, #d97706);
  border-color: rgba(245, 158, 11, 0.35);
}
.dsh-usage-window-total {
  font-size: 18px;
  line-height: 24px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-primary);
}
.dsh-usage-window-models {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.dsh-usage-model-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  padding: 2px 7px;
  border-radius: 6px;
  font-size: 11px;
  background: var(--dsw-alias-card-fill, var(--dsw-alias-bg-layer-1));
  border: 0.5px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
  overflow-wrap: anywhere;
}
.dsh-usage-markers {
  margin: 0;
  padding-left: 16px;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
}

/* Empty State */
.dsh-usage-empty {
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-xl, 16px);
  background: var(--dsw-alias-card-fill, var(--dsw-alias-bg-layer-1));
  padding: 36px 24px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.dsh-usage-empty-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.dsh-usage-empty-desc {
  margin: 0;
  max-width: 460px;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-tertiary);
}

@media (max-width: 959px) {
  .dsh-usage-heatmap-body {
    grid-template-columns: minmax(0, 1fr);
  }
  .dsh-usage-charts-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .dsh-usage-cycle-inspector-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .dsh-subscriptions-embedded-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 820px) {
  .dsh-usage-dashboard,
  .dsh-subscriptions-page {
    padding: calc(20px + var(--dsh-frame-top-clearance, 0px)) 16px 32px calc(16px + var(--dsh-frame-leading-clearance, 0px));
  }
  .dsh-usage-dashboard.dsh-usage-dashboard-embedded {
    padding: 0;
  }
  .dsh-usage-kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 500px) {
  .dsh-usage-kpi-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
`;

//#endregion
//#region src/client/usage-dashboard-state.ts
function initialUsageDashboardState() {
	return {
		phase: "loading",
		request: {
			provider: "all",
			account: "all",
			range: "30d"
		},
		distributionMode: "model",
		load: 0,
		clearErrors: []
	};
}
function reload(state, request) {
	const { error: _error,...rest } = state;
	return {
		...rest,
		phase: "loading",
		request,
		load: state.load + 1
	};
}
function usageDashboardReducer(state, action) {
	switch (action.type) {
		case "loaded": {
			const { error: _error, selectedDate,...rest } = state;
			const keepDate = selectedDate !== void 0 && action.response.heatmap.some((day) => day.date === selectedDate);
			return {
				...rest,
				...keepDate ? { selectedDate } : {},
				phase: "shown",
				response: action.response
			};
		}
		case "failed": return {
			...state,
			phase: "error",
			error: action.message
		};
		case "provider": {
			if (state.request.provider === action.provider && state.request.account === "all") return state;
			const next = reload(state, {
				...state.request,
				provider: action.provider,
				account: "all"
			});
			return action.provider !== "all" && state.distributionMode === "provider" ? {
				...next,
				distributionMode: "model"
			} : next;
		}
		case "account":
			if (state.request.account === action.account) return state;
			return reload(state, {
				...state.request,
				account: action.account
			});
		case "providerAccount": {
			if (state.request.provider === action.provider && state.request.account === action.account) return state;
			const next = reload(state, {
				...state.request,
				provider: action.provider,
				account: action.account
			});
			return state.distributionMode === "provider" ? {
				...next,
				distributionMode: "model"
			} : next;
		}
		case "range":
			if (state.request.range === action.range) return state;
			return reload(state, {
				...state.request,
				range: action.range
			});
		case "resetFilters": return reload(state, {
			provider: "all",
			account: "all",
			range: "all"
		});
		case "distribution": return state.distributionMode === action.mode ? state : {
			...state,
			distributionMode: action.mode
		};
		case "selectDate": {
			const { selectedDate: current,...rest } = state;
			if (action.date === void 0 || action.date === current) return rest;
			return {
				...rest,
				selectedDate: action.date
			};
		}
		case "refresh":
		case "retry": return reload(state, state.request);
		case "cleared": {
			const { selectedDate: _date,...rest } = reload(state, state.request);
			return {
				...rest,
				clearErrors: action.clearErrors
			};
		}
	}
}
const CLEAR_CONFIRM_OPEN = { phase: "open" };
/** Cancel and success close the confirmation, so they are the caller's, not states here. */
function clearConfirmReducer(state, action) {
	switch (action.type) {
		case "confirm": return state.phase === "clearing" ? state : { phase: "clearing" };
		case "failed": return {
			phase: "failed",
			error: action.message
		};
	}
}

//#endregion
//#region src/client/usage-format.ts
/** Keep dashboard filters, chart labels and clear scopes in step with the RPC provider type. */
const PROVIDER_META = {
	codex: {
		name: "Codex",
		colorVar: "var(--dsh-provider-codex, #10a37f)"
	},
	claude: {
		name: "Claude",
		colorVar: "var(--dsh-provider-claude, #d97757)"
	},
	grok: {
		name: "Grok",
		colorVar: "var(--dsh-provider-grok, #7c6cff)"
	},
	antigravity: {
		name: "Antigravity",
		colorVar: "var(--dsh-provider-antigravity, #3b82f6)"
	},
	muse: {
		name: "Muse Code",
		colorVar: "var(--dsh-provider-muse, #db2777)"
	}
};
const TRACKED_PROVIDERS = Object.keys(PROVIDER_META).map((id) => ({
	id,
	...PROVIDER_META[id]
}));
function providerDisplayName(provider) {
	return TRACKED_PROVIDERS.find((entry) => entry.id === provider)?.name ?? provider;
}
function providerAccentColor(provider) {
	return TRACKED_PROVIDERS.find((entry) => entry.id === provider)?.colorVar ?? "var(--dsw-alias-state-business-primary, #3b82f6)";
}
/** Locale keys for usage-window markers. */
const MARKER_KEYS = {
	"window0-tracking-start": "usageMarkerWindow0TrackingStart",
	"window0-cleared": "usageMarkerWindow0Cleared",
	"window0-pending": "usageMarkerWindow0Pending",
	"since-first-observed": "usageMarkerSinceFirstObserved",
	"since-tracking": "usageMarkerSinceTracking",
	"since-cleared": "usageMarkerSinceCleared",
	"ended-early": "usageMarkerEndedEarly",
	"ended-early-later-usage": "usageMarkerEndedEarlyLaterUsage",
	"reset-not-reported": "usageMarkerResetNotReported",
	"boundaries-unknown": "usageMarkerBoundariesUnknown"
};
const KIND_KEYS = {
	"5h": "usageSession",
	weekly: "usageWeekly",
	monthly: "usageMonthly",
	pending: "usageNotObservedYet"
};
/** A token count in the browser locale. */
function formatTokens(count) {
	return Math.round(count).toLocaleString();
}
/** Compact human-readable token count (e.g. `12.4K`, `1.85M`, `2.3B`). */
function formatCompactTokens(count) {
	if (!Number.isFinite(count) || count <= 0) return "0";
	if (count < 1e3) return String(Math.round(count));
	if (count < 1e6) {
		const val$1 = count / 1e3;
		return `${val$1 >= 100 ? Math.round(val$1) : Number(val$1.toFixed(1))}K`;
	}
	if (count < 1e9) {
		const val$1 = count / 1e6;
		return `${val$1 >= 100 ? Math.round(val$1) : Number(val$1.toFixed(val$1 >= 10 ? 1 : 2))}M`;
	}
	const val = count / 1e9;
	return `${val >= 100 ? Math.round(val) : Number(val.toFixed(2))}B`;
}
/** Share percentage string (`0%`, `<0.1%`, `12.4%`, `100%`). */
function formatPercent(share) {
	if (!Number.isFinite(share) || share <= 0) return "0%";
	const pct = share * 100;
	if (pct < .1) return "<0.1%";
	if (pct >= 99.95) return "100%";
	return `${pct >= 10 ? pct.toFixed(1) : pct.toFixed(1)}%`;
}
/** An absolute instant in the browser locale. */
function formatInstant(at) {
	return new Date(at).toLocaleString();
}
/** Short UTC date label like `Nov 23` from a `YYYY-MM-DD` string. */
const SHORT_MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec"
];
function formatShortUtcDate(isoDate) {
	const parts = isoDate.split("-");
	if (parts.length !== 3) return isoDate;
	const month = Number(parts[1]) - 1;
	const day = Number(parts[2]);
	if (month < 0 || month > 11 || !Number.isFinite(day)) return isoDate;
	return `${SHORT_MONTHS[month]} ${day}`;
}
/** "5-hour window", "Weekly · Opus", "Not observed yet". */
function kindLabel(t, option) {
	const base = t(KIND_KEYS[option.kind]);
	return option.scope === void 0 ? base : `${base} · ${option.scope}`;
}
function pad2(n) {
	return n < 10 ? `0${n}` : String(n);
}
function formatUtcMdHm(ts) {
	const d = new Date(ts);
	return {
		date: `${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`,
		time: `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`
	};
}
/** Compact, scannable UTC cycle range like `11-22 14:00 – 19:00 UTC` or `11-16 00:00 – 11-23 00:00 UTC`. */
function formatCycleTimeRange(t, cycle) {
	const start = formatUtcMdHm(cycle.startsAt ?? cycle.countedFrom);
	if (cycle.endsAt === void 0) return t("usageRangeOpen", { start: `${start.date} ${start.time} UTC` });
	const end = formatUtcMdHm(cycle.endsAt);
	if (start.date === end.date) return `${start.date} ${start.time} – ${end.time} UTC`;
	return `${start.date} ${start.time} – ${end.date} ${end.time} UTC`;
}
/** Compact relative duration like `3d 4h`, `2h 15m`, `45m`, `<1m`. */
function formatRelativeDuration(ms) {
	if (!Number.isFinite(ms) || ms <= 0) return "<1m";
	const totalMinutes = Math.floor(ms / 6e4);
	if (totalMinutes < 1) return "<1m";
	const days = Math.floor(totalMinutes / 1440);
	const hours = Math.floor(totalMinutes % 1440 / 60);
	const minutes = totalMinutes % 60;
	if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
	if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
	return `${minutes}m`;
}
/** Semantic severity tone for quota percentage consumption. */
function quotaProgressTone(percent) {
	if (percent >= 90) return "danger";
	if (percent >= 70) return "warn";
	return "ok";
}
/** Compact UTC axis label for a quota cycle (`11-22 14h` for 5h windows, `11-16` for weekly/monthly). */
function formatCycleAxisLabel(cycle) {
	const ts = cycle.startsAt ?? cycle.countedFrom;
	const d = new Date(ts);
	const md = `${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
	if (cycle.kind === "5h") return `${md} ${pad2(d.getUTCHours())}h`;
	return md;
}
/** Compute 4–5 clean rounded Y-axis ticks from 0 to >= maxValue. */
function computeNiceTicks(maxValue, segments = 4) {
	if (!Number.isFinite(maxValue) || maxValue <= 0) return [0, 1];
	const rawStep = maxValue / segments;
	const magnitude = 10 ** Math.floor(Math.log10(rawStep));
	const residual = rawStep / magnitude;
	const step = (residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 2.5 ? 2.5 : residual <= 5 ? 5 : 10) * magnitude;
	const top = Math.ceil(maxValue / step) * step;
	const ticks = [];
	for (let v = 0; v <= top + step * .001; v += step) ticks.push(Math.round(v));
	return ticks;
}
/** Classify a day's token count into a 0..4 heatmap intensity level using sqrt scaling so moderate days remain distinct. */
function heatmapLevel(tokens, maxTokens) {
	if (!Number.isFinite(tokens) || tokens <= 0 || maxTokens <= 0) return 0;
	const ratio = Math.sqrt(tokens / maxTokens);
	if (ratio < .28) return 1;
	if (ratio < .54) return 2;
	if (ratio < .78) return 3;
	return 4;
}
/** Arrange chronological UTC daily buckets into Sun..Sat week columns for a GitHub-style calendar heatmap. */
function buildHeatmapWeeks(days) {
	if (days.length === 0) return {
		weeks: [],
		monthLabels: [],
		maxTokens: 0
	};
	let maxTokens = 0;
	for (const day of days) if (day.totalTokens > maxTokens) maxTokens = day.totalTokens;
	const firstParts = days[0].date.split("-").map(Number);
	const firstDow = firstParts.length === 3 ? new Date(Date.UTC(firstParts[0], firstParts[1] - 1, firstParts[2])).getUTCDay() : 0;
	const weeks = [];
	let currentWeek = [];
	for (let pad = 0; pad < firstDow; pad++) currentWeek.push({ level: 0 });
	for (const bucket of days) {
		currentWeek.push({
			date: bucket.date,
			bucket,
			level: heatmapLevel(bucket.totalTokens, maxTokens)
		});
		if (currentWeek.length === 7) {
			weeks.push(currentWeek);
			currentWeek = [];
		}
	}
	if (currentWeek.length > 0) {
		while (currentWeek.length < 7) currentWeek.push({ level: 0 });
		weeks.push(currentWeek);
	}
	const monthLabels = [];
	let lastMonth = -1;
	for (let col = 0; col < weeks.length; col++) {
		const firstDated = weeks[col].find((cell) => cell.date !== void 0);
		if (!firstDated?.date) continue;
		const month = Number(firstDated.date.split("-")[1]) - 1;
		if (month !== lastMonth && month >= 0 && month < 12) {
			const prev = monthLabels[monthLabels.length - 1];
			if (prev !== void 0 && col - prev.col < 3) {
				if (prev.col === 0) monthLabels[monthLabels.length - 1] = {
					col,
					label: SHORT_MONTHS[month]
				};
			} else monthLabels.push({
				col,
				label: SHORT_MONTHS[month]
			});
			lastMonth = month;
		}
	}
	return {
		weeks,
		monthLabels,
		maxTokens
	};
}

//#endregion
//#region src/client/UsageHeatmap.tsx
const WEEKDAY_LABELS = [
	"",
	"Mon",
	"",
	"Wed",
	"",
	"Fri",
	""
];
function UsageHeatmap({ days, selectedDate, onSelectDate, t }) {
	const [hoveredDate, setHoveredDate] = (0, react.useState)(void 0);
	const grid = (0, react.useMemo)(() => buildHeatmapWeeks(days), [days]);
	const byDate = (0, react.useMemo)(() => {
		const map = /* @__PURE__ */ new Map();
		for (const day of days) map.set(day.date, day);
		return map;
	}, [days]);
	const stats = (0, react.useMemo)(() => {
		let activeDays = 0;
		let sum = 0;
		let peak;
		for (const day of days) if (day.totalTokens > 0) {
			activeDays += 1;
			sum += day.totalTokens;
			if (!peak || day.totalTokens > peak.totalTokens) peak = day;
		}
		return {
			activeDays,
			avgPerActiveDay: activeDays > 0 ? Math.round(sum / activeDays) : 0,
			peak
		};
	}, [days]);
	const inspectedDate = selectedDate ?? hoveredDate;
	const inspected = inspectedDate !== void 0 ? byDate.get(inspectedDate) : void 0;
	const monthByCol = (0, react.useMemo)(() => {
		const map = /* @__PURE__ */ new Map();
		for (const entry of grid.monthLabels) map.set(entry.col, entry.label);
		return map;
	}, [grid.monthLabels]);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		className: "dsh-usage-card",
		"aria-label": t("usageHeatmapTitle"),
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "dsh-usage-card-header",
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
				className: "dsh-usage-card-title",
				children: t("usageHeatmapTitle")
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "dsh-usage-card-subtitle",
				children: t("usageHeatmapSubtitle")
			})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsh-usage-heat-legend",
				"aria-hidden": "true",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("usageHeatmapLess") }),
					[
						0,
						1,
						2,
						3,
						4
					].map((level) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dsh-usage-heat-swatch",
						style: { background: `var(--dsh-heat-${level})` }
					}, level)),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("usageHeatmapMore") })
				]
			})]
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "dsh-usage-heatmap-body",
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dsh-usage-heatmap-scroll",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-usage-heatmap-inner",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsh-usage-heatmap-months",
						style: { gridTemplateColumns: `repeat(${grid.weeks.length}, 14px)` },
						"aria-hidden": "true",
						children: grid.weeks.map((_, col) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-usage-heatmap-month-label",
							children: monthByCol.get(col) ?? ""
						}, col))
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-usage-heatmap-matrix",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsh-usage-heatmap-weekdays",
							"aria-hidden": "true",
							children: WEEKDAY_LABELS.map((label, idx) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label }, idx))
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsh-usage-heatmap-weeks",
							role: "grid",
							"aria-label": t("usageHeatmapTitle"),
							children: grid.weeks.map((week, col) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsh-usage-heatmap-col",
								role: "row",
								children: week.map((cell, row) => {
									if (cell.date === void 0 || cell.bucket === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "dsh-usage-heat-cell",
										"data-empty": "true",
										"aria-hidden": "true"
									}, row);
									const date = cell.date;
									const total = cell.bucket.totalTokens;
									const isSelected = selectedDate === date;
									const label = total > 0 ? `${date}: ${t("usageTokens", { count: formatTokens(total) })}` : `${date}: ${t("usageHeatmapEmptyDay")}`;
									return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "dsh-usage-heat-cell",
										"data-level": cell.level,
										"aria-label": label,
										"aria-pressed": isSelected,
										title: label,
										onMouseEnter: () => setHoveredDate(date),
										onMouseLeave: () => setHoveredDate((current) => current === date ? void 0 : current),
										onFocus: () => setHoveredDate(date),
										onBlur: () => setHoveredDate((current) => current === date ? void 0 : current),
										onClick: () => onSelectDate(isSelected ? void 0 : date)
									}, date);
								})
							}, col))
						})]
					})]
				})
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("aside", {
				className: "dsh-usage-day-inspector",
				"aria-live": "polite",
				children: inspected !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-usage-day-inspector-head",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
						style: { fontSize: 13 },
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("time", {
							dateTime: inspected.date,
							children: t("usageHeatmapSelectedDay", { date: inspected.date })
						})
					}), selectedDate !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "dsh-usage-btn dsh-usage-btn-quiet",
						style: {
							minHeight: 24,
							padding: "0 8px"
						},
						onClick: () => onSelectDate(void 0),
						children: t("usageHeatmapClearDay")
					})]
				}), inspected.totalTokens === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "dsh-usage-card-subtitle",
					style: { margin: 0 },
					children: t("usageHeatmapEmptyDay")
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							alignItems: "baseline",
							gap: 8,
							flexWrap: "wrap"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								fontSize: 20,
								fontWeight: 600,
								fontVariantNumeric: "tabular-nums"
							},
							children: formatCompactTokens(inspected.totalTokens)
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-usage-card-subtitle",
							style: {
								margin: 0,
								fontVariantNumeric: "tabular-nums"
							},
							children: t("usageTokens", { count: formatTokens(inspected.totalTokens) })
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-usage-kpi-sub",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
								t("usageKpiInputShort"),
								" ",
								formatCompactTokens(inspected.inputTokens)
							] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
								t("usageKpiOutputShort"),
								" ",
								formatCompactTokens(inspected.outputTokens)
							] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
								t("usageKpiCacheReadShort"),
								" ",
								formatCompactTokens(inspected.cacheReadTokens)
							] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
								t("usageKpiCacheWriteShort"),
								" ",
								formatCompactTokens(inspected.cacheWriteTokens)
							] }),
							inspected.reasoningTokens > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("usageKpiReasoning", { count: formatCompactTokens(inspected.reasoningTokens) }) })
						]
					}),
					Object.keys(inspected.byProvider).length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsh-usage-window-models",
						children: Object.entries(inspected.byProvider).filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]).map(([provider, value]) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "dsh-usage-badge",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-usage-dot",
									style: { background: providerAccentColor(provider) }
								}),
								providerDisplayName(provider),
								" · ",
								formatCompactTokens(value)
							]
						}, provider))
					}),
					inspected.byModel.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
						className: "dsh-usage-day-models",
						children: inspected.byModel.slice(0, 6).map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
							className: "dsh-usage-day-model-row",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "dsh-usage-day-model-name",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-usage-dot",
									style: { background: providerAccentColor(entry.provider) }
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: entry.model })]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsh-usage-day-model-val",
								title: formatTokens(entry.totalTokens),
								children: formatCompactTokens(entry.totalTokens)
							})]
						}, `${entry.provider}:${entry.model}`))
					})
				] })] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "grid",
						gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
						gap: 10
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsh-usage-kpi-label",
							children: t("usageHeatmapActiveDays")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								fontSize: 16,
								fontWeight: 600,
								fontVariantNumeric: "tabular-nums",
								marginTop: 2
							},
							children: stats.activeDays
						})] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsh-usage-kpi-label",
							children: t("usageHeatmapAvgDay")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								fontSize: 16,
								fontWeight: 600,
								fontVariantNumeric: "tabular-nums",
								marginTop: 2
							},
							children: formatCompactTokens(stats.avgPerActiveDay)
						})] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsh-usage-kpi-label",
								children: t("usageHeatmapPeakDay")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									fontSize: 16,
									fontWeight: 600,
									fontVariantNumeric: "tabular-nums",
									marginTop: 2
								},
								children: stats.peak ? formatCompactTokens(stats.peak.totalTokens) : "—"
							}),
							stats.peak && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsh-usage-dist-sub",
								children: stats.peak.date
							})
						] })
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "dsh-usage-card-subtitle",
					style: { margin: 0 },
					children: t("usageHeatmapHint")
				})] })
			})]
		})]
	});
}

//#endregion
//#region src/client/UsageCharts.tsx
const CHART_W$1 = 580;
const CHART_H$1 = 224;
const PAD_LEFT$1 = 48;
const PAD_RIGHT$1 = 12;
const PAD_TOP$1 = 12;
const PAD_BOTTOM$1 = 28;
const PLOT_W$1 = CHART_W$1 - PAD_LEFT$1 - PAD_RIGHT$1;
const PLOT_H$1 = CHART_H$1 - PAD_TOP$1 - PAD_BOTTOM$1;
function DailyTrendChart({ daily, onSelectDate, t }) {
	const [hoveredIdx, setHoveredIdx] = (0, react.useState)(void 0);
	const { maxVal, ticks, hasData, xTickIndices } = (0, react.useMemo)(() => {
		let max = 0;
		for (const day of daily) if (day.totalTokens > max) max = day.totalTokens;
		const niceTicks = computeNiceTicks(max, 4);
		const top = niceTicks[niceTicks.length - 1] ?? 1;
		const indices = [];
		if (daily.length > 0) {
			const target = Math.min(6, daily.length);
			if (target === 1) indices.push(0);
			else for (let i = 0; i < target; i++) {
				const idx = Math.round(i * (daily.length - 1) / (target - 1));
				if (indices[indices.length - 1] !== idx) indices.push(idx);
			}
		}
		return {
			maxVal: top,
			ticks: niceTicks,
			hasData: max > 0,
			xTickIndices: indices
		};
	}, [daily]);
	const hovered = hoveredIdx !== void 0 ? daily[hoveredIdx] : void 0;
	const step = daily.length > 0 ? PLOT_W$1 / daily.length : PLOT_W$1;
	const barWidth = Math.max(2, Math.min(24, step * .68));
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		className: "dsh-usage-card",
		"aria-label": t("usageTrendTitle"),
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "dsh-usage-card-header",
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
				className: "dsh-usage-card-title",
				children: t("usageTrendTitle")
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "dsh-usage-card-subtitle",
				children: t("usageTrendSubtitle")
			})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsh-usage-legend",
				"aria-hidden": "true",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "dsh-usage-legend-item",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-usage-legend-swatch",
							style: { background: "var(--dsh-tok-input)" }
						}), t("usageLegendInput")]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "dsh-usage-legend-item",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-usage-legend-swatch",
							style: { background: "var(--dsh-tok-output)" }
						}), t("usageLegendOutput")]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "dsh-usage-legend-item",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-usage-legend-swatch",
							style: { background: "var(--dsh-tok-cache-read)" }
						}), t("usageLegendCacheRead")]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "dsh-usage-legend-item",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-usage-legend-swatch",
							style: { background: "var(--dsh-tok-cache-write)" }
						}), t("usageLegendCacheWrite")]
					})
				]
			})]
		}), !hasData ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
			className: "dsh-usage-card-subtitle",
			style: {
				margin: "24px 0",
				textAlign: "center"
			},
			children: t("usageTrendEmpty")
		}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "dsh-usage-chart-wrap",
			onMouseLeave: () => setHoveredIdx(void 0),
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				className: "dsh-usage-chart-svg",
				viewBox: `0 0 ${CHART_W$1} ${CHART_H$1}`,
				role: "img",
				"aria-label": t("usageTrendTitle"),
				children: [
					ticks.map((tick) => {
						const y = PAD_TOP$1 + PLOT_H$1 - tick / maxVal * PLOT_H$1;
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("g", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("line", {
							x1: PAD_LEFT$1,
							x2: CHART_W$1 - PAD_RIGHT$1,
							y1: y,
							y2: y,
							stroke: "var(--dsw-alias-border-l2)",
							strokeWidth: "0.75",
							strokeDasharray: tick === 0 ? void 0 : "3 3"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("text", {
							x: PAD_LEFT$1 - 8,
							y: y + 3.5,
							textAnchor: "end",
							fontSize: "10.5",
							fill: "var(--dsw-alias-label-tertiary)",
							style: { fontVariantNumeric: "tabular-nums" },
							children: formatCompactTokens(tick)
						})] }, tick);
					}),
					daily.map((day, index) => {
						const slotX = PAD_LEFT$1 + index * step;
						const barX = slotX + (step - barWidth) / 2;
						const segments = [
							{
								key: "input",
								value: day.inputTokens,
								color: "var(--dsh-tok-input)"
							},
							{
								key: "output",
								value: day.outputTokens,
								color: "var(--dsh-tok-output)"
							},
							{
								key: "cacheRead",
								value: day.cacheReadTokens,
								color: "var(--dsh-tok-cache-read)"
							},
							{
								key: "cacheWrite",
								value: day.cacheWriteTokens,
								color: "var(--dsh-tok-cache-write)"
							}
						];
						let yCursor = PAD_TOP$1 + PLOT_H$1;
						const isHovered = hoveredIdx === index;
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("g", {
							style: { cursor: onSelectDate ? "pointer" : "default" },
							onMouseEnter: () => setHoveredIdx(index),
							onClick: () => onSelectDate?.(day.date),
							children: [
								isHovered && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
									x: slotX,
									y: PAD_TOP$1,
									width: step,
									height: PLOT_H$1,
									rx: 3,
									fill: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.08))"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
									x: slotX,
									y: PAD_TOP$1,
									width: step,
									height: PLOT_H$1,
									fill: "transparent"
								}),
								segments.map((seg) => {
									if (seg.value <= 0) return null;
									const h = Math.max(1, seg.value / maxVal * PLOT_H$1);
									yCursor -= h;
									return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
										x: barX,
										y: yCursor,
										width: barWidth,
										height: h,
										rx: 1.2,
										fill: seg.color,
										opacity: hoveredIdx === void 0 || isHovered ? .94 : .52
									}, seg.key);
								})
							]
						}, day.date);
					}),
					xTickIndices.map((idx) => {
						const day = daily[idx];
						const x = PAD_LEFT$1 + idx * step + step / 2;
						const anchor = idx === 0 ? "start" : idx === daily.length - 1 ? "end" : "middle";
						return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("text", {
							x,
							y: CHART_H$1 - 6,
							textAnchor: anchor,
							fontSize: "10.5",
							fill: "var(--dsw-alias-label-tertiary)",
							children: formatShortUtcDate(day.date)
						}, day.date);
					})
				]
			}), hovered !== void 0 && hoveredIdx !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsh-usage-tooltip",
				style: hoveredIdx > daily.length * .58 ? { left: 12 } : { right: 12 },
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							fontWeight: 600,
							marginBottom: 4
						},
						children: [hovered.date, " (UTC)"]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-usage-tooltip-row",
						style: {
							fontWeight: 600,
							marginBottom: 4
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("usageKpiTotal") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: formatTokens(hovered.totalTokens) })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-usage-tooltip-row",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: { color: "var(--dsh-tok-input)" },
							children: t("usageLegendInput")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: formatTokens(hovered.inputTokens) })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-usage-tooltip-row",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: { color: "var(--dsh-tok-output)" },
							children: t("usageLegendOutput")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: formatTokens(hovered.outputTokens) })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-usage-tooltip-row",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: { color: "var(--dsh-tok-cache-read)" },
							children: t("usageLegendCacheRead")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: formatTokens(hovered.cacheReadTokens) })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-usage-tooltip-row",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: { color: "var(--dsh-tok-cache-write)" },
							children: t("usageLegendCacheWrite")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: formatTokens(hovered.cacheWriteTokens) })]
					}),
					hovered.reasoningTokens > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							marginTop: 4,
							opacity: .8
						},
						children: t("usageKpiReasoning", { count: formatTokens(hovered.reasoningTokens) })
					})
				]
			})]
		})]
	});
}
function TokenProgressBar({ totals, maxTokens }) {
	if (maxTokens <= 0 || totals.totalTokens <= 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		className: "dsh-usage-dist-track",
		"aria-hidden": "true"
	});
	const widthPct = (value) => `${value / maxTokens * 100}%`;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "dsh-usage-dist-track",
		"aria-hidden": "true",
		children: [
			totals.inputTokens > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { style: {
				width: widthPct(totals.inputTokens),
				background: "var(--dsh-tok-input)"
			} }),
			totals.outputTokens > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { style: {
				width: widthPct(totals.outputTokens),
				background: "var(--dsh-tok-output)"
			} }),
			totals.cacheReadTokens > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { style: {
				width: widthPct(totals.cacheReadTokens),
				background: "var(--dsh-tok-cache-read)"
			} }),
			totals.cacheWriteTokens > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { style: {
				width: widthPct(totals.cacheWriteTokens),
				background: "var(--dsh-tok-cache-write)"
			} })
		]
	});
}
function DistributionChart({ models, providerBreakdown, mode, onMode, t }) {
	const [expanded, setExpanded] = (0, react.useState)(false);
	const MAX_VISIBLE = 7;
	const rows = mode === "model" ? models : providerBreakdown;
	const visibleRows = mode === "model" && !expanded ? models.slice(0, MAX_VISIBLE) : rows;
	const maxTokens = rows.length > 0 ? rows[0].totalTokens : 0;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		className: "dsh-usage-card",
		"aria-label": t("usageDistributionTitle"),
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "dsh-usage-card-header",
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
				className: "dsh-usage-card-title",
				children: t("usageDistributionTitle")
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsh-usage-segmented dsh-usage-segmented-compact",
				role: "group",
				"aria-label": t("usageDistributionTitle"),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "dsh-usage-pill",
					"aria-pressed": mode === "model",
					onClick: () => onMode("model"),
					children: t("usageByModel")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "dsh-usage-pill",
					"aria-pressed": mode === "provider",
					onClick: () => onMode("provider"),
					children: t("usageByProvider")
				})]
			})]
		}), rows.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
			className: "dsh-usage-card-subtitle",
			style: {
				margin: "24px 0",
				textAlign: "center"
			},
			children: t("usageDistributionEmpty")
		}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "dsh-usage-dist-list",
			children: [mode === "model" ? visibleRows.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsh-usage-dist-row",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-usage-dist-head",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "dsh-usage-dist-label",
							title: `${providerDisplayName(entry.provider)} · ${entry.model}`,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsh-usage-dot",
								style: { background: providerAccentColor(entry.provider) }
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: entry.model })]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "dsh-usage-dist-val",
							title: formatTokens(entry.totalTokens),
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: formatCompactTokens(entry.totalTokens) }),
								" · ",
								formatPercent(entry.share)
							]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TokenProgressBar, {
						totals: entry,
						maxTokens
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-usage-dist-sub",
						children: [
							providerDisplayName(entry.provider),
							" · ",
							t("usageKpiInputShort"),
							" ",
							formatCompactTokens(entry.inputTokens),
							" · ",
							t("usageKpiOutputShort"),
							" ",
							formatCompactTokens(entry.outputTokens),
							" · ",
							t("usageKpiCacheReadShort"),
							" ",
							formatCompactTokens(entry.cacheReadTokens),
							entry.cacheWriteTokens > 0 && ` · ${t("usageKpiCacheWriteShort")} ${formatCompactTokens(entry.cacheWriteTokens)}`,
							entry.reasoningTokens > 0 && ` · ${t("usageKpiReasoning", { count: formatCompactTokens(entry.reasoningTokens) })}`
						]
					})
				]
			}, `${entry.provider}:${entry.model}`)) : visibleRows.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsh-usage-dist-row",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-usage-dist-head",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "dsh-usage-dist-label",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsh-usage-dot",
								style: { background: providerAccentColor(entry.provider) }
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: providerDisplayName(entry.provider) })]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "dsh-usage-dist-val",
							title: formatTokens(entry.totalTokens),
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: formatCompactTokens(entry.totalTokens) }),
								" · ",
								formatPercent(entry.share)
							]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TokenProgressBar, {
						totals: entry,
						maxTokens
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-usage-dist-sub",
						children: [
							t("usageKpiModelsCount", { count: entry.activeModels }),
							" · ",
							t("usageKpiAccountsCount", { accounts: entry.activeAccounts }),
							" · ",
							t("usageKpiInputShort"),
							" ",
							formatCompactTokens(entry.inputTokens),
							" · ",
							t("usageKpiOutputShort"),
							" ",
							formatCompactTokens(entry.outputTokens),
							" · ",
							t("usageKpiCacheReadShort"),
							" ",
							formatCompactTokens(entry.cacheReadTokens)
						]
					})
				]
			}, entry.provider)), mode === "model" && models.length > MAX_VISIBLE && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: "dsh-usage-btn dsh-usage-btn-quiet",
				style: {
					alignSelf: "flex-start",
					padding: "0 6px",
					minHeight: 26
				},
				onClick: () => setExpanded((prev) => !prev),
				children: expanded ? t("usageDistributionShowLess") : t("usageDistributionShowMore", { count: models.length - MAX_VISIBLE })
			})]
		})]
	});
}
function UsageCharts({ daily, models, providerBreakdown, distributionMode, onDistributionMode, onSelectDate, t }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "dsh-usage-charts-grid",
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(DailyTrendChart, {
			daily,
			...onSelectDate ? { onSelectDate } : {},
			t
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DistributionChart, {
			models,
			providerBreakdown,
			mode: distributionMode,
			onMode: onDistributionMode,
			t
		})]
	});
}

//#endregion
//#region src/client/ActiveWindowsPanel.tsx
const MAX_CHART_CYCLES = 24;
const CHART_W = 980;
const CHART_H = 290;
const PAD_LEFT = 58;
const PAD_RIGHT = 48;
const PAD_TOP = 26;
const PAD_BOTTOM = 44;
const PLOT_W = CHART_W - PAD_LEFT - PAD_RIGHT;
const PLOT_H = CHART_H - PAD_TOP - PAD_BOTTOM;
const QUOTA_TICKS = [
	0,
	25,
	50,
	75,
	100
];
function clampPercent(value) {
	return Math.max(0, Math.min(100, Math.round(value)));
}
function toneStrokeColor(tone) {
	switch (tone) {
		case "ok": return "var(--dsw-alias-state-success-primary, #10b981)";
		case "warn": return "var(--dsw-alias-state-warn-primary, #f59e0b)";
		case "danger": return "var(--dsw-alias-state-error-primary, #ef4444)";
	}
}
function statusBadge(win, now, t) {
	switch (win.status) {
		case "open": {
			const countdown = win.resetAt !== void 0 && win.resetAt > now ? ` · ${t("usageCycleResetsIn", { time: formatRelativeDuration(win.resetAt - now) })}` : "";
			return {
				text: `${t("usageWindowStatusOpen")}${countdown}`,
				className: "dsh-usage-badge dsh-usage-badge-open"
			};
		}
		case "ended-early": return {
			text: t("usageWindowStatusEndedEarly"),
			className: "dsh-usage-badge dsh-usage-badge-warn"
		};
		case "closed": return {
			text: t("usageWindowStatusClosed"),
			className: "dsh-usage-badge"
		};
	}
}
function cycleKey(win, fallbackIndex) {
	return win.id || `${win.provider}:${win.account}:${win.kind}:${win.scope ?? ""}:${fallbackIndex}`;
}
function shortKindTag(win, t) {
	if (win.kind === "5h") return win.scope ? `5h · ${win.scope}` : "5h";
	if (win.kind === "weekly") return win.scope ? `${t("usageWeekly")} · ${win.scope}` : t("usageWeekly");
	return kindLabel(t, win.scope === void 0 ? { kind: win.kind } : {
		kind: win.kind,
		scope: win.scope
	});
}
/**
* Pure-SVG Dual-Axis Combo Chart for Quota Cycles:
* - Left Y-axis + rounded bars: Cycle Token Usage (`totalTokens`), colored by provider
* - Right Y-axis (0–100%) + line & semantic dots: Quota Utilization % (`quotaUsedPercent`), breaking cleanly across missing gaps
* - Top clickable strip for active (`isCurrent`) cycles + click-to-pin inline Cycle Inspector strip below
*/
function ActiveWindowsPanel({ windows, now = Date.now(), initialKind = "all", initialSelectedId, t }) {
	const [kindFilter, setKindFilter] = (0, react.useState)(initialKind);
	const [hoveredIdx, setHoveredIdx] = (0, react.useState)(void 0);
	const [selectedId, setSelectedId] = (0, react.useState)(initialSelectedId);
	const kindCounts = (0, react.useMemo)(() => {
		let count5h = 0;
		let countWeekly = 0;
		for (const win of windows) if (win.kind === "5h") count5h += 1;
		else if (win.kind === "weekly") countWeekly += 1;
		return {
			all: windows.length,
			"5h": count5h,
			weekly: countWeekly
		};
	}, [windows]);
	const chartCycles = (0, react.useMemo)(() => {
		return [...windows.filter((win) => {
			if (kindFilter === "5h") return win.kind === "5h";
			if (kindFilter === "weekly") return win.kind === "weekly";
			return true;
		}).slice(0, MAX_CHART_CYCLES)].sort((a, b) => {
			const ta = a.startsAt ?? a.countedFrom;
			const tb = b.startsAt ?? b.countedFrom;
			if (ta !== tb) return ta - tb;
			if (a.isCurrent !== b.isCurrent) return Number(a.isCurrent) - Number(b.isCurrent);
			return a.id.localeCompare(b.id);
		});
	}, [windows, kindFilter]);
	const activePills = (0, react.useMemo)(() => {
		return chartCycles.filter((win) => win.isCurrent).sort((a, b) => (b.quotaUsedPercent ?? -1) - (a.quotaUsedPercent ?? -1) || b.totalTokens - a.totalTokens);
	}, [chartCycles]);
	const { tokenTicks, maxTokens, xTickIndices, lineSegments } = (0, react.useMemo)(() => {
		let peakTok = 0;
		for (const win of chartCycles) if (win.totalTokens > peakTok) peakTok = win.totalTokens;
		const ticks = computeNiceTicks(peakTok, 4);
		const topTok = ticks[ticks.length - 1] ?? 1;
		const n = chartCycles.length;
		const xIndices = [];
		if (n > 0) {
			const maxLabels = Math.min(n, 8);
			if (maxLabels === n) for (let i = 0; i < n; i++) xIndices.push(i);
			else for (let i = 0; i < maxLabels; i++) {
				const idx = Math.round(i * (n - 1) / (maxLabels - 1));
				if (xIndices[xIndices.length - 1] !== idx) xIndices.push(idx);
			}
		}
		const stepVal = n > 0 ? PLOT_W / n : PLOT_W;
		const segments = [];
		let currentPts = [];
		for (let i = 0; i < n; i++) {
			const pct = chartCycles[i].quotaUsedPercent;
			if (pct !== void 0 && Number.isFinite(pct)) {
				const cx = PAD_LEFT + i * stepVal + stepVal / 2;
				const cy = PAD_TOP + PLOT_H - clampPercent(pct) / 100 * PLOT_H;
				currentPts.push(`${cx.toFixed(1)},${cy.toFixed(1)}`);
			} else {
				if (currentPts.length >= 2) segments.push({ points: currentPts.join(" ") });
				currentPts = [];
			}
		}
		if (currentPts.length >= 2) segments.push({ points: currentPts.join(" ") });
		return {
			tokenTicks: ticks,
			maxTokens: topTok,
			xTickIndices: xIndices,
			lineSegments: segments
		};
	}, [chartCycles]);
	const selectedCycle = (0, react.useMemo)(() => {
		if (selectedId === void 0) return void 0;
		return chartCycles.find((win, idx) => cycleKey(win, idx) === selectedId);
	}, [chartCycles, selectedId]);
	const hoveredCycle = hoveredIdx !== void 0 ? chartCycles[hoveredIdx] : void 0;
	const step = chartCycles.length > 0 ? PLOT_W / chartCycles.length : PLOT_W;
	const barWidth = Math.max(10, Math.min(34, step * .56));
	const toggleSelect = (id) => {
		setSelectedId((current) => current === id ? void 0 : id);
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		className: "dsh-usage-card",
		"aria-label": t("usageActiveWindowsTitle"),
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "dsh-usage-card-header",
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
				className: "dsh-usage-card-title",
				children: t("usageActiveWindowsTitle")
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "dsh-usage-card-subtitle",
				children: t("usageActiveWindowsNote")
			})] }), windows.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dsh-usage-cycle-controls",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-usage-segmented",
					role: "group",
					"aria-label": t("usageKind"),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dsh-usage-pill",
							"aria-pressed": kindFilter === "all",
							onClick: () => setKindFilter("all"),
							children: t("usageCyclesKindAll", { count: kindCounts.all })
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dsh-usage-pill",
							"aria-pressed": kindFilter === "5h",
							disabled: kindCounts["5h"] === 0,
							onClick: () => setKindFilter("5h"),
							children: t("usageCyclesKind5h", { count: kindCounts["5h"] })
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dsh-usage-pill",
							"aria-pressed": kindFilter === "weekly",
							disabled: kindCounts.weekly === 0,
							onClick: () => setKindFilter("weekly"),
							children: t("usageCyclesKindWeekly", { count: kindCounts.weekly })
						})
					]
				})
			})]
		}), chartCycles.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
			className: "dsh-usage-card-subtitle",
			style: {
				margin: "12px 0",
				textAlign: "center"
			},
			children: t("usageActiveWindowsEmpty")
		}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsh-usage-cycles-legend-row",
				children: [activePills.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-usage-active-strip",
					role: "group",
					"aria-label": t("usageCyclesActiveStripLabel"),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dsh-usage-active-strip-label",
						children: t("usageCyclesActiveStripLabel")
					}), activePills.map((win, idx) => {
						const id = cycleKey(win, idx);
						const pct = win.quotaUsedPercent !== void 0 && Number.isFinite(win.quotaUsedPercent) ? clampPercent(win.quotaUsedPercent) : void 0;
						const tone = pct !== void 0 ? quotaProgressTone(pct) : "na";
						const accountText = win.accountLabel ?? win.account;
						const isSelected = selectedId === id;
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "dsh-usage-active-pill",
							"aria-pressed": isSelected,
							title: `${providerDisplayName(win.provider)} · ${accountText} · ${shortKindTag(win, t)}`,
							onClick: () => toggleSelect(id),
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-usage-dot",
									style: { background: providerAccentColor(win.provider) }
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: providerDisplayName(win.provider) }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-usage-active-pill-kind",
									children: shortKindTag(win, t)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-usage-active-pill-tok",
									children: formatCompactTokens(win.totalTokens)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-usage-active-pill-pct",
									"data-tone": tone,
									children: pct !== void 0 ? `${pct}%` : "n/a"
								})
							]
						}, id);
					})]
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-usage-legend",
					"aria-hidden": "true",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "dsh-usage-legend-item",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsh-usage-legend-swatch",
								style: { background: "var(--dsh-tok-input)" }
							}), t("usageCyclesLegendTokens")]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "dsh-usage-legend-item",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "dsh-usage-legend-active-bar" }), t("usageCyclesLegendActive")]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "dsh-usage-legend-item",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "dsh-usage-legend-line" }), t("usageCyclesLegendQuota")]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "dsh-usage-legend-item",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "dsh-usage-legend-hollow" }), t("usageCyclesLegendNa")]
						})
					]
				})]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsh-usage-combo-wrap",
				onMouseLeave: () => setHoveredIdx(void 0),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
					className: "dsh-usage-combo-svg",
					viewBox: `0 0 ${CHART_W} ${CHART_H}`,
					role: "img",
					"aria-label": t("usageActiveWindowsTitle"),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("text", {
							x: PAD_LEFT - 10,
							y: 13,
							textAnchor: "end",
							fontSize: "10",
							fontWeight: "500",
							fill: "var(--dsw-alias-label-tertiary)",
							children: t("usageCyclesAxisTokens")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("text", {
							x: CHART_W - PAD_RIGHT + 8,
							y: 13,
							textAnchor: "start",
							fontSize: "10",
							fontWeight: "500",
							fill: "var(--dsw-alias-label-tertiary)",
							children: t("usageCyclesAxisQuota")
						}),
						QUOTA_TICKS.map((pct) => {
							const y = PAD_TOP + PLOT_H - pct / 100 * PLOT_H;
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("g", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("line", {
								x1: PAD_LEFT,
								x2: CHART_W - PAD_RIGHT,
								y1: y,
								y2: y,
								stroke: "var(--dsw-alias-border-l2)",
								strokeWidth: "0.75",
								strokeDasharray: pct === 0 ? void 0 : "3 3"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("text", {
								x: CHART_W - PAD_RIGHT + 8,
								y: y + 3.5,
								textAnchor: "start",
								fontSize: "10.5",
								fill: "var(--dsw-alias-label-tertiary)",
								style: { fontVariantNumeric: "tabular-nums" },
								children: [pct, "%"]
							})] }, `q-${pct}`);
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("line", {
							x1: PAD_LEFT,
							x2: CHART_W - PAD_RIGHT,
							y1: PAD_TOP + PLOT_H - .8 * PLOT_H,
							y2: PAD_TOP + PLOT_H - .8 * PLOT_H,
							stroke: "var(--dsw-alias-state-warn-primary, #f59e0b)",
							strokeOpacity: "0.28",
							strokeWidth: "1",
							strokeDasharray: "4 4"
						}),
						tokenTicks.map((tick) => {
							const ratio = maxTokens > 0 ? tick / maxTokens : 0;
							const y = PAD_TOP + PLOT_H - ratio * PLOT_H;
							return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("text", {
								x: PAD_LEFT - 10,
								y: y + 3.5,
								textAnchor: "end",
								fontSize: "10.5",
								fill: "var(--dsw-alias-label-tertiary)",
								style: { fontVariantNumeric: "tabular-nums" },
								children: formatCompactTokens(tick)
							}, `t-${tick}`);
						}),
						chartCycles.map((win, index) => {
							const id = cycleKey(win, index);
							const slotX = PAD_LEFT + index * step;
							const cx = slotX + step / 2;
							const barX = slotX + (step - barWidth) / 2;
							const barH = win.totalTokens > 0 && maxTokens > 0 ? Math.max(3, win.totalTokens / maxTokens * PLOT_H) : 0;
							const barY = PAD_TOP + PLOT_H - barH;
							const isHovered = hoveredIdx === index;
							const isSelected = selectedId === id;
							const emphasized = isHovered || isSelected;
							const dimmed = hoveredIdx !== void 0 && !isHovered || hoveredIdx === void 0 && selectedId !== void 0 && !isSelected;
							const providerColor = providerAccentColor(win.provider);
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("g", {
								style: { cursor: "pointer" },
								onMouseEnter: () => setHoveredIdx(index),
								onClick: () => toggleSelect(id),
								children: [
									(isHovered || isSelected) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
										x: slotX + 1,
										y: PAD_TOP,
										width: Math.max(2, step - 2),
										height: PLOT_H,
										rx: 4,
										fill: isSelected ? "var(--dsw-alias-interactive-bg-active, rgba(128,128,128,0.14))" : "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.08))"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
										x: slotX,
										y: PAD_TOP,
										width: step,
										height: PLOT_H + 22,
										fill: "transparent"
									}),
									barH > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
										x: barX,
										y: barY,
										width: barWidth,
										height: barH,
										rx: 3.5,
										fill: providerColor,
										fillOpacity: emphasized ? .96 : dimmed ? .36 : win.isCurrent ? .88 : .68,
										stroke: win.isCurrent ? "var(--dsw-alias-label-primary)" : isSelected ? "var(--dsw-alias-label-primary)" : "none",
										strokeOpacity: win.isCurrent ? .6 : .85,
										strokeWidth: win.isCurrent || isSelected ? 1.25 : 0
									}),
									win.isCurrent && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
										cx,
										cy: Math.max(PAD_TOP + 4, barY - 7),
										r: 3,
										fill: "var(--dsw-alias-state-success-primary, #10b981)"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
										cx,
										cy: PAD_TOP + PLOT_H + 10,
										r: 2.8,
										fill: providerColor,
										opacity: dimmed ? .4 : .95
									})
								]
							}, id);
						}),
						lineSegments.map((seg, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("g", {
							style: { pointerEvents: "none" },
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("polyline", {
								points: seg.points,
								fill: "none",
								stroke: "var(--dsw-alias-card-fill, var(--dsw-alias-bg-layer-1))",
								strokeWidth: "4.5",
								strokeLinecap: "round",
								strokeLinejoin: "round",
								opacity: "0.85"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("polyline", {
								points: seg.points,
								fill: "none",
								stroke: "var(--dsw-alias-label-primary)",
								strokeWidth: "2",
								strokeLinecap: "round",
								strokeLinejoin: "round",
								opacity: "0.82"
							})]
						}, `seg-${i}`)),
						chartCycles.map((win, index) => {
							const id = cycleKey(win, index);
							const cx = PAD_LEFT + index * step + step / 2;
							const emphasized = hoveredIdx === index || selectedId === id;
							const pct = win.quotaUsedPercent !== void 0 && Number.isFinite(win.quotaUsedPercent) ? clampPercent(win.quotaUsedPercent) : void 0;
							if (pct === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
								"data-quota-na": "true",
								cx,
								cy: PAD_TOP + PLOT_H - 4,
								r: emphasized ? 4.2 : 3.2,
								fill: "var(--dsw-alias-card-fill, var(--dsw-alias-bg-layer-1))",
								stroke: "var(--dsw-alias-label-tertiary)",
								strokeWidth: "1.5",
								style: { pointerEvents: "none" }
							}, `dot-${id}`);
							const cy = PAD_TOP + PLOT_H - pct / 100 * PLOT_H;
							const tone = quotaProgressTone(pct);
							const dotColor$1 = toneStrokeColor(tone);
							const peakPct = win.quotaPeakPercent !== void 0 && Number.isFinite(win.quotaPeakPercent) ? clampPercent(win.quotaPeakPercent) : void 0;
							const showPeak = peakPct !== void 0 && peakPct > pct;
							const peakY = showPeak ? PAD_TOP + PLOT_H - peakPct / 100 * PLOT_H : void 0;
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("g", {
								style: { pointerEvents: "none" },
								children: [
									showPeak && peakY !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("line", {
										x1: cx,
										x2: cx,
										y1: cy - 4,
										y2: peakY,
										stroke: dotColor$1,
										strokeWidth: "1.25",
										strokeDasharray: "2 1.5",
										opacity: "0.8"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("line", {
										x1: cx - 3.5,
										x2: cx + 3.5,
										y1: peakY,
										y2: peakY,
										stroke: dotColor$1,
										strokeWidth: "1.5",
										strokeLinecap: "round"
									})] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
										cx,
										cy,
										r: emphasized ? 6.5 : 5.2,
										fill: "var(--dsw-alias-card-fill, var(--dsw-alias-bg-layer-1))"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
										"data-quota-point": "true",
										"data-tone": tone,
										cx,
										cy,
										r: emphasized ? 4.8 : 3.6,
										fill: dotColor$1
									})
								]
							}, `dot-${id}`);
						}),
						xTickIndices.map((idx) => {
							const win = chartCycles[idx];
							const x = PAD_LEFT + idx * step + step / 2;
							const anchor = idx === 0 && chartCycles.length > 4 ? "start" : idx === chartCycles.length - 1 && chartCycles.length > 4 ? "end" : "middle";
							return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("text", {
								x,
								y: CHART_H - 10,
								textAnchor: anchor,
								fontSize: "10.5",
								fill: "var(--dsw-alias-label-tertiary)",
								style: { fontVariantNumeric: "tabular-nums" },
								children: formatCycleAxisLabel(win)
							}, `x-${idx}`);
						})
					]
				}), hoveredCycle !== void 0 && hoveredIdx !== void 0 && (() => {
					const badge = statusBadge(hoveredCycle, now, t);
					const pct = hoveredCycle.quotaUsedPercent !== void 0 && Number.isFinite(hoveredCycle.quotaUsedPercent) ? clampPercent(hoveredCycle.quotaUsedPercent) : void 0;
					const peakPct = hoveredCycle.quotaPeakPercent !== void 0 && Number.isFinite(hoveredCycle.quotaPeakPercent) ? clampPercent(hoveredCycle.quotaPeakPercent) : void 0;
					const range = formatCycleTimeRange(t, {
						...hoveredCycle.startsAt === void 0 ? {} : { startsAt: hoveredCycle.startsAt },
						countedFrom: hoveredCycle.countedFrom,
						...hoveredCycle.endsAt === void 0 ? {} : { endsAt: hoveredCycle.endsAt }
					});
					const accountText = hoveredCycle.loggedIn ? hoveredCycle.accountLabel ?? hoveredCycle.account : t("usageAccountLoggedOut", { account: hoveredCycle.accountLabel ?? hoveredCycle.account });
					const label = kindLabel(t, hoveredCycle.scope === void 0 ? { kind: hoveredCycle.kind } : {
						kind: hoveredCycle.kind,
						scope: hoveredCycle.scope
					});
					return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-usage-tooltip",
						style: hoveredIdx > chartCycles.length * .54 ? {
							left: 66,
							maxWidth: 270
						} : {
							right: 56,
							maxWidth: 270
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									alignItems: "center",
									gap: 6,
									fontWeight: 600,
									marginBottom: 2
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "dsh-usage-dot",
										style: { background: providerAccentColor(hoveredCycle.provider) }
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: providerDisplayName(hoveredCycle.provider) }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											opacity: .6,
											fontWeight: 400
										},
										children: "·"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap",
											fontWeight: 500
										},
										children: accountText
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									opacity: .8,
									marginBottom: 4
								},
								children: [
									label,
									" · ",
									badge.text
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									opacity: .72,
									marginBottom: 6
								},
								children: range
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-usage-tooltip-row",
								style: { fontWeight: 600 },
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("usageCycleTokensLabel") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: formatCompactTokens(hoveredCycle.totalTokens) })]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-usage-tooltip-row",
								style: {
									fontWeight: 600,
									marginBottom: 4
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("usageCycleQuotaLabel") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: { color: pct !== void 0 ? toneStrokeColor(quotaProgressTone(pct)) : void 0 },
									children: pct !== void 0 ? `${t("usageCycleQuotaUsed", { percent: pct })}${peakPct !== void 0 && peakPct > pct ? ` (${t("usageCycleQuotaPeak", { percent: peakPct })})` : ""}` : t("usageCycleQuotaNa")
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									opacity: .78,
									marginBottom: hoveredCycle.models.length > 0 ? 4 : 0
								},
								children: [
									t("usageKpiInputShort"),
									" ",
									formatCompactTokens(hoveredCycle.inputTokens),
									" · ",
									t("usageKpiOutputShort"),
									" ",
									formatCompactTokens(hoveredCycle.outputTokens),
									" · ",
									t("usageKpiCacheReadShort"),
									" ",
									formatCompactTokens(hoveredCycle.cacheReadTokens)
								]
							}),
							hoveredCycle.models.slice(0, 2).map((m) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-usage-tooltip-row",
								style: { opacity: .85 },
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										overflow: "hidden",
										textOverflow: "ellipsis",
										whiteSpace: "nowrap"
									},
									children: m.model
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
									formatCompactTokens(m.totalTokens),
									" (",
									formatPercent(m.share),
									")"
								] })]
							}, m.model))
						]
					});
				})()]
			}),
			selectedCycle !== void 0 ? (() => {
				const label = kindLabel(t, selectedCycle.scope === void 0 ? { kind: selectedCycle.kind } : {
					kind: selectedCycle.kind,
					scope: selectedCycle.scope
				});
				const accountText = selectedCycle.loggedIn ? selectedCycle.accountLabel ?? selectedCycle.account : t("usageAccountLoggedOut", { account: selectedCycle.accountLabel ?? selectedCycle.account });
				const badge = statusBadge(selectedCycle, now, t);
				const cycleRange = formatCycleTimeRange(t, {
					...selectedCycle.startsAt === void 0 ? {} : { startsAt: selectedCycle.startsAt },
					countedFrom: selectedCycle.countedFrom,
					...selectedCycle.endsAt === void 0 ? {} : { endsAt: selectedCycle.endsAt }
				});
				const usedPct = selectedCycle.quotaUsedPercent !== void 0 && Number.isFinite(selectedCycle.quotaUsedPercent) ? clampPercent(selectedCycle.quotaUsedPercent) : void 0;
				const peakPct = selectedCycle.quotaPeakPercent !== void 0 && Number.isFinite(selectedCycle.quotaPeakPercent) ? clampPercent(selectedCycle.quotaPeakPercent) : void 0;
				const showPeak = usedPct !== void 0 && peakPct !== void 0 && peakPct > usedPct;
				const tone = usedPct !== void 0 ? quotaProgressTone(usedPct) : "na";
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
					className: "dsh-usage-cycle-inspector",
					"aria-live": "polite",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-usage-window-top",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "dsh-usage-window-id",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-usage-dot",
									style: { background: providerAccentColor(selectedCycle.provider) }
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-usage-window-provider",
									children: providerDisplayName(selectedCycle.provider)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-usage-window-sep",
									"aria-hidden": "true",
									children: "·"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-usage-window-account",
									title: accountText,
									children: accountText
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-usage-window-meta",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-usage-badge",
									title: label,
									children: label
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: badge.className,
									children: badge.text
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-usage-dist-sub",
									children: cycleRange
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsh-usage-btn dsh-usage-btn-quiet",
									style: {
										minHeight: 24,
										padding: "0 8px"
									},
									onClick: () => setSelectedId(void 0),
									children: t("usageCyclesClearSelection")
								})
							]
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-usage-cycle-inspector-grid",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-usage-cycle-inspector-col",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "dsh-usage-cycle-metrics",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "dsh-usage-cycle-metric-label",
										children: t("usageCycleTokensLabel")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "dsh-usage-window-total",
										title: t("usageTokens", { count: formatTokens(selectedCycle.totalTokens) }),
										children: formatCompactTokens(selectedCycle.totalTokens)
									})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "dsh-usage-cycle-quota-col",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: "dsh-usage-cycle-metric-label",
												children: t("usageCycleQuotaLabel")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "dsh-usage-cycle-quota-val",
												"data-tone": tone,
												children: usedPct !== void 0 ? t("usageCycleQuotaUsed", { percent: usedPct }) : t("usageCycleQuotaNa")
											}),
											showPeak && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "dsh-usage-dist-sub",
												children: t("usageCycleQuotaPeak", { percent: peakPct })
											})
										]
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "dsh-usage-quota-track",
									"data-na": usedPct === void 0 ? "true" : "false",
									role: usedPct !== void 0 ? "progressbar" : void 0,
									"aria-valuenow": usedPct,
									"aria-valuemin": usedPct !== void 0 ? 0 : void 0,
									"aria-valuemax": usedPct !== void 0 ? 100 : void 0,
									"aria-label": usedPct !== void 0 ? t("usageCycleQuotaUsed", { percent: usedPct }) : t("usageCycleQuotaNa"),
									children: [usedPct !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "dsh-usage-quota-fill",
										"data-tone": tone,
										style: { width: `${usedPct}%` }
									}), showPeak && peakPct !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "dsh-usage-quota-peak-mark",
										style: { left: `calc(${peakPct}% - 1px)` },
										title: t("usageCycleQuotaPeak", { percent: peakPct })
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "dsh-usage-dist-sub",
									children: [
										t("usageKpiInputShort"),
										" ",
										formatCompactTokens(selectedCycle.inputTokens),
										" · ",
										t("usageKpiOutputShort"),
										" ",
										formatCompactTokens(selectedCycle.outputTokens),
										" · ",
										t("usageKpiCacheReadShort"),
										" ",
										formatCompactTokens(selectedCycle.cacheReadTokens),
										selectedCycle.cacheWriteTokens > 0 && ` · ${t("usageKpiCacheWriteShort")} ${formatCompactTokens(selectedCycle.cacheWriteTokens)}`,
										selectedCycle.reasoningTokens > 0 && ` · ${t("usageKpiReasoning", { count: formatCompactTokens(selectedCycle.reasoningTokens) })}`
									]
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-usage-cycle-inspector-col",
							children: [selectedCycle.models.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-usage-window-models",
								children: [selectedCycle.models.slice(0, 5).map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: "dsh-usage-model-chip",
									title: formatTokens(entry.totalTokens),
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: entry.model }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: formatCompactTokens(entry.totalTokens) }),
										entry.share > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
											"(",
											formatPercent(entry.share),
											")"
										] })
									]
								}, entry.model)), selectedCycle.models.length > 5 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: "dsh-usage-model-chip",
									children: ["+", selectedCycle.models.length - 5]
								})]
							}), selectedCycle.markers.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
								className: "dsh-usage-markers",
								children: selectedCycle.markers.map((marker) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: t(MARKER_KEYS[marker]) }, marker))
							})]
						})]
					})]
				});
			})() : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "dsh-usage-card-subtitle",
				style: { margin: 0 },
				children: t("usageCyclesInspectorHint")
			})
		] })]
	});
}

//#endregion
//#region src/client/ClearUsageHistoryDialog.tsx
const { border, stack, actions } = dialogLayout;
function summarizeTarget(target, clearInfo) {
	const list = target === "all" ? TRACKED_PROVIDERS.map((p) => clearInfo[p.id]).filter((info) => info !== void 0) : clearInfo[target] ? [clearInfo[target]] : [];
	let accounts = 0;
	let from;
	let to;
	let earlierHistory = false;
	for (const info of list) {
		accounts += info.accounts;
		if (info.from !== void 0 && (from === void 0 || info.from < from)) from = info.from;
		if (info.to !== void 0 && (to === void 0 || info.to > to)) to = info.to;
		if (info.earlierHistory) earlierHistory = true;
	}
	return {
		accounts,
		...from === void 0 ? {} : { from },
		...to === void 0 ? {} : { to },
		earlierHistory
	};
}
/**
* Confirmation modal for clearing stored usage history for one provider or all providers.
* Opened directly from the Usage Dashboard page (never nested inside another dialog).
*/
function ClearUsageHistoryDialog({ target, clearInfo, state, t, onTargetChange, onCancel, onConfirm }) {
	const dialog = (0, react.useRef)(null);
	const cancelButton = (0, react.useRef)(null);
	const title = (0, react.useId)();
	const description = (0, react.useId)();
	const clearing = state.phase === "clearing";
	(0, react.useEffect)(() => {
		const element = dialog.current;
		if (!element) return;
		const previous = document.activeElement;
		element.showModal();
		cancelButton.current?.focus();
		return () => {
			element.close();
			if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
		};
	}, []);
	const targetName = target === "all" ? t("usageClearAllProviders") : providerDisplayName(target);
	const stored = summarizeTarget(target, clearInfo);
	const nothing = stored.accounts === 0 && !stored.earlierHistory;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dialog", {
		className: "dsh-subscription-manager",
		ref: dialog,
		"aria-labelledby": title,
		"aria-describedby": description,
		onCancel: (event) => {
			event.preventDefault();
			if (!clearing) onCancel();
		},
		style: {
			width: 480,
			maxWidth: "calc(100vw - 32px)"
		},
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: providerSettingsCss }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			style: {
				...stack,
				padding: 20
			},
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
					id: title,
					style: { margin: 0 },
					children: t("usageClearTitle", { provider: targetName })
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
					style: {
						...stack,
						gap: 4
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dsh-subscription-label",
						children: t("usageClearScopeLabel")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
						value: target,
						disabled: clearing,
						onChange: (event) => onTargetChange(event.target.value),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: "all",
							children: t("usageClearAllProviders")
						}), TRACKED_PROVIDERS.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: entry.id,
							children: entry.name
						}, entry.id))]
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
					id: description,
					style: {
						...stack,
						gap: 6
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("usageClearRemoved") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("ul", {
							style: {
								margin: 0,
								paddingLeft: 20
							},
							children: [
								nothing && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: t("usageClearNothingStored") }),
								stored.accounts > 0 && stored.from !== void 0 && stored.to !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: t("usageClearRemovedWindows", {
									count: stored.accounts,
									from: formatInstant(stored.from),
									to: formatInstant(stored.to)
								}) }),
								stored.earlierHistory && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: t("usageClearRemovedEarlier") })
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("usageClearKept") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dsh-subscription-hint",
							style: { margin: 0 },
							children: t("usageClearKeptList")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: { margin: 0 },
							children: t("usageClearIrreversible")
						})
					]
				}),
				state.phase === "failed" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					role: "alert",
					children: t("usageClearFailed", { message: state.error ?? "" })
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", {
					style: {
						...actions,
						justifyContent: "flex-end",
						borderTop: border,
						paddingTop: 12
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						ref: cancelButton,
						type: "button",
						autoFocus: true,
						disabled: clearing,
						onClick: onCancel,
						children: t("cancel")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "dsh-subscription-primary",
						disabled: clearing,
						onClick: onConfirm,
						children: clearing ? t("usageClearing") : t("usageClearConfirm")
					})]
				})
			]
		})]
	});
}

//#endregion
//#region src/client/UsageDashboard.tsx
const RANGES = [
	{
		id: "7d",
		key: "usageRange7d"
	},
	{
		id: "30d",
		key: "usageRange30d"
	},
	{
		id: "90d",
		key: "usageRange90d"
	},
	{
		id: "all",
		key: "usageRangeAll"
	}
];
function fallbackTranslate$1(key, params) {
	let text = en[key];
	for (const [name, value] of Object.entries(params ?? {})) text = text.replaceAll(`{${name}}`, String(value));
	return text;
}
function messageOf(error) {
	return error instanceof Error ? error.message : String(error);
}
function formatClockTime(ts) {
	return new Date(ts).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit"
	});
}
/** Presentational dashboard view (pure & SSR-testable without RPC or browser DOM). */
function UsageDashboardView({ state, t, onAction, onOpenClear, embedded = false }) {
	const { response, request, phase } = state;
	const busy = phase === "loading";
	const providerTotals = /* @__PURE__ */ new Map();
	for (const entry of response?.providers ?? []) providerTotals.set(entry.provider, entry.totalTokens);
	const allProviderTotal = (response?.providers ?? []).reduce((sum, p) => sum + p.totalTokens, 0);
	const selectedProviderInfo = request.provider === "all" ? void 0 : response?.providers.find((p) => p.provider === request.provider);
	const accountSelectValue = request.account === "all" ? "all" : request.provider === "all" ? request.account : `${request.provider}\u0000${request.account}`;
	const handleAccountSelect = (raw) => {
		if (raw === "all") {
			onAction({
				type: "account",
				account: "all"
			});
			return;
		}
		const sep = raw.indexOf("\0");
		if (sep > 0) {
			const provider = raw.slice(0, sep);
			const account = raw.slice(sep + 1);
			if (request.provider === "all") onAction({
				type: "providerAccount",
				provider,
				account
			});
			else onAction({
				type: "account",
				account
			});
			return;
		}
		onAction({
			type: "account",
			account: raw
		});
	};
	const summary = response?.summary;
	const hasVisibleUsage = response !== void 0 && (response.summary.totalTokens > 0 || response.heatmap.some((d) => d.totalTokens > 0) || response.quotaCycles.length > 0 || response.activeWindows.length > 0);
	const hasAnyGlobalUsage = allProviderTotal > 0;
	const isFiltered = request.provider !== "all" || request.account !== "all" || request.range !== "all";
	const ioTotal = (summary?.inputTokens ?? 0) + (summary?.outputTokens ?? 0);
	const inputPct = ioTotal > 0 ? (summary?.inputTokens ?? 0) / ioTotal * 100 : 50;
	const cacheBase = (summary?.inputTokens ?? 0) + (summary?.cacheReadTokens ?? 0) + (summary?.cacheWriteTokens ?? 0);
	const cacheHitPct = cacheBase > 0 ? Math.round((summary?.cacheReadTokens ?? 0) / cacheBase * 100) : 0;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: embedded ? "dsh-usage-dashboard dsh-usage-dashboard-embedded" : "dsh-usage-dashboard",
		children: [!embedded && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: usageDashboardCss }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "dsh-usage-container",
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
					className: "dsh-usage-header",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-usage-title-group",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h1", {
							className: "dsh-usage-title",
							children: t("usageDashboardTitle")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dsh-usage-subtitle",
							children: t("usageDashboardSubtitle")
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-usage-header-actions",
						children: [
							response !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsh-usage-updated",
								children: t("usageLastUpdated", { time: formatClockTime(response.generatedAt) })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "dsh-usage-btn",
								disabled: busy,
								onClick: () => onAction({ type: "refresh" }),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
									"aria-hidden": "true",
									width: "13",
									height: "13",
									viewBox: "0 0 24 24",
									fill: "none",
									stroke: "currentColor",
									strokeWidth: "2",
									strokeLinecap: "round",
									strokeLinejoin: "round",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M21 12a9 9 0 1 1-2.64-6.36" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("polyline", { points: "21 3 21 9 15 9" })]
								}), busy ? t("usageViewLoading") : t("usageRefresh")]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dsh-usage-btn dsh-usage-btn-danger",
								"aria-haspopup": "dialog",
								disabled: busy || response === void 0,
								onClick: onOpenClear,
								children: t("usageClearOpen")
							})
						]
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("nav", {
					className: "dsh-usage-filters",
					"aria-label": t("providerTabs"),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-usage-segmented dsh-usage-provider-pills",
						role: "group",
						"aria-label": t("providerTabs"),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "dsh-usage-pill",
							"aria-pressed": request.provider === "all",
							disabled: busy,
							onClick: () => onAction({
								type: "provider",
								provider: "all"
							}),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("usageProviderAll") }), allProviderTotal > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsh-usage-pill-badge",
								children: formatCompactTokens(allProviderTotal)
							})]
						}), TRACKED_PROVIDERS.map((entry) => {
							const total = providerTotals.get(entry.id) ?? 0;
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "dsh-usage-pill",
								"aria-pressed": request.provider === entry.id,
								disabled: busy,
								onClick: () => onAction({
									type: "provider",
									provider: entry.id
								}),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "dsh-usage-dot",
										style: { background: entry.colorVar }
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: entry.name }),
									total > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "dsh-usage-pill-badge",
										children: formatCompactTokens(total)
									})
								]
							}, entry.id);
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-usage-filter-right",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
							className: "dsh-usage-select",
							"aria-label": t("usageAccount"),
							value: accountSelectValue,
							disabled: busy || response === void 0,
							onChange: (event) => handleAccountSelect(event.target.value),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: "all",
								children: t("usageAccountAll")
							}), selectedProviderInfo !== void 0 ? selectedProviderInfo.accounts.map((acct) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: `${selectedProviderInfo.provider}\u0000${acct.key}`,
								children: acct.loggedIn ? acct.label ?? acct.key : t("usageAccountLoggedOut", { account: acct.label ?? acct.key })
							}, acct.key)) : (response?.providers ?? []).filter((p) => p.accounts.length > 0).map((p) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("optgroup", {
								label: providerDisplayName(p.provider),
								children: p.accounts.map((acct) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: `${p.provider}\u0000${acct.key}`,
									children: acct.loggedIn ? acct.label ?? acct.key : t("usageAccountLoggedOut", { account: acct.label ?? acct.key })
								}, `${p.provider}:${acct.key}`))
							}, p.provider))]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsh-usage-segmented",
							role: "group",
							"aria-label": t("usageKind"),
							children: RANGES.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dsh-usage-pill",
								"aria-pressed": request.range === item.id,
								disabled: busy,
								onClick: () => onAction({
									type: "range",
									range: item.id
								}),
								children: t(item.key)
							}, item.id))
						})]
					})]
				}),
				phase === "error" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-usage-banner dsh-usage-banner-error",
					role: "alert",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("usageViewFailed", { message: state.error ?? "" }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "dsh-usage-btn",
						onClick: () => onAction({ type: "retry" }),
						children: t("usageRetry")
					})]
				}),
				response !== void 0 && response.errors.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dsh-usage-banner dsh-usage-banner-warn",
					role: "status",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("usageDataErrors", { list: response.errors.join("; ") }) })
				}),
				state.clearErrors.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dsh-usage-banner dsh-usage-banner-warn",
					role: "alert",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("usageClearPartial", { list: state.clearErrors.join("; ") }) })
				}),
				response === void 0 && phase === "loading" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dsh-usage-empty",
					role: "status",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dsh-usage-empty-desc",
						children: t("usageViewLoading")
					})
				}),
				response !== void 0 && !hasVisibleUsage && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-usage-empty",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
							className: "dsh-usage-empty-title",
							children: hasAnyGlobalUsage && isFiltered ? t("usageEmptyFilter") : t("usageEmptyDashboard")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dsh-usage-empty-desc",
							children: hasAnyGlobalUsage && isFiltered ? t("usageDashboardSubtitle") : response.cleared ? t("usageEmptyDashboardCleared") : t("usageEmptyDashboardHint")
						}),
						hasAnyGlobalUsage && isFiltered && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dsh-usage-btn",
							style: { marginTop: 6 },
							onClick: () => onAction({ type: "resetFilters" }),
							children: t("usageEmptyResetFilter")
						})
					]
				}),
				response !== void 0 && summary !== void 0 && hasVisibleUsage && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "dsh-usage-kpi-grid",
						"aria-label": t("usageDashboardTitle"),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
								className: "dsh-usage-kpi-card",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "dsh-usage-kpi-label",
										children: t("usageKpiTotal")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "dsh-usage-kpi-value",
										title: formatTokens(summary.totalTokens),
										children: formatCompactTokens(summary.totalTokens)
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "dsh-usage-kpi-sub",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("usageKpiExact", { count: formatTokens(summary.totalTokens) }) })
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
								className: "dsh-usage-kpi-card",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "dsh-usage-kpi-label",
										children: t("usageKpiInputOutput")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "dsh-usage-kpi-value",
										style: { fontSize: 19 },
										children: [
											formatCompactTokens(summary.inputTokens),
											" / ",
											formatCompactTokens(summary.outputTokens)
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "dsh-usage-split-bar",
										"aria-hidden": "true",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { style: {
											width: `${inputPct}%`,
											background: "var(--dsh-tok-input)"
										} }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { style: {
											width: `${100 - inputPct}%`,
											background: "var(--dsh-tok-output)"
										} })]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "dsh-usage-kpi-sub",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
												t("usageKpiInputShort"),
												" ",
												formatCompactTokens(summary.inputTokens)
											] }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
												t("usageKpiOutputShort"),
												" ",
												formatCompactTokens(summary.outputTokens)
											] }),
											summary.reasoningTokens > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("usageKpiReasoning", { count: formatCompactTokens(summary.reasoningTokens) }) })
										]
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
								className: "dsh-usage-kpi-card",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "dsh-usage-kpi-label",
										children: t("usageKpiCache")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "dsh-usage-kpi-value",
										style: { fontSize: 19 },
										children: [
											formatCompactTokens(summary.cacheReadTokens),
											" / ",
											formatCompactTokens(summary.cacheWriteTokens)
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "dsh-usage-split-bar",
										"aria-hidden": "true",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { style: {
											width: `${cacheHitPct}%`,
											background: "var(--dsh-tok-cache-read)"
										} }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { style: {
											width: `${Math.max(0, 100 - cacheHitPct)}%`,
											background: "var(--dsh-tok-cache-write)",
											opacity: summary.cacheWriteTokens > 0 ? .85 : .15
										} })]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "dsh-usage-kpi-sub",
										children: cacheBase > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("usageKpiCacheHit", { percent: cacheHitPct }) }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
											t("usageKpiCacheReadShort"),
											" 0 · ",
											t("usageKpiCacheWriteShort"),
											" 0"
										] })
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
								className: "dsh-usage-kpi-card",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "dsh-usage-kpi-label",
										children: t("usageKpiActivity")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "dsh-usage-kpi-value",
										children: t("usageKpiModelsCount", { count: summary.activeModels })
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "dsh-usage-kpi-sub",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("usageKpiDaysCount", { days: summary.activeDays }) }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "·" }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("usageKpiAccountsCount", { accounts: summary.activeAccounts }) })
										]
									})
								]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageHeatmap, {
						days: response.heatmap,
						...state.selectedDate === void 0 ? {} : { selectedDate: state.selectedDate },
						onSelectDate: (date) => onAction(date === void 0 ? { type: "selectDate" } : {
							type: "selectDate",
							date
						}),
						t
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageCharts, {
						daily: response.daily,
						models: response.models,
						providerBreakdown: response.providerBreakdown,
						distributionMode: state.distributionMode,
						onDistributionMode: (mode) => onAction({
							type: "distribution",
							mode
						}),
						onSelectDate: (date) => onAction({
							type: "selectDate",
							date
						}),
						t
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActiveWindowsPanel, {
						windows: response.quotaCycles.length > 0 ? response.quotaCycles : response.activeWindows,
						now: response.generatedAt,
						t
					})
				] })
			]
		})]
	});
}
/** Sidebar plugin home page for Subscription Usage. */
function UsageDashboard(props) {
	const { rpc, embedded = false, refreshKey = 0 } = props;
	const t = props.t ?? fallbackTranslate$1;
	const [state, dispatch] = (0, react.useReducer)(usageDashboardReducer, void 0, initialUsageDashboardState);
	const [clearTarget, setClearTarget] = (0, react.useState)(void 0);
	const [clearConfirm, setClearConfirm] = (0, react.useState)(void 0);
	const aliveRef = (0, react.useRef)(true);
	const lastRefreshKey = (0, react.useRef)(refreshKey);
	(0, react.useEffect)(() => {
		aliveRef.current = true;
		return () => {
			aliveRef.current = false;
		};
	}, []);
	(0, react.useEffect)(() => {
		if (refreshKey !== lastRefreshKey.current) {
			lastRefreshKey.current = refreshKey;
			dispatch({ type: "refresh" });
		}
	}, [refreshKey]);
	(0, react.useEffect)(() => {
		if (rpc === void 0) return;
		let active = true;
		callSubscriptionsAuth(rpc, "usageDashboard", {
			provider: state.request.provider,
			account: state.request.account,
			range: state.request.range
		}).then((response) => {
			if (active) dispatch({
				type: "loaded",
				response
			});
		}).catch((error) => {
			if (active) dispatch({
				type: "failed",
				message: messageOf(error)
			});
		});
		return () => {
			active = false;
		};
	}, [
		rpc,
		state.load,
		state.request.provider,
		state.request.account,
		state.request.range
	]);
	async function runClear() {
		if (rpc === void 0 || clearTarget === void 0 || clearConfirm?.phase === "clearing") return;
		setClearConfirm(clearConfirmReducer(clearConfirm ?? CLEAR_CONFIRM_OPEN, { type: "confirm" }));
		try {
			const result = await callSubscriptionsAuth(rpc, "clearUsageHistory", {
				provider: clearTarget,
				confirm: true
			});
			if (!aliveRef.current) return;
			setClearConfirm(void 0);
			setClearTarget(void 0);
			dispatch({
				type: "cleared",
				clearErrors: result.errors
			});
		} catch (error) {
			if (!aliveRef.current) return;
			setClearConfirm((current) => clearConfirmReducer(current ?? CLEAR_CONFIRM_OPEN, {
				type: "failed",
				message: messageOf(error)
			}));
			dispatch({ type: "refresh" });
		}
	}
	if (rpc === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: embedded ? "dsh-usage-dashboard dsh-usage-dashboard-embedded" : "dsh-usage-dashboard",
		children: [!embedded && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: usageDashboardCss }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			className: "dsh-usage-container",
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dsh-usage-empty",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "dsh-usage-empty-desc",
					children: t("usageDashboardUnavailable")
				})
			})
		})]
	});
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageDashboardView, {
		state,
		t,
		embedded,
		onAction: dispatch,
		onOpenClear: () => {
			setClearTarget(state.request.provider);
			setClearConfirm(CLEAR_CONFIRM_OPEN);
		}
	}), clearConfirm !== void 0 && clearTarget !== void 0 && state.response !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ClearUsageHistoryDialog, {
		target: clearTarget,
		clearInfo: state.response.clearInfo,
		state: clearConfirm,
		t,
		onTargetChange: setClearTarget,
		onCancel: () => {
			setClearConfirm(void 0);
			setClearTarget(void 0);
		},
		onConfirm: () => {
			runClear();
		}
	})] });
}

//#endregion
//#region src/client/UsageNavIcon.tsx
/** Sidebar navigation glyph for the Subscription Usage dashboard; the host shell supplies its size. */
function UsageNavIcon({ size }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
		"aria-hidden": "true",
		width: size,
		height: size,
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: "1.7",
		strokeLinecap: "round",
		strokeLinejoin: "round",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
				x: "3",
				y: "13",
				width: "4",
				height: "7",
				rx: "1.2"
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
				x: "10",
				y: "9",
				width: "4",
				height: "11",
				rx: "1.2"
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
				x: "17",
				y: "4",
				width: "4",
				height: "16",
				rx: "1.2"
			})
		]
	});
}

//#endregion
//#region src/client/SubscriptionsPage.tsx
const TABS = ["usage", "settings"];
function fallbackTranslate(key, params) {
	let text = en[key];
	for (const [name, value] of Object.entries(params ?? {})) text = text.replaceAll(`{${name}}`, String(value));
	return text;
}
function SettingsTabIcon({ size }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
		"aria-hidden": "true",
		width: size,
		height: size,
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: "1.7",
		strokeLinecap: "round",
		strokeLinejoin: "round",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("line", {
				x1: "4",
				y1: "7",
				x2: "20",
				y2: "7"
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
				cx: "9",
				cy: "7",
				r: "2.2",
				fill: "var(--dsw-alias-bg-base, currentColor)"
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("line", {
				x1: "4",
				y1: "17",
				x2: "20",
				y2: "17"
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
				cx: "15",
				cy: "17",
				r: "2.2",
				fill: "var(--dsw-alias-bg-base, currentColor)"
			})
		]
	});
}
/**
* Unified Subscriptions sidebar page with accessible top tabs:
* - **Usage** (default home): full cross-provider analytics dashboard
* - **Settings**: OAuth account login, quota limits, account pool & proxy configuration
*/
function SubscriptionsPage(props) {
	const { rpc, initialTab = "usage" } = props;
	const t = props.t ?? fallbackTranslate;
	const [activeTab, setActiveTab] = (0, react.useState)(initialTab);
	const [visitedSettings, setVisitedSettings] = (0, react.useState)(initialTab === "settings");
	const [usageRefreshKey, setUsageRefreshKey] = (0, react.useState)(0);
	const tabIdPrefix = (0, react.useId)();
	const tabRefs = (0, react.useRef)({});
	const selectTab = (next) => {
		if (next === activeTab) return;
		if (next === "settings") setVisitedSettings(true);
		else if (activeTab === "settings") setUsageRefreshKey((k) => k + 1);
		setActiveTab(next);
	};
	const handleTabKeyDown = (event, current) => {
		const idx = TABS.indexOf(current);
		let nextIdx;
		if (event.key === "ArrowRight") nextIdx = (idx + 1) % TABS.length;
		else if (event.key === "ArrowLeft") nextIdx = (idx - 1 + TABS.length) % TABS.length;
		else if (event.key === "Home") nextIdx = 0;
		else if (event.key === "End") nextIdx = TABS.length - 1;
		if (nextIdx === void 0) return;
		event.preventDefault();
		const nextTab = TABS[nextIdx];
		selectTab(nextTab);
		tabRefs.current[nextTab]?.focus();
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "dsh-subscriptions-page",
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: usageDashboardCss }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "dsh-subscriptions-page-inner",
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
					className: "dsh-subscriptions-page-topbar",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-subscriptions-page-brand",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SubscriptionNavIcon, {
							size: 18,
							active: true
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("nav") })]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-subscriptions-page-tabs",
						role: "tablist",
						"aria-label": t("nav"),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							ref: (el) => {
								tabRefs.current.usage = el;
							},
							type: "button",
							role: "tab",
							id: `${tabIdPrefix}-tab-usage`,
							"aria-selected": activeTab === "usage",
							"aria-controls": `${tabIdPrefix}-panel-usage`,
							tabIndex: activeTab === "usage" ? 0 : -1,
							className: "dsh-subscriptions-page-tab",
							onClick: () => selectTab("usage"),
							onKeyDown: (event) => handleTabKeyDown(event, "usage"),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageNavIcon, {
								size: 15,
								active: activeTab === "usage"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("usageNav") })]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							ref: (el) => {
								tabRefs.current.settings = el;
							},
							type: "button",
							role: "tab",
							id: `${tabIdPrefix}-tab-settings`,
							"aria-selected": activeTab === "settings",
							"aria-controls": `${tabIdPrefix}-panel-settings`,
							tabIndex: activeTab === "settings" ? 0 : -1,
							className: "dsh-subscriptions-page-tab",
							onClick: () => selectTab("settings"),
							onKeyDown: (event) => handleTabKeyDown(event, "settings"),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsTabIcon, { size: 15 }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("usageTabSettings") })]
						})]
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					role: "tabpanel",
					id: `${tabIdPrefix}-panel-usage`,
					"aria-labelledby": `${tabIdPrefix}-tab-usage`,
					hidden: activeTab !== "usage",
					className: "dsh-subscriptions-page-panel",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageDashboard, {
						...rpc === void 0 ? {} : { rpc },
						t,
						embedded: true,
						refreshKey: usageRefreshKey
					})
				}),
				visitedSettings && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					role: "tabpanel",
					id: `${tabIdPrefix}-panel-settings`,
					"aria-labelledby": `${tabIdPrefix}-tab-settings`,
					hidden: activeTab !== "settings",
					className: "dsh-subscriptions-page-panel",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SubscriptionsSection, {
						...rpc === void 0 ? {} : { rpc },
						t,
						hideUsageHint: true,
						embedded: true
					})
				})
			]
		})]
	});
}

//#endregion
//#region src/client/index.ts
/** Dictionary namespace owned by this plugin. */
const NS = "settings.subscriptions";
/** Sidebar panel id shared between `sidebar.panellist` and `main` slots. */
const SUBSCRIPTIONS_PANEL_ID = "subscriptions";
/**
* Required services (cordis fiber inject): `slots` carries the registration
* seat, `connection` the `/subscriptions-auth` RPC caller, and `locale` the copy
* dictionaries.
*/
const inject = [
	"slots",
	"connection",
	"locale"
];
/**
* Register the Subscriptions section once the `settings.section` declaration
* is on the ledger (the shell's apply order relative to this one is NOT
* constrained; registration depends on the slot through `slots.inject()`).
* @param ctx - client root context.
*/
function apply(ctx) {
	ctx.effect(() => ctx.locale.register(NS, {
		zh,
		en
	}), "dsh-plugin-subscriptions: copy dictionaries");
	ctx.effect(() => {
		const style = document.createElement("style");
		style.setAttribute("data-plugin", "dsh-plugin-subscriptions");
		style.textContent = "div[role=\"dialog\"][aria-modal=\"true\"]:has(> nav) { padding-top: 14px; }";
		document.head.appendChild(style);
		return () => style.remove();
	}, "dsh-plugin-subscriptions: settings panel breathing room");
	const connection = ctx.get("connection");
	const t = ctx.locale.bind(NS);
	const injected = () => ({
		rpc: connection.rpc,
		t
	});
	ctx.slots.inject("settings.section", () => ctx.slots.register({
		name: "settings.section",
		id: "subscriptions",
		order: 90,
		label: () => t("nav"),
		inject: injected
	}, SubscriptionsSection));
	ctx.slots.inject("settings.section.icon", () => ctx.slots.register({
		name: "settings.section.icon",
		id: "subscriptions"
	}, SubscriptionNavIcon));
	const pageInjected = () => ({
		rpc: connection.rpc,
		t
	});
	ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
		name: "sidebar.panellist",
		id: SUBSCRIPTIONS_PANEL_ID,
		order: 20,
		label: () => t("nav")
	}, SubscriptionNavIcon));
	ctx.slots.inject("main", () => ctx.slots.register({
		name: "main",
		key: SUBSCRIPTIONS_PANEL_ID,
		inject: pageInjected
	}, SubscriptionsPage));
	const toolviewInjected = () => ({ load: createImageLoader(connection.rpc) });
	ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
		name: "tool.call.toolview",
		key: "image_generate",
		locale: NS,
		inject: toolviewInjected
	}, ImageGenerateToolview));
	const videoToolviewInjected = () => ({ loadVideo: createVideoLoader(connection.rpc) });
	ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
		name: "tool.call.toolview",
		key: "video_generate",
		locale: NS,
		inject: videoToolviewInjected
	}, VideoGenerateToolview));
	const models = () => ctx.get("modelDirectories");
	ctx.slots.inject("conversation.input.right", () => ctx.slots.register({
		name: "conversation.input.right",
		id: "codex-speed",
		order: 0,
		locale: NS,
		inject: (sessionId) => ({
			loadSpeed: createSpeedLoader(connection, models, sessionId),
			setSpeed: createSpeedSetter(connection, sessionId, models)
		})
	}, SpeedSelect));
	ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
		name: "conversation.composer.dock",
		id: "subscription-usage",
		order: 10,
		locale: NS,
		inject: (sessionId) => ({
			rpc: connection.rpc,
			currentModel: createCurrentModelReader(models, sessionId)
		})
	}, SubscriptionUsageBadge));
	ctx.inject(["commandUi"], (scope) => {
		const command = scope.get("commandUi");
		scope.effect(() => command.register({
			name: "fast",
			description: fastCommandDescription(() => t("commandFast")),
			available: () => true,
			ui: {
				kind: "popupSelect",
				options: async (session) => {
					const state = await createSpeedLoader(connection, models, session.sessionId)();
					if (!state.visible) throw new Error(t("commandFastUnavailable"));
					return [{
						id: "standard",
						label: t("speedStandard"),
						detail: t("speedStandardDescription")
					}, {
						id: "fast",
						label: t("speedFast"),
						detail: t("speedFastDescription")
					}].map((option) => ({
						...option,
						active: option.id === state.tier
					}));
				},
				onSelect: async (option, session) => {
					await createSpeedSetter(connection, session.sessionId, models)(option.id);
				}
			}
		}), "dsh-plugin-subscriptions: /fast contribution");
	});
}

//#endregion
exports.SubscriptionsPage = SubscriptionsPage;
exports.UsageDashboard = UsageDashboard;
exports.UsageDashboardView = UsageDashboardView;
exports.apply = apply;
exports.inject = inject;
return module.exports; } });
//# sourceMappingURL=client.js.map