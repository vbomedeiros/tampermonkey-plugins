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
