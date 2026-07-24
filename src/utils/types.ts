import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export type DomainName = 'incidents' | 'alerts' | 'schedules' | 'org';

export type CallToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

export interface DomainHandler {
  getTools(): Tool[];
  handleCall(
    toolName: string,
    args: Record<string, unknown>,
    token?: string
  ): Promise<CallToolResult>;
}

export type NavigationState = {
  currentDomain: DomainName | null;
};
