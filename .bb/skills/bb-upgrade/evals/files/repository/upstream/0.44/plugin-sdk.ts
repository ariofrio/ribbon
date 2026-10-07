export const version = "0.5.29";
export interface Composer { focus(): void; }
export declare function useComposerView(): { scope: { kind: "thread"; threadId: string } };
export type ServiceTier = "default" | "fast";
export interface Rpc { register(handlers: Record<string, (input: unknown) => unknown>): void; }
export const automaticTitleOrder = ["provider-codex", "bb-ai"];
