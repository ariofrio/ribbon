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

interface RenameProjectDialogProps {
  open: boolean;
  projectName: string;
  onOpenChange(open: boolean): void;
  onRename(name: string): Promise<void>;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() !== ""
    ? error.message
    : fallback;
}

export function RenameProjectDialog({
  open,
  projectName,
  onOpenChange,
  onRename,
}: RenameProjectDialogProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [nextName, setNextName] = useState(projectName);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = nextName.trim();
    if (pending) return;
    if (name === "") {
      setError("Project name cannot be empty.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      await onRename(name);
      onOpenChange(false);
    } catch (caught) {
      setError(errorMessage(caught, "Could not rename project."));
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
          <DialogTitle>Rename project</DialogTitle>
          <DialogDescription>
            Choose a new name for this project.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(event) => void submit(event)}>
          <div className="space-y-2">
            <Input
              ref={inputRef}
              id={inputId}
              aria-label="Project name"
              value={nextName}
              autoCapitalize="words"
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
              Rename project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface RemoveProjectDialogProps {
  open: boolean;
  projectName: string;
  onOpenChange(open: boolean): void;
  onRemove(): Promise<void>;
}

export function RemoveProjectDialog({
  open,
  projectName,
  onOpenChange,
  onRemove,
}: RemoveProjectDialogProps) {
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
      setError(errorMessage(caught, "Could not remove project."));
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
          <DialogTitle>Remove project?</DialogTitle>
          <DialogDescription>
            Remove &quot;{projectName}&quot; and all of its threads? This cannot
            be undone.
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
            Remove project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
