import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ThreadAction } from "../thread-actions-store";
import { useRibbonData } from "./data";

/**
 * The dialog behind a thread's "Edit actions": up to a few labeled prompts
 * that become buttons on the row, and whether the title makes room for them.
 */
export function ThreadActionsEditor() {
  const ribbon = useRibbonData();
  const threadId = ribbon?.actionsEditor ?? null;
  const [draft, setDraft] = useState<{
    threadId: string;
    actions: ThreadAction[];
    hideTitle: boolean;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const record = threadId === null ? undefined : ribbon?.threadActions.get(threadId);
  useEffect(() => {
    if (threadId === null) {
      setDraft(null);
      return;
    }
    setDraft((current) =>
      current?.threadId === threadId
        ? current
        : {
            threadId,
            actions: [...(record?.actions ?? [])],
            hideTitle: record?.hideTitle ?? false,
          },
    );
    setError(null);
  }, [record, threadId]);
  if (ribbon === null) return null;
  const close = () => ribbon.editActions(null);
  const invalid =
    draft === null ||
    draft.actions.some(({ label, prompt }) => !label.trim() || !prompt.trim());
  return (
    <Dialog
      open={threadId !== null}
      onOpenChange={(open) => {
        if (!open && !pending) close();
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit thread actions</DialogTitle>
          <DialogDescription>
            Add buttons that send prompts to this thread.
          </DialogDescription>
        </DialogHeader>
        {draft ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (invalid) return;
              setPending(true);
              setError(null);
              void ribbon
                .saveThreadActions(draft.threadId, draft.actions, draft.hideTitle)
                .then(close)
                .catch((cause: unknown) => {
                  setError(
                    cause instanceof Error ? cause.message : "Could not save thread actions",
                  );
                })
                .finally(() => setPending(false));
            }}
          >
            {draft.actions.map((action, index) => (
              <div className="space-y-2 rounded-md border border-border p-3" key={action.id}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">Action {index + 1}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        actions: draft.actions.filter(({ id }) => id !== action.id),
                      })
                    }
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
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      actions: draft.actions.map((item) =>
                        item.id === action.id ? { ...item, label: event.target.value } : item,
                      ),
                    })
                  }
                />
                <Textarea
                  aria-label={`Action ${index + 1} prompt`}
                  maxLength={10000}
                  placeholder="Prompt to send to this thread"
                  disabled={pending}
                  value={action.prompt}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      actions: draft.actions.map((item) =>
                        item.id === action.id ? { ...item, prompt: event.target.value } : item,
                      ),
                    })
                  }
                />
              </div>
            ))}
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={draft.actions.length > 0 && draft.hideTitle}
                disabled={pending || draft.actions.length === 0}
                onCheckedChange={(checked) =>
                  setDraft({ ...draft, hideTitle: checked === true })
                }
              />
              Hide thread title
            </label>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  setDraft({
                    ...draft,
                    actions: [
                      ...draft.actions,
                      { id: crypto.randomUUID(), label: "", prompt: "" },
                    ],
                  })
                }
              >
                Add action
              </Button>
              <Button type="submit" disabled={pending || invalid}>
                Save actions
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
