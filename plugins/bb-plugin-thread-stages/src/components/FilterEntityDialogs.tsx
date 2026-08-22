import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useDialogCenterX } from "../lib/dialog-position";
import { usePortalScopeProps } from "@/vendor/lib/portal-scope";
import { Icon } from "./Icon";

export interface FilterEntityTarget {
  kind: "project" | "section";
  id: string;
  name: string;
}

interface SharedDialogProps {
  target: FilterEntityTarget | null;
  onOpenChange: (open: boolean) => void;
}

const OVERLAY_CLASS =
  "fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px]";
const CONTENT_CLASS =
  "fixed left-1/2 top-1/2 z-50 w-full max-w-[32rem] -translate-x-1/2 -translate-y-1/2 border bg-background p-6 shadow-sm sm:rounded-lg max-md:w-[calc(100%_-_2rem)]";

export function FilterEntityRenameDialog({
  target,
  onOpenChange,
  onRename,
}: SharedDialogProps & {
  onRename: (target: FilterEntityTarget, name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dialogCenterX = useDialogCenterX(target !== null);
  const portalScopeProps = usePortalScopeProps();

  useEffect(() => {
    if (!target) return;
    setName(target.name);
    setError(null);
  }, [target]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!target || pending) return;
    const nextName = name.trim();
    if (!nextName) {
      setError(
        `${target.kind === "project" ? "Project" : "Section"} name cannot be empty.`,
      );
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onRename(target, nextName);
      onOpenChange(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : `Could not rename ${target.kind}.`,
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog.Root
      open={target !== null}
      onOpenChange={(open) => {
        if (!pending) onOpenChange(open);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay {...portalScopeProps} className={OVERLAY_CLASS} />
        {target ? (
          <Dialog.Content
            {...portalScopeProps}
            className={CONTENT_CLASS}
            style={{ left: dialogCenterX }}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              inputRef.current?.focus();
            }}
          >
            <Dialog.Title className="text-base font-semibold leading-none tracking-tight">
              Rename {target.kind}
            </Dialog.Title>
            <Dialog.Description className="mt-1.5 text-sm text-muted-foreground">
              Choose a new name for this {target.kind}.
            </Dialog.Description>
            <form
              className="mt-4 space-y-4"
              onSubmit={(event) => void submit(event)}
            >
              <input
                ref={inputRef}
                aria-label={`${target.kind === "project" ? "Project" : "Section"} name`}
                autoComplete="off"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                disabled={pending}
                value={name}
                onChange={(event) => {
                  setName(event.currentTarget.value);
                  setError(null);
                }}
              />
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : null}
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={pending}
                  className="inline-flex h-9 cursor-pointer items-center justify-center rounded-md bg-foreground px-4 text-sm font-medium text-background hover:bg-foreground/90 disabled:pointer-events-none disabled:opacity-50"
                >
                  Rename {target.kind}
                </button>
              </div>
            </form>
            <DialogClose pending={pending} />
          </Dialog.Content>
        ) : null}
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function FilterEntityRemoveDialog({
  target,
  onOpenChange,
  onRemove,
}: SharedDialogProps & {
  onRemove: (target: FilterEntityTarget) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogCenterX = useDialogCenterX(target !== null);
  const portalScopeProps = usePortalScopeProps();

  useEffect(() => setError(null), [target]);

  async function remove(): Promise<void> {
    if (!target || pending) return;
    setPending(true);
    setError(null);
    try {
      await onRemove(target);
      onOpenChange(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : `Could not remove ${target.kind}.`,
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog.Root
      open={target !== null}
      onOpenChange={(open) => {
        if (!pending) onOpenChange(open);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay {...portalScopeProps} className={OVERLAY_CLASS} />
        {target ? (
          <Dialog.Content
            {...portalScopeProps}
            className={CONTENT_CLASS}
            style={{ left: dialogCenterX }}
          >
            <Dialog.Title className="text-base font-semibold leading-none tracking-tight">
              Remove {target.kind}?
            </Dialog.Title>
            <Dialog.Description className="mt-1.5 text-sm text-muted-foreground">
              {target.kind === "project"
                ? `Remove "${target.name}" and all of its threads? This cannot be undone.`
                : "Threads in this section will move back to Unorganized."}
            </Dialog.Description>
            {error ? (
              <p className="mt-4 text-sm text-destructive">{error}</p>
            ) : null}
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                disabled={pending}
                className="inline-flex h-9 cursor-pointer items-center justify-center rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:pointer-events-none disabled:opacity-50"
                onClick={() => void remove()}
              >
                Remove {target.kind}
              </button>
            </div>
            <DialogClose pending={pending} />
          </Dialog.Content>
        ) : null}
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DialogClose({ pending }: { pending: boolean }) {
  return (
    <Dialog.Close
      aria-label="Close"
      disabled={pending}
      className="absolute right-4 top-4 cursor-pointer rounded-sm opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring disabled:pointer-events-none"
    >
      <Icon name="Close" className="size-4" aria-hidden />
    </Dialog.Close>
  );
}
