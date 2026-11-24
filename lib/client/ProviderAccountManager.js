import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { callSubscriptionsAuth } from './subscriptions-rpc.js';
import { accountModelRows, accountPoolSelection, mergeAccountChanges, mergeLatestAccounts } from './account-preferences.js';
import { ProviderModelEditor } from './ProviderModelEditor.js';
import { notifyDisplayNameChange } from './display-name-events.js';
import { dialogLayout, providerSettingsCss } from './provider-settings-styles.js';
import { SubscriptionTabs } from './SubscriptionTabs.js';
import { SettingHelp } from './SettingHelp.js';
import { CODEX_DEFAULT_MAX_TOKENS } from '../codex-budget-defaults.js';
const PROMPT_CACHE_TTLS = ['5m', '1h'];
const { border, stack, actions } = dialogLayout;
/** Model ids listed inline after a successful probe; the rest are only counted. */
const PROBE_PREVIEW = 6;
/** Native top-layer dialog provides keyboard containment, Escape and focus restoration. */
export function ProviderAccountManager({ provider, name, accountsVersion, rpc, t, onClose }) {
    const dialog = useRef(null);
    const title = useId();
    const description = useId();
    const cacheTtlId = useId();
    const displayNameId = useId();
    const tabIdPrefix = useId();
    const [selectedAccount, setSelectedAccount] = useState();
    const selectedAccountRef = useRef();
    selectedAccountRef.current = selectedAccount;
    const tabRefs = useRef({});
    const restoreAccountFocus = useRef(false);
    const initialized = useRef(false);
    const contextWindowId = useId();
    const outputReserveId = useId();
    const [catalog, setCatalog] = useState();
    const [changes, setChanges] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [saveError, setSaveError] = useState('');
    const [attempt, setAttempt] = useState(0);
    const [modelsDirty, setModelsDirty] = useState(false);
    const [displayName, setDisplayName] = useState('');
    const [nameDirty, setNameDirty] = useState(false);
    /** '' follows the plugin config; otherwise an explicit TTL. */
    const [cacheTtl, setCacheTtl] = useState('');
    const [cacheTtlDirty, setCacheTtlDirty] = useState(false);
    const [probes, setProbes] = useState({});
    const [contextWindow, setContextWindow] = useState('');
    const [outputReserve, setOutputReserve] = useState('');
    const [contextDirty, setContextDirty] = useState(false);
    const [reserveDirty, setReserveDirty] = useState(false);
    const [budgetSubmitted, setBudgetSubmitted] = useState(false);
    const alive = useRef(true);
    const saveLock = useRef(false);
    /** One in-flight probe per account; a second click while one runs is a no-op. */
    const probeLocks = useRef(new Set());
    const editor = useRef(null);
    useEffect(() => {
        alive.current = true;
        const element = dialog.current;
        const previous = document.activeElement;
        element.showModal();
        return () => {
            alive.current = false;
            element.close();
            if (previous instanceof HTMLElement && previous.isConnected)
                previous.focus();
        };
    }, []);
    useEffect(() => {
        let current = true;
        setLoading(true);
        setError('');
        void callSubscriptionsAuth(rpc, 'providerSettings', { provider }).then(data => {
            if (current) {
                // Keep all drafts when another client connects or disconnects an account.
                if (!initialized.current) {
                    setDisplayName(data.settings.displayName ?? '');
                    setCacheTtl(data.settings.promptCacheTtl ?? '');
                    setContextWindow(data.settings.contextWindow?.toString() ?? '');
                    setOutputReserve(data.settings.defaultMaxTokens?.toString() ?? '');
                    initialized.current = true;
                }
                const previous = selectedAccountRef.current;
                if (previous !== undefined && !data.accounts.some(account => account.key === previous)) {
                    const focus = document.activeElement;
                    const oldTab = tabRefs.current[previous];
                    const oldPanel = oldTab?.getAttribute('aria-controls');
                    restoreAccountFocus.current = focus === oldTab || !!(oldPanel && document.getElementById(oldPanel)?.contains(focus));
                    setSelectedAccount(data.accounts[0]?.key);
                }
                else if (previous === undefined)
                    setSelectedAccount(data.accounts[0]?.key);
                setCatalog(data);
            }
        }).catch(error => {
            if (current)
                setError(t('accountsLoadFailed', { message: error instanceof Error ? error.message : String(error) }));
        }).finally(() => { if (current)
            setLoading(false); });
        return () => { current = false; };
    }, [provider, rpc, attempt, accountsVersion]);
    useLayoutEffect(() => {
        if (!restoreAccountFocus.current)
            return;
        restoreAccountFocus.current = false;
        if (selectedAccount !== undefined && tabRefs.current[selectedAccount])
            tabRefs.current[selectedAccount].focus();
        else
            dialog.current?.querySelector('header button')?.focus();
    }, [catalog, selectedAccount]);
    // Empty means no override. Reject exponents, decimals, signs and unsafe integers.
    function parseBudget(value) {
        if (!/^[0-9]+$/.test(value))
            return undefined;
        const parsed = Number(value);
        return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
    }
    const contextInvalid = contextWindow !== '' && parseBudget(contextWindow) === undefined;
    const reserveInvalid = outputReserve !== '' && parseBudget(outputReserve) === undefined;
    function edit(key, next) {
        setChanges(current => ({ ...current, [key]: next }));
    }
    /**
     * Fetch one account's model list live, through the proxy typed above it. The
     * draft goes out with the request, so a new proxy can be proven before it is
     * saved; the host answers with what came back rather than throwing.
     */
    async function probe(key) {
        if (probeLocks.current.has(key))
            return;
        probeLocks.current.add(key);
        const field = changes[key] ?? catalog?.settings.accounts?.[key] ?? {};
        setProbes(current => ({ ...current, [key]: { running: true } }));
        try {
            const result = await callSubscriptionsAuth(rpc, 'accountModelsTest', {
                provider, account: key, proxy: field.proxy ?? '',
            });
            if (alive.current)
                setProbes(current => ({ ...current, [key]: { running: false, result } }));
        }
        catch (error) {
            // The endpoint itself is unreachable (older host, transport failure):
            // report it on the card instead of dropping the click.
            const message = error instanceof Error ? error.message : String(error);
            const result = { ok: false, viaProxy: false, models: [], latencyMs: 0, error: message };
            if (alive.current)
                setProbes(current => ({ ...current, [key]: { running: false, result } }));
        }
        finally {
            probeLocks.current.delete(key);
        }
    }
    /**
     * One submit for both drafts: the model editor's (visibility, effort,
     * context, tools) and this dialog's account edits. A failure keeps the
     * dialog open with every edit intact.
     */
    async function save() {
        if (saveLock.current)
            return;
        if (provider === 'codex' && (contextInvalid || reserveInvalid)) {
            setBudgetSubmitted(true);
            return;
        }
        // An invalid model draft (e.g. a malformed context window) blocks the
        // whole submit; the editor shows the reason next to the field.
        const models = editor.current === null ? { efforts: [] } : editor.current.collect();
        if (models === undefined)
            return;
        saveLock.current = true;
        setSaving(true);
        setSaveError('');
        let savedEfforts = 0;
        try {
            for (const { model, effort } of models.efforts) {
                await callSubscriptionsAuth(rpc, 'setModelDefault', { provider, model, ...(effort ? { effort } : {}) });
                savedEfforts++;
                if (!alive.current)
                    return;
            }
            // Re-read before writing: another client may have saved since this
            // dialog loaded, and a stale snapshot must never be written back.
            const latest = await callSubscriptionsAuth(rpc, 'providerSettings', { provider });
            if (!alive.current)
                return;
            const base = models.settings === undefined ? latest.settings : mergeLatestAccounts(models.settings, latest.settings);
            // The Antigravity opt-in gate belongs to setProviderEnabled, never to this draft.
            const { displayName: _staleName, promptCacheTtl: _staleTtl, contextWindow: _staleContext, defaultMaxTokens: _staleReserve, enabled: _enabled, ...rest } = mergeAccountChanges(base, changes);
            const savedName = nameDirty ? displayName.trim() : latest.settings.displayName;
            const savedTtl = cacheTtlDirty ? cacheTtl : latest.settings.promptCacheTtl;
            const savedContext = contextDirty ? parseBudget(contextWindow) : latest.settings.contextWindow;
            const savedReserve = reserveDirty ? parseBudget(outputReserve) : latest.settings.defaultMaxTokens;
            const settings = {
                ...rest,
                ...(savedName ? { displayName: savedName } : {}),
                ...(savedTtl ? { promptCacheTtl: savedTtl } : {}),
                ...(savedContext === undefined ? {} : { contextWindow: savedContext }),
                ...(savedReserve === undefined ? {} : { defaultMaxTokens: savedReserve }),
            };
            await callSubscriptionsAuth(rpc, 'setProviderSettings', { provider, settings });
            notifyDisplayNameChange(provider, settings.displayName);
            if (alive.current)
                onClose();
        }
        catch (error) {
            if (alive.current) {
                const message = error instanceof Error ? error.message : String(error);
                setSaveError((savedEfforts ? t('modelsPartialSave') + ' ' : '') + t('accountsSaveFailed', { message }));
            }
        }
        finally {
            saveLock.current = false;
            if (alive.current)
                setSaving(false);
        }
    }
    const activeAccount = catalog?.accounts.some(account => account.key === selectedAccount)
        ? selectedAccount : catalog?.accounts[0]?.key;
    // Encode UTF-16 units rather than using raw account identifiers in DOM ids.
    const accountId = (key) => Array.from({ length: key.length }, (_, index) => key.charCodeAt(index).toString(16).padStart(4, '0')).join('') || 'empty';
    return _jsxs("dialog", { className: "dsh-subscription-manager", ref: dialog, "aria-labelledby": title, "aria-describedby": description, onCancel: event => { if (saveLock.current)
            event.preventDefault(); }, onClose: onClose, style: { width: 900, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100dvh - 32px)', overflow: 'auto' }, children: [_jsx("style", { children: providerSettingsCss }), _jsxs("div", { style: { ...stack, padding: 20 }, children: [_jsxs("header", { style: { ...actions, justifyContent: 'space-between' }, children: [_jsx("h2", { id: title, style: { margin: 0 }, children: t('accountsTitle', { provider: name }) }), _jsx("button", { type: "button", autoFocus: true, disabled: saving, onClick: onClose, children: t('imageClose') })] }), _jsx("p", { id: description, className: "dsh-subscription-hint", children: t('accountsHint') }), error && _jsx("p", { role: "alert", children: error }), loading && _jsx("p", { role: "status", className: "dsh-subscription-hint", children: t('accountsLoading') }), !loading && (!catalog || !!error) && _jsx("button", { type: "button", onClick: () => setAttempt(value => value + 1), children: t('modelDefaultsRetry') }), catalog && _jsxs("fieldset", { disabled: saving, style: { ...stack, border: 0, margin: 0, padding: 0 }, children: [_jsxs("section", { style: { ...stack, gap: 6, paddingBottom: 8 }, children: [_jsxs("div", { style: { ...actions, gap: 4 }, children: [_jsx("label", { htmlFor: displayNameId, children: _jsx("strong", { children: t('subscriptionDisplayName') }) }), _jsx(SettingHelp, { title: t('subscriptionDisplayName'), hint: t('subscriptionDisplayNameHint'), t: t, portal: false })] }), _jsxs("div", { style: actions, children: [_jsx("input", { id: displayNameId, maxLength: 80, value: displayName, placeholder: name, style: { flex: '1 1 200px' }, onChange: event => { setDisplayName(event.target.value); setNameDirty(true); } }), _jsx("button", { type: "button", disabled: !displayName, onClick: () => { setDisplayName(''); setNameDirty(true); }, children: t('displayNameReset') })] })] }), provider === 'claude' && _jsxs("section", { style: { ...stack, gap: 6, paddingBottom: 8 }, children: [_jsx("label", { htmlFor: cacheTtlId, children: _jsx("strong", { children: t('claudePromptCacheTtl') }) }), _jsxs("select", { id: cacheTtlId, value: cacheTtl, style: { justifySelf: 'start' }, onChange: event => { setCacheTtl(event.target.value); setCacheTtlDirty(true); }, children: [_jsx("option", { value: "", children: t('claudePromptCacheTtlDefault', { ttl: catalog.promptCacheTtlDefault ?? '5m' }) }), PROMPT_CACHE_TTLS.map(ttl => _jsx("option", { value: ttl, children: t(`claudePromptCacheTtl${ttl}`) }, ttl))] }), _jsx("small", { className: "dsh-subscription-hint", children: t('claudePromptCacheTtlHint') })] }), catalog.accounts.length === 0 && _jsx("p", { className: "dsh-subscription-hint", children: t('accountsEmpty') }), catalog.accounts.length > 0 && _jsx(SubscriptionTabs, { prefix: tabIdPrefix, label: t('accountsTabs'), scrollLeftLabel: t('scrollAccountsLeft'), scrollRightLabel: t('scrollAccountsRight'), active: activeAccount, onSelect: setSelectedAccount, tabRefs: tabRefs, tabs: catalog.accounts.map(account => {
                                    const alias = (changes[account.key] ?? catalog.settings.accounts?.[account.key])?.alias?.trim();
                                    return { key: account.key, id: accountId(account.key), label: alias || account.label,
                                        ariaLabel: alias ? alias + ' — ' + account.label : account.label };
                                }) }), catalog.accounts.map(account => {
                                const preferences = changes[account.key] ?? catalog.settings.accounts?.[account.key] ?? {};
                                const selected = accountPoolSelection(preferences, account.models, provider);
                                const models = accountModelRows(account, preferences, provider).sort((a, b) => b.name.localeCompare(a.name, undefined, { sensitivity: 'base', numeric: true }) || b.id.localeCompare(a.id));
                                const probeState = probes[account.key];
                                const probeResult = probeState?.running === false ? probeState.result : undefined;
                                return _jsx("div", { role: "tabpanel", id: `${tabIdPrefix}-panel-${accountId(account.key)}`, "aria-labelledby": `${tabIdPrefix}-tab-${accountId(account.key)}`, hidden: activeAccount !== account.key, tabIndex: 0, children: _jsxs("fieldset", { style: { ...stack, border, borderRadius: 'var(--dsw-radius-lg, 12px)', padding: 14, margin: 0 }, children: [_jsx("legend", { style: { padding: '0 6px', overflowWrap: 'anywhere', maxWidth: '100%' }, children: account.label }), account.unavailable && _jsx("p", { className: "dsh-subscription-hint", children: t('accountsCatalogUnavailable') }), _jsxs("label", { style: { ...stack, gap: 6 }, children: [_jsx("span", { className: "dsh-subscription-label", children: t('accountsAlias') }), _jsx("input", { value: preferences.alias ?? '', placeholder: account.label, onChange: event => {
                                                            const next = { ...preferences };
                                                            if (event.target.value.trim())
                                                                next.alias = event.target.value;
                                                            else
                                                                delete next.alias;
                                                            edit(account.key, next);
                                                        } })] }), _jsxs("label", { style: { ...stack, gap: 6 }, children: [_jsx("span", { className: "dsh-subscription-label", children: t('accountsProxy') }), _jsx("input", { value: preferences.proxy ?? '', placeholder: t('accountsProxyPlaceholder'), spellCheck: false, autoComplete: "off", autoCapitalize: "off", autoCorrect: "off", onChange: event => {
                                                            const next = { ...preferences };
                                                            if (event.target.value.trim())
                                                                next.proxy = event.target.value;
                                                            else
                                                                delete next.proxy;
                                                            edit(account.key, next);
                                                        } }), _jsx("small", { className: "dsh-subscription-hint", children: t('accountsProxyHint') })] }), _jsxs("div", { style: { ...actions, justifyContent: 'space-between' }, children: [_jsx("button", { type: "button", disabled: probeState?.running === true, onClick: () => { void probe(account.key); }, children: probeState?.running === true ? t('accountsProbeRunning') : t('accountsProbe') }), _jsx("small", { className: "dsh-subscription-hint", children: t('accountsProbeHint') })] }), probeResult !== undefined && _jsxs(_Fragment, { children: [_jsx("p", { role: probeResult.ok ? 'status' : 'alert', children: probeResult.ok
                                                            ? t(probeResult.viaProxy ? 'accountsProbeOk' : 'accountsProbeOkDirect', {
                                                                count: String(probeResult.models.length), ms: String(probeResult.latencyMs),
                                                            })
                                                            : t('accountsProbeFail', { message: probeResult.error ?? '' }) }), probeResult.ok && probeResult.models.length > 0 && _jsx("small", { className: "dsh-subscription-hint", style: { overflowWrap: 'anywhere' }, children: t('accountsProbeModels', {
                                                            models: `${probeResult.models.slice(0, PROBE_PREVIEW).join(', ')}${probeResult.models.length > PROBE_PREVIEW
                                                                ? ` (+${probeResult.models.length - PROBE_PREVIEW})` : ''}`,
                                                        }) })] }), _jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: preferences.poolEnabled !== false, onChange: event => edit(account.key, { ...preferences, poolEnabled: event.target.checked }) }), " ", t('accountsPoolEnabled')] }), _jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: preferences.independentEntry === true, onChange: event => edit(account.key, { ...preferences, independentEntry: event.target.checked }) }), " ", t('accountsIndependent')] }), _jsx("p", { className: "dsh-subscription-hint", children: t('accountsIndependentHint') }), _jsxs("details", { children: [_jsxs("summary", { style: { cursor: 'pointer', fontSize: 13 }, children: [t('accountsModels'), " \u00B7 ", preferences.poolModels === undefined
                                                                ? t('accountsModelsAll') : t('accountsModelsCount', { count: selected.size })] }), _jsxs("div", { style: { ...stack, marginTop: 12 }, children: [_jsx("p", { className: "dsh-subscription-hint", children: t('accountsModelsHint') }), _jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: preferences.poolModels === undefined, onChange: event => {
                                                                            const next = { ...preferences };
                                                                            if (event.target.checked)
                                                                                delete next.poolModels;
                                                                            else
                                                                                next.poolModels = account.models.map(model => model.id);
                                                                            edit(account.key, next);
                                                                        } }), " ", t('accountsModelsAutomatic')] }), _jsxs("div", { style: actions, children: [_jsx("button", { type: "button", onClick: () => edit(account.key, { ...preferences, poolModels: models.map(model => model.id) }), children: t('modelsSelectAll') }), _jsx("button", { type: "button", onClick: () => edit(account.key, { ...preferences, poolModels: [] }), children: t('modelsSelectNone') })] }), _jsxs("div", { style: { ...stack, gap: 8, maxHeight: 240, overflowY: 'auto' }, children: [models.map(model => _jsxs("label", { style: { overflowWrap: 'anywhere' }, children: [_jsx("input", { type: "checkbox", checked: selected.has(model.id), onChange: event => {
                                                                                    const next = new Set(selected);
                                                                                    if (event.target.checked)
                                                                                        next.add(model.id);
                                                                                    else
                                                                                        next.delete(model.id);
                                                                                    edit(account.key, { ...preferences, poolModels: [...next] });
                                                                                } }), " ", model.name, model.unavailable && ` (${t('modelsUnavailable')})`] }, model.id)), models.length === 0 && _jsx("p", { className: "dsh-subscription-hint", children: t('accountsNoModels') })] })] })] })] }) }, account.key);
                            }), provider === 'codex' && _jsxs("section", { style: { ...stack, gap: 10, paddingBottom: 8 }, children: [_jsx("h3", { style: { margin: 0 }, children: t('codexModelDefaults') }), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 12, alignItems: 'start' }, children: [_jsxs("div", { style: { ...stack, gap: 6 }, children: [_jsxs("div", { style: { ...actions, gap: 4 }, children: [_jsx("label", { htmlFor: contextWindowId, children: t('codexGlobalContext') }), _jsx(SettingHelp, { title: t('codexGlobalContext'), hint: t('codexGlobalContextHint'), t: t, portal: false })] }), _jsx("input", { id: contextWindowId, type: "text", inputMode: "numeric", value: contextWindow, placeholder: t('codexContextDefault'), "aria-describedby": budgetSubmitted && contextInvalid ? contextWindowId + '-error' : undefined, "aria-invalid": budgetSubmitted && contextInvalid || undefined, onChange: event => { setContextWindow(event.target.value); setContextDirty(true); } }), budgetSubmitted && contextInvalid && _jsx("small", { id: contextWindowId + '-error', role: "alert", children: t('codexBudgetInvalid') })] }), _jsxs("div", { style: { ...stack, gap: 6 }, children: [_jsxs("div", { style: { ...actions, gap: 4 }, children: [_jsx("label", { htmlFor: outputReserveId, children: t('codexOutputReserve') }), _jsx(SettingHelp, { title: t('codexOutputReserve'), hint: t('codexOutputReserveHint'), t: t, portal: false })] }), _jsx("input", { id: outputReserveId, type: "text", inputMode: "numeric", value: outputReserve, placeholder: t('codexBudgetDefault', { value: CODEX_DEFAULT_MAX_TOKENS.toLocaleString() }), "aria-describedby": budgetSubmitted && reserveInvalid ? outputReserveId + '-error' : undefined, "aria-invalid": budgetSubmitted && reserveInvalid || undefined, onChange: event => { setOutputReserve(event.target.value); setReserveDirty(true); } }), budgetSubmitted && reserveInvalid && _jsx("small", { id: outputReserveId + '-error', role: "alert", children: t('codexBudgetInvalid') })] })] })] })] }), _jsx(ProviderModelEditor, { ref: editor, provider: provider, rpc: rpc, t: t, disabled: saving, ...catalog === undefined ? {} : { globalContextWindow: parseBudget(contextWindow) ?? null }, onDirtyChange: setModelsDirty }), _jsxs("footer", { style: { ...stack, gap: 8, borderTop: border, padding: '14px 0 8px',
                            position: 'sticky', bottom: 0, background: 'var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1))' }, children: [saveError && _jsx("p", { role: "alert", children: saveError }), _jsxs("div", { style: { ...actions, justifyContent: 'flex-end' }, children: [_jsx("button", { type: "button", disabled: saving, onClick: onClose, children: t('cancel') }), _jsx("button", { type: "button", className: "dsh-subscription-primary", disabled: loading || saving || (!Object.keys(changes).length && !modelsDirty && !nameDirty && !cacheTtlDirty && !contextDirty && !reserveDirty), onClick: () => { void save(); }, children: saving ? t('modelDefaultsSaving') : t('modelsSave') })] })] })] })] });
}
