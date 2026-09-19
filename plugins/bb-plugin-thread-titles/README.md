# Thread titles

Refine each new thread title once, after five minutes or three user messages.
The update can run while the thread is busy and uses its full recorded
conversation, including assistant messages, tool results, and partial output.

## Install

```sh
bb marketplace add git:github.com/ariofrio/ribbon
bb plugin install thread-titles@ribbon
```

Requires bb 0.43.3 or later. Newly created visible threads are eligible;
installing the plugin does not rename existing threads. No sidebar plugin is
required.

## Behavior

The timer starts with the first accepted user message. Retries and messages
sent by agents do not count toward the three-message trigger. At the first
trigger, a fresh hidden worker generates a concise title on the source thread's
provider and host, in a personal workspace. It receives the complete recorded
transcript as quoted data and is instructed to return a title without tools.
The worker is stopped and archived afterward.

The plugin saves the first stored title it observes during initial naming.
bb initially displays a fallback derived from the first prompt while its stored
`title` is still null. If no stored title arrives, the fallback is the baseline.
A different title before generation or application permanently cancels the
update. This compares title values; it cannot identify who changed a title or
distinguish a manual rename made before the first stored title was observed.
There is also a small read-to-write race because bb has no conditional title
update API.

The baseline, deadline, message count, worker identity, and terminal outcome are
stored in the plugin database. Restarts resume known jobs, but never repeat an
ambiguous worker creation or title write. If the initial stored title appeared
while the plugin was offline and its baseline is unknown, the update is skipped.
A destructive history edit or context clear during generation cancels the job.
Completed and skipped jobs are never retried.

## Settings

By default, Codex uses an available Luna model and Claude Code uses Haiku.
Other providers require an explicit model ID. The model must be available on the
source thread's provider:

```sh
bb plugin config thread-titles set model gpt-5.6-luna
bb plugin config thread-titles unset model
```

The default transcript limit is 200,000 UTF-8 bytes. Larger transcripts are
skipped in full, never truncated. Configure a limit between 1,000 and 2,000,000
bytes with:

```sh
bb plugin config thread-titles set maxTranscriptBytes 200000
```

Workers that fail, request an interaction, attempt tools, return invalid JSON,
or exceed two minutes of observed execution time are skipped. Waiting for bb's
concurrency admission does not consume that execution timeout.

Inspect outcomes with `bb plugin logs thread-titles`.

## Development

```sh
npm test --workspace bb-plugin-thread-titles
npm run release:check --workspace bb-plugin-thread-titles
npm run test:e2e -- --case thread-titles:once
```
