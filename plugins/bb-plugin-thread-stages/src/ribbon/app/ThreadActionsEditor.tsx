import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { ThreadAction } from "../thread-actions-store";
import { useRibbonData } from "./data";

/** Labeled prompts edited in a thread's menu and drawn as buttons on its row. */
export function ThreadActionsEditor({
  threadId,
  onSaved,
}: {
  threadId: string;
  onSaved: () => void;
}) {
  const ribbon = useRibbonData();
  const [actions, setActions] = useState<ThreadAction[]>(
    () => [...(ribbon?.threadActions.get(threadId)?.actions ?? [])],
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (ribbon === null) return null;
  const invalid = actions.some(({ label, prompt }) => !label.trim() || !prompt.trim());
  return (
    <form
      aria-label="Edit thread actions"
      className="space-y-2 p-1"
      onKeyDown={(event) => {
        // Text editing and tabbing stay in the form; Escape still dismisses the menu.
        if (event.key !== "Escape") event.stopPropagation();
      }}
      onSubmit={(event) => {
        event.preventDefault();
        if (invalid || pending) return;
        setPending(true);
        setError(null);
        void ribbon.saveThreadActions(threadId, actions)
          .then(onSaved)
          .catch((cause: unknown) => {
            setError(cause instanceof Error ? cause.message : "Could not save thread actions");
          })
          .finally(() => setPending(false));
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
                  disabled={pending}
                  value={action.label}
                  onChange={(event) => setActions(actions.map((item) =>
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
                  disabled={pending}
                  value={action.prompt}
                  onChange={(event) => setActions(actions.map((item) =>
                    item.id === action.id ? { ...item, prompt: event.target.value } : item,
                  ))}
                />
              </TableCell>
              <TableCell className="p-1 align-top">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-7 max-md:pointer-coarse:h-10"
                  aria-label={`Remove action ${index + 1}`}
                  disabled={pending}
                  onClick={() => setActions(actions.filter(({ id }) => id !== action.id))}
                >
                  <Icon name="Trash2" aria-hidden />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          <TableRow>
            <TableCell colSpan={3} className="p-1">
              <Button
                type="button"
                variant="ghost"
                className="h-8 w-full justify-start px-2 max-md:pointer-coarse:h-10"
                disabled={pending}
                onClick={() => setActions([...actions, { id: crypto.randomUUID(), label: "", prompt: "" }])}
              >
                <Icon name="Plus" aria-hidden />
                Add action
              </Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      <div className="flex justify-end px-1">
        <Button type="submit" size="sm" disabled={pending || invalid}>Save actions</Button>
      </div>
    </form>
  );
}
