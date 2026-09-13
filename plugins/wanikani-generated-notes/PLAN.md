# WaniKani Generated Notes

## Design update: automatic Front lookup

As of version 0.2.0, the user has chosen exact `Front` lookup on every visit
instead of subject-to-note links. Manual linking, mapping fields, and a custom
manifest bridge are no longer required for reading notes. The script displays
cached content immediately while resolving the current matching note in Anki.
The identity/linking portions below are historical proposals; bulk preparation
remains planned.

Status: stage 1 is implemented in `wanikani-generated-notes.user.js`. See
`README.md` for setup and current scope. The design below also describes later
stages; proposed custom endpoints and Anki fields do not exist yet.

Display Japanese learning explanations from Anki immediately inside WaniKani.
Generate content ahead of lessons using the existing Japanese card workflow,
keep Anki as the editable source of truth, and synchronize a persistent browser
copy so previously downloaded explanations remain available while Anki is closed.

This will be a separate plugin from `wanikani-vocab-analysis`.

## Why

The existing vocabulary analysis script generates explanations on demand, which
interrupts lessons. Its `GM_setValue` cache is persistent, not temporary, but it
is confined to the userscript's browser storage and is not a shared, editable
library. Changes to its cache prefix also leave older entries unused.

The Anki workflow already provides a stronger foundation: seven-part explanations
including Reading Breakdown, HTML validation, resumable generation, guarded saves,
and an optional review workflow. Reuse that pipeline instead of maintaining a
second prompt and generation implementation in the browser.

## Architecture

```text
WaniKani vocabulary metadata
          |
          v
Bulk preparation using japanese_card_workflow
          |
          v
Anki notes: canonical content and manual edits
          |
          | AnkiConnect, when Anki is running
          v
Persistent userscript storage
          |
          v
WaniKani Generated Notes panel
```

Synchronization is one-way: Anki to browser. Editing and generation happen in
Anki's workflow. The userscript does not need an OpenAI API key.

## Anki library and identity

Reuse the existing Japanese vocabulary note type and fields:

| Information | Storage |
| --- | --- |
| Japanese word | `Front` |
| Japanese dictionary definition | `Back` |
| Learning explanation | `GeneratedNotes` |
| Existing personal material | Existing fields, preserved |
| Linked WaniKani subjects | Proposed `WaniKaniSubjectIDs` field |
| Preparation status | Proposed tags such as `wk::reference` and `wk::ready` |

Use WaniKani subject IDs as the permanent lookup keys. During initial linking,
compare spelling, reading, and meaning; do not automatically resolve ambiguous
matches by spelling alone. Multiple subject IDs may explicitly map to one note
when appropriate. A subject mapped to multiple notes is a conflict to resolve,
not permission to select an arbitrary explanation.

For vocabulary already in Anki, link and reuse the existing note. Preserve its
cards, deck placement, and scheduling.

For missing vocabulary, create notes in a separate top-level **WaniKani Reference**
deck and suspend every generated card. Content belongs to the note; suspension
belongs to its cards. Creation and suspension should be one guarded Anki operation
where supported, with verification and recovery so a partial failure cannot leave
reference cards accidentally active.

Later, a reference card can be moved into a study deck and unsuspended without
duplicating its note or explanation. Do not automatically re-suspend cards that
the user has deliberately promoted to study.

## Bulk preparation

Start with the current WaniKani level and the next level, rather than generating
the entire curriculum.

1. Fetch vocabulary and kana-vocabulary metadata from the WaniKani API.
2. Produce a preview of existing matches, missing notes, and ambiguous matches.
3. Link confirmed matches and create missing suspended reference notes.
4. Reuse suitable existing explanations; generate missing content with the Anki
   workflow's generator and HTML validator.
5. Apply the optional reviewed workflow when requested. Track generation and
   review separately: generated content is not automatically reviewed content.
6. Save through guarded Anki operations, verify readback, and report coverage.

Keep generation resumable: checkpoint responses before saving, record per-note
status, serialize writes, and re-read after ambiguous save outcomes. Reruns must
not create duplicate notes, regenerate completed content, or overwrite manual
edits. Do not infer that legacy notes lack useful AI content merely because
`GeneratedNotes` is empty.

The existing `batch_generate_notes.py` enforces `-is:suspended`, even when given
a custom query. Reference notes therefore need an explicit supported mode or a
separate preparation coordinator; changing the query alone is insufficient.

Follow the existing AI Notes workflow's review and save requirements when using
that workflow. Preserve other fields and scheduling throughout.

## Proposed AnkiConnect read interface

Extend the existing custom bridge in `japanese_card_workflow/anki_connect.py`.
These are proposed actions, not existing endpoints:

- `japaneseLibraryManifest`: return a stable library identifier, schema version,
  subject-to-note mappings, and hashes of exported content.
- `japaneseLibraryGet`: return content for a bounded list of subject IDs,
  including note ID, explanation HTML, and content hash.

Hash the actual exported fields so edits made manually in Anki are detected.
Return explicit missing/conflict states. Limit exports to linked vocabulary and
the fields needed by the panel.

Fetch manifests and content in bounded batches. If content changes during a
download, reconcile its hash with a fresh manifest rather than publishing an
inconsistent snapshot. Only remove local entries after a complete successful
manifest confirms they are no longer linked. Network failures must never clear
the saved library.

## Browser behavior and synchronization

Render the persistent local copy first, then synchronize in the background when
Anki is reachable. Initially download all linked explanations in bounded batches
so subsequent lesson navigation does not depend on individual Anki requests.

| Situation | Behavior |
| --- | --- |
| Explanation already downloaded | Display immediately |
| Anki contains a newer version | Update the local copy and visible panel |
| Anki is closed or unreachable | Keep the saved explanation; show sync status unobtrusively |
| Explanation has never been prepared | Show “Not prepared yet” |
| Conflicting subject mappings | Show a conflict state instead of guessing |
| New browser installation | Require an initial synchronization |

Namespace storage by stable library ID and schema version. Keep last successful
sync information, use bounded connection timeouts and retry backoff, and provide
a manual **Sync from Anki** action. Version storage with explicit migrations
instead of silently abandoning older cache prefixes.

Support vocabulary and kana-vocabulary lesson panels, vocabulary pages, and
review answer information in stage 1. Guard asynchronous
updates against navigation so a response for one subject cannot appear under
another. Review integration must not reveal answers before the user answers.

Use Tampermonkey's privileged request mechanism with explicit localhost
permission. Preserve AnkiConnect authentication and origin protections; do not
expose AnkiConnect to the network. Validate the actual browser-to-localhost
connection early in implementation.

Sanitize all HTML before rendering, including manually edited Anki content.
Use a small semantic HTML allowlist and panel-owned styling. Treat imported
content as data, not executable markup.

## Delivery stages

### Stage 1: Read existing explanations

- Link a small, explicitly selected set of existing Anki notes.
- Implement local synchronization and panels for lessons, vocabulary pages,
  and review answer information. Initially use standard AnkiConnect read actions;
  the proposed custom bridge can follow when shared Anki-side mappings are added.
- Verify manual edits propagate and saved explanations survive browser restarts
  and remain visible after closing Anki.
- Verify missing content, mapping conflicts, profile changes, interrupted sync,
  and rapid lesson navigation behave correctly.

### Stage 2: Prepare upcoming vocabulary

- Add bulk matching and suspended reference-note creation.
- Add resumable generation using the existing Anki pipeline.
- Report ready, missing, failed, and ambiguous items for upcoming levels.
- Verify reruns create no duplicates, all newly created reference cards are
  suspended, and existing study schedules remain unchanged.

## Deferred scope

Cloud hosting, browser-side generation, two-way editing, automatic writes to
WaniKani's own notes, and whole-curriculum generation are outside the initial
implementation. Cross-device access without desktop Anki could later use an
explicit export/import mechanism or a private hosted copy.

## References

- Existing userscript: `../wanikani-vocab-analysis/wanikani-vocab-analysis.user.js`
- Anki workflow: `~/Code/anki-plugins/plugins/japanese_card_workflow/README.md`
- Reviewed workflow: `~/Code/anki-plugins/plugins/japanese_card_workflow/AI_NOTES_WORKFLOW.md`
- Generator: `~/Code/anki-plugins/plugins/japanese_card_workflow/generation.py`
- Batch runner: `~/Code/anki-plugins/plugins/japanese_card_workflow/batch_generate_notes.py`
- Custom bridge: `~/Code/anki-plugins/plugins/japanese_card_workflow/anki_connect.py`
- [WaniKani Subjects API](https://docs.api.wanikani.com/20170710/#subjects)
- [Tampermonkey documentation](https://www.tampermonkey.net/documentation.php)
