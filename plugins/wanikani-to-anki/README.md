# WaniKani to Anki

Adds a "For Anki HTML import" section to every WaniKani vocabulary page. Builds clean, copy-ready HTML for pasting directly into Anki's HTML editor — including the vocabulary's meaning, reading, word type, and the mnemonic explanations for each component kanji.

**Requires:** [WaniKani Open Framework (WKOF)](https://community.wanikani.com/t/instructions-installing-wanikani-open-framework/28549) — install this first.

## Install

[Install wanikani-to-anki.user.js](https://raw.githubusercontent.com/vbomedeiros/tampermonkey-plugins/main/plugins/wanikani-to-anki/wanikani-to-anki.user.js)

## What it does

- Appends a section after the Meaning section on any `wanikani.com/vocabulary/*` page
- Builds an Anki-ready HTML block containing:
  - Vocabulary characters, meaning, reading, word type, and WaniKani level
  - Meaning and reading mnemonics for each component kanji (loaded through WKOF's cached WaniKani API data)
  - Hint text where present
- Converts WaniKani `<mark>` tags to inline-styled `<span>` elements (Anki doesn't support `<mark>`)
- Strips CSS classes and normalises `<p>`/`<section>` tags to `<div>` to avoid Anki margin issues
- "Copy HTML source" button copies the result to the clipboard

## Frontend compatibility

Version 5.0.2 uses the current `data-name="meaning"` / `data-name="reading"`
sections and their named mnemonic, alternative-meaning, and word-type subsections.
It no longer depends on Item Info Injector, whose old insertion selectors stopped
matching WaniKani. Component-kanji information still comes from WKOF.

The script loads throughout WaniKani so Turbo navigation from the dashboard works,
but inserts an export only on vocabulary pages. It waits for subject data and
page content, checks the current subject against the URL, and recreates the
section after navigation without retaining another word's export.

## Checks

```sh
npm ci --prefix plugins/wanikani-to-anki
npm test --prefix plugins/wanikani-to-anki
node --check plugins/wanikani-to-anki/wanikani-to-anki.user.js
```

Regression tests cover current DOM extraction, component kanji, HTML formatting,
copy controls, delayed data/rendering, Turbo navigation, and duplicate/stale
sections. Live validation uses the Tampermonkey MCP workflow in the repository.

Live validation (2026-10-02): installed 5.0.2 through Tampermonkey MCP, verified
the export and copy button on 対応, navigated to 領域 and back, and confirmed one
export section with the correct word and no previous-word content. Dashboard
entry and kana-only pages are covered by synthetic tests, not this live check.
