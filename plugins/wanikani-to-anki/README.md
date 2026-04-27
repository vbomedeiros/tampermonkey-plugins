# WaniKani to Anki

Adds a "For Anki HTML import" section to every WaniKani vocabulary page. Builds clean, copy-ready HTML for pasting directly into Anki's HTML editor — including the vocabulary's meaning, reading, word type, and the mnemonic explanations for each component kanji.

## Install

[Install wanikani-to-anki.user.js](https://raw.githubusercontent.com/vbomedeiros/tampermonkey-plugins/main/plugins/wanikani-to-anki/wanikani-to-anki.user.js)

## What it does

- Appends a section at the bottom of any `wanikani.com/vocabulary/*` page
- Builds an Anki-ready HTML block containing:
  - Vocabulary characters, meaning, reading, word type, and WaniKani level
  - Meaning and reading mnemonics for each component kanji (loaded via hidden iframes)
  - Hint text where present
- Converts WaniKani `<mark>` tags to inline-styled `<span>` elements (Anki doesn't support `<mark>`)
- Strips CSS classes and normalises `<p>`/`<section>` tags to `<div>` to avoid Anki margin issues
- "Copy HTML source" button copies the result to the clipboard
