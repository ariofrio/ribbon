import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { ThreadAction } from "../thread-actions-store";
import { useRibbonData } from "./data";

const emptyAction = (): ThreadAction => ({ id: crypto.randomUUID(), label: "", prompt: "" });
const isEmpty = ({ label, prompt }: ThreadAction) => !label.trim() && !prompt.trim();
const withEmptyRow = (actions: ThreadAction[]) =>
  actions.length === 0 || !isEmpty(actions[actions.length - 1]!) ? [...actions, emptyAction()] : actions;

/** Labeled prompts edited in a thread's menu and drawn as buttons on its row. */
export function ThreadActionsEditor({ threadId }: { threadId: string }) {
  const ribbon = useRibbonData();
  const [actions, setActions] = useState<ThreadAction[]>(
    () => withEmptyRow([...(ribbon?.threadActions.get(threadId)?.actions ?? [])]),
  );
  const [error, setError] = useState<string | null>(null);
  const draft = useRef(actions);
  const saved = useRef(ribbon?.threadActions.get(threadId)?.actions ?? []);
  const queue = useRef(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);
  const saveThreadActions = ribbon?.saveThreadActions;
  const flush = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    const snapshot = draft.current;
    queue.current = queue.current.then(async () => {
      if (!saveThreadActions) return;
      const next = snapshot.flatMap((action) => {
        const label = action.label.trim();
        const prompt = action.prompt.trim();
        if (label && prompt) return [{ ...action, label, prompt }];
        // Keep a saved action while either field is being edited to an empty value.
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
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 300);
  };
  if (ribbon === null) return null;
  return (
    <form
      aria-label="Edit thread actions"
      className="space-y-2 p-1"
      onKeyDown={(event) => {
        // Text editing and tabbing stay in the form; Escape still dismisses the menu.
        if (event.key !== "Escape") event.stopPropagation();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          const lastFilled = draft.current.reduce((last, action, index) => isEmpty(action) ? last : index, -1);
          draft.current = withEmptyRow(draft.current.slice(0, lastFilled + 2));
          setActions(draft.current);
        }
        flush();
      }}
      onSubmit={(event) => {
        event.preventDefault();
        flush();
      }}
    >
      <Table aria-label="Thread actions" className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="h-7 w-[30%] px-1 text-xs">Label</TableHead>
            <TableHead className="h-7 px-1 text-xs">Prompt</TableHead>
            <TableHead className="h-7 w-9 px-1"><span className="sr-only">Remove</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {actions.map((action, index) => (
            <TableRow key={action.id}>
              <TableCell className="p-1 align-top">
                <Input
                  aria-label={`Action ${index + 1} button label`}
                  className="h-8 px-2"
                  maxLength={24}
                  placeholder="Label"
                  value={action.label}
                  onChange={(event) => changeActions(actions.map((item) =>
                    item.id === action.id ? { ...item, label: event.target.value } : item,
                  ))}
                />
              </TableCell>
              <TableCell className="p-1 align-top">
                <Textarea
                  aria-label={`Action ${index + 1} prompt`}
                  className="h-8 min-h-8 resize-y px-2 py-1"
                  rows={1}
                  maxLength={10000}
                  placeholder="Prompt to send"
                  value={action.prompt}
                  onChange={(event) => changeActions(actions.map((item) =>
                    item.id === action.id ? { ...item, prompt: event.target.value } : item,
                  ))}
                />
              </TableCell>
              <TableCell className="p-1 align-top">
                {!isEmpty(action) ? <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-7 max-md:pointer-coarse:h-10"
                  aria-label={`Remove action ${index + 1}`}
                  onClick={() => {
                    changeActions(actions.filter(({ id }) => id !== action.id));
                    flush();
                  }}
                >
                  <Icon name="Trash2" aria-hidden />
                </Button> : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
    </form>
  );
}
