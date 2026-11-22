/**
 * DeepSeek Harness message/tool vocabulary to Antigravity's Gemini-shaped
 * v1internal request envelope, plus response/SSE translation back to the
 * harness streaming contract.
 */
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment';
import type { GenerateOptions, StreamChunk, TokenUsage, ToolSchema } from '@deepseek-ai/dsh-llm';
import type { TranslatableMessage } from './resolved.js';
/** Minimal Gemini part shape used by v1internal. */
export interface AntigravityPart {
    text?: string;
    thought?: boolean;
    thoughtSignature?: string;
    inlineData?: {
        mimeType: string;
        data: string;
    };
    functionCall?: {
        id?: string;
        name?: string;
        args?: unknown;
    };
    functionResponse?: {
        id: string;
        name: string;
        response: Record<string, unknown>;
    };
}
/**
 * Full Antigravity request envelope. Fields are declared (and serialized) in
 * protobuf field order — project(1), requestId(2), request(3), model(4),
 * userAgent(6), requestType(7) — matching the desktop client's protojson.
 */
export interface AntigravityRequest {
    project: string;
    requestId: string;
    request: {
        contents: {
            role: 'user' | 'model';
            parts: AntigravityPart[];
        }[];
        sessionId: string;
        systemInstruction?: {
            parts: {
                text: string;
            }[];
        };
        tools?: {
            functionDeclarations: Record<string, unknown>[];
        }[];
        toolConfig?: {
            functionCallingConfig: {
                mode: 'VALIDATED';
            };
        };
        generationConfig?: Record<string, unknown>;
    };
    model: string;
    userAgent: 'antigravity';
    requestType: 'agent';
}
/** Map harness tool schemas to Gemini function declarations. */
export declare function toAntigravityTools(tools: readonly ToolSchema[], model?: string): {
    functionDeclarations: Record<string, unknown>[];
}[];
/**
 * Convert resolved harness messages into Gemini contents. Function response
 * names are recovered from prior tool calls because DSH correlates results by
 * id while the Gemini wire requires both id and name.
 */
export declare function toAntigravityContents(messages: readonly TranslatableMessage[], model?: string, wireModel?: string | undefined): {
    role: 'user' | 'model';
    parts: AntigravityPart[];
}[];
/**
 * The wire `sessionId` for one harness session. The desktop language server
 * derives it by FNV-1a 64-bit hashing its conversation identifier and
 * formatting the result as a signed decimal int64, so the harness session id
 * is hashed the same way: stable per conversation, and indistinguishable in
 * shape from the client's own ids (a raw `session-...` string or UUID is
 * not a form the client ever sends).
 */
export declare function antigravitySessionId(session: string): string;
/**
 * Build one v1internal generateContent/streamGenerateContent request.
 * When forStreaming is true and the model is Claude, caps maxOutputTokens at 64000
 * to avoid INVALID_ARGUMENT errors.
 */
export declare function toAntigravityRequest(options: GenerateOptions, messages: readonly TranslatableMessage[], projectId: string, forStreaming?: boolean, wireModel?: string, profile?: {
    thinkingLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
    thinkingBudget?: number;
}): AntigravityRequest;
/** Antigravity SSE/non-stream response subset. */
export interface AntigravityResponseEvent {
    response?: {
        candidates?: {
            content?: {
                parts?: AntigravityPart[];
            };
            finishReason?: string;
        }[];
        usageMetadata?: {
            promptTokenCount?: number;
            candidatesTokenCount?: number;
            thoughtsTokenCount?: number;
            totalTokenCount?: number;
            cachedContentTokenCount?: number;
        };
    };
}
/** Map Gemini usage metadata to the harness's disjoint counters. */
export declare function mapAntigravityUsage(metadata: NonNullable<NonNullable<AntigravityResponseEvent['response']>['usageMetadata']>): TokenUsage;
/** Push translator for both parsed SSE events and one non-stream response. */
export declare class AntigravityStreamTranslator {
    private blocks;
    private closed;
    private nextIndex;
    private sawContent;
    private sawThoughtImage;
    private sawReasoning;
    private sawToolCall;
    terminated: boolean;
    private usage;
    private readonly images;
    constructor(attachments?: AttachmentStore, signal?: AbortSignal);
    private open;
    private close;
    private closeAll;
    private finish;
    /** Process one decoded Antigravity response frame. */
    push(event: AntigravityResponseEvent): Promise<StreamChunk[]>;
}
/** Consume Antigravity's SSE response into the DSH streaming contract. */
export declare function streamAntigravity(stream: ReadableStream<Uint8Array>, onActivity?: () => void, attachments?: AttachmentStore, signal?: AbortSignal): AsyncGenerator<StreamChunk>;
/** Translate a non-stream generateContent response using the same state machine. */
export declare function parseAntigravityResponse(event: AntigravityResponseEvent, attachments?: AttachmentStore, signal?: AbortSignal): Promise<StreamChunk[]>;
