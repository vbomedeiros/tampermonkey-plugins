# WaniKani Generated Notes

Automatically displays Anki’s `GeneratedNotes` for the current WaniKani word.
Version 0.2.0 removes manual linking: every visit searches for an exact `Front`
match and displays the explanation without a button click.

## Install or update

[Install or update in Tampermonkey](https://raw.githubusercontent.com/vbomedeiros/tampermonkey-plugins/main/plugins/wanikani-generated-notes/wanikani-generated-notes.user.js),
then reload WaniKani. Alternatively, paste the full contents of
[wanikani-generated-notes.user.js](wanikani-generated-notes.user.js) into
Tampermonkey and save.

## How it works

1. The script displays any saved explanation immediately.
2. It searches Anki’s `Front` field for the current word and verifies an exact
   plain-text match, including stripping HTML and normalizing Unicode.
3. It reads the matching note’s `GeneratedNotes`, displays it, and saves a local
   copy for offline use. It does not remember a note ID for future lookups.

Anki must be running with AnkiConnect at `http://127.0.0.1:8765` for fresh lookups.
The first connection automatically selects the open Anki profile. If an API key
is configured, enter it under **Connection**. Previously selected profiles and
saved explanations from version 0.1.0 are retained.

A new lookup runs whenever a supported panel opens or the tab regains focus.
Concurrent lookups for the same profile and word share their in-flight request.
**Refresh from Anki** is an optional retry control, not a prerequisite for viewing.

## Supported pages

- Vocabulary pages: **Generated Notes** appears after Meaning.
- Vocabulary and kana-vocabulary lessons: at the bottom of the Meaning tab.
- Reviews and lesson quizzes: in item information after answering and opening the
  matching information panel. Notes disappear immediately on the next question.

The script handles Turbo navigation directly, without WKOF or Item Info Injector.

## Saved content and missing notes

Content is cached by profile name and word. If Anki is closed or a request fails,
the previous saved explanation remains visible. A successful lookup with no exact
match shows that the word was not found; an empty field shows **Not prepared yet**.
Unexpected duplicate Front values produce a message instead of arbitrary content.
There is no linking or note-selection interface.

A different open Anki profile does not overwrite the selected profile’s cache.
Use **Connection** to switch deliberately. Profile renames and new browsers need
an initial connection. Collections reusing the same profile name cannot be
separated by this initial implementation.

## Access

Only `getActiveProfile`, `findNotes`, and `notesInfo` are called. No Anki notes,
cards, or scheduling are modified, and no AI generation is performed. Requests
use Tampermonkey’s localhost permission and retain configured AnkiConnect
authentication. HTML is rendered using a semantic allowlist without scripts,
external images, source styles, or event handlers.

## Tests

From this directory:

```sh
npm ci
npm test
```

The 11 DOM tests cover automatic first-use lookup, exact matching, replacement
note IDs, cache reuse and offline behavior, profile mismatch, missing/duplicate
matches, partial responses, sanitization, navigation races, lesson tabs, and
review answer gating. Test data is synthetic.

Version 0.2.0 was also verified in Chrome with the existing 後悔 note: all seven
sections appeared automatically without linking or button clicks. Live answered
review testing remains separate from the automated review-gating tests.

## Future work

[PLAN.md](PLAN.md) retains the bulk preparation design. Its original subject-link
proposal is superseded: vocabulary lookup uses exact `Front` matching. Bulk
creation and AI generation remain future work.

## Vocabulary preparation

The Anki workflow has a `prepare_wanikani_vocab.py` CLI. By default it reports
what would be reused, filled, or created without writing to Anki or calling
OpenAI. Add `--run` to generate and save missing content. Keep Anki and AnkiConnect running. On macOS, the script automatically
reads your token from Keychain. On first run it prompts for hidden input, saves
the token to Keychain, and continues. Run it in Terminal for the first setup;
macOS may ask you to allow Keychain access.

The Keychain service is `japanese-card-workflow.wanikani`, account `api-token`.
To replace a revoked token, delete that item in Keychain Access and rerun.
`WANIKANI_API_TOKEN` remains an optional environment override; override values
are not saved. No token is written to repository files or reports. If Keychain
access or saving fails, the script stops with an error. An invalid token can be
saved, but WaniKani will reject it; replace it using the steps above.
If AnkiConnect requires a key, set `ANKICONNECT_API_KEY` as well.

```sh
python3 ~/Code/anki-plugins/plugins/japanese_card_workflow/prepare_wanikani_vocab.py \
  --dry-run --levels 33,34 --output /tmp/wk-levels.json

python3 ~/Code/anki-plugins/plugins/japanese_card_workflow/prepare_wanikani_vocab.py \
  --dry-run --available-lessons --output /tmp/wk-lessons.json
```

When both selection flags are supplied, only available lessons on the specified
levels are included (intersection). Each flag alone retains its usual behavior.
Output filenames must be new. The script
uses the adjacent workflow `config.json` for field/template/deck names; use
`--config /path/to/config.json` if your active configuration differs. The `Beginning Japanese`
note type and configured destination decks must already exist. This note type is
fixed in the script; there is no `--model` flag.

Reports include per-level counts, matching note IDs, conflicts, and the prospective
number of generation requests. Only `GeneratedNotes` determines whether an
explanation is missing; `Notes` is ignored and preserved. Active and
suspended notes are both included. This report is a dry-run snapshot, not an
execution manifest: later generation must revalidate notes before any writes.
### Generate and save

Restart Anki after updating the add-on, then close Browser/Add/Edit windows.
The installed add-on must expose the new `japaneseWanikani*` bridge actions.
Use `--run` instead of `--dry-run` to execute:

```sh
python3 ~/Code/anki-plugins/plugins/japanese_card_workflow/prepare_wanikani_vocab.py \
  --run --levels 7 --available-lessons \
  --concurrency 4
```

This makes paid OpenAI requests using `OPENAI_API_KEY` or the API key already
configured in the Anki add-on. It reuses the existing generator and model.

- Existing nonempty `GeneratedNotes` is reused. Empty fields are filled without
  changing other fields, decks, or card scheduling. `Notes` is ignored.
- New notes populate `Front`, `Kana` (copied from `Front`), `Back`, and
  `GeneratedNotes`; other fields remain
  empty, including optional audio/image fields. Both configured templates must
  generate cards. Both cards are routed to their normal subdecks and suspended.
- Later manual unsuspension is preserved by subsequent completed runs.
- Changed notes and duplicates are reported instead of overwritten.

Requests run concurrently (default from workflow config, currently four), while
Anki writes are serialized. Validated generation responses are saved locally before
writes. Rerun the same command to retry failures without regenerating cached content.
Use the same `--state` directory to reuse results; the default is
`~/Library/Logs/japanese-card-workflow/wanikani`. JSON run reports record each word's
outcome. Failed/conflicting items yield a nonzero exit status.

Each new-note operation is undoable. If creation fails, it rolls back. A hard
interruption can leave a new note tagged `japanese_workflow::wanikani_pending`;
the next `--run` repairs those incomplete notes before starting generation.
Until that recovery runs, a crash between creation and suspension can leave cards
active. Normal completion removes the marker and ends automatic suspension control.
Recovery uses the current configured deck destinations.

Ctrl-C cancels queued jobs; already running requests may finish and cache their
results before exit. Generated explanations are not independently human-reviewed.
No automatic Anki sync is performed. See [PLAN.md](PLAN.md) for the design.

Execution prints `Anki search: nid:...`. Paste it into Anki Browser to see both
cards for each successfully created or filled note. The run report also stores
`affected_note_ids` and `anki_search` after each result, including partial runs.
Reused and failed items are excluded. `nid:0` means no notes were changed.

### Historical preparation tags

Execution adds `wanikani::level::07` and `wanikani::run::YYYY-MM-DD` to every
successfully prepared note, including reused notes. The run date is the local
date at execution start. `wanikani::source::created` is added only when creating
a new note. Historical levels/dates and personal tags are preserved. Existing
tags are compared case-insensitively; an already-tagged reused note is not rewritten.
Dry runs add no tags. Newly tagged reused notes now count as affected notes in
the printed search. Restart Anki after this update to load the tagging bridge.
