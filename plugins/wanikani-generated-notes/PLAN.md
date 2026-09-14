# WaniKani Generated Notes — detailed preparation plan

Status: stage 2 execution implemented, updated September 13, 2026. Stage 1 reader
is implemented in version 0.2.0. Execution uses explicit `--run`; omission remains
a dry run. See README.md for commands, recovery behavior, and current limitations. This document replaces earlier proposals for
manual linking, subject mapping fields, and a separate reference deck.

## 1. Architecture and ownership

The preparation coordinator will live in
`~/Code/anki-plugins/plugins/japanese_card_workflow/`, with CLI entry
point `prepare_wanikani_vocab.py`. Reuse the existing generator, HTML validation,
configuration, guarded save helpers, and Anki collection operations. Add focused
modules for WaniKani retrieval, inventory, and a durable job journal as needed.
Implemented modules are `prepare_wanikani_vocab.py`, `wanikani_execution.py`, and
`wanikani_collection.py`, with guarded `japaneseWanikani*` AnkiConnect actions.
The detailed design below includes future extensions beyond the current CLI.

The Tampermonkey script remains the reader: automatically find the exact Front,
read GeneratedNotes, and display it on vocabulary pages, lesson Meaning panels,
and answered review information. Its persistent cache displays previously seen
content while a fresh Anki lookup runs. No linking UI or OpenAI key in the browser.
A first visit still requires reachable Anki unless that word was previously cached;
bulk preparation alone does not preload every word into browser storage.

Anki stores the authoritative, editable content. A local coordinator performs
network generation concurrently; all Anki collection mutations run through the
add-on on Anki's owning thread. Do not write directly to Anki's database or bypass
the existing guarded, undoable save path with generic field updates.

## 2. Existing versus new notes

Match using the same normalized plain-text Front rule as the reader, across the
supported vocabulary note type and all its decks, including suspended cards.
Do not use fuzzy spelling, reading, deck, or WaniKani level as identity. Deduplicate
the selected words before generation. Subject IDs belong in the local job record
for provenance and fetching, not in a mandatory linking field in Anki.

| Inventory result | Content action | Card action |
| --- | --- | --- |
| Existing note with GeneratedNotes | Reuse; no generation | Preserve decks, scheduling, suspension |
| Existing note with empty GeneratedNotes | Generate only the missing explanation | Preserve decks, scheduling, suspension |
| No matching note | Generate and create a normal vocabulary note | Route both templates to their normal subdecks and suspend both |
| Conflicting matches, unsupported model, or invalid content | Report for resolution | No automatic changes |

Existing Back, personal Notes, media, and other fields remain unchanged. Only
GeneratedNotes determines whether an explanation is missing; Notes is ignored.
Content regeneration or replacement of nonempty fields is a separate explicit
operation.

New notes use the existing vocabulary model, field conventions, and templates:

- Front: WaniKani spelling.
- Kana: an exact copy of Front, for new notes only.
- Back: generated dictionary definition through the existing generator.
- GeneratedNotes: existing seven-section explanation format.
- Card 1 → `Japanese Vocabulary::1. Recognition`.
- Card 2 → `Japanese Vocabulary::2. Recall`.
- Both cards suspended before the operation is considered successful.

Read deck and template names from configuration rather than hardcoding these
current values. Validate the selected model and both templates before generation.
Inspect normal note creation and template requirements before implementing field
population; do not assume a field named Kana is simply a reading field. Required
fields or media must follow the normal workflow, with missing requirements
reported rather than fabricated. Suspension does not make a note uneditable.

The existing finish operation suspends only Recall. Introduce a distinct
new-note preparation operation sharing its template-based routing logic; do not
change the regular finish policy or apply it to reused notes. Creation, routing,
and suspension must be one guarded, undoable collection operation with readback.
Verify atomicity on the installed Anki API; if unavailable, implement a recoverable
operation that cannot silently leave newly created cards active.

Once creation has been verified, a later run treats that note as existing. Never
re-suspend or move cards just because this tool originally created them. Manual
unsuspension is sufficient to start normal study in the already-correct decks.

## 3. Vocabulary selection

### Level mode

Select all non-hidden vocabulary and kana-vocabulary subjects on one or more
specified levels, including those not yet unlocked or already studied. This is
catalogue preparation, independent of the account's current lesson availability.
Example selection: levels 33 and 34. Kanji and radicals are outside this feature.

### Available-lessons mode

Use the WaniKani assignments API's `immediately_available_for_lessons` filter,
`hidden=false`, and vocabulary/kana-vocabulary subject types. Follow every page,
then retrieve subject metadata in bounded groups. Apply no level restriction unless levels are explicitly supplied.
This covers eligible older-level additions and vocabulary unlocked after a level
transition. Fetch assignments afresh on each run; subject metadata can be cached
and refreshed. Respect API throttling and retry transient failures.

The target is the complete API-eligible lesson pool, not the daily lesson badge,
a selected browser batch, or due reviews. The supplied lesson-picker screenshots
show why levels must not be inferred from the current level. During verification,
compare inventory counts and words by level with the picker; report differences
instead of silently forcing counts to agree.

Selection is a timestamped snapshot. Items unlocked during generation join the
next run, so workload and cost do not silently expand. A user can combine level
and available-lesson selections to take their intersection: only currently
available lessons on the specified levels. Deduplicate before inventory.

## 4. Inventory and execution

1. Preflight the active Anki profile, model, required fields, templates, and decks.
2. Fetch selected WaniKani subjects. Save mode, timestamp, subject IDs, levels,
   spellings, and relevant metadata in a local run manifest.
3. Read candidate Anki notes in bounded groups and build an exact Front index.
   Inventory performs no generation and no Anki writes. Include active and
   suspended cards; never inherit the current batch runner's `-is:suspended`
   exclusion.
4. Report totals by level and action: reuse, fill missing GeneratedNotes, create,
   conflicts and invalid configuration. Show the number
   of paid generation requests before execution.
5. Generate only required content using the existing prompt and configured model.
   For a new word, request definition and explanation together. Preserve the
   existing distinction between generated and independently reviewed content;
   apply the documented review workflow when that workflow is selected.
6. Validate and checkpoint each result as it completes. Feed valid results to
   the serialized Anki writer without waiting for the entire run.
7. Read back fields and card state. Mark verified completion in the journal.
8. Produce coverage, failures, conflicts, and resume instructions. A failed word
   does not block unrelated words.

The CLI currently supports dry-run and `--run`; rerunning performs fresh inventory
and resumes cached generation. Executing an old inventory directly is not supported.
The dry run makes no Anki changes and no paid OpenAI requests.
A plan does not authorize paid generation by itself. Store API credentials using
existing local configuration conventions, outside version control and reports.

## 5. Fast generation

Default to concurrent ordinary Responses API requests, one vocabulary item per
request. Reuse the existing generation model and structured output/HTML validators.
Combine the requested fields for one word in that call, rather than mixing many
words in one large prompt. This preserves per-word quality checks and retries.

Use the existing concurrency setting (currently 4) as the starting worker limit;
make it configurable and measure a small run before raising it. Enforce request
and token limits, honor server retry guidance, and use capped exponential backoff
with jitter. Generation workers perform network work only. Group Anki reads and
serialize writes on Anki's owning thread. Inventory group size and generation
concurrency are different settings; the current maximum batch size of 50 does
not imply 50 simultaneous requests.

Persist results immediately to avoid paying again after interruption. Record
latency, tokens when returned, retries, and completion counts to tune throughput.
Parallelism reduces elapsed time when rate limits allow; it does not reduce the
amount of generated content or guarantee a fixed speedup.

Optional later execution mode: OpenAI Batch API for large advance preparation.
It offers a 50% discount and a completion window of up to 24 hours, so it is not
the default for preparing lessons soon. Confirm the chosen model and request
options support Batch before submission. Persist job IDs and per-word custom IDs,
match unordered results by ID, and retry only failed or missing items.

## 6. Concurrency, recovery, and manual edits

Maintain a durable local journal outside tracked source, with statuses such as
inventoried, generating, generated, validated, saving, verified, failed, conflict,
and needs-review. Include run ID, profile, Front, subject IDs, note/card IDs when
known, original field hashes, prompt/model version, validated output, and errors.
Keep credentials out of the journal.

Before each save, verify the profile and reread the relevant fields. If a person
edited them since inventory, stop that item for reconciliation. Generation caches
must be keyed by the word, requested fields, and generation settings, not only
by a transient Anki note ID.

Before creating a note, repeat exact Front lookup inside the serialized write
operation. If a note appeared meanwhile, handle it as existing: never suspend it
or overwrite its content. Retain Anki's duplicate checks as an additional guard.
Prevent two preparation runs from writing concurrently using an operation lock.

After ambiguous write outcomes, reread Anki before retrying. Recover incomplete
creation using the recorded operation identity and actual state, not a blanket
rule that re-suspends all tool-created cards. Successful creation ends the tool's
ownership of suspension policy. Verify undo behavior and interruption boundaries
before enabling real bulk creation.

## 7. Delivery and acceptance

### Stage 2A: dry run

Implement both selections and exact Front matching. Confirm old-level lessons
and mixed levels 33/34 are represented according to live eligibility. Confirm
active and suspended existing notes are both reused. No paid generation or writes.

### Stage 2B: guarded preparation on a small sample

Implement new-note creation plus missing-content fills. Verify both template
names and correct decks, suspension of both new cards, unchanged existing review
history and scheduling, guarded handling of manual edits, and visible notes in
the existing userscript. Verify normal study after manually unsuspending a card.

### Stage 2C: parallelism and resume

Enable bounded workers and persistent checkpoints. Test throttling, one failed
word, interrupted generation, ambiguous saves, duplicate appearance during a run,
profile switches, and repeated runs after manual unsuspension. Verify completed
outputs are reused and reruns create no duplicate notes.

Optional later work: Batch API execution and browser cache preloading. Neither
is required for the initial fast preparation path. Cloud hosting, browser-side
generation, WaniKani writes, and automatic scheduling remain outside this plan.

## References

- Existing implementation and setup: [README.md](README.md)
- Anki workflow: `~/Code/anki-plugins/plugins/japanese_card_workflow/`
- Relevant source: `generation.py`, `collection_ops.py`, `anki_connect.py`,
  `batch_generate_notes.py`, `config.json`, and `AI_NOTES_WORKFLOW.md`.
- [WaniKani API](https://docs.api.wanikani.com/20170710/)
- [OpenAI rate limits](https://developers.openai.com/api/docs/guides/rate-limits)
- [OpenAI Batch API](https://developers.openai.com/api/docs/guides/batch)

## Historical tagging (implemented)

Successful execution tags new, filled, and reused notes with observed levels
(`wanikani::level::07`) and the local execution date (`wanikani::run::YYYY-MM-DD`).
Only newly created notes receive `wanikani::source::created`. Tags accumulate as
historical artifacts; no live level reconciliation is performed. Add only tags
missing under case-insensitive comparison. Preserve personal tags and card state.
A reused note needing no new tags is a no-op. Dry runs never write tags. Tag-only
updates are included in the affected-note search and are undoable.

The preparation CLI always uses the `Beginning Japanese` Anki note type.
There is no `--model` option; the OpenAI generation model is unchanged.
