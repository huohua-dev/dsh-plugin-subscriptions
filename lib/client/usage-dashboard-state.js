export function initialUsageDashboardState() {
    return {
        phase: 'loading',
        request: { provider: 'all', account: 'all', range: '30d' },
        distributionMode: 'model',
        load: 0,
        clearErrors: [],
    };
}
function reload(state, request) {
    const { error: _error, ...rest } = state;
    return { ...rest, phase: 'loading', request, load: state.load + 1 };
}
export function usageDashboardReducer(state, action) {
    switch (action.type) {
        case 'loaded': {
            const { error: _error, selectedDate, ...rest } = state;
            const keepDate = selectedDate !== undefined && action.response.heatmap.some(day => day.date === selectedDate);
            return {
                ...rest,
                ...keepDate ? { selectedDate } : {},
                phase: 'shown',
                response: action.response,
            };
        }
        case 'failed':
            return { ...state, phase: 'error', error: action.message };
        case 'provider': {
            if (state.request.provider === action.provider && state.request.account === 'all')
                return state;
            const next = reload(state, { ...state.request, provider: action.provider, account: 'all' });
            // Auto-switch distribution to 'model' when narrowing to a single provider so the chart stays informative.
            return action.provider !== 'all' && state.distributionMode === 'provider'
                ? { ...next, distributionMode: 'model' }
                : next;
        }
        case 'account': {
            if (state.request.account === action.account)
                return state;
            return reload(state, { ...state.request, account: action.account });
        }
        case 'providerAccount': {
            if (state.request.provider === action.provider && state.request.account === action.account)
                return state;
            const next = reload(state, { ...state.request, provider: action.provider, account: action.account });
            return state.distributionMode === 'provider' ? { ...next, distributionMode: 'model' } : next;
        }
        case 'range': {
            if (state.request.range === action.range)
                return state;
            return reload(state, { ...state.request, range: action.range });
        }
        case 'resetFilters':
            return reload(state, { provider: 'all', account: 'all', range: 'all' });
        case 'distribution':
            return state.distributionMode === action.mode ? state : { ...state, distributionMode: action.mode };
        case 'selectDate': {
            const { selectedDate: current, ...rest } = state;
            if (action.date === undefined || action.date === current)
                return rest;
            return { ...rest, selectedDate: action.date };
        }
        case 'refresh':
        case 'retry':
            return reload(state, state.request);
        case 'cleared': {
            const { selectedDate: _date, ...rest } = reload(state, state.request);
            return { ...rest, clearErrors: action.clearErrors };
        }
    }
}
export const CLEAR_CONFIRM_OPEN = { phase: 'open' };
/** Cancel and success close the confirmation, so they are the caller's, not states here. */
export function clearConfirmReducer(state, action) {
    switch (action.type) {
        case 'confirm':
            return state.phase === 'clearing' ? state : { phase: 'clearing' };
        case 'failed':
            return { phase: 'failed', error: action.message };
    }
}
