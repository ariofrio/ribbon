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
the plugin's title the later write. With bb's own titles turned off
(`bb settings ai-services set thread-title off`), it starts right away. If the first turn ends before bb's title
arrives, this pass is skipped. Whatever its outcome, the second pass follows.

The second pass titles the first turn: when it ends, or while it is still
running once its transcript reaches a quarter of the transcript size limit. The
first message alone often cannot say what a thread is about, such as a prompt
that is only an issue link. Completion and size are read from durable history,
so a missed event or restart does not lose the trigger.

After a successful second pass, or one exhausted by temporary provider failures,
the third accepted user message triggers one assessment of the title. An untitled
thread receives a fresh title instead. If the title has changed since the second
pass, the assessment is permanently cancelled. Otherwise, the worker keeps it unless it
is generic, materially inaccurate, or longer than the title length limit. New details, alternative wording, and
stylistic preferences are not reasons to rewrite an accurate, specific title.
Retries and agent messages do not count. Elapsed time alone never starts a new phase.
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
Each pass attempts each distinct model in its fallback stack once, with at most
one additional attempt to correct an overlong title. Recovery never adopts an
earlier pass's worker or a failed one. Each completed pass saves the resulting
title as the baseline for the next. The final assessment ends the job. Exhausting
temporary failures in the second pass still allows the third-message pass; other
terminal second-pass failures end it. Previously
completed jobs are not backfilled. Older untitled jobs skipped after a selected
model failed are checked once against their owned worker's recorded errors; only
confirmed temporary failures become eligible for third-message recovery.

## Settings

Each pass can be turned off on the plugin's settings page: **Title the first
message**, **Title the first turn**, **Title long first turns early**, and
**Review on the third message**. All are on by default. A thread whose pass is
off goes straight to the next pass, so turning off the first two leaves only
the third-message review; turning off the review ends the thread's titling after
its first turn. A setting applies when a thread reaches that pass.

Choose the title model under **Title model** on the plugin's settings page,
using bb's own provider, model, and reasoning picker. That selection heads each
pass's fallback stack on the source thread's machine, whatever the thread's own
provider. A machine without the selected model starts with the automatic model.

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

The fallback stack is the selected model (if any), then bb's automatic model,
then its fallback, with duplicate provider/model pairs removed. Ribbon mirrors
bb's Codex text-service chain using the two newest Luna models available on the
thread's host. The SDK does not currently expose the service's internal model
list. Each pass snapshots its stack; fallback never changes the saved selection.
An unavailable automatic catalog does not block an available selected model.

A timeout, rate limit, overload, or lost connection advances to the next model.
A different provider can run immediately. Before another attempt on the same
provider, rate limits wait until the latest blocked window resets plus 15 seconds;
without a structured reset, they wait 15 minutes. Other temporary provider errors
wait one minute. These deadlines survive restart and carry into later phases.
Two minutes of observed execution times out a worker; admission wait is excluded.

Permanent provider errors skip the remaining models on that provider for the
phase; a different provider in the stack can still run. Unclassified failures,
interactions, tool use, and invalid JSON stop the phase. An overlong title gets
one correction attempt on the same model per phase;
it does not reset the fallback budget. Once the final phase exhausts its budget,
the job stops and records its reason in plugin logs.

Workers are stopped and archived before replacement. bb's provider-retry plugin
may have queued a retry for the failed worker, but bb excludes archived threads
from automatic queue dispatch. Ribbon persists retirement before cleanup so a
restart completes cleanup before creating another worker.

Inspect outcomes with `bb plugin logs thread-titles`.

## Development

```sh
npm test --workspace bb-plugin-thread-titles
npm run release:check --workspace bb-plugin-thread-titles
npm run test:e2e -- --case thread-titles:once
```
