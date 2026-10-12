import { useCallback, useEffect, useRef, useState } from "react";
import { definePluginApp, useRpc } from "@get-bb/plugin-sdk/app";
import { Button } from "@/vendor/components/ui/button";
import { Textarea } from "@/vendor/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/vendor/components/ui/tabs";
import type { InstructionsSnapshot, rpcContract } from "./contract";
import { RichEditor } from "./rich-editor";
import { useEditorHeight } from "./use-editor-height";
import { draftStore, type EditorMode, type StoredDraft } from "./draft-store";
import { mountDraftIndicator } from "./draft-indicator";
import "./styles.css";

function GlobalInstructions() {
  const rpc = useRpc<typeof rpcContract>();
  const panel = useEditorHeight();
  const [snapshot, setSnapshot] = useState<InstructionsSnapshot>();
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<EditorMode>("rich");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string>();
  const [storageError, setStorageError] = useState<string>();
  const [conflict, setConflict] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editorGeneration, setEditorGeneration] = useState(0);
  const dirty = snapshot !== undefined && draft !== snapshot.instructions;
  const current = useRef({ dirty, busy });
  const checkpoint = useRef<StoredDraft | null>(null);
  const persistenceVersion = useRef(0);
  current.current = { dirty, busy };

  const load = useCallback(async (discard = false) => {
    setBusy(true);
    setError(undefined);
    try {
      const next = await rpc.call("instructions.read", null);
      let stored: StoredDraft | null = null;
      try {
        stored = await draftStore.read(next.path);
        if (discard || stored?.instructions === next.instructions) {
          await draftStore.clear(next.path, stored?.id);
          stored = null;
        }
        setStorageError(undefined);
      } catch (cause) { setStorageError(`Draft storage: ${String(cause)}`); }
      checkpoint.current = stored;
      setSnapshot(stored?.base ?? next); setDraft(stored?.instructions ?? next.instructions); setSaved(false);
      if (stored) setMode(stored.mode);
      const changed = stored !== null && stored.base.revision !== next.revision;
      setConflict(changed);
      if (changed) setError("File changed elsewhere. Copy your edits, then reload.");
      setEditorGeneration((generation) => generation + 1);
    } catch (cause) { setError(String(cause)); }
    finally { setBusy(false); }
  }, [rpc]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const focus = () => { if (!current.current.dirty && !current.current.busy) void load(); };
    window.addEventListener("focus", focus);
    return () => { window.removeEventListener("focus", focus); };
  }, [load]);

  function persist(instructions: string, editorMode: EditorMode) {
    if (!snapshot) return;
    const version = ++persistenceVersion.current;
    let operation: Promise<void>;
    if (instructions === snapshot.instructions) {
      operation = draftStore.clear(snapshot.path, checkpoint.current?.id);
      checkpoint.current = null;
    } else {
      const record: StoredDraft = { version: 1, id: crypto.randomUUID(), base: snapshot, instructions, mode: editorMode };
      checkpoint.current = record;
      operation = draftStore.write(record);
    }
    void operation.then(() => {
      if (persistenceVersion.current === version) setStorageError(undefined);
    }, (cause: unknown) => {
      if (persistenceVersion.current === version) setStorageError(`Draft not saved locally: ${String(cause)}`);
    });
  }
  function edit(value: string) { setDraft(value); setSaved(false); persist(value, mode); }
  function changeMode(value: string) {
    if (value !== "rich" && value !== "plain") return;
    setMode(value);
    if (dirty) persist(draft, value);
  }
  async function save() {
    if (!snapshot || busy || conflict) return;
    setBusy(true); setError(undefined); setSaved(false);
    try {
      const result = await rpc.call("instructions.save", { instructions: draft, revision: snapshot.revision });
      if (result.status === "conflict") {
        setConflict(true);
        setError("File changed elsewhere. Copy your edits, then reload.");
      } else {
        setSnapshot(result.snapshot); setSaved(true);
        try {
          await draftStore.clear(snapshot.path, checkpoint.current?.id);
          checkpoint.current = null;
          setStorageError(undefined);
        } catch (cause) { setStorageError(`Saved, but the local draft could not be cleared: ${String(cause)}`); }
      }
    } catch (cause) { setError(String(cause)); }
    finally { setBusy(false); }
  }

  return (
    <section ref={panel} className="bb-global-instructions flex flex-col gap-3" aria-label="Global instructions editor">
      <div>
        <p className="text-sm text-muted-foreground">Shared across projects and connected machines. Saved changes apply to new agent sessions.</p>
        {snapshot && <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{snapshot.path}</p>}
      </div>
      {(error || storageError) && <p role="alert" className="text-sm text-destructive">{error ?? storageError}</p>}
      {snapshot ? <>
        <Tabs className="global-instructions-tabs" value={mode} onValueChange={changeMode}>
          <TabsList aria-label="Editor mode">
            <TabsTrigger value="rich" disabled={busy}>Rich Markdown</TabsTrigger>
            <TabsTrigger value="plain" disabled={busy}>Plain text</TabsTrigger>
          </TabsList>
          <TabsContent className="global-instructions-pane" value="rich">
            {mode === "rich" && <RichEditor key={editorGeneration} value={draft} disabled={busy} onChange={edit} />}
          </TabsContent>
          <TabsContent className="global-instructions-pane" value="plain">
            <Textarea aria-label="Global instructions" value={draft} disabled={busy}
              className="global-instructions-source font-mono text-sm" spellCheck={false}
              onChange={(event) => edit(event.target.value)} />
          </TabsContent>
        </Tabs>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" disabled={busy || !dirty || conflict} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => void load(true)}>
            {conflict ? "Reload latest" : dirty ? "Discard changes" : "Reload"}
          </Button>
          <span role="status" className="text-xs text-muted-foreground">
            {saved ? "Saved" : dirty ? "Unsaved changes" : "No character limit"}
          </span>
        </div>
      </> : busy ? <p role="status" className="text-sm text-muted-foreground">Loading instructions…</p>
        : <Button variant="outline" onClick={() => void load()}>Retry</Button>}
    </section>
  );
}

export default definePluginApp((app) => {
  app.contentScripts.register({ id: "unsaved-draft", mount: mountDraftIndicator });
  app.slots.settingsSection({ id: "global-instructions", component: GlobalInstructions });
});
