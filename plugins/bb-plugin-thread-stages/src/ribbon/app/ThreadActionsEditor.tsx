import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { ThreadAction } from "../thread-actions-store";
import { useRibbonData } from "./data";

const emptyAction = (): ThreadAction => ({ id: crypto.randomUUID(), label: "", prompt: "" });
const isEmpty = ({ label, prompt }: ThreadAction) => !label.trim() && !prompt.trim();
const withEmptyRow = (actions: ThreadAction[]) =>
  actions.length === 0 || !isEmpty(actions[actions.length - 1]!) ? [...actions, emptyAction()] : actions;

function expandPrompt(field: HTMLTextAreaElement) {
  field.style.height = "auto";
  const minimum = Number.parseFloat(getComputedStyle(field).minHeight);
  field.style.height = `${Math.min(144, Math.max(minimum, field.scrollHeight + 2))}px`;
}

/** Labeled prompts edited in a thread's menu and drawn as buttons on its row. */
export function ThreadActionsEditor({ threadId, onExit, onTabBoundary }: {
  threadId: string;
  onExit?: () => void;
  onTabBoundary?: () => void;
}) {
  const ribbon = useRibbonData();
  const [actions, setActions] = useState<ThreadAction[]>(
    () => withEmptyRow([...(ribbon?.threadActions.get(threadId)?.actions ?? [])]),
  );
  const [error, setError] = useState<string | null>(null);
  const draft = useRef(actions);
  const saved = useRef(ribbon?.threadActions.get(threadId)?.actions ?? []);
  const queue = useRef(Promise.resolve());
  const mounted = useRef(false);
  const labelFields = useRef(new Map<string, HTMLInputElement>());
  const focusAfterRemoval = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (focusAfterRemoval.current === null) return;
    labelFields.current.get(focusAfterRemoval.current)?.focus();
    focusAfterRemoval.current = null;
  }, [actions]);
  const saveThreadActions = ribbon?.saveThreadActions;
  const flush = useCallback(() => {
    queue.current = queue.current.then(async () => {
      if (!saveThreadActions) return;
      const snapshot = draft.current;
      const next = snapshot.flatMap((action) => {
        const label = action.label.trim();
        const prompt = action.prompt.trim();
        if (prompt) return [{ ...action, label, prompt }];
        // Keep a saved action while its prompt is being edited to an empty value.
        const previous = !isEmpty(action) && saved.current.find(({ id }) => id === action.id);
        return previous ? [previous] : [];
      });
      if (JSON.stringify(next) === JSON.stringify(saved.current)) return;
      try {
        await saveThreadActions(threadId, next);
        saved.current = next;
        if (mounted.current) setError(null);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Could not save thread actions";
        if (mounted.current) setError(message);
        else toast.error(message);
      }
    });
  }, [saveThreadActions, threadId]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      flush();
    };
  }, [flush]);
  const changeActions = (next: ThreadAction[]) => {
    draft.current = withEmptyRow(next);
    setActions(draft.current);
    flush();
  };
  if (ribbon === null) return null;
  return (
    <form
      aria-label="Edit thread actions"
      className="space-y-2 [&_tr:focus-within>td]:bg-state-hover [&:not(:focus-within)_tr:hover>td]:bg-state-hover"
      onKeyDown={(event) => {
        // Text editing stays in the form; Escape returns to its parent menu.
        if (event.key === "Tab" && !event.altKey && !event.ctrlKey && !event.metaKey) {
          const fields = [...event.currentTarget.querySelectorAll<HTMLElement>("input, textarea, button")];
          const index = fields.indexOf(event.target as HTMLElement);
          const next = fields[index + (event.shiftKey ? -1 : 1)];
          const leave = onTabBoundary ?? onExit;
          if (next || leave) {
            event.preventDefault();
            event.stopPropagation();
            if (next) {
              next.focus();
              if (next instanceof HTMLInputElement) next.select();
            } else leave?.();
            return;
          }
        }
        if (event.key === "Escape" && onExit) {
          event.preventDefault();
          event.stopPropagation();
          onExit();
          return;
        }
        if (event.key !== "Escape") event.stopPropagation();
      }}
      onBlur={(event) => {
        const lastFilled = draft.current.reduce((last, action, index) => isEmpty(action) ? last : index, -1);
        const emptyRows = draft.current.slice(lastFilled + 1);
        if (emptyRows.length > 1) {
          const nextRowId = event.relatedTarget instanceof HTMLElement
            ? event.relatedTarget.closest("tr")?.getAttribute("data-action-id") : null;
          const keep = emptyRows.find(({ id }) => id === nextRowId) ?? emptyRows[0]!;
          draft.current = [...draft.current.slice(0, lastFilled + 1), keep];
          setActions(draft.current);
        }
        flush();
      }}
      onSubmit={(event) => {
        event.preventDefault();
        flush();
      }}
    >
      <Table aria-label="Thread actions" className="table-fixed border-separate border-spacing-0">
        <TableBody>
          {actions.map((action, index) => (
            <TableRow key={action.id} data-action-id={action.id} className="border-0 hover:bg-transparent">
              <TableCell className="w-[32%] rounded-l-sm p-0 align-top">
                <Input
                  aria-label={`Action ${index + 1} button label`}
                  className="h-[1.625rem] rounded-sm border-transparent px-[0.4375rem] py-1 text-xs leading-4 focus-visible:border-input focus-visible:ring-0 max-md:pointer-coarse:h-[2.625rem] max-md:pointer-coarse:py-2 max-md:pointer-coarse:leading-6"
                  ref={(field) => {
                    if (field) labelFields.current.set(action.id, field);
                    else labelFields.current.delete(action.id);
                  }}
                  maxLength={24}
                  placeholder="Button label"
                  value={action.label}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      event.currentTarget.closest("tr")?.querySelector("textarea")?.focus();
                    }
                  }}
                  onChange={(event) => changeActions(draft.current.map((item) =>
                    item.id === action.id ? { ...item, label: event.target.value } : item,
                  ))}
                />
              </TableCell>
              <TableCell className="p-0 align-top">
                <Textarea
                  aria-label={`Action ${index + 1} prompt`}
                  className="h-[1.625rem] min-h-[1.625rem] resize-none rounded-sm border-transparent px-[0.4375rem] py-1 text-xs leading-4 focus-visible:border-input focus-visible:ring-0 max-md:pointer-coarse:h-[2.625rem] max-md:pointer-coarse:min-h-[2.625rem] max-md:pointer-coarse:py-2 max-md:pointer-coarse:leading-6"
                  rows={1}
                  maxLength={10000}
                  placeholder="Prompt to send"
                  value={action.prompt}
                  onFocus={(event) => expandPrompt(event.currentTarget)}
                  onBlur={(event) => { event.currentTarget.style.height = ""; }}
                  onChange={(event) => {
                    changeActions(draft.current.map((item) =>
                      item.id === action.id ? { ...item, prompt: event.target.value } : item,
                    ));
                    expandPrompt(event.currentTarget);
                  }}
                />
              </TableCell>
              <TableCell className="w-[1.625rem] rounded-r-sm p-0 align-top max-md:pointer-coarse:w-[2.625rem]">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-[1.625rem] w-[1.625rem] rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-inset [&_[data-icon-root]]:size-3.5 max-md:pointer-coarse:h-[2.625rem] max-md:pointer-coarse:w-[2.625rem]"
                  aria-label={`${actions.length === 1 ? "Clear" : "Remove"} action ${index + 1}`}
                  onClick={() => {
                    const next = draft.current.length === 1
                      ? [{ ...action, label: "", prompt: "" }]
                      : withEmptyRow(draft.current.filter(({ id }) => id !== action.id));
                    focusAfterRemoval.current = (next[index] ?? next[next.length - 1]!).id;
                    changeActions(next);
                    flush();
                  }}
                >
                  <Icon name="X" aria-hidden />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
    </form>
  );
}
