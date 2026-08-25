import { Button } from "@/vendor/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/vendor/components/ui/dialog";
import { Input } from "@/vendor/components/ui/input";
import { useId, useRef, useState, type FormEvent } from "react";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() !== ""
    ? error.message
    : fallback;
}

interface RenameSectionDialogProps {
  open: boolean;
  sectionName: string;
  onOpenChange(open: boolean): void;
  onRename(name: string): Promise<void>;
}

/** bb's own wording, so the crumb's dialog reads like the sidebar's. */
export function RenameSectionDialog({
  open,
  sectionName,
  onOpenChange,
  onRename,
}: RenameSectionDialogProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [nextName, setNextName] = useState(sectionName);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = nextName.trim();
    if (pending) return;
    if (name === "") {
      setError("Section name cannot be empty.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      await onRename(name);
      onOpenChange(false);
    } catch (caught) {
      setError(errorMessage(caught, "Could not rename section."));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!pending) onOpenChange(nextOpen);
      }}
    >
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.select();
        }}
      >
        <DialogHeader>
          <DialogTitle>Rename section</DialogTitle>
          <DialogDescription>
            Choose a new name for this section.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(event) => void submit(event)}>
          <div className="space-y-2">
            <Input
              ref={inputRef}
              id={inputId}
              aria-label="Section name"
              value={nextName}
              autoCapitalize="sentences"
              autoCorrect="off"
              spellCheck={false}
              disabled={pending}
              onChange={(event) => {
                setNextName(event.target.value);
                setError(null);
              }}
            />
            {error === null ? null : (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Rename section
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface RemoveSectionDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  onRemove(): Promise<void>;
}

export function RemoveSectionDialog({
  open,
  onOpenChange,
  onRemove,
}: RemoveSectionDialogProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await onRemove();
      onOpenChange(false);
    } catch (caught) {
      setError(errorMessage(caught, "Could not remove section."));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!pending) onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove section?</DialogTitle>
          <DialogDescription>
            Threads in this section will move back to Unorganized.
          </DialogDescription>
        </DialogHeader>
        {error === null ? null : (
          <p className="text-sm text-destructive">{error}</p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() => void remove()}
          >
            Remove section
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
