import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { callSubscriptionsAuth } from './subscriptions-rpc.js';
import { contextWindowChoice, formatWindowLabel, modelEditorState, pruneDefaultContextOverrides, savedModelIds } from './model-filter.js';
import { SettingHelp } from './SettingHelp.js';
import { ProviderRefreshButton } from './ProviderRefreshButton.js';
const border = '0.5px solid var(--dsw-alias-border-l2, #ddd)';
const actions = { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' };
/** Decorative symbols complement the existing translated labels. */
function ToolIcon({ tool }) {
    return _jsx("svg", { "aria-hidden": "true", width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round", style: { flex: '0 0 auto', marginTop: 2 }, children: tool === 'image_generate' ? _jsxs(_Fragment, { children: [_jsx("rect", { x: "3", y: "4", width: "18", height: "16", rx: "2" }), _jsx("circle", { cx: "8", cy: "9", r: "1.5" }), _jsx("path", { d: "m4 18 5-5 3 3 3-4 5 6" })] })
            : tool === 'video_generate' ? _jsxs(_Fragment, { children: [_jsx("rect", { x: "3", y: "5", width: "13", height: "14", rx: "2" }), _jsx("path", { d: "m16 10 5-3v10l-5-3z" })] })
                : tool === 'web_search' ? _jsxs(_Fragment, { children: [_jsx("circle", { cx: "12", cy: "12", r: "9" }), _jsx("path", { d: "M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" })] })
                    : _jsxs(_Fragment, { children: [_jsx("path", { d: "M5 4 19 20M19 4 5 20" }), _jsx("circle", { cx: "18", cy: "18", r: "3" }), _jsx("path", { d: "m20.2 20.2 1.8 1.8" })] }) });
}
/**
 * Embedded section of the account manager dialog. It owns the model draft
 * (visibility, effort, context, tools) but not its submission: the dialog
 * collects the draft through the handle and saves it with the account edits
 * in one go, so there is a single Save/Cancel pair.
 */
export const ProviderModelEditor = forwardRef(function ProviderModelEditor({ provider, rpc, t, disabled = false, globalContextWindow, onDirtyChange }, ref) {
    const [catalog, setCatalog] = useState();
    const [draft, setDraft] = useState({});
    const [contexts, setContexts] = useState({});
    const [efforts, setEfforts] = useState({});
    const [query, setQuery] = useState('');
    const [expanded, setExpanded] = useState(() => new Set());
    const [revealedInvalidModel, setRevealedInvalidModel] = useState();
    const [editingName, setEditingName] = useState();
    const idPrefix = useId();
    const [busy, setBusy] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [error, setError] = useState('');
    const generation = useRef(0);
    useEffect(() => () => { generation.current++; }, []);
    useEffect(() => { onDirtyChange?.(dirty); }, [dirty]);
    function reset(data) {
        setCatalog(data);
        setExpanded(new Set());
        setRevealedInvalidModel(undefined);
        setDraft(data.settings);
        setEfforts(Object.fromEntries(data.models.map(model => [model.id, model.configured ?? ''])));
        setContexts(Object.fromEntries(Object.entries(data.settings.contextWindows ?? {}).map(([id, value]) => [id, String(value)])));
        setDirty(false);
    }
    async function load(force = false) {
        const request = ++generation.current;
        setBusy(true);
        setError('');
        try {
            const data = await callSubscriptionsAuth(rpc, 'providerSettings', { provider, force });
            if (generation.current === request)
                reset(data);
        }
        catch (error) {
            if (generation.current === request)
                setError(String(error instanceof Error ? error.message : error));
        }
        finally {
            if (generation.current === request)
                setBusy(false);
        }
    }
    function edit(next) { setDraft(next); setDirty(true); }
    /** A saved grok context override that differs from the advertised default. */
    function hasGrokContextOverride(model) {
        const saved = Object.hasOwn(draft.contextWindows ?? {}, model.id) ? draft.contextWindows[model.id] : undefined;
        return saved !== undefined && saved !== model.defaultContextWindow;
    }
    /** Catalog-driven window picker (issue #149): tiers come from the live grok catalog. */
    function grokContextPicker(model) {
        const choice = contextWindowChoice(contexts[model.id] ?? '', model);
        return _jsxs("div", { style: actions, children: [_jsxs("label", { style: actions, children: [t('modelsContextWindow'), _jsxs("select", { "aria-label": `${model.name} ${t('modelsContextWindow')}`, value: choice.value, onChange: event => {
                                setContexts({ ...contexts, [model.id]: event.target.value });
                                setDirty(true);
                            }, children: [_jsx("option", { value: "", children: t('modelsContextFollow', { default: formatWindowLabel(model.defaultContextWindow) }) }), choice.tiers.map(tier => _jsx("option", { value: String(tier), children: formatWindowLabel(tier) }, tier)), choice.unavailable !== undefined && _jsx("option", { value: String(choice.unavailable), disabled: true, children: t('modelsContextUnavailableOption', { value: formatWindowLabel(choice.unavailable) }) })] })] }), _jsx("small", { children: t('modelsContextBounds', {
                        default: formatWindowLabel(model.defaultContextWindow), max: formatWindowLabel(model.maxContextWindow),
                    }) })] });
    }
    useEffect(() => { void load(); }, [provider, rpc]);
    useImperativeHandle(ref, () => ({
        collect() {
            if (!catalog || !dirty)
                return { efforts: [] };
            const windows = Object.create(null);
            for (const [model, text] of Object.entries(contexts)) {
                if (!text.trim())
                    continue;
                const value = Number(text);
                if (!/^\d+$/.test(text.trim()) || !Number.isSafeInteger(value) || value <= 0) {
                    setExpanded(previous => new Set(previous).add(model));
                    setRevealedInvalidModel(model);
                    setError(t('modelsContextInvalid', { model }));
                    return undefined;
                }
                windows[model] = value;
            }
            setError('');
            setRevealedInvalidModel(undefined);
            // A saved grok value equal to the advertised default is rendered as
            // "follow provider"; persist that choice by dropping the key, never by
            // pinning it. Keep Codex's explicit numeric overrides intact.
            const keptWindows = provider === 'grok'
                ? pruneDefaultContextOverrides(windows, catalog.models)
                : windows;
            const { accounts: _accounts, ...settings } = { ...draft, ...(provider === 'codex' || provider === 'grok' ? { contextWindows: keptWindows } : {}) };
            return {
                settings,
                efforts: catalog.models.flatMap(model => {
                    const effort = efforts[model.id] ?? '';
                    return effort === (model.configured ?? '') || !model.efforts?.length ? [] : [{ model: model.id, effort }];
                }),
            };
        },
    }), [catalog, dirty, draft, contexts, efforts, provider]);
    const allModels = catalog?.models ?? [];
    const known = new Set(allModels.map(model => model.id));
    const savedIds = savedModelIds(draft.visibleModels, draft.modelDisplayNames, draft.subagentSpeeds);
    const missing = savedIds.filter(id => !known.has(id)).map(id => ({ id, name: id }));
    const customName = (id) => Object.hasOwn(draft.modelDisplayNames ?? {}, id) ? draft.modelDisplayNames[id] : '';
    const editName = (id, value) => {
        const names = Object.assign(Object.create(null), draft.modelDisplayNames);
        if (value.trim())
            names[id] = value;
        else
            delete names[id];
        edit({ ...draft, modelDisplayNames: names });
    };
    const displayName = (model) => customName(model.id).trim() || model.name;
    const models = [...allModels, ...missing]
        .filter(model => model.id === editingName || model.id === revealedInvalidModel || `${model.name} ${model.id} ${customName(model.id)}`.toLowerCase().includes(query.trim().toLowerCase()))
        .sort((a, b) => displayName(b).localeCompare(displayName(a), undefined, { sensitivity: 'base', numeric: true }) || b.id.localeCompare(a.id));
    const editorState = modelEditorState({
        discovered: allModels.length,
        saved: missing.length,
        matched: models.length,
        accounts: catalog?.accounts ?? [],
    });
    const selected = new Set(draft.visibleModels ?? allModels.map(model => model.id));
    const codexContextDefault = (max, effective) => globalContextWindow === undefined ? effective ?? max : Math.min(globalContextWindow ?? max, max);
    const modelDescriptionId = (id) => idPrefix + '-model-id-' + Array.from({ length: id.length }, (_, i) => id.charCodeAt(i).toString(16).padStart(4, '0')).join('');
    return _jsxs("div", { style: { borderTop: border, marginTop: 12, paddingTop: 12 }, children: [_jsxs("div", { style: { ...actions, gap: 4 }, children: [_jsx("h3", { style: { margin: 0 }, children: t('modelsEdit') }), _jsx(SettingHelp, { title: t('modelsEdit'), hint: t('modelsHint'), t: t, portal: false }), _jsx(ProviderRefreshButton, { label: t('usageRefresh'), disabled: busy || disabled || dirty, onClick: () => { void load(true); } }), busy && _jsx("span", { role: "status", children: t('modelDefaultsLoading') })] }), _jsxs("div", { style: { display: 'grid', gap: 12, marginTop: 12 }, children: [error && _jsx("p", { role: "alert", children: error }), catalog && _jsxs("fieldset", { disabled: busy || disabled, style: { border: 0, padding: 0, margin: 0, minWidth: 0, display: 'grid', gap: 12 }, children: [_jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: draft.visibleModels === undefined, onChange: event => {
                                            const next = { ...draft };
                                            if (event.target.checked)
                                                delete next.visibleModels;
                                            else
                                                next.visibleModels = allModels.map(model => model.id);
                                            edit(next);
                                        } }), " ", t('modelsAutomatic')] }), editorState.listState === 'provider-empty' ? _jsx("p", { className: "dsh-subscription-hint", children: t(editorState.noticeKey) }) : _jsxs(_Fragment, { children: [_jsxs("div", { style: actions, children: [_jsx("input", { style: { flex: '1 1 180px' }, value: query, onChange: event => { setQuery(event.target.value); setRevealedInvalidModel(undefined); }, placeholder: t('modelDefaultsFilterPlaceholder'), "aria-label": t('modelDefaultsFilterPlaceholder') }), _jsx("button", { type: "button", onClick: () => edit({ ...draft, visibleModels: allModels.map(model => model.id) }), children: t('modelsSelectAll') }), _jsx("button", { type: "button", onClick: () => edit({ ...draft, visibleModels: [] }), children: t('modelsSelectNone') })] }), _jsxs("div", { style: { maxHeight: 360, overflowY: 'auto', display: 'grid', gap: 0, alignContent: 'start' }, children: [models.map(model => _jsxs("div", { style: { borderBottom: expanded.has(model.id) ? border : 'none', padding: expanded.has(model.id) ? '2px 2px 10px' : '2px', display: 'grid', gap: expanded.has(model.id) ? 8 : 0 }, children: [_jsxs("div", { style: { ...actions, flexWrap: 'nowrap', minWidth: 0 }, children: [_jsx("input", { type: "checkbox", "aria-describedby": modelDescriptionId(model.id), "aria-label": `${displayName(model)}${!known.has(model.id) ? ` (${t('modelsUnavailable')})` : ''}`, checked: selected.has(model.id), onChange: event => {
                                                                    const next = new Set(selected);
                                                                    if (event.target.checked)
                                                                        next.add(model.id);
                                                                    else
                                                                        next.delete(model.id);
                                                                    edit({ ...draft, visibleModels: [...next] });
                                                                } }), _jsxs("button", { type: "button", "aria-labelledby": modelDescriptionId(model.id) + '-name', "aria-describedby": modelDescriptionId(model.id), "aria-expanded": expanded.has(model.id), onClick: () => setExpanded(previous => {
                                                                    const next = new Set(previous);
                                                                    if (next.has(model.id))
                                                                        next.delete(model.id);
                                                                    else
                                                                        next.add(model.id);
                                                                    return next;
                                                                }), className: "dsh-subscription-model-toggle", children: [_jsxs("span", { className: "dsh-subscription-model-name", id: modelDescriptionId(model.id) + '-name', children: [displayName(model), !known.has(model.id) && ` (${t('modelsUnavailable')})`] }), _jsxs("span", { className: "dsh-subscription-model-id", id: modelDescriptionId(model.id), children: ["ID: ", model.id] }), _jsxs("span", { className: "dsh-subscription-model-action", "aria-hidden": "true", children: [t(expanded.has(model.id) ? 'modelsCollapse' : 'modelsExpand'), _jsx("svg", { width: "16", height: "16", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: expanded.has(model.id) ? 'm4 10 4-4 4 4' : 'm4 6 4 4 4-4' }) })] })] })] }), expanded.has(model.id) && _jsxs(_Fragment, { children: [_jsxs("div", { style: actions, children: [_jsxs("label", { style: { display: 'grid', gap: 6, flex: '1 1 200px', minWidth: 0 }, children: [_jsx("span", { style: { fontSize: 12 }, children: t('modelDisplayName') }), _jsx("input", { maxLength: 80, "aria-label": `${model.name} ${t('modelDisplayName')}`, placeholder: model.name, value: customName(model.id), onFocus: () => setEditingName(model.id), onBlur: () => setEditingName(undefined), onChange: event => editName(model.id, event.target.value) })] }), _jsx("button", { type: "button", style: { alignSelf: 'end' }, "aria-label": `${model.name} ${t('displayNameReset')}`, disabled: !customName(model.id), onClick: () => editName(model.id, ''), children: t('displayNameReset') })] }), _jsx("small", { style: { color: 'var(--dsw-alias-label-tertiary)' }, children: t('modelDisplayNameHint') }), _jsxs("div", { style: actions, children: [(model.efforts?.length ?? 0) > 0 && _jsxs("label", { style: actions, children: [t('modelDefaultsTitle'), _jsxs("select", { "aria-label": `${model.name} ${t('modelDefaultsTitle')}`, value: efforts[model.id] ?? '', onChange: event => {
                                                                                    setEfforts({ ...efforts, [model.id]: event.target.value });
                                                                                    setDirty(true);
                                                                                }, children: [_jsx("option", { value: "", children: t('modelDefaultsFollowProvider') }), model.configured && !model.efforts?.some(effort => effort.id === model.configured) &&
                                                                                        _jsxs("option", { value: model.configured, disabled: true, children: [model.configured, " (", t('modelsUnavailable'), ")"] }), model.efforts?.map(effort => _jsx("option", { value: effort.id, children: effort.name }, effort.id))] })] }), provider === 'codex' && model.maxContextWindow !== undefined && _jsxs("div", { style: actions, children: [_jsxs("label", { style: actions, children: [t('modelsContext'), _jsx("input", { style: { width: 140 }, inputMode: "numeric", value: contexts[model.id] ?? '', "aria-label": `${model.name} ${t('modelsContext')}`, placeholder: String(codexContextDefault(model.maxContextWindow, model.defaultContextWindow)), onChange: event => { setContexts({ ...contexts, [model.id]: event.target.value }); setDirty(true); } })] }), _jsx("small", { children: t(typeof globalContextWindow === 'number' ? 'modelsGlobalContextBounds' : 'modelsCodexContextBounds', {
                                                                                    default: codexContextDefault(model.maxContextWindow, model.defaultContextWindow),
                                                                                    standard: model.standardContextWindow ?? model.defaultContextWindow ?? model.maxContextWindow,
                                                                                    max: model.maxContextWindow,
                                                                                }) })] }), provider === 'grok' && model.defaultContextWindow !== undefined
                                                                        && ((model.contextWindowOptions?.length ?? 0) > 1 || hasGrokContextOverride(model))
                                                                        && grokContextPicker(model)] }), provider === 'codex' && (model.fastTier || Object.hasOwn(draft.subagentSpeeds ?? {}, model.id)) && _jsx("div", { style: { display: 'grid', gap: 6 }, children: _jsxs("div", { style: actions, children: [_jsxs("label", { style: actions, children: [t('modelsSubagentSpeed'), _jsxs("select", { "aria-label": `${model.name} ${t('modelsSubagentSpeed')}`, value: Object.hasOwn(draft.subagentSpeeds ?? {}, model.id) ? draft.subagentSpeeds[model.id] : 'standard', onChange: event => edit({ ...draft, subagentSpeeds: {
                                                                                            ...draft.subagentSpeeds, [model.id]: event.target.value,
                                                                                        } }), children: [_jsx("option", { value: "standard", children: t('speedStandard') }), _jsxs("option", { value: "fast", disabled: !model.fastTier, children: [t('speedFast'), !model.fastTier && ` (${t('modelsUnavailable')})`] })] })] }), _jsx(SettingHelp, { title: `${model.name} ${t('modelsSubagentSpeed')}`, hint: t('modelsSubagentSpeedHint'), t: t, portal: false })] }) })] })] }, model.id)), models.length === 0 && _jsx("span", { children: t('modelDefaultsFilterEmpty', { query }) })] })] }), provider === 'codex' && _jsx("small", { children: t('modelsContextHint') }), provider === 'grok' && _jsx("small", { children: t('modelsContextGrokHint') }), catalog.tools.length > 0 && _jsxs("div", { style: { display: 'grid', gap: 8 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 4 }, children: [_jsx("strong", { children: t('modelsTools') }), _jsx(SettingHelp, { title: t('modelsTools'), hint: t('modelsToolsHint'), t: t, portal: false })] }), _jsx("div", { className: "dsh-subscription-tools", children: catalog.tools.map(tool => _jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: draft.tools?.[tool] !== false, onChange: event => edit({
                                                        ...draft, tools: { ...draft.tools, [tool]: event.target.checked },
                                                    }) }), _jsx(ToolIcon, { tool: tool }), _jsx("span", { children: t(tool === 'image_generate' ? 'modelsImage' : tool === 'video_generate' ? 'modelsVideo' : tool === 'web_search' ? 'modelsWebSearch' : 'modelsSearch') })] }, tool)) })] })] })] })] });
});
