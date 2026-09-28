# Thread titles

Title threads from their first message and first turn, and refine generic, inaccurate, or overlong titles on the third user message.
The update can run while the thread is busy and uses its recorded
conversation, including assistant messages, tool results, and partial output.

## Install

```sh
bb marketplace add git:github.com/ariofrio/ribbon
bb plugin install thread-titles@ribbon
```

Requires bb 0.44.0 or later. Newly created visible threads are eligible;
installing the plugin does not rename existing threads. No sidebar plugin is
required.

## Behavior

Each title comes from a fresh hidden worker running the title model (see
[Settings](#settings)) on the source thread's machine, in a personal workspace.
It receives the recorded transcript as quoted data and is instructed to return
a title within the title length limit, without tools.

The first pass titles the first message. bb titles a new thread from the first
80 columns of its prompt, so this pass waits until bb has stored that title, or
recorded that it generated none, and then replaces or keeps it. Waiting makes
the plugin's title the later write. If the first turn ends before bb's title
arrives, this pass is skipped. Whatever its outcome, the second pass follows.

The second pass titles the first turn: when it ends, or while it is still
running once its transcript reaches a quarter of the transcript size limit. The
first message alone often cannot say what a thread is about, such as a prompt
that is only an issue link. Completion and size are read from durable history,
so a missed event or restart does not lose the trigger.

After a successful second pass, the third accepted user message triggers one
assessment of the title. If the title has changed since the second pass, the
assessment is permanently cancelled. Otherwise, the worker keeps it unless it
is generic, materially inaccurate, or longer than the title length limit. New details, alternative wording, and
stylistic preferences are not reasons to rewrite an accurate, specific title.
Retries and agent messages do not count. Elapsed time never triggers an update.
Each worker is stopped and archived afterward.

The plugin saves the first stored title it observes before the first pass.
bb initially displays a fallback derived from the first prompt while its stored
`title` is still null. If no stored title arrives, the fallback is the baseline.
A different title before generation or application permanently cancels the
update. This compares title values; it cannot identify who changed a title or
distinguish a manual rename made before the first stored title was observed.
There is also a small read-to-write race because bb has no conditional title
update API.

The phase, baseline, message count, worker identities, and terminal outcome are
stored in the plugin database. Background reconciliation recovers missed message
events, including across restarts, but never repeats an ambiguous worker creation
or title write. If the initial stored title appeared
while the plugin was offline and its baseline is unknown, the update is skipped.
A destructive history edit or context clear during generation cancels the job.
Each pass starts at most one worker, plus a single retry, and
recovery never adopts an earlier pass's worker or a failed one. Each completed
pass saves the resulting title as the baseline for the next. A completed
assessment, or a skipped second or third pass, ends the job; nothing is retried
later. Previously completed jobs are not backfilled.

## Settings

Choose the title model under **Title model** on the plugin's settings page,
using bb's own provider, model, and reasoning picker. Every title worker then
runs that selection on the source thread's machine, whatever the thread's own
provider. A machine without the selected model skips the thread.

**Use automatic** clears the selection. Automatic titling runs what bb's own
Codex title service runs: the newest Luna model in the Codex catalog of the
thread's machine, at the lowest reasoning level, whatever the thread's own
provider. A thread whose machine offers no Luna model is skipped.

The transcript keeps user and assistant messages in full. Any tool text longer
than 1,000 characters keeps only its first and last 500, and model reasoning is
left out. A transcript over the size limit is cut off after the last whole entry
that fits, and the worker is told that later conversation is missing; a thread
whose first message alone exceeds the limit is skipped. The default limit is
200,000 UTF-8 bytes. Configure one between 1,000 and 2,000,000 bytes with:

```sh
bb plugin config thread-titles set maxTranscriptBytes 200000
```

Titles are at most 40 characters by default. Configure a limit between 20 and
80 characters with:

```sh
bb plugin config thread-titles set maxTitleLength 40
```

Workers that fail, request an interaction, attempt tools, return invalid JSON,
or exceed two minutes of observed execution time are skipped. Waiting for bb's
concurrency admission does not consume that execution timeout. As in bb's own
Codex title service, an automatic worker that times out or fails with a rate
limit, overload, or lost connection is retried once on the next newest Luna
model; a selected model is never retried after a failure. A worker that returns
a title over the length limit, or keeps a current title over it, is retried once
on the same model, automatic or selected. A second overlong title skips the
phase.

Inspect outcomes with `bb plugin logs thread-titles`.

## Development

```sh
npm test --workspace bb-plugin-thread-titles
npm run release:check --workspace bb-plugin-thread-titles
npm run test:e2e -- --case thread-titles:once
```
