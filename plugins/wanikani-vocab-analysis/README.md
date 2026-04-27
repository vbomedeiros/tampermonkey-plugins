# WaniKani Vocabulary Analysis

Adds a "Vocabulary Analysis" section to WaniKani vocabulary lesson pages. On click, sends the vocabulary word to the OpenAI API using a structured six-part analysis prompt and renders the response inline.

## Install

[Install wanikani-vocab-analysis.user.js](https://raw.githubusercontent.com/vbomedeiros/tampermonkey-plugins/main/plugins/wanikani-vocab-analysis/wanikani-vocab-analysis.user.js)

## Setup

You need an OpenAI API key. On first use, the script will prompt you to enter it. It is stored in Tampermonkey's persistent storage (never sent anywhere except `api.openai.com`). Use the **⚙ API Key** button at any time to update it.

## What it does

Appears at the bottom of vocabulary lesson pages (`wanikani.com/subject-lessons/*`). The analysis covers:

1. **Word Overview** — kanji, reading, English definition, word origin (native/Sino-Japanese/borrowed)
2. **Kanji Breakdown** — each kanji's meaning, nuance, and reading in the compound
3. **Etymology and Cultural Context** — origin, evolution, cultural significance
4. **Example Phrases** — 2–3 natural Japanese sentences with translations
5. **Dictionary Definition** — Sanseido-style Japanese entry with reading, POS marker, and antonym if applicable
6. **In Summary** — concise wrap-up (~500 characters) suitable for pasting into WaniKani notes

Responses are cached per vocabulary item so revisiting a word doesn't make a new API call. Click **Refresh** to force a new one.

## Notes

- Uses `gpt-4o`. Each call costs a small amount of API credit (~$0.01 or less per word).
- Only activates on vocabulary-type lessons, not kanji or radical lessons.
- If the section doesn't appear, try switching tabs (Meaning → Reading) to trigger re-injection.
