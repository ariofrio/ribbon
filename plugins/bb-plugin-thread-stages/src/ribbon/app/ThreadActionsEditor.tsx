import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
      className="space-y-3 p-2"
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
      <p className="text-sm text-muted-foreground">Add buttons that send prompts to this thread.</p>
      {actions.map((action, index) => (
        <div className="space-y-2 rounded-md border border-border p-2" key={action.id}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">Action {index + 1}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => setActions(actions.filter(({ id }) => id !== action.id))}
            >
              Remove
            </Button>
          </div>
          <Input
            aria-label={`Action ${index + 1} button label`}
            maxLength={24}
            placeholder="Button label"
            disabled={pending}
            value={action.label}
            onChange={(event) => setActions(actions.map((item) =>
              item.id === action.id ? { ...item, label: event.target.value } : item,
            ))}
          />
          <Textarea
            aria-label={`Action ${index + 1} prompt`}
            maxLength={10000}
            placeholder="Prompt to send to this thread"
            disabled={pending}
            value={action.prompt}
            onChange={(event) => setActions(actions.map((item) =>
              item.id === action.id ? { ...item, prompt: event.target.value } : item,
            ))}
          />
        </div>
      ))}
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => setActions([...actions, { id: crypto.randomUUID(), label: "", prompt: "" }])}
        >
          Add action
        </Button>
        <Button type="submit" disabled={pending || invalid}>Save actions</Button>
      </div>
    </form>
  );
}
