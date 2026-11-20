import type { ToolCallBlock } from '@deepseek-ai/dsh-client-ui-conversation/client';
/** Read during render: the host republishes preparing calls when observed answers change. */
export declare function mediaArguments(block: ToolCallBlock): {
    prompt: string;
    references: number;
};
