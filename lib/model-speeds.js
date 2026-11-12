/** Durable composer speed choices, separate from Settings-page subagent defaults. */
import { readFileSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';
/** Per-model composer preferences; publish changes only after the atomic save. */
export class ModelSpeeds {
    path;
    current = new Map();
    writes = Promise.resolve();
    constructor(path = dshHomePath('plugins', 'subscriptions', 'model-speeds.json')) {
        this.path = path;
        try {
            const raw = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
            if (!raw || typeof raw !== 'object' || Array.isArray(raw))
                throw new Error('expected model-to-speed map');
            for (const [model, tier] of Object.entries(raw)) {
                if (!model.trim() || (tier !== 'standard' && tier !== 'fast'))
                    throw new Error('invalid model speed');
                this.current.set(model, tier);
            }
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw new Error(`Cannot read model speeds at ${path}`, { cause: error });
        }
    }
    get(model) {
        return this.current.get(model);
    }
    set(model, tier) {
        const run = this.writes.then(async () => {
            const next = new Map(this.current).set(model, tier);
            await mkdir(dirname(this.path), { recursive: true });
            const temporary = `${this.path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
            try {
                await writeFile(temporary, JSON.stringify(Object.fromEntries(next), null, 2), { mode: 0o600 });
                await rename(temporary, this.path);
            }
            finally {
                await rm(temporary, { force: true });
            }
            this.current = next;
        });
        this.writes = run.catch(() => undefined);
        return run;
    }
}
