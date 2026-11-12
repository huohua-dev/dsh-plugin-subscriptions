import { LlmError } from '@deepseek-ai/dsh-llm';
const MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
/** Response-scoped admission: persist bytes before publishing a host image block. */
export class AntigravityOutputImages {
    attachments;
    signal;
    count = 0;
    bytes = 0;
    constructor(attachments, signal) {
        this.attachments = attachments;
        this.signal = signal;
    }
    async save(value) {
        this.signal?.throwIfAborted();
        if (value === null || typeof value !== 'object') {
            throw new LlmError('Antigravity returned invalid inlineData', 'INVALID_IMAGE_RESPONSE');
        }
        const { mimeType, data } = value;
        if (typeof mimeType !== 'string' || !MEDIA_TYPES.includes(mimeType)
            || typeof data !== 'string' || data.length === 0) {
            throw new LlmError('Antigravity returned an unsupported image MIME type or empty image', 'INVALID_IMAGE_RESPONSE');
        }
        const store = this.attachments;
        if (store === undefined) {
            throw new LlmError('Antigravity image output requires the DSH attachment store', 'UNSUPPORTED');
        }
        const limits = store.imageLimits;
        const byteBudget = Math.min(limits.maxImageBytes, limits.maxMessageImageBytes - this.bytes);
        if (this.count >= limits.maxImagesPerMessage || data.length > Math.ceil(byteBudget / 3) * 4) {
            throw new LlmError('Antigravity image output exceeds host attachment limits', 'IMAGE_OUTPUT_LIMIT');
        }
        // Buffer's decoder is permissive; require canonical, padded base64 and reject
        // data URLs, whitespace, invalid padding and truncated encodings explicitly.
        if (data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
            throw new LlmError('Antigravity returned invalid image base64', 'INVALID_IMAGE_RESPONSE');
        }
        const bytes = Buffer.from(data, 'base64');
        if (bytes.toString('base64') !== data) {
            throw new LlmError('Antigravity returned non-canonical image base64', 'INVALID_IMAGE_RESPONSE');
        }
        if (bytes.length > byteBudget) {
            throw new LlmError('Antigravity image output exceeds host attachment limits', 'IMAGE_OUTPUT_LIMIT');
        }
        if (!limits.mediaTypes.includes(mimeType)) {
            throw new LlmError('Antigravity image MIME type is disabled by the host', 'INVALID_IMAGE_RESPONSE');
        }
        // The store verifies MIME against decoded pixels, dimensions and integrity.
        // Local admission/storage failures must not penalize a subscription account.
        let attachment;
        try {
            attachment = await store.saveImage({ data: bytes, mediaType: mimeType });
        }
        catch {
            this.signal?.throwIfAborted();
            throw new LlmError('Could not validate or persist Antigravity output image', 'IMAGE_OUTPUT_STORAGE');
        }
        this.signal?.throwIfAborted();
        this.count += 1;
        this.bytes += bytes.length;
        return { type: 'image', attachment };
    }
}
