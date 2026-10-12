import { useCallback, useEffect, useRef, useState } from "react";
import { definePluginApp, useRpc } from "@get-bb/plugin-sdk/app";
import { Button } from "@/vendor/components/ui/button";
import { Textarea } from "@/vendor/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/vendor/components/ui/tabs";
import type { InstructionsSnapshot, rpcContract } from "./contract";
import { RichEditor } from "./rich-editor";
import { useEditorHeight } from "./use-editor-height";
import "./styles.css";

function GlobalInstructions() {
  const rpc = useRpc<typeof rpcContract>();
  const panel = useEditorHeight();
  const [snapshot, setSnapshot] = useState<InstructionsSnapshot>();
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState("rich");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string>();
  const [conflict, setConflict] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editorGeneration, setEditorGeneration] = useState(0);
  const dirty = snapshot !== undefined && draft !== snapshot.instructions;
  const current = useRef({ dirty, busy });
  current.current = { dirty, busy };

  const load = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try {
      const next = await rpc.call("instructions.read", null);
      setSnapshot(next); setDraft(next.instructions); setConflict(false); setSaved(false);
      setEditorGeneration((generation) => generation + 1);
    } catch (cause) { setError(String(cause)); }
    finally { setBusy(false); }
  }, [rpc]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const focus = () => { if (!current.current.dirty && !current.current.busy) void load(); };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (current.current.dirty) event.preventDefault();
    };
    window.addEventListener("focus", focus);
    window.addEventListener("beforeunload", beforeUnload);
    return () => { window.removeEventListener("focus", focus); window.removeEventListener("beforeunload", beforeUnload); };
  }, [load]);

  function edit(value: string) { setDraft(value); setSaved(false); }
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
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {snapshot ? <>
        <Tabs className="global-instructions-tabs" value={mode} onValueChange={setMode}>
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
          <Button type="button" variant="outline" disabled={busy} onClick={() => void load()}>
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
  app.slots.settingsSection({ id: "global-instructions", component: GlobalInstructions });
});
