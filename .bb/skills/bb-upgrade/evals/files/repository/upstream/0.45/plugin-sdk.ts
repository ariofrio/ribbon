export const version = "0.6.15";
export interface Composer { scope: { kind: "thread"; threadId: string }; focus(): void; insert(text: string): void; submit(options: {sendAt: number}): Promise<void>; }
export declare function useComposer(): Composer;
export declare function useComposers(): readonly Composer[];
export type ServiceTier = string;
export interface CallerContext { experimental_caller: { kind: "client" } | { kind: "plugin"; pluginId: string } }
export interface Rpc { register(handlers: Record<string, (input: unknown, context: CallerContext) => unknown>): void; }
export const automaticTitleOrder = "bb-ai first, then all services by plugin id and service id";
// No public terminal tab selection, panel visibility or focus API.
