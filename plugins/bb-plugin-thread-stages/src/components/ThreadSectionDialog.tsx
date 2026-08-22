import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useDialogCenterX } from "../lib/dialog-position";
import { usePortalScopeProps } from "@/vendor/lib/portal-scope";
import { Icon } from "./Icon";

export function ThreadSectionDialog({
  open,
  onCreate,
  onOpenChange,
}: {
  open: boolean;
  onCreate: (name: string) => Promise<void>;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dialogCenterX = useDialogCenterX(open);
  const portalScopeProps = usePortalScopeProps();

  useEffect(() => {
    if (!open) return;
    setName("");
    setError(null);
  }, [open]);

  function handleOpenChange(nextOpen: boolean): void {
    if (pending) return;
    if (nextOpen) {
      setName("");
      setError(null);
    }
    onOpenChange(nextOpen);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) return;
    const nextName = name.trim();
    if (!nextName) {
      setError("Section name cannot be empty.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onCreate(nextName);
      onOpenChange(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create section.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          {...portalScopeProps}
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px]"
        />
        <Dialog.Content
          {...portalScopeProps}
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-[32rem] -translate-x-1/2 -translate-y-1/2 border bg-background shadow-sm sm:rounded-lg max-md:w-[calc(100%_-_2rem)]"
          style={{ left: dialogCenterX }}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 p-6">
            <div className="flex flex-col space-y-1.5 text-left">
              <Dialog.Title className="text-base font-semibold leading-none tracking-tight">
                New section
              </Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground">
                Create a section for threads.
              </Dialog.Description>
            </div>
            <form
              className="space-y-4"
              onSubmit={(event) => void handleSubmit(event)}
            >
              <div className="space-y-1.5">
                <input
                  ref={inputRef}
                  aria-label="Section name"
                  autoCapitalize="sentences"
                  autoComplete="off"
                  autoCorrect="off"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={pending}
                  spellCheck={false}
                  value={name}
                  onChange={(event) => {
                    setName(event.currentTarget.value);
                    setError(null);
                  }}
                />
                {error ? (
                  <p className="text-sm text-destructive">{error}</p>
                ) : null}
              </div>
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
                <button
                  type="submit"
                  disabled={pending}
                  className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                >
                  Create section
                </button>
              </div>
            </form>
          </div>
          <Dialog.Close
            aria-label="Close"
            disabled={pending}
            className="absolute right-4 top-4 cursor-pointer rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-state-active data-[state=open]:text-foreground"
          >
            <Icon name="Close" className="size-4" aria-hidden />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
