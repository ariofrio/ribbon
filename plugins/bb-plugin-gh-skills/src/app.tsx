import { useCallback, useEffect, useState, type FormEvent } from "react";
import { definePluginApp, Markdown, useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import { Badge } from "@/vendor/components/ui/badge";
import { Button } from "@/vendor/components/ui/button";
import { Input } from "@/vendor/components/ui/input";
import { Checkbox } from "@/vendor/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/vendor/components/ui/dialog";
import { ConfirmDeleteDialog, ConfirmDeleteDialogContent } from "@/vendor/components/ui/confirm-delete-dialog";
import { ResourceCollectionPage, ResourceCollectionViewport, ResourceListState, ResourceRow } from "@/vendor/components/ui/resource-list";
import type { InstalledSkill, SearchSkill, rpcContract } from "./contract";

const band = "mx-auto w-full max-w-4xl";
const message = (cause: unknown) => cause instanceof Error ? cause.message : String(cause);

type InstallDraft = { repository: string; skill: string; pin: string; all: boolean; force: boolean; allowHidden: boolean };
const emptyDraft: InstallDraft = { repository: "", skill: "", pin: "", all: false, force: false, allowHidden: false };

function SkillsPage() {
  const rpc = useRpc<typeof rpcContract>();
  const [inventory, setInventory] = useState<{ directory: string; skills: InstalledSkill[] }>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState("");
  const [installOpen, setInstallOpen] = useState(false);
  const [draft, setDraft] = useState<InstallDraft>(emptyDraft);
  const [document, setDocument] = useState<{ title: string; content: string; plain?: boolean }>();
  const [removing, setRemoving] = useState<InstalledSkill>();
  const [mode, setMode] = useState<"installed" | "browse">("installed");
  const [query, setQuery] = useState("");
  const [owner, setOwner] = useState("");
  const [results, setResults] = useState<SearchSkill[]>();
  const [page, setPage] = useState(1);
  const [force, setForce] = useState(false);
  const [unpin, setUnpin] = useState(false);
  const refresh = useCallback(async () => {
    try { setInventory(await rpc.call("skills.list", null)); }
    catch (cause) { setError(message(cause)); }
  }, [rpc]);
  useEffect(() => { void refresh(); }, [refresh]);
  useRealtime("skills.changed", () => { void refresh(); });
  async function perform(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(undefined);
    try { await action(); }
    catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }
  async function install(event: FormEvent) {
    event.preventDefault();
    await perform(async () => {
      const result = await rpc.call("skills.install", {
        repository: draft.repository.trim(), all: draft.all, force: draft.force, allowHidden: draft.allowHidden,
        ...(!draft.all ? { skill: draft.skill.trim() } : {}), ...(draft.pin.trim() ? { pin: draft.pin.trim() } : {}),
      });
      setOutput(result.output); setInstallOpen(false); await refresh();
    });
  }
  const edit = <K extends keyof InstallDraft>(key: K, value: InstallDraft[K]) => setDraft((old) => ({ ...old, [key]: value }));
  const openInstalled = (skill: InstalledSkill) => void perform(async () => {
    const result = await rpc.call("skills.read", { id: skill.id });
    setDocument({ title: skill.skillName, content: result.content });
  });
  const update = (id?: string, dryRun = false) => void perform(async () => {
    const result = await rpc.call("skills.update", { ...(id ? { id } : { all: true }), ...(dryRun ? { dryRun: true } : {}), ...(force ? { force } : {}), ...(unpin ? { unpin } : {}) });
    setOutput(result.output || "No updates available.");
    if (!dryRun) await refresh();
  });
  const search = (nextPage = 1) => void perform(async () => {
    const result = await rpc.call("skills.search", { query: query.trim(), ...(owner.trim() ? { owner: owner.trim() } : {}), page: nextPage });
    setResults(result.skills); setPage(nextPage);
  });
  const preview = (repository: string, skill: string, allowHidden = false) => void perform(async () => {
    const result = await rpc.call("skills.preview", { repository, skill, allowHidden });
    setDocument({ title: skill, content: result.output, plain: true });
  });
  return (
    <section data-gh-skills className="flex h-full min-h-0 flex-col p-4 md:p-6" aria-label="Managed server skills">
      <ResourceCollectionPage id="gh-skills" bandClassName={band}
        description="Install and manage skills shared across projects and connected machines."
        modes={[{ id: "installed", label: "Installed", count: inventory?.skills.length }, { id: "browse", label: "Browse" }]}
        activeMode={mode} onModeChange={setMode}
        actions={<>
          <Button variant="ghost" disabled={busy} onClick={() => void refresh()}>Refresh</Button>
          <Button variant="outline" disabled={busy || !inventory?.skills.length} onClick={() => update(undefined, true)}>Check for updates</Button>
          <Button variant="outline" disabled={busy || !inventory?.skills.length} onClick={() => update()}>Update all</Button>
          <Button disabled={busy} onClick={() => { setError(undefined); setDraft(emptyDraft); setInstallOpen(true); }}>Install skill</Button>
        </>}>
        <ResourceCollectionViewport contentClassName={band}>
          <div className="space-y-4">
            {inventory && <p className="break-all font-mono text-xs text-muted-foreground">{inventory.directory}</p>}
            {busy && <p role="status" className="text-sm text-muted-foreground">Running on the BB server…</p>}
            {error && !installOpen && !removing && <div role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error}</div>}
            {output && <details open className="rounded-lg border border-border p-3"><summary className="cursor-pointer text-sm font-medium">Command output</summary><pre role="status" className="mt-2 overflow-auto whitespace-pre-wrap break-words text-xs">{output}</pre></details>}
            {mode === "browse" ? <>
              <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); search(); }}>
                <Input className="min-w-48 flex-1" aria-label="Search GitHub skills" placeholder="Search GitHub skills" value={query} onChange={(event) => setQuery(event.target.value)} required />
                <Input className="w-44" aria-label="Repository owner" placeholder="Owner (optional)" value={owner} onChange={(event) => setOwner(event.target.value)} />
                <Button disabled={busy || !query.trim()} type="submit">Search</Button>
              </form>
              {results === undefined ? <ResourceListState state="empty" message="Search GitHub to find skills, or install directly from a repository." />
                : results.length === 0 ? <ResourceListState state="empty" message="No matching skills" />
                : results.map((skill) => <ResourceRow key={`${skill.repo}/${skill.path}`} title={skill.skillName} titleMeta={skill.repo}
                  description={skill.description} openLabel={`Preview ${skill.skillName}`} onOpen={() => preview(skill.repo, skill.path)}
                  actionsVisibility="always" actions={<Button variant="outline" size="sm" disabled={busy} aria-label={`Install ${skill.skillName}`} onClick={() => {
                    setDraft({ ...emptyDraft, repository: skill.repo, skill: skill.path }); setInstallOpen(true);
                  }}>Install</Button>} />)}
              {results && <div className="flex items-center justify-end gap-2 text-sm">
                <Button variant="outline" disabled={busy || page <= 1} onClick={() => search(page - 1)}>Previous</Button>
                <span>Page {page}</span><Button variant="outline" disabled={busy || results.length < 20} onClick={() => search(page + 1)}>Next</Button>
              </div>}
            </> : <>
            <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Update options</summary><div className="mt-3 grid gap-3">
              <label className="flex items-center gap-2"><Checkbox checked={force} disabled={busy} onCheckedChange={(value) => setForce(value === true)} />Force re-download, overwriting local edits (--force)</label>
              <label className="flex items-center gap-2"><Checkbox checked={unpin} disabled={busy} onCheckedChange={(value) => setUnpin(value === true)} />Remove pins and include pinned skills (--unpin)</label>
            </div></details>
            {!inventory ? <ResourceListState state={error ? "error" : "loading"} message={error ?? "Loading skills…"} onRetry={() => void refresh()} />
              : inventory.skills.length === 0 ? <ResourceListState state="empty" message="No skills installed" />
              : inventory.skills.map((skill) => <ResourceRow key={skill.id} title={skill.skillName}
                titleMeta={skill.version || undefined} state={skill.pinned ? <Badge variant="secondary">Pinned</Badge> : undefined}
                description={skill.sourceURL || "No source metadata"} openLabel={`Open ${skill.skillName}`} onOpen={() => openInstalled(skill)}
                actionsVisibility="always" actions={<>
                  <Button variant="outline" size="sm" disabled={busy || (skill.pinned && !unpin) || !skill.sourceURL.startsWith("https://")} aria-label={`Update ${skill.skillName}`} onClick={() => update(skill.id)}>Update</Button>
                  <Button variant="ghost" size="sm" disabled={busy} aria-label={`Remove ${skill.skillName}`} onClick={() => { setError(undefined); setRemoving(skill); }}>Remove</Button>
                </>} />)}
            </>}
          </div>
        </ResourceCollectionViewport>
      </ResourceCollectionPage>
      <Dialog open={installOpen} onOpenChange={(open) => { if (!busy) setInstallOpen(open); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Install skill</DialogTitle><DialogDescription>Install from GitHub into the BB server’s skills directory.</DialogDescription></DialogHeader>
          <form onSubmit={(event) => void install(event)} className="space-y-4">
            <label className="grid gap-1.5 text-sm">Repository<Input autoFocus placeholder="OWNER/REPO" value={draft.repository} disabled={busy} onChange={(event) => edit("repository", event.target.value)} required /></label>
            <label className="grid gap-1.5 text-sm">Skill name or path<Input placeholder="skills/my-skill" value={draft.skill} disabled={busy || draft.all} onChange={(event) => edit("skill", event.target.value)} required={!draft.all} /></label>
            <label className="grid gap-1.5 text-sm">Pin to tag, branch, or SHA<Input placeholder="Optional" value={draft.pin} disabled={busy} onChange={(event) => edit("pin", event.target.value)} /></label>
            <p className="text-xs text-muted-foreground">Pinned skills are skipped by ordinary updates. Without a pin, gh selects the latest release or default branch.</p>
            <div className="grid gap-3 text-sm">
              <label className="flex items-center gap-2"><Checkbox checked={draft.all} disabled={busy} onCheckedChange={(value) => edit("all", value === true)} />Install all skills in the repository</label>
              <label className="flex items-center gap-2"><Checkbox checked={draft.force} disabled={busy} onCheckedChange={(value) => edit("force", value === true)} />Overwrite existing skills (--force)</label>
              <label className="flex items-center gap-2"><Checkbox checked={draft.allowHidden} disabled={busy} onCheckedChange={(value) => edit("allowHidden", value === true)} />Include hidden directories</label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={busy || !draft.repository.trim()} onClick={() => void perform(async () => {
                const result = await rpc.call("skills.discover", { repository: draft.repository.trim(), allowHidden: draft.allowHidden });
                setDocument({ title: "Repository skills", content: result.output, plain: true });
              })}>List repository skills</Button>
              <Button type="button" variant="outline" disabled={busy || !draft.repository.trim() || !draft.skill.trim() || draft.all} onClick={() => preview(draft.repository.trim(), draft.skill.trim() + (draft.pin.trim() ? `@${draft.pin.trim()}` : ""), draft.allowHidden)}>Preview</Button>
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setInstallOpen(false)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Installing…" : "Install"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDeleteDialog open={Boolean(removing)} onOpenChange={(open) => { if (!open && !busy) setRemoving(undefined); }}>
        <ConfirmDeleteDialogContent title={`Remove ${removing?.skillName ?? "skill"}?`}
          description="Delete this skill and its local files from the BB server. It will no longer be available to agents."
          confirmLabel={busy ? "Removing…" : "Remove skill"} pending={busy}
          onCancel={() => setRemoving(undefined)} onConfirm={() => void perform(async () => {
            if (!removing) return;
            const result = await rpc.call("skills.remove", { id: removing.id });
            setOutput(result.output); setRemoving(undefined); await refresh();
          })} />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </ConfirmDeleteDialog>
      <Dialog open={Boolean(document)} onOpenChange={(open) => { if (!open) setDocument(undefined); }}>
        <DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>{document?.title}</DialogTitle><DialogDescription>{document?.plain ? "GitHub skill preview" : "Installed skill"}</DialogDescription></DialogHeader>
          <div className="max-h-[65vh] overflow-auto">{document && (document.plain ? <pre className="whitespace-pre-wrap break-words text-sm">{document.content}</pre> : <Markdown content={document.content} />)}</div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({ id: "skills", title: "Skills", icon: "Layers", path: "skills", component: SkillsPage });
});
