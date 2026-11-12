import type { AttachmentStore } from '@deepseek-ai/dsh-attachment';
import type { ImageBlock } from '@deepseek-ai/dsh-llm';
/** Response-scoped admission: persist bytes before publishing a host image block. */
export declare class AntigravityOutputImages {
    private readonly attachments?;
    private readonly signal?;
    private count;
    private bytes;
    constructor(attachments?: AttachmentStore | undefined, signal?: AbortSignal | undefined);
    save(value: unknown): Promise<ImageBlock>;
}
