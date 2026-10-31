/**
 * Last-known Muse Code subscription usage per account, persisted at
 * `~/.dsh/plugins/subscriptions/muse-usage.json`.
 *
 * Meta's key mint — the only usage source that costs no quota — reports usage
 * only while a 5-hour window is running. Once an account sits idle past that,
 * the mint is silent about the weekly lane too, so the Settings page had
 * nothing to show (and its Refresh button nothing to refresh) until the
 * account was used again. The weekly lane cannot move without a request, and
 * every request reports usage (stream frame) and reopens the mint's report,
 * so the last value Meta disclosed is exact until its reset.
 *
 * This file is a cache: a missing, corrupt, or malformed file reads as empty,
 * and writes are best effort.
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';
/** Absolute path of the usage memo file. */
export function museUsageFilePath() {
    return dshHomePath('plugins', 'subscriptions', 'muse-usage.json');
}
/** Keep one window only when it carries a usable percentage. */
function sanitizeWindow(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return undefined;
    const raw = value;
    if (typeof raw.used_percent !== 'number' || !Number.isFinite(raw.used_percent))
        return undefined;
    const finite = (field) => typeof field === 'number' && Number.isFinite(field);
    return {
        used_percent: raw.used_percent,
        ...finite(raw.window_duration_mins) ? { window_duration_mins: raw.window_duration_mins } : {},
        ...finite(raw.resets_at) ? { resets_at: raw.resets_at } : {},
    };
}
/** Validate one remembered usage; undefined when it holds no usable window. */
function sanitizeUsage(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return undefined;
    const raw = value;
    const window = sanitizeWindow(raw.window);
    const weekly = sanitizeWindow(raw.weekly);
    if (window === undefined && weekly === undefined)
        return undefined;
    return {
        ...window === undefined ? {} : { window },
        ...weekly === undefined ? {} : { weekly },
        ...typeof raw.tier === 'string' ? { tier: raw.tier } : {},
    };
}
/** Per-account usage memo over one JSON file. */
export class MuseUsageMemo {
    path;
    /** Usage reported in this process; wins over whatever the file held. */
    reported = new Map();
    disk;
    writes = Promise.resolve();
    constructor(path = museUsageFilePath()) {
        this.path = path;
    }
    /** The memory view the usage fetcher of one account reads and feeds. */
    forAccount(account) {
        return {
            recall: () => this.recall(account),
            remember: (usage) => { this.remember(account, usage); },
        };
    }
    /** The last usage Meta reported for the account, if any. */
    async recall(account) {
        return this.reported.get(account) ?? (await this.load()).get(account);
    }
    /**
     * Record a usage report. A report missing one lane keeps the remembered
     * value of that lane. Persisted in the background; a failed write only
     * costs the memo across a restart.
     */
    remember(account, usage) {
        const next = sanitizeUsage(usage);
        if (next === undefined)
            return;
        // A sanitized report omits a missing lane entirely, so the spread keeps the prior one.
        const merged = { ...this.reported.get(account), ...next };
        this.reported.set(account, merged);
        this.writes = this.writes.then(() => this.persist(account, merged)).catch(() => undefined);
    }
    /** Settle pending writes (tests). */
    flush() {
        return this.writes;
    }
    load() {
        this.disk ??= readFile(this.path, 'utf8').then((text) => {
            const entries = new Map();
            let parsed;
            try {
                parsed = JSON.parse(text);
            }
            catch {
                return entries;
            }
            if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
                return entries;
            for (const [account, value] of Object.entries(parsed)) {
                const usage = sanitizeUsage(value);
                if (usage !== undefined)
                    entries.set(account, usage);
            }
            return entries;
        }, () => new Map());
        return this.disk;
    }
    async persist(account, usage) {
        const disk = await this.load();
        if (JSON.stringify(disk.get(account)) === JSON.stringify(usage))
            return;
        disk.set(account, usage);
        await mkdir(dirname(this.path), { recursive: true });
        const tmp = `${this.path}.tmp-${String(process.pid)}-${Math.random().toString(36).slice(2)}`;
        try {
            await writeFile(tmp, JSON.stringify(Object.fromEntries(disk), null, 2));
            await rename(tmp, this.path);
        }
        catch (error) {
            await rm(tmp, { force: true });
            throw error;
        }
    }
}
