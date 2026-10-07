import { useComposer } from "@get-bb/plugin-sdk/app";
export function useComposerFocus() { return useComposer().focus; }
export function showTerminal(id: string) { localStorage.setItem("native-selected-panel", id); }
